-- New confirmations enroll explicitly. Historical confirmed appointments are
-- not retroactively canceled for a check-in requirement they never saw.
alter table public.domain_events drop constraint domain_events_event_type_check;
alter table public.domain_events add constraint domain_events_event_type_check check(event_type in (
  'support_requested','support_answered','photo_submitted','photo_reviewed',
  'content_reported','content_report_resolved','no_show_reported','no_show_resolved',
  'payment_attention','payment_reconciled','meeting_confirmed','meeting_canceled',
  'ticket_issued','ticket_consumed','ticket_restored','intro_delivered','intro_opened',
  'intro_expired','member_became_ready','member_became_unready',
  'meeting_attendance_confirmed','meeting_response_warning'
));
alter table public.meetings
  add column attendance_policy_version text,
  add column male_attendance_policy_ack_at timestamptz,
  add column female_attendance_policy_ack_at timestamptz,
  add column male_attendance_at timestamptz,
  add column female_attendance_at timestamptz;

create table public.meeting_response_warnings (
  user_id uuid not null references public.profiles(id) on delete cascade,
  meeting_id uuid not null references public.meetings(id) on delete cascade,
  reason text not null check (reason in ('request_timeout','checkin_timeout')),
  created_at timestamptz not null default now(),
  primary key (user_id, meeting_id)
);
alter table public.meeting_response_warnings enable row level security;
create index meeting_response_warnings_recent on public.meeting_response_warnings(user_id,created_at desc);
revoke all on public.meeting_response_warnings from public, anon, authenticated;

create function public.enroll_meeting_attendance() returns trigger
  language plpgsql set search_path = public, pg_temp as $$
begin
  if new.confirmed_at is not null and
     (old.confirmed_at is null or new.scheduled_at is distinct from old.scheduled_at) then
    new.attendance_policy_version := case when new.male_attendance_policy_ack_at is not null
      and new.female_attendance_policy_ack_at is not null then 'checkin-v1' end;
    new.male_attendance_at := null;
    new.female_attendance_at := null;
  end if;
  return new;
end $$;
revoke all on function public.enroll_meeting_attendance() from public,anon,authenticated;
create trigger meetings_enroll_attendance before update of confirmed_at,scheduled_at
  on public.meetings for each row execute function public.enroll_meeting_attendance();

create function public.my_meeting_checkin(p_meeting_id uuid) returns jsonb
  language plpgsql stable security definer set search_path = public, pg_temp as $$
declare m public.meetings; i public.intros; mine timestamptz; partner timestamptz;
begin
  if auth.uid() is null then raise exception 'unauthenticated' using errcode='28000'; end if;
  select * into m from public.meetings where id=p_meeting_id;
  select * into i from public.intros where id=m.intro_id;
  if m.id is null or auth.uid() not in (i.male_id,i.female_id) then
    raise exception 'not a participant' using errcode='42501';
  end if;
  mine := case when auth.uid()=i.male_id then m.male_attendance_at else m.female_attendance_at end;
  partner := case when auth.uid()=i.male_id then m.female_attendance_at else m.male_attendance_at end;
  return jsonb_build_object('enrolled',m.attendance_policy_version is not null,
    'confirmed',mine is not null,'partnerConfirmed',partner is not null,
    'dueAt',m.scheduled_at-interval '2 hours','scheduledAt',m.scheduled_at,
    'opensAt',m.scheduled_at-interval '24 hours','asOf',now(),
    'cancelled',m.cancelled_at is not null,'completed',m.completed_at is not null);
end $$;
revoke all on function public.my_meeting_checkin(uuid) from public,anon;
grant execute on function public.my_meeting_checkin(uuid) to authenticated;

create function public.confirm_meeting_attendance(p_meeting_id uuid) returns jsonb
  language plpgsql security definer set search_path = public, pg_temp as $$
declare m public.meetings; i public.intros;
begin
  if auth.uid() is null then raise exception 'unauthenticated' using errcode='28000'; end if;
  select * into m from public.meetings where id=p_meeting_id for update;
  select * into i from public.intros where id=m.intro_id;
  if m.id is null or auth.uid() not in (i.male_id,i.female_id) or
     not exists(select 1 from public.profiles where id=auth.uid() and account_state='active') then
    raise exception 'not a participant' using errcode='42501';
  end if;
  if m.attendance_policy_version is null or m.confirmed_at is null or
     m.cancelled_at is not null or m.completed_at is not null or m.scheduled_at<=now() then
    raise exception 'checkin unavailable' using errcode='PT409';
  end if;
  if m.scheduled_at>now()+interval '24 hours' then
    raise exception 'checkin not open' using errcode='PT409';
  end if;
  if m.scheduled_at<=now()+interval '2 hours' and
     m.male_attendance_at is null and m.female_attendance_at is null then
    raise exception 'checkin deadline passed' using errcode='PT409';
  end if;
  update public.meetings set
    male_attendance_at=case when auth.uid()=i.male_id then coalesce(male_attendance_at,now()) else male_attendance_at end,
    female_attendance_at=case when auth.uid()=i.female_id then coalesce(female_attendance_at,now()) else female_attendance_at end
    where id=m.id;
  perform public.ops_emit_domain_event('meeting_attendance_confirmed','meeting',m.id::text,
    auth.uid(),'attendance:'||m.id||':'||auth.uid());
  return public.my_meeting_checkin(m.id);
end $$;
revoke all on function public.confirm_meeting_attendance(uuid) from public,anon;
grant execute on function public.confirm_meeting_attendance(uuid) to authenticated;

create function public.record_meeting_response_warning(p_user uuid,p_meeting uuid,p_reason text)
  returns void language plpgsql security definer set search_path=public,pg_temp as $$
begin
  if not exists(select 1 from public.profiles where id=p_user and account_state<>'withdrawn') then return; end if;
  insert into public.meeting_response_warnings(user_id,meeting_id,reason)
    values(p_user,p_meeting,p_reason) on conflict do nothing;
  perform public.ops_emit_domain_event('meeting_response_warning','meeting',p_meeting::text,
    p_user,'response-warning:'||p_meeting||':'||p_user,jsonb_build_object('reason',p_reason));
end $$;
revoke all on function public.record_meeting_response_warning(uuid,uuid,text) from public,anon,authenticated;

-- Lock the same meeting row as slot acceptance. A sweep must not cancel an
-- appointment that was confirmed while the sweep was waiting for the lock.
create or replace function public.expire_unanswered_meetings() returns integer
  language plpgsql security definer set search_path=public,pg_temp as $$
declare r record; n integer:=0;
begin
  for r in select m.id,m.intro_id,m.ticket_id,i.female_id
    from public.meetings m join public.tickets t on t.id=m.ticket_id
    join public.intros i on i.id=m.intro_id
    where m.prefs_submitted_at is null and m.confirmed_at is null
      and m.completed_at is null and m.cancelled_at is null
      and t.used_at<now()-interval '24 hours' and t.state='used' and t.kind='meeting'
    order by m.id for update of m skip locked
  loop
    update public.meetings set cancelled_at=now(),cancel_reason='no_response_24h' where id=r.id;
    update public.intros set closed_at=now(),outcome='expired' where id=r.intro_id and closed_at is null;
    perform public.refund_ticket(r.ticket_id,'no_response_24h');
    if exists(select 1 from public.notifications where meeting_id=r.id and user_id=r.female_id
      and kind in ('meeting_requested','meeting_request_reminder') and read_at is not null) then
      perform public.record_meeting_response_warning(r.female_id,r.id,'request_timeout');
    end if;
    n:=n+1;
  end loop;
  return n;
end $$;

create function public.meeting_feedback_due_at(p_scheduled timestamptz) returns timestamptz
  language sql immutable set search_path=public,pg_temp as $$
  select greatest((date_trunc('day',p_scheduled at time zone 'Asia/Seoul')+interval '1 day')
    at time zone 'Asia/Seoul',p_scheduled+interval '2 hours')
$$;
revoke all on function public.meeting_feedback_due_at(timestamptz) from public,anon,authenticated;

create or replace function public.enqueue_feedback_due() returns integer
  language plpgsql security definer set search_path=public,pg_temp as $$
declare n integer;
begin
  with due as (
    select m.id,i.male_id,i.female_id,public.meeting_feedback_due_at(m.scheduled_at) due_at
      from public.meetings m join public.intros i on i.id=m.intro_id
     where m.confirmed_at is not null and m.cancelled_at is null
       and public.meeting_feedback_due_at(m.scheduled_at)<=now()
       and m.scheduled_at>now()-interval '14 days'
       and not exists(select 1 from public.no_show_reports r where r.meeting_id=m.id and r.state='pending')
  ), targets as (
    select d.id,u.user_id,d.due_at from due d
      cross join lateral (values(d.male_id),(d.female_id)) u(user_id)
      join public.profiles p on p.id=u.user_id and p.account_state='active' and p.feedback_emails
      where not exists(select 1 from public.feedbacks f where f.meeting_id=d.id and f.author_id=u.user_id)
  ), kinds as (
    select id,user_id,'feedback_due'::public.notification_kind kind from targets
    union all
    select id,user_id,'feedback_followup'::public.notification_kind from targets
      where due_at<=now()-interval '24 hours' and due_at>now()-interval '7 days'
      and exists(select 1 from public.notifications n where n.meeting_id=targets.id
        and n.user_id=targets.user_id and n.kind='feedback_due')
  )
  insert into public.notifications(user_id,kind,meeting_id)
    select user_id,kind,id from kinds on conflict(user_id,kind,meeting_id) do nothing;
  get diagnostics n=row_count;
  return n;
end $$;

create function public.meeting_lifecycle_tick() returns integer
  language plpgsql security definer set search_path=public,pg_temp as $$
declare r record; k public.notification_kind; u uuid; n integer:=0; added integer;
begin
  -- Serialize ticks, but don't hold a worker queue open behind another worker.
  if not pg_try_advisory_xact_lock(hashtextextended('meeting-lifecycle-v1',0)) then return 0; end if;
  for r in select m.*,i.male_id,i.female_id from public.meetings m
    join public.intros i on i.id=m.intro_id
    where m.attendance_policy_version is not null and m.confirmed_at is not null
      and m.cancelled_at is null and m.completed_at is null
      and m.scheduled_at>now() and m.scheduled_at<=now()+interval '24 hours'
    order by m.id for update of m skip locked
  loop
    if r.scheduled_at<=now()+interval '2 hours' and
       r.male_attendance_at is null and r.female_attendance_at is null then
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
  return n+public.enqueue_feedback_due();
end $$;
revoke all on function public.meeting_lifecycle_tick() from public,anon,authenticated;
grant execute on function public.meeting_lifecycle_tick() to service_role;
select cron.schedule('meeting_lifecycle_5m','*/5 * * * *',$$ select public.meeting_lifecycle_tick(); $$);

-- Reporting is a command, not an insertable client table. In particular a
-- client must never choose an unrelated accused_id or report tomorrow's date.
revoke insert on public.no_show_reports from authenticated;
alter function public.report_no_show(uuid) rename to report_no_show_before_lifecycle;
revoke all on function public.report_no_show_before_lifecycle(uuid) from public,anon,authenticated;
create function public.report_no_show(p_meeting_id uuid) returns public.no_show_reports
  language plpgsql security definer set search_path=public,pg_temp as $$
declare m public.meetings; r public.no_show_reports;
begin
  if not public.is_meeting_participant(p_meeting_id) then
    raise exception 'not a participant' using errcode='42501';
  end if;
  select * into m from public.meetings where id=p_meeting_id for update;
  if m.confirmed_at is null or m.scheduled_at is null or m.scheduled_at>now() or m.cancelled_at is not null then
    raise exception 'meeting_not_yet_eligible' using errcode='PT409';
  end if;
  select * into r from public.no_show_reports where meeting_id=m.id and reporter_id=auth.uid();
  if found then return r; end if;
  return public.report_no_show_before_lifecycle(m.id);
end $$;
revoke all on function public.report_no_show(uuid) from public,anon;
grant execute on function public.report_no_show(uuid) to authenticated;

drop policy feedbacks_insert_participant on public.feedbacks;
create policy feedbacks_insert_participant on public.feedbacks for insert to authenticated
  with check (author_id=auth.uid() and public.is_meeting_participant(meeting_id)
    and exists(select 1 from public.meetings m where m.id=feedbacks.meeting_id
      and m.confirmed_at is not null and m.scheduled_at<=now() and m.cancelled_at is null));

create function public.submit_meeting_feedback(p_meeting_id uuid,p_met boolean,p_result text,p_body text default null)
  returns uuid language plpgsql security definer set search_path=public,pg_temp as $$
declare m public.meetings; f public.feedbacks;
begin
  if not public.is_meeting_participant(p_meeting_id) then raise exception 'not a participant' using errcode='42501'; end if;
  select * into m from public.meetings where id=p_meeting_id for update;
  if m.confirmed_at is null or m.scheduled_at is null or m.scheduled_at>now() or m.cancelled_at is not null then
    raise exception 'meeting_not_yet_eligible' using errcode='PT409';
  end if;
  if p_met is null or p_result is null or p_result not in ('again','friend','no','noshow') or
     p_met<>(p_result<>'noshow') or char_length(coalesce(p_body,''))>2000 then
    raise exception 'invalid feedback' using errcode='22023';
  end if;
  p_body:=nullif(btrim(p_body),'');
  select * into f from public.feedbacks where meeting_id=m.id and author_id=auth.uid() for update;
  if found then
    if f.met is distinct from p_met or f.result is distinct from p_result or
       coalesce(f.body,'') is distinct from coalesce(p_body,'') then
      raise exception 'feedback already submitted' using errcode='PT409';
    end if;
  else
    insert into public.feedbacks(meeting_id,author_id,met,result,body)
      values(m.id,auth.uid(),p_met,p_result,nullif(btrim(p_body),'')) returning * into f;
  end if;
  if p_met then
    if not coalesce(auth.uid()=any(m.completed_by),false) then perform public.mark_met(m.id); end if;
  else perform public.report_no_show(m.id); end if;
  return f.id;
end $$;
revoke all on function public.submit_meeting_feedback(uuid,boolean,text,text) from public,anon;
grant execute on function public.submit_meeting_feedback(uuid,boolean,text,text) to authenticated;

alter function public.notification_push_still_relevant(uuid,uuid) rename to notification_relevant_before_lifecycle;
revoke all on function public.notification_relevant_before_lifecycle(uuid,uuid) from public,anon,authenticated,service_role;
create function public.notification_push_still_relevant(p_id uuid,p_lease_token uuid) returns boolean
  language plpgsql stable security definer set search_path=public,pg_temp as $$
declare n public.notifications; m public.meetings; i public.intros; confirmed_at timestamptz;
begin
  if not public.notification_relevant_before_lifecycle(p_id,p_lease_token) then return false; end if;
  select * into n from public.notifications where id=p_id;
  select * into m from public.meetings where id=n.meeting_id;
  if n.kind::text in ('meeting_checkin_reminder','meeting_checkin_final') then
    select * into i from public.intros where id=m.intro_id;
    confirmed_at:=case when n.user_id=i.male_id then m.male_attendance_at else m.female_attendance_at end;
    return m.attendance_policy_version is not null and m.cancelled_at is null and m.completed_at is null
      and confirmed_at is null and m.scheduled_at>now()+interval '2 hours'
      and m.scheduled_at<=now()+interval '24 hours'
      and (n.kind::text<>'meeting_checkin_reminder' or m.scheduled_at>now()+interval '4 hours')
      and (n.kind::text<>'meeting_checkin_final' or m.scheduled_at<=now()+interval '4 hours');
  elsif n.kind::text='meeting_checkin_cancelled' then
    return m.cancelled_at is not null and m.cancel_reason='checkin_no_response';
  elsif n.kind::text in ('feedback_due','feedback_followup') then
    return m.cancelled_at is null and m.confirmed_at is not null
      and public.meeting_feedback_due_at(m.scheduled_at)<=now()
      and m.scheduled_at>now()-interval '14 days'
      and (n.kind::text<>'feedback_followup' or (public.meeting_feedback_due_at(m.scheduled_at)<=now()-interval '24 hours'
        and public.meeting_feedback_due_at(m.scheduled_at)>now()-interval '7 days'))
      and not exists(select 1 from public.feedbacks f where f.meeting_id=m.id and f.author_id=n.user_id)
      and exists(select 1 from public.profiles p where p.id=n.user_id and p.feedback_emails)
      and not exists(select 1 from public.no_show_reports r where r.meeting_id=m.id and r.state='pending');
  end if;
  return true;
end $$;
revoke all on function public.notification_push_still_relevant(uuid,uuid) from public,anon,authenticated;
grant execute on function public.notification_push_still_relevant(uuid,uuid) to service_role;

create function public.admin_meeting_lifecycle() returns jsonb
  language plpgsql stable security definer set search_path=public,pg_temp as $$
declare result jsonb;
begin
  if not public.is_admin() then raise exception 'admin only' using errcode='42501'; end if;
  with rows as (
    select m.id,m.scheduled_at,m.cancelled_at,m.cancel_reason,m.completed_at,
      m.attendance_policy_version,m.male_attendance_at,m.female_attendance_at,
      i.male_id,i.female_id,mp.name male_name,fp.name female_name,
      (select count(*) from public.feedbacks f where f.meeting_id=m.id) feedback_count,
      (select count(*) from public.notifications n where n.meeting_id=m.id and n.kind::text in
        ('meeting_checkin_reminder','meeting_checkin_final','feedback_due','feedback_followup')) nudge_count,
      (select count(*) from public.meeting_response_warnings w where w.user_id=i.male_id and w.created_at>now()-interval '90 days') male_warnings,
      (select count(*) from public.meeting_response_warnings w where w.user_id=i.female_id and w.created_at>now()-interval '90 days') female_warnings
    from public.meetings m join public.intros i on i.id=m.intro_id
      join public.profiles mp on mp.id=i.male_id join public.profiles fp on fp.id=i.female_id
    where m.confirmed_at is not null and m.scheduled_at>now()-interval '14 days'
      and mp.account_state<>'withdrawn' and fp.account_state<>'withdrawn'
  ), page as (select * from rows order by
    (cancelled_at is null and completed_at is null and scheduled_at<=now()+interval '4 hours') desc,
    scheduled_at desc,id limit 100)
  select jsonb_build_object('as_of',now(),'total',(select count(*) from rows),
    'items',coalesce((select jsonb_agg(to_jsonb(page)) from page),'[]'::jsonb)) into result;
  return result;
end $$;
revoke all on function public.admin_meeting_lifecycle() from public,anon;
grant execute on function public.admin_meeting_lifecycle() to authenticated;

create function public.admin_meetings_v2(p_state text default null) returns jsonb
  language plpgsql stable security definer set search_path=public,pg_temp as $$
declare result jsonb;
begin
  if not public.is_admin() then raise exception 'admin only' using errcode='42501'; end if;
  select coalesce(jsonb_agg(to_jsonb(a)||jsonb_build_object('proposed_slots',m.proposed_slots,
    'response_due_at',case when m.prefs_submitted_at is null then t.used_at+interval '24 hours' end)
    order by a.created_at desc),'[]'::jsonb) into result
    from public.admin_meetings(p_state) a join public.meetings m on m.id=a.id
    join public.tickets t on t.id=m.ticket_id;
  return result;
end $$;
revoke all on function public.admin_meetings_v2(text) from public,anon;
grant execute on function public.admin_meetings_v2(text) to authenticated;

alter function public.admin_system_overview() rename to admin_system_before_lifecycle;
revoke all on function public.admin_system_before_lifecycle() from public,anon,authenticated;
create function public.admin_system_overview() returns jsonb
  language plpgsql stable security definer set search_path=public,pg_temp as $$
declare v jsonb; job jsonb;
begin
  if not public.is_admin() then raise exception 'admin only' using errcode='42501'; end if;
  v:=public.admin_system_before_lifecycle();
  select jsonb_build_object('jobname','meeting_lifecycle_5m','schedule',j.schedule,
    'active',coalesce(j.active,false),'last_status',r.status,'last_started_at',r.start_time,
    'last_finished_at',r.end_time,'last_message',left(r.return_message,500)) into job
    from (select 1) seed left join cron.job j on j.jobname='meeting_lifecycle_5m'
    left join lateral(select status,start_time,end_time,return_message from cron.job_run_details d
      where d.jobid=j.jobid order by start_time desc limit 1) r on true;
  return jsonb_set(v,'{jobs}',coalesce(v->'jobs','[]'::jsonb)||jsonb_build_array(job));
end $$;
revoke all on function public.admin_system_overview() from public,anon;
grant execute on function public.admin_system_overview() to authenticated;
