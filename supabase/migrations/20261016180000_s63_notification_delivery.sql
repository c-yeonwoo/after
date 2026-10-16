-- S63: a notification is visible in-app independently of whether APNs accepted a push.
-- Existing sent_at values cannot prove historical APNs delivery.
alter table public.notifications
  add column dispatch_state text not null default 'pending'
    check (dispatch_state in ('pending','running','retry','submitted','unavailable','skipped','failed','unknown','legacy_unverified')),
  add column lease_token uuid,
  add column lease_until timestamptz,
  add column next_attempt_at timestamptz not null default now();
update public.notifications set dispatch_state = 'legacy_unverified' where sent_at is not null;
-- The retired mail-verification notification is never pushed.
update public.notifications
   set dispatch_state = 'skipped', sent_at = now()
 where sent_at is null and kind::text = 'notification_email_verify';
update public.notifications set dispatch_state = 'failed'
 where sent_at is null and attempts >= 5;

-- During the short DB-before-Edge deployment gap the prior worker may still
-- update sent_at/attempts. Preserve those outcomes as unverified or failed.
create function public.classify_legacy_notification_update() returns trigger
  language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if new.dispatch_state = 'pending' and old.dispatch_state = 'pending' then
    if new.sent_at is not null and old.sent_at is null then
      new.dispatch_state := 'legacy_unverified';
    elsif new.sent_at is null and new.attempts >= 5 then
      new.dispatch_state := 'failed';
    end if;
  end if;
  return new;
end $$;
create trigger notifications_classify_legacy before update of sent_at, attempts
  on public.notifications for each row
  execute function public.classify_legacy_notification_update();
revoke all on function public.classify_legacy_notification_update()
  from public, anon, authenticated;
create index notifications_dispatch_due on public.notifications(next_attempt_at, created_at, id)
  where sent_at is null and dispatch_state in ('pending','retry');

create table public.notification_deliveries (
  id bigint generated always as identity primary key,
  notification_id uuid not null references public.notifications(id) on delete cascade,
  channel text not null check (channel in ('in_app','push')),
  recipient_ref text not null check (char_length(recipient_ref) between 1 and 80),
  status text not null check (status in ('available','submitted','unavailable','skipped','failed','unknown')),
  attempt smallint not null default 0 check (attempt >= 0),
  provider_ref text,
  error_code text,
  submitted_at timestamptz,
  updated_at timestamptz not null default now(),
  unique (notification_id, channel, recipient_ref)
);
create index notification_deliveries_status on public.notification_deliveries(status, updated_at, id);
alter table public.notification_deliveries enable row level security;
revoke all on public.notification_deliveries from public, anon, authenticated;
grant select, insert, update on public.notification_deliveries to service_role;
grant usage, select on sequence public.notification_deliveries_id_seq to service_role;

create function public.record_in_app_delivery() returns trigger
  language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if new.kind::text <> 'notification_email_verify' then
    insert into public.notification_deliveries
      (notification_id, channel, recipient_ref, status)
    values (new.id, 'in_app', new.user_id::text, 'available');
  end if;
  return new;
end $$;
create trigger notifications_in_app_delivery after insert on public.notifications
  for each row execute function public.record_in_app_delivery();
insert into public.notification_deliveries (notification_id, channel, recipient_ref, status)
select id, 'in_app', user_id::text, 'available' from public.notifications
 where kind::text <> 'notification_email_verify'
on conflict do nothing;
revoke all on function public.record_in_app_delivery() from public, anon, authenticated;

-- This is the only worker claim path. Expired leases are unknown, not re-sent.
create function public.claim_notification_dispatches(p_limit integer default 50)
returns table (
  id uuid, user_id uuid, kind public.notification_kind, meeting_id uuid,
  payload jsonb, attempts smallint, lease_token uuid
) language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if auth.role() is distinct from 'service_role' then
    raise exception 'worker only' using errcode = '42501';
  end if;
  if p_limit not between 1 and 50 then
    raise exception 'invalid limit' using errcode = '22023';
  end if;
  update public.notifications n
     set dispatch_state = 'unknown', lease_token = null, lease_until = null,
         last_error = 'lease_expired_after_possible_provider_call'
   where n.dispatch_state = 'running' and n.lease_until < now();
  return query
    with picked as (
      select n.id from public.notifications n
       where n.sent_at is null and n.dispatch_state in ('pending','retry')
         and n.next_attempt_at <= now() and n.attempts < 5
       order by n.created_at, n.id
       for update skip locked limit p_limit
    )
    update public.notifications n
       set dispatch_state = 'running', lease_token = gen_random_uuid(),
           lease_until = now() + interval '10 minutes', attempts = n.attempts + 1
      from picked where n.id = picked.id
    returning n.id, n.user_id, n.kind, n.meeting_id, n.payload,
              n.attempts, n.lease_token;
end $$;
revoke all on function public.claim_notification_dispatches(integer)
  from public, anon, authenticated;
grant execute on function public.claim_notification_dispatches(integer) to service_role;

-- Results are committed only by the holder of the current lease. Device refs are
-- SHA-256 hashes, never the APNs token. A crash after APNs acceptance remains unknown.
create function public.finish_notification_dispatch(
  p_id uuid, p_lease_token uuid, p_state text, p_error_code text,
  p_results jsonb default '[]'::jsonb, p_retryable boolean default false
) returns boolean
  language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_row public.notifications;
  v_result jsonb;
  v_channel text;
  v_status text;
  v_ref text;
  v_error text;
  v_provider text;
begin
  if auth.role() is distinct from 'service_role' then
    raise exception 'worker only' using errcode = '42501';
  end if;
  if p_state is null or p_state not in ('submitted','unavailable','skipped','failed','unknown') or
     p_results is null or jsonb_typeof(p_results) <> 'array' or
     jsonb_array_length(p_results) > 20 or
     char_length(coalesce(p_error_code,'')) > 80 then
    raise exception 'invalid dispatch result' using errcode = '22023';
  end if;
  select * into v_row from public.notifications where id = p_id for update;
  if not found or v_row.dispatch_state <> 'running' or
     v_row.lease_token is distinct from p_lease_token or v_row.lease_until < now() then
    return false;
  end if;
  for v_result in select value from jsonb_array_elements(p_results) loop
    v_channel := v_result->>'channel';
    v_status := v_result->>'status';
    v_ref := v_result->>'recipient_ref';
    v_error := v_result->>'error_code';
    v_provider := v_result->>'provider_ref';
    if v_channel <> 'push' or
       v_status not in ('submitted','unavailable','skipped','failed','unknown') or
       v_ref is null or char_length(v_ref) <> 64 or v_ref !~ '^[0-9a-f]+$' or
       char_length(coalesce(v_error,'')) > 80 or
       char_length(coalesce(v_provider,'')) > 80 then
      raise exception 'invalid delivery item' using errcode = '22023';
    end if;
    insert into public.notification_deliveries
      (notification_id, channel, recipient_ref, status, attempt,
       provider_ref, error_code, submitted_at, updated_at)
    values (p_id, 'push', v_ref, v_status, v_row.attempts, v_provider, v_error,
            case when v_status = 'submitted' then now() end, now())
    on conflict (notification_id, channel, recipient_ref) do update
      set status = excluded.status, attempt = excluded.attempt,
          provider_ref = excluded.provider_ref,
          error_code = excluded.error_code, submitted_at = excluded.submitted_at,
          updated_at = excluded.updated_at;
  end loop;
  update public.notifications
       set dispatch_state = case when p_state = 'failed' and p_retryable and attempts < 5
                               then 'retry' else p_state end,
         next_attempt_at = case when p_state = 'failed' and p_retryable and attempts < 5
                                then now() + make_interval(mins => least(60, power(2, attempts)::integer))
                                else next_attempt_at end,
         sent_at = case when p_state in ('submitted','unavailable','skipped') then now() else null end,
         lease_token = null, lease_until = null, last_error = nullif(p_error_code,'')
   where id = p_id;
  return true;
end $$;
revoke all on function public.finish_notification_dispatch(uuid,uuid,text,text,jsonb,boolean)
  from public, anon, authenticated;
grant execute on function public.finish_notification_dispatch(uuid,uuid,text,text,jsonb,boolean)
  to service_role;

-- The worker rechecks the authoritative state immediately before APNs calls.
create function public.notification_push_still_relevant(p_id uuid, p_lease_token uuid)
returns boolean language plpgsql stable security definer set search_path = public, pg_temp as $$
declare v_row public.notifications;
begin
  if auth.role() is distinct from 'service_role' then
    raise exception 'worker only' using errcode = '42501';
  end if;
  select * into v_row from public.notifications where id = p_id;
  if not found or v_row.dispatch_state <> 'running' or
     v_row.lease_token is distinct from p_lease_token or v_row.lease_until < now() then
    return false;
  end if;
  if not exists (select 1 from public.profiles p where p.id = v_row.user_id
                  and p.account_state = 'active') then return false; end if;
  if v_row.kind::text = 'notification_email_verify' then return false; end if;
  if v_row.meeting_id is not null then
    if v_row.kind::text in ('meeting_requested','prefs_submitted') and
       not exists (select 1 from public.meetings m where m.id = v_row.meeting_id
                    and m.cancelled_at is null and m.confirmed_at is null) then
      return false;
    end if;
    if v_row.kind::text = 'meeting_confirmed' and
       not exists (select 1 from public.meetings m where m.id = v_row.meeting_id
                    and m.cancelled_at is null and m.confirmed_at is not null) then
      return false;
    end if;
    if v_row.kind::text = 'meeting_released' and
       not exists (select 1 from public.meetings m where m.id = v_row.meeting_id
                    and m.cancelled_at is not null) then
      return false;
    end if;
    if v_row.kind::text = 'feedback_due' and
       not exists (select 1 from public.meetings m where m.id = v_row.meeting_id
                    and m.cancelled_at is null and m.scheduled_at < now()) then
      return false;
    end if;
    if v_row.kind::text = 'no_show_response_required' and
       not exists (select 1 from public.no_show_reports r
                    where r.meeting_id = v_row.meeting_id and r.accused_id = v_row.user_id
                      and r.state = 'pending') then return false; end if;
  end if;
  return true;
end $$;
revoke all on function public.notification_push_still_relevant(uuid,uuid)
  from public, anon, authenticated;
grant execute on function public.notification_push_still_relevant(uuid,uuid) to service_role;

-- Existing cron wakes the worker only for due work or to classify expired leases.
create or replace function public.drain_notification_outbox()
returns void language plpgsql security definer set search_path = public, pg_temp as $$
declare v_url text; v_key text;
begin
  select decrypted_secret into v_url from vault.decrypted_secrets
   where name = 'edge_function_base_url';
  select decrypted_secret into v_key from vault.decrypted_secrets
   where name = 'service_role_key';
  if v_url is null or v_key is null then
    raise notice 'drain_notification_outbox: vault 에 edge_function_base_url / service_role_key 가 없어 건너뜁니다';
    return;
  end if;
  if not exists (
    select 1 from public.notifications where sent_at is null and (
      (dispatch_state in ('pending','retry') and next_attempt_at <= now() and attempts < 5)
      or (dispatch_state = 'running' and lease_until < now())
    )
  ) then return; end if;
  perform net.http_post(
    url := v_url || '/functions/v1/send-notifications',
    headers := jsonb_build_object('Content-Type','application/json',
                                  'Authorization','Bearer ' || v_key),
    body := '{}'::jsonb, timeout_milliseconds := 120000
  );
end $$;
revoke all on function public.drain_notification_outbox() from public, anon, authenticated;
grant execute on function public.drain_notification_outbox() to service_role;
