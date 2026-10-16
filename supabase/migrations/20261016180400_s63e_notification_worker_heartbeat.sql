-- Cron success only proves an HTTP request was queued. The worker records its
-- own completed run so the console can distinguish idle from stalled delivery.
create table public.notification_worker_runs (
  id bigint generated always as identity primary key,
  completed_at timestamptz not null default now(),
  duration_ms integer not null check (duration_ms between 0 and 600000),
  claimed integer not null check (claimed between 0 and 50),
  submitted integer not null check (submitted between 0 and 50),
  unavailable integer not null check (unavailable between 0 and 50),
  skipped integer not null check (skipped between 0 and 50),
  failed integer not null check (failed between 0 and 50),
  unknown integer not null check (unknown between 0 and 50),
  check (submitted + unavailable + skipped + failed + unknown = claimed)
);
create index notification_worker_runs_recent on public.notification_worker_runs(completed_at desc, id desc);
alter table public.notification_worker_runs enable row level security;
revoke all on public.notification_worker_runs from public, anon, authenticated;
grant select, insert on public.notification_worker_runs to service_role;
grant usage, select on sequence public.notification_worker_runs_id_seq to service_role;

create function public.record_notification_worker_run(
  p_duration_ms integer, p_claimed integer, p_submitted integer,
  p_unavailable integer, p_skipped integer, p_failed integer, p_unknown integer
) returns bigint
  language plpgsql security definer set search_path = public, pg_temp as $$
declare v_id bigint;
begin
  if auth.role() is distinct from 'service_role' then
    raise exception 'worker only' using errcode = '42501';
  end if;
  insert into public.notification_worker_runs
    (duration_ms,claimed,submitted,unavailable,skipped,failed,unknown)
  values (p_duration_ms,p_claimed,p_submitted,p_unavailable,p_skipped,p_failed,p_unknown)
  returning id into v_id;
  return v_id;
end $$;
revoke all on function public.record_notification_worker_run(integer,integer,integer,integer,integer,integer,integer)
  from public, anon, authenticated;
grant execute on function public.record_notification_worker_run(integer,integer,integer,integer,integer,integer,integer)
  to service_role;

alter function public.admin_notification_health() rename to admin_notification_health_base;
revoke all on function public.admin_notification_health_base()
  from public, anon, authenticated;
create function public.admin_notification_health() returns jsonb
  language plpgsql stable security definer set search_path = public, pg_temp as $$
declare v_base jsonb; v_last timestamptz; v_duration integer;
begin
  if not public.is_admin() then
    raise exception 'admin only' using errcode = '42501';
  end if;
  v_base := public.admin_notification_health_base();
  select completed_at,duration_ms into v_last,v_duration
    from public.notification_worker_runs order by completed_at desc,id desc limit 1;
  return v_base || jsonb_build_object(
    'last_worker_at', v_last,
    'last_worker_duration_ms', v_duration,
    'worker_stale', ((v_base->>'pending')::integer > 0 and
                     (v_last is null or v_last < now() - interval '15 minutes'))
  );
end $$;
revoke all on function public.admin_notification_health() from public, anon;
grant execute on function public.admin_notification_health() to authenticated;
