-- The deadline belongs to the original request, including reminders opened much later.
-- Return the ticket timestamp alongside the existing inbox fields; older clients ignore it.
drop function public.my_notifications(integer);
create function public.my_notifications(p_limit integer default 50)
returns table(id uuid,kind public.notification_kind,created_at timestamptz,read_at timestamptz,
  meeting_id uuid,counterpart_name text,request_used_at timestamptz)
language sql stable security definer set search_path=public,pg_temp as $$
  select n.id,n.kind,n.created_at,n.read_at,n.meeting_id,p.name,t.used_at
  from public.notifications n
  left join public.meetings m on m.id=n.meeting_id
  left join public.intros i on i.id=m.intro_id
  left join public.profiles p on p.id=coalesce(nullif(n.payload->>'counterpart_id','')::uuid,
    case when i.male_id=n.user_id then i.female_id else i.male_id end)
  left join public.tickets t on t.id=m.ticket_id and n.kind in ('meeting_requested','meeting_request_reminder')
  where n.user_id=auth.uid() and n.kind<>'notification_email_verify'
    and n.last_error is distinct from 'schedule_superseded'
  order by n.created_at desc,n.id desc limit least(greatest(coalesce(p_limit,50),1),100)
$$;
revoke all on function public.my_notifications(integer) from public,anon;
grant execute on function public.my_notifications(integer) to authenticated;

-- Serialize against the same meeting row as the expiry worker. An answer already
-- recorded in time is free to continue through confirmation and later rescheduling.
create function public.check_initial_meeting_reply_deadline() returns trigger
language plpgsql set search_path=public,pg_temp as $$
begin
  if exists(select 1 from public.tickets t where t.id=old.ticket_id
    and t.used_at + interval '24 hours' <= clock_timestamp()) then
    raise exception 'meeting_request_expired' using errcode='PT409';
  end if;
  return new;
end $$;
revoke all on function public.check_initial_meeting_reply_deadline() from public, anon, authenticated;
create trigger check_initial_meeting_reply_deadline
before update of prefs_submitted_at, confirmed_at, cancelled_at on public.meetings
for each row when (old.cancelled_at is null and old.prefs_submitted_at is null and old.confirmed_at is null
  and (new.prefs_submitted_at is not null or new.confirmed_at is not null
    or (new.cancelled_at is not null and new.cancel_reason='declined')))
execute function public.check_initial_meeting_reply_deadline();
