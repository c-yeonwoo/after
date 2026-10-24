-- No autonomous execution: an immutable, short-lived draft is approved by its owner.
create table public.assistant_actions (
  id uuid primary key,
  owner_id uuid not null references public.profiles(id) on delete cascade,
  meeting_id uuid not null references public.meetings(id) on delete cascade,
  kind text not null check(kind in ('preferences','accept_slot','confirm','change')),
  args jsonb not null,
  preview jsonb not null,
  base_hash text not null,
  approval_token uuid not null default gen_random_uuid(),
  state text not null default 'awaiting_approval' check(state in ('awaiting_approval','succeeded','revoked')),
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default now()+interval '15 minutes',
  executed_at timestamptz
);
create index assistant_actions_owner on public.assistant_actions(owner_id,created_at desc);
alter table public.assistant_actions enable row level security;
revoke all on public.assistant_actions from public,anon,authenticated;
grant all on public.assistant_actions to service_role;

create function public.assistant_schedule_hash(p_id uuid) returns text
language sql stable security definer set search_path=public,pg_temp as $$
  select md5(jsonb_build_object('meeting',to_jsonb(m),'changes',
    (select jsonb_agg(to_jsonb(c) order by c.sequence_id) from meeting_change_requests c where c.meeting_id=m.id))::text)
    from meetings m where m.id=p_id;
$$;
revoke all on function public.assistant_schedule_hash(uuid) from public,anon,authenticated;

-- The caller must already have a paid/free-beta ticket-backed meeting. This
-- feature never buys a ticket, creates a match, or accepts on behalf of a partner.
create function public.assistant_check_schedule(p_meeting uuid,p_kind text,p_args jsonb) returns void
language plpgsql security definer set search_path=public,pg_temp as $$
declare m meetings; i intros; d timestamptz; slot integer; candidate text;
begin
  perform assistant_require_owner();
  select * into m from meetings where id=p_meeting;
  select * into i from intros where id=m.intro_id;
  if i.id is null or auth.uid() not in(i.male_id,i.female_id) or m.cancelled_at is not null
    or m.completed_at is not null or is_excluded(i.male_id,i.female_id)
    or (select count(*) from profiles where id in(i.male_id,i.female_id) and account_state='active' and onboarding_step>=7)<>2
    or not exists(select 1 from tickets where id=m.ticket_id and state='used') then
    raise exception 'meeting unavailable' using errcode='PT409'; end if;
  if not (select assistant_schedule_enabled from app_settings where id) then
    raise exception 'feature disabled' using errcode='PT403'; end if;
  if p_args is null or jsonb_typeof(p_args)<>'object' then raise exception 'invalid draft' using errcode='22023'; end if;
  if (p_kind='change' and p_args-'at'<>'{}'::jsonb)
    or (p_kind='accept_slot' and p_args-'slot'<>'{}'::jsonb)
    or (p_kind='confirm' and p_args-array['at','place','placeKind']<>'{}'::jsonb)
    or (p_kind='preferences' and p_args-array['dates','stations','anywhere']<>'{}'::jsonb) then
    raise exception 'hidden draft fields' using errcode='22023'; end if;
  if p_kind='change' then
    if m.confirmed_at is null or m.scheduled_at<=now()+interval '3 hours' then
      raise exception 'meeting unavailable' using errcode='PT409'; end if;
    d:=(p_args->>'at')::timestamptz;
    if d is null or d=m.scheduled_at or d<now()+interval '3 hours' or d>now()+interval '21 days'
      or extract(isodow from d at time zone 'Asia/Seoul')>5
      or (d at time zone 'Asia/Seoul')::time not between time '18:00' and time '22:00'
      or exists(select 1 from meeting_change_requests where meeting_id=m.id and state='pending' and expires_at>now()) then
      raise exception 'invalid date or pending request' using errcode='PT409'; end if;
  else
    if m.confirmed_at is not null then raise exception 'already confirmed' using errcode='PT409'; end if;
    if p_kind='accept_slot' then
      slot:=(p_args->>'slot')::integer;
      if auth.uid()<>i.female_id or slot is null or slot<0 or slot>=coalesce(cardinality(m.proposed_slots),0)
        or m.proposed_slots[slot+1]<=now() then raise exception 'slot unavailable' using errcode='PT409'; end if;
    elsif p_kind='preferences' then
      if auth.uid()<>i.female_id or coalesce(cardinality(m.proposed_slots),0)>0
        or jsonb_typeof(p_args->'dates') is distinct from 'array'
        or jsonb_array_length(p_args->'dates') not between 1 and 3
        or jsonb_typeof(p_args->'stations') is distinct from 'array'
        or jsonb_array_length(p_args->'stations')<>0
        or (p_args->>'anywhere') is distinct from 'true' then
        raise exception 'invalid preferences' using errcode='22023'; end if;
      for candidate in select jsonb_array_elements_text(p_args->'dates') loop
        d:=candidate::timestamptz;
        if d<now()+interval '3 hours' or d>now()+interval '21 days' then raise exception 'invalid date' using errcode='22023'; end if;
      end loop;
    elsif p_kind='confirm' then
      d:=(p_args->>'at')::timestamptz;
      if auth.uid()<>i.male_id or m.prefs_submitted_at is null or coalesce(cardinality(m.proposed_slots),0)>0
        or d is null or d<now()+interval '3 hours' or d>now()+interval '21 days'
        or not exists(select 1 from jsonb_array_elements_text(m.prefs->'dates') v where v::timestamptz=d)
        or length(trim(coalesce(p_args->>'place',''))) not between 2 and 100
        or p_args->>'placeKind' not in ('카페','저녁','가벼운 술','기타') or p_args->>'placeKind' is null then
        raise exception 'invalid confirmation' using errcode='22023'; end if;
    else raise exception 'invalid action' using errcode='22023'; end if;
  end if;
end $$;
revoke all on function public.assistant_check_schedule(uuid,text,jsonb) from public,anon,authenticated;

create function public.my_assistant_schedule() returns jsonb
language plpgsql stable security definer set search_path=public,pg_temp as $$
begin
  perform assistant_require_owner();
  return jsonb_build_object('enabled',(select assistant_schedule_enabled from app_settings where id),
    'meetings',coalesce((select jsonb_agg(jsonb_build_object('id',m.id,'name',p.name,
      'confirmed',m.confirmed_at is not null,'scheduledAt',m.scheduled_at,'slots',m.proposed_slots,
      'place',coalesce(m.proposed_place_name,m.place_name),'dates',m.prefs->'dates',
      'isFemale',i.female_id=auth.uid()) order by m.created_at desc)
      from meetings m join intros i on i.id=m.intro_id
      join profiles p on p.id=case when i.male_id=auth.uid() then i.female_id else i.male_id end
      where auth.uid() in(i.male_id,i.female_id) and m.cancelled_at is null and m.completed_at is null
        and p.account_state='active' and not is_excluded(i.male_id,i.female_id)
        and (select assistant_schedule_enabled from app_settings where id)),'[]'::jsonb),
    'actions',coalesce((select jsonb_agg(to_jsonb(a)||jsonb_build_object('state',
      case when a.state='awaiting_approval' and a.expires_at<=now() then 'expired' else a.state end)
      order by a.created_at desc) from (select * from assistant_actions where owner_id=auth.uid()
        and created_at>now()-interval '30 days' order by created_at desc limit 20) a),'[]'::jsonb));
end $$;
revoke all on function public.my_assistant_schedule() from public,anon;
grant execute on function public.my_assistant_schedule() to authenticated;

create function public.assistant_draft_schedule(p_id uuid,p_meeting uuid,p_kind text,p_args jsonb) returns jsonb
language plpgsql security definer set search_path=public,pg_temp as $$
declare a assistant_actions; m meetings; label text; view jsonb;
begin
  perform assistant_require_owner();
  perform pg_advisory_xact_lock(hashtextextended(auth.uid()::text||':assistant-schedule',0));
  select * into a from assistant_actions where id=p_id;
  if found then
    if a.owner_id<>auth.uid() or a.meeting_id<>p_meeting or a.kind<>p_kind or a.args is distinct from p_args then
      raise exception 'request conflict' using errcode='PT409'; end if;
    return my_assistant_schedule();
  end if;
  select * into m from meetings where id=p_meeting for update;
  perform assistant_check_schedule(p_meeting,p_kind,p_args);
  select p.name into label from intros i join profiles p
    on p.id=case when i.male_id=auth.uid() then i.female_id else i.male_id end where i.id=m.intro_id;
  view:=jsonb_build_object('name',label,'dates',case when p_kind='accept_slot' then jsonb_build_array(m.proposed_slots[(p_args->>'slot')::integer+1])
    when p_kind='preferences' then p_args->'dates' else jsonb_build_array(p_args->>'at') end,
    'place',case when p_kind='accept_slot' then m.proposed_place_name when p_kind='confirm' then p_args->>'place'
      when p_kind='change' then m.place_name else null end);
  if (select count(*) from assistant_actions where owner_id=auth.uid() and created_at>now()-interval '24 hours')>=20 then
    raise exception 'draft limit' using errcode='PT429'; end if;
  update assistant_actions set state='revoked' where owner_id=auth.uid() and meeting_id=p_meeting and state='awaiting_approval';
  insert into assistant_actions(id,owner_id,meeting_id,kind,args,preview,base_hash)
    values(p_id,auth.uid(),p_meeting,p_kind,p_args,view,assistant_schedule_hash(p_meeting));
  return my_assistant_schedule();
end $$;
revoke all on function public.assistant_draft_schedule(uuid,uuid,text,jsonb) from public,anon;
grant execute on function public.assistant_draft_schedule(uuid,uuid,text,jsonb) to authenticated;

create function public.assistant_approve_schedule(p_id uuid,p_token uuid,p_policy_ack boolean) returns jsonb
language plpgsql security definer set search_path=public,pg_temp as $$
declare a assistant_actions; m meetings;
begin
  perform assistant_require_owner();
  select * into a from assistant_actions where id=p_id and owner_id=auth.uid();
  if a.id is null or p_token is distinct from a.approval_token or p_policy_ack is distinct from true then
    raise exception 'approval required' using errcode='42501'; end if;
  -- Same order for all operations: meeting -> action. Existing RPCs re-lock the same meeting.
  select * into m from meetings where id=a.meeting_id for update;
  select * into a from assistant_actions where id=p_id for update;
  if a.state='succeeded' then return my_assistant_schedule(); end if;
  if a.state<>'awaiting_approval' or a.expires_at<=now() or a.base_hash is distinct from assistant_schedule_hash(a.meeting_id) then
    raise exception 'draft changed or expired' using errcode='PT409'; end if;
  perform assistant_check_schedule(a.meeting_id,a.kind,a.args);
  if a.kind='preferences' then perform submit_meeting_prefs_v2(a.meeting_id,a.args);
  elsif a.kind='accept_slot' then perform accept_meeting_slot_v2(a.meeting_id,(a.args->>'slot')::integer);
  elsif a.kind='confirm' then perform confirm_meeting_v2(a.meeting_id,(a.args->>'at')::timestamptz,a.args->>'place',a.args->>'placeKind');
  elsif a.kind='change' then perform request_meeting_change(a.meeting_id,(a.args->>'at')::timestamptz,m.schedule_revision,a.id);
  end if;
  update assistant_actions set state='succeeded',executed_at=now() where id=a.id;
  return my_assistant_schedule();
end $$;
revoke all on function public.assistant_approve_schedule(uuid,uuid,boolean) from public,anon;
grant execute on function public.assistant_approve_schedule(uuid,uuid,boolean) to authenticated;

create function public.assistant_revoke_schedule(p_id uuid) returns jsonb
language plpgsql security definer set search_path=public,pg_temp as $$
declare mid uuid;
begin
  perform assistant_require_owner();
  select meeting_id into mid from assistant_actions where id=p_id and owner_id=auth.uid();
  perform 1 from meetings where id=mid for update;
  update assistant_actions set state='revoked' where id=p_id and owner_id=auth.uid() and state='awaiting_approval';
  return my_assistant_schedule();
end $$;
revoke all on function public.assistant_revoke_schedule(uuid) from public,anon;
grant execute on function public.assistant_revoke_schedule(uuid) to authenticated;
select cron.schedule('expire-assistant-actions','17 * * * *',
  $$delete from public.assistant_actions where created_at<now()-interval '30 days'$$);
