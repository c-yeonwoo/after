-- Preserve the PR-06 guard for existing kinds and add a stricter, opt-out-aware
-- check immediately before APNs submission for the new optional reminder.
alter function public.notification_push_still_relevant(uuid,uuid)
  rename to notification_push_still_relevant_base;
revoke all on function public.notification_push_still_relevant_base(uuid,uuid)
  from public, anon, authenticated, service_role;

create function public.notification_push_still_relevant(p_id uuid, p_lease_token uuid)
returns boolean language plpgsql stable security definer set search_path = public, pg_temp as $$
declare v_row public.notifications; v_used_at timestamptz;
begin
  if auth.role() is distinct from 'service_role' then
    raise exception 'worker only' using errcode = '42501';
  end if;
  if not public.notification_push_still_relevant_base(p_id,p_lease_token) then return false; end if;
  select * into v_row from public.notifications where id=p_id;
  if v_row.kind <> 'meeting_request_reminder'::public.notification_kind then return true; end if;
  select t.used_at into v_used_at from public.meetings m
    join public.tickets t on t.id=m.ticket_id where m.id=v_row.meeting_id;
  return coalesce(public.automation_reminder_valid(v_row.meeting_id,v_row.user_id,v_used_at),false);
end $$;
revoke all on function public.notification_push_still_relevant(uuid,uuid)
  from public, anon, authenticated;
grant execute on function public.notification_push_still_relevant(uuid,uuid) to service_role;
