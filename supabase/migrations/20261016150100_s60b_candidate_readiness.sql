-- 새 후보 노출·호감 기록의 입구도 동일한 본인 자격으로 막는다.
create or replace function public.next_candidate()
  returns setof public.public_profiles
  language plpgsql volatile security definer set search_path = public, pg_temp as $$
declare
  v_uid uuid := auth.uid();
  v_candidate uuid;
begin
  if v_uid is null or public.my_gender() <> 'female'
     or not (public.member_readiness(v_uid)->>'ready')::boolean then
    return;
  end if;

  select ci.candidate_id into v_candidate
    from public.candidate_impressions ci
   where ci.viewer_id = v_uid
     and public.is_eligible_candidate(ci.candidate_id)
     and not exists (select 1 from public.affinities a
                      where a.from_id = v_uid and a.to_id = ci.candidate_id)
     and not public.is_excluded(v_uid, ci.candidate_id)
   order by ci.last_shown_at desc limit 1;

  if v_candidate is null then
    select p.id into v_candidate
      from public.profiles p
      left join lateral (
        select count(*)::integer as viewer_count, max(ci.last_shown_at) as last_shown_at
          from public.candidate_impressions ci where ci.candidate_id = p.id
      ) exposure on true
     where public.is_eligible_candidate(p.id)
       and not exists (select 1 from public.affinities a
                        where a.from_id = v_uid and a.to_id = p.id)
       and not public.is_excluded(v_uid, p.id)
     order by exposure.viewer_count asc, exposure.last_shown_at asc nulls first,
              p.created_at asc, p.id asc
     for update of p skip locked limit 1;
    if v_candidate is not null then
      insert into public.candidate_impressions (viewer_id, candidate_id)
      values (v_uid, v_candidate)
      on conflict (viewer_id, candidate_id) do update
        set last_shown_at = now(),
            show_count = candidate_impressions.show_count + 1;
    end if;
  end if;
  return query select pp.* from public.public_profiles pp where pp.id = v_candidate;
end $$;

create or replace function public.remaining_candidates()
  returns integer language sql stable security definer set search_path = public, pg_temp as $$
  select count(*)::integer from public.eligible_profiles p
   where public.my_gender() = 'female'
     and (public.member_readiness(auth.uid())->>'ready')::boolean
     and p.gender = 'male' and p.hub_id = public.my_hub_id()
     and not exists (select 1 from public.affinities a
                      where a.from_id = auth.uid() and a.to_id = p.id)
     and not public.is_excluded(auth.uid(), p.id)
$$;

drop policy affinities_insert_female_only on public.affinities;
create policy affinities_insert_female_only on public.affinities
  for insert to authenticated with check (
    from_id = auth.uid()
    and public.my_gender() = 'female'
    and (public.my_readiness()->>'ready')::boolean
    and public.is_eligible_candidate(affinities.to_id)
    and not public.is_excluded(auth.uid(), affinities.to_id)
  );
