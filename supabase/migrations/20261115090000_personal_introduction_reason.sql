-- Only this optional, first-person choice is reused. The review body stays private.
alter table public.feedbacks add column next_preference text
  check (next_preference is null or (met and next_preference in ('walk','coffee','meal','activity')));
create index feedbacks_latest_preference on public.feedbacks(author_id, created_at desc, id desc)
  where met;

create function public.submit_feedback_with_preference(
  p_meeting_id uuid, p_met boolean, p_result text, p_preference text, p_body text default null
) returns uuid language plpgsql security definer set search_path = public, pg_temp as $$
declare prior public.feedbacks; receipt uuid;
begin
  if not public.is_meeting_participant(p_meeting_id) then
    raise exception 'not a participant' using errcode='42501';
  end if;
  if p_preference is null or not p_met or p_preference not in ('walk','coffee','meal','activity') then
    raise exception 'invalid preference' using errcode='22023';
  end if;
  -- Serialize with the existing submission RPC, including old clients without a preference.
  perform 1 from public.meetings where id=p_meeting_id for update;
  select * into prior from public.feedbacks where author_id=auth.uid() and meeting_id=p_meeting_id;
  if found and prior.next_preference is distinct from p_preference then
    raise exception 'feedback already submitted' using errcode='PT409';
  end if;
  receipt := public.submit_meeting_feedback(p_meeting_id,p_met,p_result,p_body);
  if prior.id is null then
    update public.feedbacks set next_preference=p_preference where id=receipt;
  end if;
  return receipt;
end $$;
revoke all on function public.submit_feedback_with_preference(uuid,boolean,text,text,text) from public,anon;
grant execute on function public.submit_feedback_with_preference(uuid,boolean,text,text,text) to authenticated;

-- Call only after the enclosing RPC has selected a card visible to this viewer.
create function public.feedback_intro_reason(p_candidate uuid) returns text
language sql stable set search_path=public,pg_temp as $$
  with latest as (
    select next_preference from public.feedbacks
    where author_id=auth.uid() and met order by created_at desc,id desc limit 1
  )
  select case
    when latest.next_preference='walk' and (p.profile_public_signals->'first_date' ? '함께 걷기' or (p.profile_story is null and '산책'=any(p.interests)))
      then '지난 후기에서 산책을 고르셨죠. 이분도 함께 걷는 시간을 좋아해요.'
    when latest.next_preference='coffee' and p.profile_public_signals->'first_date' ? '짧게 커피'
      then '지난 후기에서 커피 한 잔을 고르셨죠. 이분도 첫 만남은 가볍게 커피로 시작하고 싶대요.'
    when latest.next_preference='meal' and p.profile_public_signals->'first_date' ? '식사하며 대화'
      then '지난 후기에서 식사하며 대화하고 싶다고 하셨죠. 이분도 같은 자리를 골랐어요.'
    when latest.next_preference='activity' and p.profile_public_signals->'first_date' ? '활동이나 체험'
      then '지난 후기에서 함께하는 활동을 고르셨죠. 이분도 첫 만남에 무언가 같이 해보고 싶대요.'
  end
  from latest join public.profiles p on p.id=p_candidate
$$;
revoke all on function public.feedback_intro_reason(uuid) from public,anon,authenticated;

create or replace function intro_teaser()
  returns table(age integer, job text, headline text, shared text[], reason text,
                delivered integer)
  language plpgsql stable security definer set search_path = public, pg_temp as $$
declare
  v_uid  uuid := auth.uid();
  v_card intro_queue;
  v_her  profiles;
  v_me   profiles;
  common text[];
begin
  if v_uid is null then
    raise exception 'unauthenticated' using errcode = '28000';
  end if;
  if my_gender() <> 'male' then
    raise exception 'only male users receive introductions' using errcode = '42501';
  end if;

  select * into v_card from next_openable_card(v_uid);
  if not found then
    return;
  end if;

  select * into v_her from profiles where id = v_card.female_id;
  select * into v_me  from profiles where id = v_uid;

  -- A published story supersedes legacy profile fields. Only compare visible answers.
  common := array(
    select distinct topic from (
      select opt.value as topic
      from unnest(array['first_date','topics','rhythm']) k
      cross join lateral jsonb_array_elements_text(v_her.profile_public_signals->k) opt(value)
      where (v_me.profile_public_signals->k) ? opt.value
      union all
      select t from unnest(v_her.topics) t
      where v_me.profile_story is null and v_her.profile_story is null and t=any(v_me.topics)
      union all
      select t from unnest(v_her.interests) t
      where v_me.profile_story is null and v_her.profile_story is null and t=any(v_me.interests)
    ) visible where btrim(topic)<>'' order by topic
  );

  return query
  select
    case when v_her.birth is null then null
         else date_part('year', age(current_date, v_her.birth))::integer end,
    v_her.job,
    v_her.headline,
    common,
    coalesce(public.feedback_intro_reason(v_her.id),nullif(btrim(v_card.reason),''),
      case when cardinality(common)>0 then format('두 분의 프로필에서 ‘%s’라는 공통점을 찾았어요.',common[1])
           when v_her.profile_public_signals->'first_date' ? '함께 걷기' then '처음 만날 때 나란히 걷는 자리가 편하다고 한 분이에요.'
           when v_her.profile_public_signals->'first_date' ? '짧게 커피' then '처음엔 커피 한 잔으로 가볍게 알아가고 싶다는 분이에요.'
           else '운영팀이 두 분의 프로필을 살펴보고 이번 소개로 골랐어요.' end),
    (select count(*)::integer from intro_queue q
      where q.male_id = v_uid and q.opened_at is null
        and q.delivered_at is not null and q.expires_at > now());
end $$;

alter function public.home_state_v2() rename to home_state_v2_before_intro_reason;
revoke all on function public.home_state_v2_before_intro_reason() from public,anon,authenticated;
create function public.home_state_v2() returns jsonb
language plpgsql security definer set search_path=public,pg_temp as $$
declare state jsonb; reason text;
begin
  state := public.home_state_v2_before_intro_reason();
  if state->>'primary_state'='intro_delivered' and state->'me'->>'gender'='male' then
    select t.reason into reason from public.intro_teaser() t;
  elsif state->>'primary_state'='intro_available' then
    reason := public.feedback_intro_reason((state->'candidate'->>'id')::uuid);
  end if;
  return state || jsonb_build_object('viewer_intro_reason',reason);
end $$;
revoke all on function public.home_state_v2() from public,anon;
grant execute on function public.home_state_v2() to authenticated;
