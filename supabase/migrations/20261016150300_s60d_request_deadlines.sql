-- 요청 목록에는 티켓 사용 시각을 기준으로 한 실제 서버 기한만 노출한다.
create or replace function public.my_request_deadlines()
  returns table(meeting_id uuid, deadline_at timestamptz, as_of timestamptz)
  language plpgsql stable security definer set search_path = public, pg_temp as $$
begin
  if auth.uid() is null then
    raise exception 'unauthenticated' using errcode = '28000';
  end if;
  return query
    select m.id, t.used_at + interval '24 hours', now()
      from public.meetings m
      join public.intros i on i.id = m.intro_id
      join public.tickets t on t.id = m.ticket_id
     where i.female_id = auth.uid() and i.closed_at is null
       and m.prefs_submitted_at is null and m.cancelled_at is null
       and m.completed_at is null;
end $$;
revoke all on function public.my_request_deadlines() from public, anon;
grant execute on function public.my_request_deadlines() to authenticated;
