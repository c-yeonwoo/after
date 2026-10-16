-- Client visibility is not authority: even a direct RPC cannot confirm a
-- meeting before its scheduled start. Existing completed outcomes are untouched.
alter function public.mark_met(uuid) rename to mark_met_base;
revoke all on function public.mark_met_base(uuid) from public, anon, authenticated;

create function public.mark_met(p_meeting_id uuid) returns public.meetings
  language plpgsql security definer set search_path = public, pg_temp as $$
declare v public.meetings;
begin
  if auth.uid() is null then raise exception 'unauthenticated' using errcode='28000'; end if;
  select * into v from public.meetings where id=p_meeting_id;
  if not found then raise exception 'meeting not found' using errcode='P0002'; end if;
  if v.scheduled_at is null or v.scheduled_at>now() or v.cancelled_at is not null then
    raise exception 'meeting_not_yet_eligible' using errcode='PT409';
  end if;
  return public.mark_met_base(p_meeting_id);
end $$;
revoke all on function public.mark_met(uuid) from public, anon;
grant execute on function public.mark_met(uuid) to authenticated;
