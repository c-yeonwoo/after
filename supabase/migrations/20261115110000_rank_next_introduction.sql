-- Use only the author's latest attended-meeting choice. An omitted choice resets it.
create function public.latest_date_preference(p_viewer uuid) returns text
language sql stable set search_path = public, pg_temp as $$
  select next_preference from public.feedbacks
  where author_id=p_viewer and met order by created_at desc,id desc limit 1
$$;
revoke all on function public.latest_date_preference(uuid) from public,anon,authenticated;

create function public.published_date_matches(pref text, signals jsonb, legacy boolean, interests text[]) returns boolean
language sql immutable set search_path = public, pg_temp as $$
  select coalesce((jsonb_typeof(signals->'first_date')='array' and
    (signals->'first_date') ? (case pref when 'walk' then '함께 걷기' when 'coffee' then '짧게 커피'
      when 'meal' then '식사하며 대화' when 'activity' then '활동이나 체험' end))
    or (legacy and pref='walk' and '산책'=any(interests)), false)
$$;
revoke all on function public.published_date_matches(text,jsonb,boolean,text[]) from public,anon,authenticated;

create or replace function public.feedback_intro_reason(p_candidate uuid) returns text
language sql stable set search_path=public,pg_temp as $$
  with latest as (select public.latest_date_preference(auth.uid()) as next_preference)
  select case latest.next_preference
    when 'walk'
      then '지난 후기에서 산책을 고르셨죠. 이분도 함께 걷는 시간을 좋아해요.'
    when 'coffee'
      then '지난 후기에서 커피 한 잔을 고르셨죠. 이분도 첫 만남은 가볍게 커피로 시작하고 싶대요.'
    when 'meal'
      then '지난 후기에서 식사하며 대화하고 싶다고 하셨죠. 이분도 같은 자리를 골랐어요.'
    when 'activity'
      then '지난 후기에서 함께하는 활동을 고르셨죠. 이분도 첫 만남에 무언가 같이 해보고 싶대요.'
  end
  from latest join public.profiles p on p.id=p_candidate
  where public.published_date_matches(latest.next_preference,p.profile_public_signals,p.profile_story is null,p.interests)
$$;

CREATE OR REPLACE FUNCTION public.next_candidate()
 RETURNS SETOF public_profiles
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_uid uuid := auth.uid();
  v_candidate uuid;
  pref text;
begin
  if v_uid is null or public.member_meeting_hold(v_uid) or public.my_gender() <> 'female'
     or not (public.member_readiness(v_uid)->>'ready')::boolean then
    return;
  end if;

  -- Concurrent home/detail requests from one viewer must keep the first impression.
  perform pg_advisory_xact_lock(hashtextextended('next-candidate:' || v_uid::text, 0));
  select ci.candidate_id into v_candidate
    from public.candidate_impressions ci
   where ci.viewer_id = v_uid
     and public.is_eligible_candidate(ci.candidate_id)
     and not exists (select 1 from public.affinities a
                      where a.from_id = v_uid and a.to_id = ci.candidate_id)
     and not public.is_excluded(v_uid, ci.candidate_id)
   order by ci.last_shown_at desc limit 1;

  if v_candidate is null then
    pref := public.latest_date_preference(v_uid);
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
     order by public.published_date_matches(pref,p.profile_public_signals,p.profile_story is null,p.interests) desc,
              (p.hub_id=public.my_hub_id()) desc, exposure.viewer_count asc, exposure.last_shown_at asc nulls first,
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
end $function$
;

CREATE OR REPLACE FUNCTION public.admin_curation_recommendations(p_male uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare pref text;
begin
  if not public.is_admin() then raise exception 'admin only' using errcode='42501'; end if;
  pref := public.latest_date_preference(p_male);
  perform public.curation_recommendation_tick(p_male);
  return jsonb_build_object('batch', (select to_jsonb(s)-'singleton' from public.curation_batch_state s),
    'as_of',now(),'items',coalesce((select jsonb_agg(to_jsonb(r) order by
      (r.liked_at<now()-interval '72 hours') desc,
      public.published_date_matches(pref,source.profile_public_signals,source.profile_story is null,source.interests) desc,
      r.score desc,r.liked_at,r.female_id)
      from public.curation_recommendations r
      join public.eligible_profiles m on m.id=r.male_id
      join public.eligible_profiles f on f.id=r.female_id and public.meeting_areas_overlap(m.id,f.id)
      join public.profiles source on source.id=r.female_id
      where r.male_id=p_male and not public.is_excluded(r.male_id,r.female_id)
        and exists(select 1 from public.affinities a where a.from_id=r.female_id and a.to_id=r.male_id and a.verdict='like')
        and not exists(select 1 from public.intros i where i.male_id=r.male_id and i.female_id=r.female_id)
        and not exists(select 1 from public.intro_queue q where q.male_id=r.male_id and q.female_id=r.female_id)), '[]'::jsonb));
end $function$
;
