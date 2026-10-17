-- In-app availability and APNs acceptance do not prove delivery/read. Until
-- a verified external receipt is integrated, only an in-app read permits a
-- no-response penalty. Otherwise operations must contact the participants.
create function public.meeting_checkin_notice_read(p_meeting uuid,p_user uuid) returns boolean
  language sql stable security definer set search_path=public,pg_temp as $$
  select exists(select 1 from public.notifications n join public.meetings m on m.id=n.meeting_id
    where n.meeting_id=p_meeting and n.user_id=p_user
      and n.kind in ('meeting_checkin_reminder','meeting_checkin_final')
      and n.created_at>=m.confirmed_at and n.read_at is not null)
$$;
revoke all on function public.meeting_checkin_notice_read(uuid,uuid) from public,anon,authenticated;

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
  return n+public.enqueue_feedback_due();
end $$;

-- A participant may still rescue an uncancelled appointment when the worker
-- held it for delivery uncertainty. Both commands lock the same meeting row.
create or replace function public.confirm_meeting_attendance(p_meeting_id uuid) returns jsonb
  language plpgsql security definer set search_path=public,pg_temp as $$
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
  update public.meetings set
    male_attendance_at=case when auth.uid()=i.male_id then coalesce(male_attendance_at,now()) else male_attendance_at end,
    female_attendance_at=case when auth.uid()=i.female_id then coalesce(female_attendance_at,now()) else female_attendance_at end
    where id=m.id;
  perform public.ops_emit_domain_event('meeting_attendance_confirmed','meeting',m.id::text,
    auth.uid(),'attendance:'||m.id||':'||auth.uid());
  return public.my_meeting_checkin(m.id);
end $$;

alter function public.admin_meeting_lifecycle() rename to admin_meeting_lifecycle_before_notice_guard;
revoke all on function public.admin_meeting_lifecycle_before_notice_guard() from public,anon,authenticated;
create function public.admin_meeting_lifecycle() returns jsonb
  language plpgsql stable security definer set search_path=public,pg_temp as $$
declare v jsonb; items jsonb;
begin
  if not public.is_admin() then raise exception 'admin only' using errcode='42501'; end if;
  v:=public.admin_meeting_lifecycle_before_notice_guard();
  select coalesce(jsonb_agg(item||jsonb_build_object(
    'male_notice_read',public.meeting_checkin_notice_read((item->>'id')::uuid,(item->>'male_id')::uuid),
    'female_notice_read',public.meeting_checkin_notice_read((item->>'id')::uuid,(item->>'female_id')::uuid)
  ) order by position),'[]'::jsonb) into items
    from jsonb_array_elements(v->'items') with ordinality as x(item,position);
  return jsonb_set(v,'{items}',items);
end $$;
revoke all on function public.admin_meeting_lifecycle() from public,anon;
grant execute on function public.admin_meeting_lifecycle() to authenticated;
