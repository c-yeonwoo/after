create table public.meeting_manual_confirmations (
  meeting_id uuid references public.meetings(id) on delete cascade,
  schedule_revision integer not null,
  actor_id uuid references public.profiles(id) on delete set null,
  confirmed_at timestamptz not null default now(),
  primary key(meeting_id,schedule_revision)
);
create table public.member_warning_reviews (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  covered_meetings uuid[] not null,
  reviewed_at timestamptz not null default now()
);
alter table public.meeting_manual_confirmations enable row level security;
alter table public.member_warning_reviews enable row level security;
revoke all on public.meeting_manual_confirmations,public.member_warning_reviews from public,anon,authenticated;

create function public.meeting_manually_confirmed(p_meeting uuid) returns boolean
  language sql stable security definer set search_path=public,pg_temp as $$
  select exists(select 1 from public.meeting_manual_confirmations c join public.meetings m on m.id=c.meeting_id
    where m.id=p_meeting and c.schedule_revision=m.schedule_revision)
$$;
revoke all on function public.meeting_manually_confirmed(uuid) from public,anon,authenticated;

create function public.meeting_contact_needed(p_meeting uuid) returns boolean
  language sql stable security definer set search_path=public,pg_temp as $$
  select exists(select 1 from public.meetings m join public.intros i on i.id=m.intro_id
    join public.profiles mp on mp.id=i.male_id join public.profiles fp on fp.id=i.female_id
    where m.id=p_meeting and m.confirmed_at is not null and m.cancelled_at is null and m.completed_at is null
      and mp.account_state='active' and fp.account_state='active'
      and m.scheduled_at>now()-interval '1 day' and m.scheduled_at<=now()+interval '4 hours'
      and (m.male_attendance_at is null or m.female_attendance_at is null)
      and not public.meeting_manually_confirmed(m.id))
$$;
revoke all on function public.meeting_contact_needed(uuid) from public,anon,authenticated;

create function public.warning_review_needed(p_user uuid) returns boolean
  language sql stable security definer set search_path=public,pg_temp as $$
  select count(*)>=2 and coalesce(bool_or(not(w.meeting_id=any(coalesce(r.covered_meetings,'{}'::uuid[])))),false)
    from public.meeting_response_warnings w join public.profiles p on p.id=w.user_id and p.account_state='active'
    left join public.member_warning_reviews r on r.user_id=w.user_id
    where w.user_id=p_user and w.created_at>now()-interval '90 days'
$$;
revoke all on function public.warning_review_needed(uuid) from public,anon,authenticated;

alter table public.ops_cases drop constraint ops_cases_case_type_check;
alter table public.ops_cases add constraint ops_cases_case_type_check check(case_type in (
  'support','photo_review','content_report','no_show_report','payment_unknown','notification_failure',
  'meeting_followup','response_review'));

-- Extend only the two existing literal validation lists; preserve their
-- source-of-truth, idempotency, cursor and optimistic locking implementations.
do $$ declare f record; definition text; begin
  for f in select p.oid,p.proname from pg_proc p join pg_namespace ns on ns.oid=p.pronamespace
    where ns.nspname='public' and p.proname in ('ops_sync_case','admin_ops_cases')
  loop
    definition:=pg_get_functiondef(f.oid);
    if f.proname='admin_ops_cases' and definition not like '%''notification_failure''%' then
      definition:=regexp_replace(definition,'p_type not in\s*\(([^)]*)\)',
        'p_type not in (\1,''notification_failure'')','gi');
    end if;
    if definition not like '%''meeting_followup''%' then
      definition:=regexp_replace(definition,'p_type not in\s*\(([^)]*)\)',
        'p_type not in (\1,''meeting_followup'',''response_review'')','gi');
    end if;
    execute definition;
  end loop;
end $$;

alter function public.ops_source_open(text,text) rename to ops_source_before_meeting_followup;
revoke all on function public.ops_source_before_meeting_followup(text,text) from public,anon,authenticated;
create function public.ops_source_open(p_type text,p_source_id text) returns boolean
  language plpgsql stable security definer set search_path=public,pg_temp as $$
begin
  if p_type in ('meeting_followup','response_review') and p_source_id !~ '^[0-9a-f-]{36}$' then return false; end if;
  if p_type='meeting_followup' then return public.meeting_contact_needed(p_source_id::uuid); end if;
  if p_type='response_review' then return public.warning_review_needed(p_source_id::uuid); end if;
  return public.ops_source_before_meeting_followup(p_type,p_source_id);
end $$;
revoke all on function public.ops_source_open(text,text) from public,anon,authenticated;

alter function public.ops_current_sources() rename to ops_sources_before_meeting_followup;
revoke all on function public.ops_sources_before_meeting_followup() from public,anon,authenticated;
create function public.ops_current_sources()
returns table(case_type text,source_id text,subject_id uuid,source_revision text,priority text)
  language sql stable security definer set search_path=public,pg_temp as $$
  select * from public.ops_sources_before_meeting_followup()
  union all
  select 'meeting_followup',m.id::text,i.male_id,
    m.schedule_revision||':'||coalesce(m.male_attendance_at::text,'')||':'||coalesce(m.female_attendance_at::text,''),'high'
    from public.meetings m join public.intros i on i.id=m.intro_id where public.meeting_contact_needed(m.id)
  union all
  select 'response_review',p.id::text,p.id,
    (select md5(string_agg(w.meeting_id::text,',' order by w.meeting_id)) from public.meeting_response_warnings w
      where w.user_id=p.id and w.created_at>now()-interval '90 days'),'normal'
    from public.profiles p where public.warning_review_needed(p.id)
$$;
revoke all on function public.ops_current_sources() from public,anon,authenticated;

create function public.refresh_meeting_operations() returns void
  language plpgsql security definer set search_path=public,pg_temp as $$
declare r record; case_id uuid;
begin
  for r in select * from public.ops_current_sources() where case_type in ('meeting_followup','response_review') loop
    case_id:=public.ops_sync_case(r.case_type,r.source_id,r.subject_id,r.source_revision,true,r.priority);
    if r.case_type='meeting_followup' then
      update public.ops_cases c set due_at=least(c.due_at,
        case when m.scheduled_at>now() then m.scheduled_at-interval '2 hours' else m.scheduled_at+interval '1 hour' end)
        from public.meetings m where c.id=case_id and m.id::text=r.source_id;
    end if;
  end loop;
  for r in select * from public.ops_cases where case_type in ('meeting_followup','response_review')
    and status not in ('resolved','superseded') loop
    if not public.ops_source_open(r.case_type,r.source_id) then
      perform public.ops_sync_case(r.case_type,r.source_id,r.subject_id,'closed',false,r.priority);
    end if;
  end loop;
  update public.meeting_change_requests c set state=case when c.expires_at<=now() then 'expired' else 'superseded' end
    from public.meetings m where c.meeting_id=m.id and c.state='pending' and
      (c.expires_at<=now() or m.cancelled_at is not null or m.completed_at is not null or m.schedule_revision<>c.base_revision);
end $$;
revoke all on function public.refresh_meeting_operations() from public,anon,authenticated;

create function public.admin_complete_meeting_operation(p_case_id uuid,p_expected_version integer,
  p_note text,p_request_id uuid,p_both_confirmed boolean default false) returns void
  language plpgsql security definer set search_path=public,pg_temp as $$
declare c public.ops_cases; m public.meetings; other_case uuid;
begin
  if not public.is_admin() then raise exception 'admin only' using errcode='42501'; end if;
  if p_request_id is null or char_length(btrim(coalesce(p_note,''))) not between 3 and 500 then
    raise exception 'request and reason required' using errcode='22023'; end if;
  select * into c from public.ops_cases where id=p_case_id;
  if c.case_type='meeting_followup' then
    select * into m from public.meetings where id::text=c.source_id for update;
  end if;
  perform pg_advisory_xact_lock(hashtextextended(c.case_type||':'||c.source_id,0));
  select * into c from public.ops_cases where id=p_case_id for update;
  select case_id into other_case from public.ops_case_events where request_id=p_request_id;
  if found then
    if other_case<>p_case_id then raise exception 'request ID conflict' using errcode='PT409'; end if;
    return;
  end if;
  if c.id is null or c.case_type not in ('meeting_followup','response_review') or
    c.version is distinct from p_expected_version or c.status in ('resolved','superseded') then
    raise exception 'stale_version' using errcode='PT409'; end if;
  if not public.ops_source_open(c.case_type,c.source_id) then raise exception 'source changed' using errcode='PT409'; end if;
  if c.case_type='meeting_followup' then
    if p_both_confirmed is distinct from true or m.scheduled_at<=now() then
      raise exception 'both participants must explicitly confirm before the meeting' using errcode='22023'; end if;
    insert into public.meeting_manual_confirmations(meeting_id,schedule_revision,actor_id)
      values(m.id,m.schedule_revision,auth.uid()) on conflict do nothing;
  else
    insert into public.member_warning_reviews(user_id,covered_meetings)
      select c.source_id::uuid,array_agg(meeting_id order by meeting_id)
      from public.meeting_response_warnings where user_id=c.source_id::uuid and created_at>now()-interval '90 days'
      on conflict(user_id) do update set covered_meetings=excluded.covered_meetings,reviewed_at=now();
  end if;
  perform public.ops_sync_case(c.case_type,c.source_id,c.subject_id,'operator_reviewed',false,c.priority);
  insert into public.ops_case_events(case_id,event_type,actor_type,actor_id,from_status,to_status,reason_code,note,request_id)
    values(c.id,'resolved','admin',auth.uid(),c.status,'resolved','operator_verified',btrim(p_note),p_request_id);
  insert into public.admin_actions(actor_id,kind,target_user,target_ref,case_id,request_id,note)
    values(auth.uid(),'case_transition',c.subject_id,c.id,c.id,p_request_id,btrim(p_note));
end $$;
revoke all on function public.admin_complete_meeting_operation(uuid,integer,text,uuid,boolean) from public,anon;
grant execute on function public.admin_complete_meeting_operation(uuid,integer,text,uuid,boolean) to authenticated;

alter function public.admin_ops_case_detail(uuid) rename to ops_detail_before_meeting_followup;
revoke all on function public.ops_detail_before_meeting_followup(uuid) from public,anon,authenticated;
create function public.admin_ops_case_detail(p_case_id uuid) returns jsonb
  language plpgsql stable security definer set search_path=public,pg_temp as $$
declare v jsonb; c public.ops_cases; context jsonb;
begin
  if not public.is_admin() then raise exception 'admin only' using errcode='42501'; end if;
  v:=public.ops_detail_before_meeting_followup(p_case_id);
  select * into c from public.ops_cases where id=p_case_id;
  if c.source_id !~ '^[0-9a-f-]{36}$' then return v; end if;
  if c.case_type='meeting_followup' then
    select jsonb_build_object('meetingId',m.id,'scheduledAt',m.scheduled_at,
      'revision',m.schedule_revision,'canConfirm',m.scheduled_at>now(),
      'maleId',i.male_id,'femaleId',i.female_id) into context
      from public.meetings m join public.intros i on i.id=m.intro_id where m.id::text=c.source_id;
  elsif c.case_type='response_review' then
    context:=jsonb_build_object('warningCount',(select count(*) from public.meeting_response_warnings
      where user_id=c.source_id::uuid and created_at>now()-interval '90 days'));
  else return v; end if;
  return v||jsonb_build_object('context',context);
end $$;
revoke all on function public.admin_ops_case_detail(uuid) from public,anon;
grant execute on function public.admin_ops_case_detail(uuid) to authenticated;

alter function public.admin_meeting_lifecycle() rename to lifecycle_before_operations;
revoke all on function public.lifecycle_before_operations() from public,anon,authenticated;
create function public.admin_meeting_lifecycle() returns jsonb
  language plpgsql stable security definer set search_path=public,pg_temp as $$
declare v jsonb; items jsonb;
begin
  if not public.is_admin() then raise exception 'admin only' using errcode='42501'; end if;
  v:=public.lifecycle_before_operations();
  select coalesce(jsonb_agg(item||jsonb_build_object(
    'operator_confirmed',public.meeting_manually_confirmed((item->>'id')::uuid),
    'male_review_pending',public.warning_review_needed((item->>'male_id')::uuid),
    'female_review_pending',public.warning_review_needed((item->>'female_id')::uuid),
    'male_review_case',(select id from public.ops_cases where case_type='response_review' and source_id=item->>'male_id' and status not in ('resolved','superseded')),
    'female_review_case',(select id from public.ops_cases where case_type='response_review' and source_id=item->>'female_id' and status not in ('resolved','superseded')),
    'contact_case',(select id from public.ops_cases where case_type='meeting_followup' and source_id=item->>'id' and status not in ('resolved','superseded'))
  ) order by position),'[]'::jsonb) into items from jsonb_array_elements(v->'items') with ordinality as x(item,position);
  return jsonb_set(v,'{items}',items);
end $$;
revoke all on function public.admin_meeting_lifecycle() from public,anon;
grant execute on function public.admin_meeting_lifecycle() to authenticated;

alter function public.my_meeting_checkin(uuid) rename to checkin_before_operations;
revoke all on function public.checkin_before_operations(uuid) from public,anon,authenticated;
create function public.my_meeting_checkin(p_meeting_id uuid) returns jsonb
  language plpgsql stable security definer set search_path=public,pg_temp as $$
begin
  return public.checkin_before_operations(p_meeting_id)||jsonb_build_object('operatorConfirmed',public.meeting_manually_confirmed(p_meeting_id));
end $$;
revoke all on function public.my_meeting_checkin(uuid) from public,anon;
grant execute on function public.my_meeting_checkin(uuid) to authenticated;

-- No copied contact details. Withdrawal redacts new operational notes too,
-- including a contact case whose subject was the other participant.
create function public.erase_meeting_operations_on_withdrawal() returns trigger
  language plpgsql security definer set search_path=public,pg_temp as $$
declare c public.ops_cases;
begin
  if new.account_state='withdrawn' and old.account_state<>'withdrawn' then
    for c in select * from public.ops_cases where
      (case_type='response_review' and source_id=new.id::text) or
      (case_type='meeting_followup' and source_id in (select m.id::text from public.meetings m
        join public.intros i on i.id=m.intro_id where new.id in(i.male_id,i.female_id))) for update
    loop
      update public.ops_case_events set note=null where case_id=c.id;
      update public.admin_actions set note='회원 탈퇴로 운영 메모 삭제' where case_id=c.id;
      update public.ops_cases set source_id='erased:'||gen_random_uuid(),subject_id=null,
        status='superseded',resolved_at=coalesce(resolved_at,now()),resolution_code='member_withdrawn',version=version+1 where id=c.id;
    end loop;
    delete from public.member_warning_reviews where user_id=new.id;
  end if;
  return new;
end $$;
revoke all on function public.erase_meeting_operations_on_withdrawal() from public,anon,authenticated;
create trigger a_erase_meeting_operations after update of account_state on public.profiles
  for each row execute function public.erase_meeting_operations_on_withdrawal();

create or replace function public.meeting_lifecycle_tick() returns integer
  language plpgsql security definer set search_path=public,pg_temp as $$
declare r record; k public.notification_kind; u uuid; n integer:=0; added integer;
begin
  if not pg_try_advisory_xact_lock(hashtextextended('meeting-lifecycle-v1',0)) then return 0; end if;
  for r in select m.*,i.male_id,i.female_id from public.meetings m
    join public.intros i on i.id=m.intro_id
    where m.attendance_policy_version is not null and m.confirmed_at is not null
      and m.cancelled_at is null and m.completed_at is null
      and m.scheduled_at>now() and m.scheduled_at<=now()+interval '24 hours'
    order by m.id for update of m skip locked
  loop
    if r.scheduled_at<=now()+interval '2 hours' and
       r.male_attendance_at is null and r.female_attendance_at is null and
       not public.meeting_manually_confirmed(r.id) and
       public.meeting_checkin_notice_read(r.id,r.male_id) and
       public.meeting_checkin_notice_read(r.id,r.female_id) then
      update public.meetings set cancelled_at=now(),cancel_reason='checkin_no_response' where id=r.id;
      update public.intros set closed_at=now(),outcome='expired' where id=r.intro_id and closed_at is null;
      perform public.refund_ticket(r.ticket_id,'checkin_no_response');
      perform public.record_meeting_response_warning(r.male_id,r.id,'checkin_timeout');
      perform public.record_meeting_response_warning(r.female_id,r.id,'checkin_timeout');
      insert into public.notifications(user_id,kind,meeting_id)
        values(r.female_id,'meeting_checkin_cancelled',r.id) on conflict do nothing;
      n:=n+1;
    elsif r.scheduled_at>now()+interval '2 hours' then
      k:=case when r.scheduled_at<=now()+interval '4 hours'
        then 'meeting_checkin_final'::public.notification_kind
        else 'meeting_checkin_reminder'::public.notification_kind end;
      for u in select x.user_id from (values(r.male_id,r.male_attendance_at),
        (r.female_id,r.female_attendance_at)) x(user_id,confirmed_at)
        join public.profiles p on p.id=x.user_id and p.account_state='active'
        where x.confirmed_at is null
      loop
        insert into public.notifications(user_id,kind,meeting_id) values(u,k,r.id) on conflict do nothing;
        get diagnostics added=row_count; n:=n+added;
      end loop;
    end if;
  end loop;
  perform public.refresh_meeting_operations();
  return n+public.enqueue_feedback_due();
end $$;
select public.refresh_meeting_operations();
