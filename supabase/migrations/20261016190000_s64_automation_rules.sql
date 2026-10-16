-- P0 automation: one bounded, optional reminder. Existing expiry/refund jobs are untouched.

create table public.member_notification_preferences (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  request_reminders boolean not null default true,
  updated_at timestamptz not null default now()
);
alter table public.member_notification_preferences enable row level security;
revoke all on public.member_notification_preferences from public, anon, authenticated;

create function public.my_notification_preferences() returns jsonb
  language plpgsql stable security definer set search_path = public, pg_temp as $$
declare v_enabled boolean;
begin
  if auth.uid() is null then raise exception 'unauthenticated' using errcode = '28000'; end if;
  select request_reminders into v_enabled from public.member_notification_preferences
   where user_id = auth.uid();
  return jsonb_build_object('request_reminders', coalesce(v_enabled, true));
end $$;
revoke all on function public.my_notification_preferences() from public, anon;
grant execute on function public.my_notification_preferences() to authenticated;

create function public.set_my_request_reminders(p_enabled boolean) returns jsonb
  language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if auth.uid() is null then raise exception 'unauthenticated' using errcode = '28000'; end if;
  if p_enabled is null then raise exception 'invalid preference' using errcode = '22023'; end if;
  if not exists (select 1 from public.profiles where id = auth.uid() and account_state = 'active') then
    raise exception 'inactive account' using errcode = '42501';
  end if;
  insert into public.member_notification_preferences(user_id, request_reminders)
  values (auth.uid(), p_enabled)
  on conflict (user_id) do update set request_reminders = excluded.request_reminders, updated_at = now();
  return jsonb_build_object('request_reminders', p_enabled);
end $$;
revoke all on function public.set_my_request_reminders(boolean) from public, anon;
grant execute on function public.set_my_request_reminders(boolean) to authenticated;

create table public.automation_rules (
  rule_key text primary key check (rule_key = 'meeting_request_reminder'),
  mode text not null default 'off' check (mode in ('off','observe','approval','auto')),
  version integer not null default 1 check (version > 0),
  daily_limit integer not null default 20 check (daily_limit between 1 and 100),
  min_interval_hours integer not null default 24 check (min_interval_hours between 12 and 168),
  paused_reason text check (char_length(paused_reason) <= 500),
  observed_since timestamptz,
  updated_by uuid references public.profiles(id) on delete set null,
  updated_at timestamptz not null default now()
);
insert into public.automation_rules(rule_key) values ('meeting_request_reminder');
alter table public.automation_rules enable row level security;
revoke all on public.automation_rules from public, anon, authenticated;

create table public.automation_runs (
  id uuid primary key default gen_random_uuid(),
  rule_key text not null references public.automation_rules(rule_key),
  rule_version integer not null,
  meeting_id uuid references public.meetings(id) on delete set null,
  user_id uuid references public.profiles(id) on delete set null,
  source_used_at timestamptz not null,
  status text not null check (status in ('observed','approval_required','succeeded','skipped','failed','unknown')),
  preview_hash text not null,
  preview_expires_at timestamptz not null,
  approved_by uuid references public.profiles(id) on delete set null,
  approved_at timestamptz,
  result_code text,
  created_at timestamptz not null default now(),
  unique (rule_key, meeting_id, rule_version)
);
create index automation_runs_recent on public.automation_runs(rule_key, created_at desc);
create index automation_runs_approval on public.automation_runs(status, preview_expires_at)
  where status = 'approval_required';
alter table public.automation_runs enable row level security;
revoke all on public.automation_runs from public, anon, authenticated;

alter table public.admin_actions drop constraint admin_actions_kind_check;
alter table public.admin_actions add constraint admin_actions_kind_check check (kind = any (array[
  'resolve_report', 'ban', 'unban', 'refund', 'cancel_meeting', 'review_photo', 'set_queue',
  'resolve_no_show', 'set_payments', 'fulfill_order', 'reset_photo', 'retry_notification',
  'set_queue_reason', 'upsert_place', 'reconcile_payment', 'case_transition',
  'automation_rule', 'automation_approval'
]));

-- The request must still be actionable, and the recipient must still want optional reminders.
create function public.automation_reminder_valid(p_meeting_id uuid, p_user_id uuid, p_used_at timestamptz)
returns boolean language sql stable security definer set search_path = public, pg_temp as $$
  select exists (
    select 1 from public.meetings m
    join public.intros i on i.id = m.intro_id
    join public.tickets t on t.id = m.ticket_id
    join public.profiles p on p.id = i.female_id
    left join public.member_notification_preferences pref on pref.user_id = p.id
    where m.id = p_meeting_id and i.female_id = p_user_id
      and t.used_at = p_used_at and t.used_at is not null
      and t.used_at + interval '12 hours' <= now()
      and t.used_at + interval '24 hours' > now()
      and i.closed_at is null and m.cancelled_at is null
      and m.prefs_submitted_at is null and m.confirmed_at is null
      and p.account_state = 'active' and coalesce(pref.request_reminders, true)
  );
$$;
revoke all on function public.automation_reminder_valid(uuid,uuid,timestamptz)
  from public, anon, authenticated;

-- Cron records candidates. Observe mode has zero notification side effects.
create function public.automation_tick() returns integer
  language plpgsql security definer set search_path = public, pg_temp as $$
declare v_rule public.automation_rules; v_added integer := 0; v_row record;
  v_hash text; v_run_id uuid; v_count integer;
begin
  select * into v_rule from public.automation_rules where rule_key = 'meeting_request_reminder' for update;
  if v_rule.mode = 'off' or v_rule.paused_reason is not null then return 0; end if;
  for v_row in
    select m.id meeting_id, i.female_id user_id, t.used_at
      from public.meetings m join public.intros i on i.id = m.intro_id
      join public.tickets t on t.id = m.ticket_id
     where t.used_at between now() - interval '23 hours' and now() - interval '12 hours'
       and m.cancelled_at is null and m.prefs_submitted_at is null
       and m.confirmed_at is null and i.closed_at is null
     order by t.used_at, m.id limit 100
  loop
    if not public.automation_reminder_valid(v_row.meeting_id, v_row.user_id, v_row.used_at)
       or exists (select 1 from public.notifications n where n.meeting_id = v_row.meeting_id
                     and n.kind = 'meeting_request_reminder'::public.notification_kind) then
      continue;
    end if;
    v_hash := encode(extensions.digest(concat_ws(':', v_rule.rule_key, v_rule.version,
               v_row.meeting_id, v_row.user_id, v_row.used_at, 'reminder-v1'), 'sha256'), 'hex');
    if v_rule.mode = 'auto' then
      select count(*) into v_count from public.automation_runs
       where rule_key=v_rule.rule_key and status='succeeded'
         and approved_at >= date_trunc('day',now());
      if v_count >= v_rule.daily_limit or exists (
        select 1 from public.automation_runs where user_id=v_row.user_id
          and status='succeeded'
          and approved_at > now()-make_interval(hours=>v_rule.min_interval_hours)
      ) then continue; end if;
    end if;
    insert into public.automation_runs(rule_key,rule_version,meeting_id,user_id,source_used_at,
      status,preview_hash,preview_expires_at)
    values (v_rule.rule_key,v_rule.version,v_row.meeting_id,v_row.user_id,v_row.used_at,
      case when v_rule.mode = 'observe' then 'observed'
           when v_rule.mode = 'auto' then 'succeeded' else 'approval_required' end,
      v_hash, least(v_row.used_at + interval '24 hours', now() + interval '1 hour'))
    on conflict (rule_key,meeting_id,rule_version) do nothing returning id into v_run_id;
    if v_run_id is not null then
      v_added := v_added + 1;
      if v_rule.mode = 'auto' then
        -- Rule row lock serializes this bounded enqueue; delivery remains in PR-06 worker.
        insert into public.notifications(user_id,kind,meeting_id)
          values(v_row.user_id,'meeting_request_reminder',v_row.meeting_id)
          on conflict (user_id,kind,meeting_id) do nothing;
        update public.automation_runs set approved_at=now(),result_code='auto_queued'
          where id=v_run_id;
      end if;
    end if;
    v_run_id := null;
  end loop;
  return v_added;
end $$;
revoke all on function public.automation_tick() from public, anon, authenticated;
grant execute on function public.automation_tick() to service_role;

create function public.admin_automation_overview() returns jsonb
  language plpgsql stable security definer set search_path = public, pg_temp as $$
declare v_rule public.automation_rules; v_runs jsonb;
begin
  if not public.is_admin() then raise exception 'admin only' using errcode = '42501'; end if;
  select * into v_rule from public.automation_rules where rule_key = 'meeting_request_reminder';
  select coalesce(jsonb_agg(to_jsonb(x) order by x.rule_version desc, x.created_at desc), '[]'::jsonb) into v_runs
  from (select id,meeting_id,user_id,rule_version,status,preview_hash,preview_expires_at,created_at,result_code
          from public.automation_runs where rule_key = v_rule.rule_key
         order by rule_version desc, created_at desc limit 30) x;
  return jsonb_build_object('rule',to_jsonb(v_rule),'runs',v_runs,'as_of',now());
end $$;
revoke all on function public.admin_automation_overview() from public, anon;
grant execute on function public.admin_automation_overview() to authenticated;

create function public.admin_update_automation_rule(
  p_expected_version integer, p_mode text, p_daily_limit integer,
  p_min_interval_hours integer, p_paused_reason text, p_reason text, p_request_id uuid
) returns public.automation_rules
  language plpgsql security definer set search_path = public, pg_temp as $$
declare v_old public.automation_rules; v_new public.automation_rules;
begin
  if not public.is_admin() then raise exception 'admin only' using errcode = '42501'; end if;
  if p_request_id is null or char_length(btrim(coalesce(p_reason,''))) not between 3 and 500
     or p_mode is null or p_mode not in ('off','observe','approval','auto')
     or p_daily_limit is null or p_daily_limit not between 1 and 100
     or p_min_interval_hours is null or p_min_interval_hours not between 12 and 168
     or char_length(coalesce(p_paused_reason,'')) > 500 then
    raise exception 'invalid rule change' using errcode = '22023';
  end if;
  select * into v_old from public.automation_rules where rule_key = 'meeting_request_reminder' for update;
  if v_old.version <> p_expected_version then raise exception 'stale_version' using errcode = 'PT409'; end if;
  if p_mode = 'auto' and (v_old.observed_since is null
      or v_old.observed_since > now() - interval '48 hours'
      or not exists (select 1 from public.automation_runs where rule_key = v_old.rule_key
                     and status = 'observed')
      or exists (select 1 from public.automation_runs where rule_key = v_old.rule_key
                 and status in ('failed','unknown'))) then
    raise exception 'auto requires 48h observation and review' using errcode = 'PT409';
  end if;
  update public.automation_rules set mode = p_mode, version = version + 1,
     daily_limit = p_daily_limit, min_interval_hours = p_min_interval_hours,
     paused_reason = nullif(btrim(p_paused_reason),''),
     observed_since = case when p_mode = 'observe' and v_old.mode <> 'observe'
                           then now() when p_mode = 'off' then null else observed_since end,
     updated_by = auth.uid(), updated_at = now()
   where rule_key = v_old.rule_key returning * into v_new;
  insert into public.admin_actions(actor_id,kind,request_id,note)
    values (auth.uid(),'automation_rule',p_request_id,
      concat('mode ',v_old.mode,' → ',v_new.mode,'; ',btrim(p_reason)));
  return v_new;
end $$;
revoke all on function public.admin_update_automation_rule(integer,text,integer,integer,text,text,uuid)
  from public, anon;
grant execute on function public.admin_update_automation_rule(integer,text,integer,integer,text,text,uuid)
  to authenticated;

create function public.admin_approve_automation(
  p_run_id uuid, p_preview_hash text, p_reason text, p_request_id uuid
) returns text language plpgsql security definer set search_path = public, pg_temp as $$
declare v_run public.automation_runs; v_rule public.automation_rules;
  v_count integer; v_inserted integer;
begin
  if not public.is_admin() then raise exception 'admin only' using errcode = '42501'; end if;
  if p_request_id is null or char_length(btrim(coalesce(p_reason,''))) not between 3 and 500 then
    raise exception 'reason and request ID required' using errcode = '22023';
  end if;
  select * into v_run from public.automation_runs where id = p_run_id for update;
  if not found then raise exception 'run not found' using errcode = 'P0002'; end if;
  if v_run.status = 'succeeded' and v_run.preview_hash = p_preview_hash then return 'succeeded'; end if;
  select * into v_rule from public.automation_rules where rule_key = v_run.rule_key for update;
  if v_rule.mode <> 'approval' or v_rule.paused_reason is not null
     or v_rule.version <> v_run.rule_version or v_run.status <> 'approval_required'
     or p_preview_hash is null or v_run.preview_hash <> p_preview_hash
     or v_run.preview_expires_at <= now() then
    update public.automation_runs set status='skipped',result_code='approval_expired_or_changed'
     where id=p_run_id and status='approval_required';
    return 'skipped';
  end if;
  if not public.automation_reminder_valid(v_run.meeting_id,v_run.user_id,v_run.source_used_at) then
    update public.automation_runs set status='skipped',result_code='source_changed' where id=p_run_id;
    return 'skipped';
  end if;
  select count(*) into v_count from public.automation_runs
   where rule_key=v_run.rule_key and status='succeeded' and approved_at >= date_trunc('day',now());
  if v_count >= v_rule.daily_limit then raise exception 'daily limit' using errcode='PT409'; end if;
  if exists (select 1 from public.automation_runs where user_id=v_run.user_id
      and status='succeeded' and approved_at > now()-make_interval(hours=>v_rule.min_interval_hours)) then
    raise exception 'recipient frequency limit' using errcode='PT409';
  end if;
  insert into public.notifications(user_id,kind,meeting_id)
    values(v_run.user_id,'meeting_request_reminder',v_run.meeting_id)
    on conflict (user_id,kind,meeting_id) do nothing;
  get diagnostics v_inserted = row_count;
  update public.automation_runs set status='succeeded',approved_by=auth.uid(),
    approved_at=now(),result_code=case when v_inserted = 1 then 'queued' else 'already_queued' end
   where id=p_run_id;
  insert into public.admin_actions(actor_id,kind,target_user,target_ref,request_id,note)
    values(auth.uid(),'automation_approval',v_run.user_id,p_run_id,p_request_id,btrim(p_reason));
  return 'succeeded';
end $$;
revoke all on function public.admin_approve_automation(uuid,text,text,uuid) from public, anon;
grant execute on function public.admin_approve_automation(uuid,text,text,uuid) to authenticated;

-- Pausing the new rule does not pause existing ticket expiry or refunds.
select cron.schedule('automation_reminder_tick','*/5 * * * *',
  $$select public.automation_tick()$$);
