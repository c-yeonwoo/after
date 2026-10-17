-- Each confirmed schedule owns its reminders. Historical deliveries are kept,
-- not deleted/reused as though a provider had accepted a different message.
alter table public.meetings add column schedule_revision integer not null default 1 check(schedule_revision>0);
alter table public.notifications
  add column schedule_revision integer not null default 1,
  add column event_version text not null default 'base';
update public.notifications set event_version='schedule:1' where meeting_id is not null;
alter table public.notifications drop constraint notifications_user_id_kind_meeting_id_key;
alter table public.notifications add constraint notifications_schedule_event_once
  unique(user_id,kind,meeting_id,event_version);

create function public.attach_notification_schedule() returns trigger
  language plpgsql security definer set search_path=public,pg_temp as $$
begin
  if new.meeting_id is not null then
    select schedule_revision into new.schedule_revision from public.meetings where id=new.meeting_id;
    if new.event_version='base' then new.event_version:='schedule:'||new.schedule_revision; end if;
  end if;
  return new;
end $$;
revoke all on function public.attach_notification_schedule() from public,anon,authenticated;
create trigger attach_notification_schedule before insert on public.notifications
  for each row execute function public.attach_notification_schedule();

-- Mechanical conflict-target upgrade for existing enqueue/automation functions,
-- including private compatibility versions. Their bodies and grants otherwise
-- stay unchanged. The BEFORE INSERT trigger supplies event_version.
do $$ declare f record; definition text; begin
  for f in select p.oid from pg_proc p join pg_namespace ns on ns.oid=p.pronamespace
    where ns.nspname='public' and p.prokind='f'
      and p.prosrc ~* 'on conflict\s*\(user_id,\s*kind,\s*meeting_id\)'
  loop
    definition:=regexp_replace(pg_get_functiondef(f.oid),
      'on conflict\s*\(user_id,\s*kind,\s*meeting_id\)',
      'on conflict(user_id,kind,meeting_id,event_version)','gi');
    execute definition;
  end loop;
end $$;

create table public.meeting_change_requests (
  id uuid primary key default gen_random_uuid(),
  sequence_id bigint generated always as identity,
  meeting_id uuid not null references public.meetings(id) on delete cascade,
  base_revision integer not null,
  proposed_at timestamptz not null,
  requested_by uuid not null references public.profiles(id) on delete cascade,
  male_agreed_at timestamptz,
  female_agreed_at timestamptz,
  state text not null default 'pending' check(state in ('pending','accepted','declined','withdrawn','expired','superseded')),
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  request_id uuid not null unique
);
create unique index one_pending_meeting_change on public.meeting_change_requests(meeting_id) where state='pending';
alter table public.meeting_change_requests enable row level security;
revoke all on public.meeting_change_requests from public,anon,authenticated;

create function public.my_meeting_change(p_meeting_id uuid) returns jsonb
  language plpgsql stable security definer set search_path=public,pg_temp as $$
declare c public.meeting_change_requests; m public.meetings;
begin
  if not public.is_meeting_participant(p_meeting_id) then raise exception 'not a participant' using errcode='42501'; end if;
  select * into m from public.meetings where id=p_meeting_id;
  select * into c from public.meeting_change_requests where meeting_id=m.id
    and base_revision=m.schedule_revision order by sequence_id desc limit 1;
  return jsonb_build_object('asOf',now(),'revision',m.schedule_revision,'scheduledAt',m.scheduled_at,
    'canRequest',m.confirmed_at is not null and m.cancelled_at is null and m.completed_at is null
      and m.scheduled_at>now()+interval '3 hours',
    'change',case when c.id is null then null else jsonb_build_object(
      'id',c.id,'proposedAt',c.proposed_at,'requestedBy',c.requested_by,
      'state',case when c.state='pending' and c.expires_at<=now() then 'expired' else c.state end,
      'expiresAt',c.expires_at) end);
end $$;
revoke all on function public.my_meeting_change(uuid) from public,anon;
grant execute on function public.my_meeting_change(uuid) to authenticated;

create function public.request_meeting_change(p_meeting_id uuid,p_proposed_at timestamptz,p_expected_revision integer,p_request_id uuid)
  returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare m public.meetings; i public.intros; c public.meeting_change_requests; local_time timestamp;
begin
  if not public.is_meeting_participant(p_meeting_id) or not exists(select 1 from public.profiles
    where id=auth.uid() and account_state='active') then raise exception 'not a participant' using errcode='42501'; end if;
  select * into m from public.meetings where id=p_meeting_id for update;
  select * into i from public.intros where id=m.intro_id;
  select * into c from public.meeting_change_requests where request_id=p_request_id;
  if found then
    if c.meeting_id<>m.id or c.requested_by<>auth.uid() or c.proposed_at is distinct from p_proposed_at then
      raise exception 'request ID conflict' using errcode='PT409'; end if;
    return public.my_meeting_change(m.id);
  end if;
  if p_request_id is null or p_expected_revision is distinct from m.schedule_revision or
     m.confirmed_at is null or m.cancelled_at is not null or m.completed_at is not null or
     m.scheduled_at<=now()+interval '3 hours' then raise exception 'schedule changed or unavailable' using errcode='PT409'; end if;
  local_time:=p_proposed_at at time zone 'Asia/Seoul';
  if p_proposed_at is null or p_proposed_at=m.scheduled_at or
     p_proposed_at<now()+interval '3 hours' or p_proposed_at>now()+interval '21 days' or
     extract(isodow from local_time)>5 or local_time::time<time '18:00' or local_time::time>time '22:00' then
    raise exception 'choose a weekday evening between 3 hours and 21 days' using errcode='22023'; end if;
  update public.meeting_change_requests set state='expired' where meeting_id=m.id and state='pending' and expires_at<=now();
  if exists(select 1 from public.meeting_change_requests where meeting_id=m.id and state='pending') then
    raise exception 'a change is already pending' using errcode='PT409'; end if;
  if (select count(*) from public.meeting_change_requests where meeting_id=m.id and requested_by=auth.uid()
    and created_at>now()-interval '24 hours')>=3 then
    raise exception 'daily change limit' using errcode='P0001'; end if;
  insert into public.meeting_change_requests(meeting_id,base_revision,proposed_at,requested_by,
    male_agreed_at,female_agreed_at,expires_at,request_id)
  values(m.id,m.schedule_revision,p_proposed_at,auth.uid(),
    case when auth.uid()=i.male_id then now() end,case when auth.uid()=i.female_id then now() end,
    least(now()+interval '24 hours',m.scheduled_at-interval '2 hours',p_proposed_at-interval '3 hours'),p_request_id) returning * into c;
  insert into public.notifications(user_id,kind,meeting_id,event_version)
    values(case when auth.uid()=i.male_id then i.female_id else i.male_id end,
      'meeting_change_requested',m.id,'change:'||c.id);
  return public.my_meeting_change(m.id);
end $$;
revoke all on function public.request_meeting_change(uuid,timestamptz,integer,uuid) from public,anon;
grant execute on function public.request_meeting_change(uuid,timestamptz,integer,uuid) to authenticated;

create function public.respond_meeting_change(p_change_id uuid,p_accept boolean) returns public.meetings
  language plpgsql security definer set search_path=public,pg_temp as $$
declare c public.meeting_change_requests; m public.meetings; i public.intros;
begin
  select * into c from public.meeting_change_requests where id=p_change_id;
  if c.id is null or not public.is_meeting_participant(c.meeting_id) or not exists(select 1 from public.profiles
    where id=auth.uid() and account_state='active') then raise exception 'not a participant' using errcode='42501'; end if;
  select * into m from public.meetings where id=c.meeting_id for update;
  select * into c from public.meeting_change_requests where id=p_change_id for update;
  select * into i from public.intros where id=m.intro_id;
  if c.state='accepted' and m.schedule_revision=c.base_revision+1 and p_accept is true then return m; end if;
  if p_accept is false and m.schedule_revision=c.base_revision and
    ((c.state='declined' and c.requested_by<>auth.uid()) or (c.state='withdrawn' and c.requested_by=auth.uid())) then return m; end if;
  if p_accept is null or c.state<>'pending' or c.expires_at<=now() or m.schedule_revision<>c.base_revision or
    m.cancelled_at is not null or m.completed_at is not null or m.scheduled_at<=now() then
    raise exception 'schedule changed or unavailable' using errcode='PT409'; end if;
  if not p_accept then
    update public.meeting_change_requests set state=case when requested_by=auth.uid() then 'withdrawn' else 'declined' end where id=c.id;
    return m;
  end if;
  if c.requested_by=auth.uid() then raise exception 'partner agreement required' using errcode='42501'; end if;
  if c.proposed_at<now()+interval '3 hours' then raise exception 'proposed time is too close' using errcode='PT409'; end if;
  update public.meeting_change_requests set male_agreed_at=coalesce(male_agreed_at,now()),
    female_agreed_at=coalesce(female_agreed_at,now()),state='accepted' where id=c.id returning * into c;
  -- The existing confirmation trigger serializes both participants and rejects
  -- double booking. Nothing charges/refunds/reissues a ticket here.
  update public.meetings set scheduled_at=c.proposed_at,proposed_slots=array[c.proposed_at],accepted_slot=0,
    schedule_revision=schedule_revision+1,
    male_attendance_policy_ack_at=c.male_agreed_at,female_attendance_policy_ack_at=c.female_agreed_at,
    private_opens_at=case when private_opens_at<=now() then private_opens_at else
      greatest(now(),((c.proposed_at at time zone 'Asia/Seoul')::date-1+time '18:00') at time zone 'Asia/Seoul') end
    where id=m.id returning * into m;
  update public.notifications set dispatch_state=case
      when dispatch_state in ('pending','retry','running') then 'skipped' else dispatch_state end,
    last_error='schedule_superseded',lease_token=null,lease_until=null
    where meeting_id=m.id and schedule_revision<m.schedule_revision;
  insert into public.notifications(user_id,kind,meeting_id)
    values(i.male_id,'meeting_changed',m.id),(i.female_id,'meeting_changed',m.id) on conflict do nothing;
  return m;
end $$;
revoke all on function public.respond_meeting_change(uuid,boolean) from public,anon;
grant execute on function public.respond_meeting_change(uuid,boolean) to authenticated;

create or replace function public.meeting_checkin_notice_read(p_meeting uuid,p_user uuid) returns boolean
  language sql stable security definer set search_path=public,pg_temp as $$
  select exists(select 1 from public.notifications n join public.meetings m on m.id=n.meeting_id
    where n.meeting_id=p_meeting and n.user_id=p_user and n.schedule_revision=m.schedule_revision
      and n.kind in ('meeting_checkin_reminder','meeting_checkin_final') and n.read_at is not null)
$$;

alter function public.notification_push_still_relevant(uuid,uuid) rename to notification_relevant_before_schedule_revision;
revoke all on function public.notification_relevant_before_schedule_revision(uuid,uuid) from public,anon,authenticated,service_role;
create function public.notification_push_still_relevant(p_id uuid,p_lease_token uuid) returns boolean
  language plpgsql stable security definer set search_path=public,pg_temp as $$
declare n public.notifications; m public.meetings;
begin
  if not public.notification_relevant_before_schedule_revision(p_id,p_lease_token) then return false; end if;
  select * into n from public.notifications where id=p_id;
  if n.meeting_id is null then return true; end if;
  select * into m from public.meetings where id=n.meeting_id;
  if n.schedule_revision<>m.schedule_revision then return false; end if;
  if n.kind='meeting_change_requested' then
    return m.cancelled_at is null and exists(select 1 from public.meeting_change_requests c
      where 'change:'||c.id=n.event_version and c.state='pending' and c.expires_at>now());
  end if;
  if n.kind='meeting_changed' then
    return m.cancelled_at is null and m.completed_at is null and m.scheduled_at>now();
  end if;
  return true;
end $$;
revoke all on function public.notification_push_still_relevant(uuid,uuid) from public,anon,authenticated;
grant execute on function public.notification_push_still_relevant(uuid,uuid) to service_role;

create or replace function public.my_notifications(p_limit integer default 50)
returns table(id uuid,kind public.notification_kind,created_at timestamptz,read_at timestamptz,meeting_id uuid,counterpart_name text)
language sql stable security definer set search_path=public,pg_temp as $$
  select n.id,n.kind,n.created_at,n.read_at,n.meeting_id,
    (select p.name from public.profiles p where p.id=coalesce(nullif(n.payload->>'counterpart_id','')::uuid,
      (select case when i.male_id=n.user_id then i.female_id else i.male_id end
       from public.meetings m join public.intros i on i.id=m.intro_id where m.id=n.meeting_id)))
  from public.notifications n where n.user_id=auth.uid() and n.kind<>'notification_email_verify'
    and n.last_error is distinct from 'schedule_superseded'
    order by n.created_at desc,n.id desc limit least(greatest(coalesce(p_limit,50),1),100)
$$;
create or replace function public.unread_notification_count() returns integer
  language sql stable security definer set search_path=public,pg_temp as $$
  select count(*)::integer from public.notifications where user_id=auth.uid() and read_at is null
    and kind<>'notification_email_verify' and last_error is distinct from 'schedule_superseded'
$$;

create function public.mark_displayed_notifications_read(p_ids uuid[]) returns void
  language plpgsql security definer set search_path=public,pg_temp as $$
begin
  if auth.uid() is null then raise exception 'unauthenticated' using errcode='28000'; end if;
  if p_ids is null or cardinality(p_ids)>100 then raise exception 'invalid list' using errcode='22023'; end if;
  update public.notifications set read_at=now() where id=any(p_ids) and user_id=auth.uid() and read_at is null;
end $$;
revoke all on function public.mark_displayed_notifications_read(uuid[]) from public,anon;
grant execute on function public.mark_displayed_notifications_read(uuid[]) to authenticated;

-- An old client's unbounded "read all" must not mark unseen check-in notices.
create or replace function public.mark_notifications_read() returns void
  language sql security definer set search_path=public,pg_temp as $$
  update public.notifications set read_at=now() where user_id=auth.uid() and read_at is null
    and kind not in ('meeting_checkin_reminder','meeting_checkin_final')
$$;
