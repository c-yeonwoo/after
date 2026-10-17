-- Retain the current policy/readiness wrapper. Only expose a boolean owned by
-- the caller; no names, opposite-party verdicts or promise of a match/timeframe.
alter function public.home_state_v2() rename to home_state_v2_before_intro_progress;
revoke all on function public.home_state_v2_before_intro_progress()
  from public, anon, authenticated;

create function public.home_state_v2() returns jsonb
language plpgsql volatile security definer set search_path = public, pg_temp as $$
declare
  v jsonb;
  v_has_likes boolean := false;
begin
  v := public.home_state_v2_before_intro_progress();
  if public.my_gender() = 'female'
     and coalesce((v #>> '{readiness,ready}')::boolean, false) then
    select exists (
      select 1 from public.affinities a
       where a.from_id = auth.uid() and a.verdict = 'like'
         and public.is_eligible_candidate(a.to_id)
         and not public.is_excluded(auth.uid(), a.to_id)
         and not exists (
           select 1 from public.intros i
            where i.male_id = a.to_id and i.female_id = auth.uid()
              and (i.closed_at is not null or exists (
                select 1 from public.meetings m where m.intro_id = i.id
                  and (m.cancelled_at is not null or m.completed_at is not null)
              ))
         )
    ) into v_has_likes;
  end if;
  return v || jsonb_build_object('intro_progress',
    jsonb_build_object('has_likes', v_has_likes));
end $$;
revoke all on function public.home_state_v2() from public, anon;
grant execute on function public.home_state_v2() to authenticated;
