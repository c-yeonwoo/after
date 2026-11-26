-- Private priority for the next selection. A newer attended-date preference wins again.
create table public.intro_priority_choices (
  member_id uuid primary key references public.profiles(id) on delete cascade,
  choice text not null check(choice in ('walk','coffee','meal','activity','any')),
  changed_at timestamptz not null default clock_timestamp()
);
create table public.first_intro_checks (
  member_id uuid primary key references public.profiles(id) on delete cascade,
  stage text not null check(stage in ('supply','curation','reply')),
  next_check_at timestamptz not null,
  operator_id uuid references public.profiles(id) on delete set null
);
alter table public.intro_priority_choices enable row level security;
alter table public.first_intro_checks enable row level security;
revoke all on public.intro_priority_choices, public.first_intro_checks from public, anon, authenticated;

create function public.effective_intro_priority(p_member uuid)
returns table(choice text, source text) language sql stable set search_path=public,pg_temp as $$
  select s.choice,s.source from (
    select c.choice,'edit' as source,c.changed_at as at from intro_priority_choices c where c.member_id=p_member
    union all
    (select f.next_preference,'feedback',f.created_at from feedbacks f
      where f.author_id=p_member and f.met order by f.created_at desc,f.id desc limit 1)
  ) s order by s.at desc, s.source limit 1
$$;
revoke all on function public.effective_intro_priority(uuid) from public,anon,authenticated;

create table public.intro_signal_discounts (
  member_id uuid not null references public.profiles(id) on delete cascade,
  signal text not null check(length(signal) between 1 and 160),
  primary key(member_id,signal)
);
alter table public.intro_signal_discounts enable row level security;
revoke all on public.intro_signal_discounts from public,anon,authenticated;

create function public.public_intro_topics(p profiles) returns text[]
language sql immutable set search_path=public,pg_temp as $$
  select array(select distinct v from (
    select jsonb_array_elements_text(case when jsonb_typeof(p.profile_public_signals->k)='array' then p.profile_public_signals->k else '[]'::jsonb end) v from unnest(array['first_date','topics','rhythm']) k
    union all select unnest(p.interests) where p.profile_story is null
    union all select unnest(p.topics) where p.profile_story is null
  ) a where btrim(v)<>'' order by v)
$$;
revoke all on function public.public_intro_topics(profiles) from public,anon,authenticated;

create function public.save_intro_signal_weight(p_owner uuid,p_signal text,p_less boolean) returns void
language plpgsql security definer set search_path=public,pg_temp as $$
begin
  if p_owner is distinct from auth.uid() or not exists(select 1 from profiles p where p.id=p_owner
    and p.account_state='active' and p.role='member' and p_signal=any(public_intro_topics(p)) for share)
    or p_less is null or length(p_signal) not between 1 and 160 then raise exception 'invalid signal' using errcode='42501'; end if;
  if p_less then insert into intro_signal_discounts values(p_owner,p_signal) on conflict do nothing;
  else delete from intro_signal_discounts where member_id=p_owner and signal=p_signal; end if;
end $$;
revoke all on function public.save_intro_signal_weight(uuid,text,boolean) from public,anon;
grant execute on function public.save_intro_signal_weight(uuid,text,boolean) to authenticated;

-- With a correction, prefer a shared signal the member still values. Other eligible people stay in the pool.
create function public.remaining_intro_signals(p_owner uuid) returns text[]
language sql stable set search_path=public,pg_temp as $$
  select array(select unnest(public_intro_topics(p)) except select signal from intro_signal_discounts d where d.member_id=p_owner)
  from profiles p where p.id=p_owner and exists(select 1 from intro_signal_discounts where member_id=p_owner)
$$;
revoke all on function public.remaining_intro_signals(uuid) from public,anon,authenticated;

-- Both the female next-card query and the operator's male queue ordering already use this helper.
create or replace function public.latest_date_preference(p_viewer uuid) returns text
language sql stable set search_path=public,pg_temp as $$
  select nullif(choice,'any') from effective_intro_priority(p_viewer)
$$;

create function public.save_intro_priority(p_owner uuid,p_choice text) returns void
language plpgsql security definer set search_path=public,pg_temp as $$
begin
  if p_owner is distinct from auth.uid() or not exists(select 1 from profiles where id=auth.uid() and account_state='active' and role='member' for share) then
    raise exception 'active member required' using errcode='42501';
  end if;
  if p_choice is null or p_choice not in ('walk','coffee','meal','activity','any') then
    raise exception 'invalid priority' using errcode='22023';
  end if;
  insert into intro_priority_choices(member_id,choice) values(auth.uid(),p_choice)
    on conflict(member_id) do update set choice=excluded.choice,changed_at=clock_timestamp();
end $$;
revoke all on function public.save_intro_priority(uuid,text) from public,anon;
grant execute on function public.save_intro_priority(uuid,text) to authenticated;

alter function public.feedback_intro_reason(uuid) rename to feedback_intro_reason_before_priority;
create function public.feedback_intro_reason(p_candidate uuid) returns text
language sql stable security definer set search_path=public,pg_temp as $$
  select case when e.choice='walk' and not coalesce((p.profile_public_signals->'first_date') ? '함께 걷기',false) then
    '산책을 좋아하는 분을 눈여겨보셨죠. 이분도 공개 관심사에 산책을 적었어요.'
    when e.source='edit' then
    format('다음 소개에서 %s 우선해 달라고 하셨죠. 이분도 같은 첫 만남을 골랐어요.',
      case e.choice when 'walk' then '산책을' when 'coffee' then '커피를' when 'meal' then '식사를' when 'activity' then '함께하는 활동을' end)
    else feedback_intro_reason_before_priority(p_candidate) end
  from effective_intro_priority(auth.uid()) e join profiles p on p.id=p_candidate
  where published_date_matches(e.choice,p.profile_public_signals,p.profile_story is null,p.interests)
$$;
revoke all on function public.feedback_intro_reason(uuid) from public,anon,authenticated;

-- Evidence is derived inside the authorized home/teaser selection. Before opening a paid
-- card we return only the signal already expressed in its teaser, never the member's ID or interview.
create function public.intro_reason_evidence(p_peer uuid,p_curated text)
returns jsonb language plpgsql stable set search_path=public,pg_temp as $$
declare n record; pref text; quote text; origin text; detail text;
begin
  select * into n from intro_reading_note(p_peer,p_curated);
  if n.reason is null then return null; end if;
  select choice into pref from effective_intro_priority(auth.uid());
  if feedback_intro_reason(p_peer) is not null then
    origin:='priority';
    quote:=case pref when 'walk' then '함께 걷기' when 'coffee' then '짧게 커피' when 'meal' then '식사하며 대화' when 'activity' then '활동이나 체험' end;
    -- Old profiles used interest tags instead of explicit first-date answers.
    if pref='walk' and not exists(select 1 from profiles where id=p_peer and profile_public_signals->'first_date' ? quote) then
      quote:='산책'; detail:='상대가 공개한 관심사';
    else detail:='상대가 고른 첫 만남'; end if;
  elsif nullif(btrim(p_curated),'') is not null then
    origin:='curated'; detail:='운영 매니저가 두 프로필을 검토해 남긴 소개예요.';
  elsif cardinality(n.shared)>0 then
    origin:='shared';
    select item into quote from unnest(n.shared) with ordinality as topics(item,ord)
     order by exists(select 1 from intro_signal_discounts d where d.member_id=auth.uid() and d.signal=item),ord limit 1;
    detail:='두 사람의 공개 프로필에서 겹친 답';
  elsif exists(select 1 from profiles where id=p_peer and profile_public_signals->'first_date' ? '함께 걷기') then
    origin:='public'; quote:='함께 걷기'; detail:='상대가 고른 첫 만남';
  elsif exists(select 1 from profiles where id=p_peer and profile_public_signals->'first_date' ? '짧게 커피') then
    origin:='public'; quote:='짧게 커피'; detail:='상대가 고른 첫 만남';
  else
    origin:='selection'; detail:='이번 소개에는 별도로 기록된 공통점이 없어요.';
  end if;
  return jsonb_build_object('reason',case when origin='selection' then '이번에 소개할 분이에요. 프로필에서 직접 알아보세요.' when origin='shared' then format('두 분의 프로필에서 ‘%s’라는 공통점을 찾았어요.',quote) else n.reason end,
    'source',origin,'label',detail,'quote',quote,'discounted',exists(select 1 from intro_signal_discounts d where d.member_id=auth.uid() and d.signal=quote));
end $$;
revoke all on function public.intro_reason_evidence(uuid,text) from public,anon,authenticated;

-- Pure read shared between the member home and the operator queue. Reading it never
-- delivers a card or creates an impression. A former/paused member leaves the worklist automatically.
create function public.first_intro_wait(p profiles) returns jsonb
language plpgsql stable set search_path=public,pg_temp as $$
declare blockers jsonb; v_stage text; check_at timestamptz;
begin
  if p.id is null or p.role<>'member' or p.account_state<>'active' or p.paused_at is not null or p.onboarding_step<>7
    or exists(select 1 from intros i where i.male_id=p.id)
    or exists(select 1 from intros i join meetings m on m.intro_id=i.id where i.female_id=p.id)
    or exists(select 1 from intro_queue q where q.male_id=p.id and q.delivered_at is not null)
    or exists(select 1 from domain_events d where d.subject_id=p.id and d.event_type='intro_delivered') then return null; end if;
  blockers:=member_readiness_snapshot(p)->'blockers';
  if blockers='["photos_pending"]'::jsonb then
    v_stage:='photo';
    select o.next_check_at into check_at from ops_cases o where o.subject_id=p.id and o.case_type='photo_review'
      and o.status not in ('resolved','superseded');
  elsif blockers<>'[]'::jsonb or member_meeting_hold(p.id) then return null;
  elsif p.gender='female' then
    if exists(select 1 from profiles m where profile_candidate_ready(m) and meeting_areas_overlap(p.id,m.id)
        and not is_excluded(p.id,m.id) and not exists(select 1 from affinities a where a.from_id=p.id and a.to_id=m.id)) then return null; end if;
    if exists(select 1 from affinities a join profiles m on m.id=a.to_id where a.from_id=p.id and a.verdict='like'
      and profile_candidate_ready(m) and meeting_areas_overlap(p.id,m.id) and not is_excluded(p.id,m.id)
      and not exists(select 1 from intros i where i.male_id=m.id and i.female_id=p.id and i.closed_at is not null)) then v_stage:='reply';
    elsif exists(select 1 from candidate_impressions where viewer_id=p.id) then return null;
    else v_stage:='supply'; end if;
  elsif exists(select 1 from affinities a join eligible_profiles f on f.id=a.from_id and f.gender='female'
    where a.to_id=p.id and a.verdict='like' and meeting_areas_overlap(p.id,f.id) and not is_excluded(p.id,f.id)) then v_stage:='curation';
  else v_stage:='supply'; end if;
  if v_stage<>'photo' then
    select c.next_check_at into check_at from first_intro_checks c where c.member_id=p.id and c.stage=v_stage;
  end if;
  return jsonb_build_object('stage',v_stage,'next_check_at',check_at);
end $$;
revoke all on function public.first_intro_wait(profiles) from public,anon,authenticated;

create function public.admin_first_intro_waits(p_limit integer default 30,p_offset integer default 0) returns jsonb
language plpgsql stable security definer set search_path=public,pg_temp as $$
begin
  if not is_admin() then raise exception 'admin only' using errcode='42501'; end if;
  if p_limit not between 1 and 100 or p_offset<0 or p_limit is null or p_offset is null then raise exception 'invalid page' using errcode='22023'; end if;
  return (with waits as materialized (
    select p.id,p.name,p.gender,first_intro_wait(p) as wait,
      (select max(d.occurred_at) from domain_events d where d.subject_id=p.id and d.event_type='member_became_ready') as ready_at,
      p.created_at from profiles p where p.account_state='active' and p.role='member' and p.onboarding_step=7 and p.paused_at is null
  ), ordered as (
    select waits.*,case when wait->>'stage'='photo' then (select o.id from ops_cases o where o.subject_id=waits.id and o.case_type='photo_review' and o.status not in ('resolved','superseded') limit 1) end as photo_case_id from waits where wait is not null
    order by (coalesce((wait->>'next_check_at')::timestamptz<now(),false)) desc,
      coalesce(ready_at,created_at),id limit p_limit offset p_offset
  ) select jsonb_build_object('items',coalesce((select jsonb_agg(to_jsonb(o)-'created_at') from ordered o),'[]'::jsonb),
      'total',(select count(*) from waits where wait is not null)));
end $$;
create function public.admin_set_first_intro_check(p_member uuid,p_stage text,p_next timestamptz,p_previous timestamptz) returns void
language plpgsql security definer set search_path=public,pg_temp as $$
declare member profiles; w jsonb;
begin
  if not is_admin() then raise exception 'admin only' using errcode='42501'; end if;
  select * into member from profiles where id=p_member for update;
  w:=first_intro_wait(member);
  if w is null or w->>'stage' is distinct from p_stage or p_stage='photo'
     or (w->>'next_check_at')::timestamptz is distinct from p_previous then
    raise exception 'wait changed' using errcode='PT409'; end if;
  if p_next is not null and (p_next<=now() or p_next>now()+interval '30 days') then raise exception 'invalid next check' using errcode='22023'; end if;
  if p_next is null then delete from first_intro_checks where member_id=p_member;
  else insert into first_intro_checks values(p_member,p_stage,p_next,auth.uid())
    on conflict(member_id) do update set stage=excluded.stage,next_check_at=excluded.next_check_at,operator_id=excluded.operator_id;
  end if;
end $$;
revoke all on function public.admin_first_intro_waits(integer,integer),public.admin_set_first_intro_check(uuid,text,timestamptz,timestamptz) from public,anon;
grant execute on function public.admin_first_intro_waits(integer,integer),public.admin_set_first_intro_check(uuid,text,timestamptz,timestamptz) to authenticated;

alter function public.home_state_v2() rename to home_state_before_first_intro;
revoke all on function public.home_state_before_first_intro() from public,anon,authenticated;
create function public.home_state_v2() returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare s jsonb:=home_state_before_first_intro(); candidate uuid:=(s->'candidate'->>'id')::uuid;
  curated text; evidence jsonb; w jsonb; pref text;
begin
  if s->>'primary_state' in ('waiting','photos_pending') then
    select first_intro_wait(p) into w from profiles p where p.id=auth.uid();
    -- The member never sees inbound likes, supply counts, operator IDs or notes.
    if w->>'stage'='curation' then w:=jsonb_set(w,'{stage}','"supply"'); end if;
  elsif s->>'primary_state' in ('intro_available','intro_delivered') then
    if s->>'primary_state'='intro_delivered' and s->'me'->>'gender'='male' then
      select q.female_id,q.reason into candidate,curated from next_openable_card(auth.uid()) q;
    elsif candidate is not null and s->'me'->>'gender'='male' then
      select i.reason into curated from intros i where i.male_id=auth.uid() and i.female_id=candidate and i.closed_at is null;
    end if;
    if candidate is not null then evidence:=intro_reason_evidence(candidate,curated); end if;
  end if;
  select e.choice into pref from effective_intro_priority(auth.uid()) e;
  return s || jsonb_build_object('first_intro_wait',w,'intro_evidence',evidence,'intro_priority',pref);
end $$;
revoke all on function public.home_state_v2() from public,anon;
grant execute on function public.home_state_v2() to authenticated;

create function public.clear_intro_private_state() returns trigger
language plpgsql security definer set search_path=public,pg_temp as $$
begin
  delete from first_intro_checks where member_id=new.id;
  if new.account_state='withdrawn' then delete from intro_priority_choices where member_id=new.id; delete from intro_signal_discounts where member_id=new.id; end if;
  return new;
end $$;
revoke all on function public.clear_intro_private_state() from public,anon,authenticated;
create trigger clear_intro_private_state after update of paused_at,account_state on profiles
for each row when (new.paused_at is distinct from old.paused_at or new.account_state is distinct from old.account_state)
execute function public.clear_intro_private_state();

-- The evidence and the teaser always refer to the same card in this statement's snapshot.
create function public.intro_teaser_with_evidence() returns jsonb
language sql stable security definer set search_path=public,pg_temp as $$
  select to_jsonb(t) || jsonb_build_object('evidence',intro_reason_evidence(c.female_id,c.reason))
    from intro_teaser() t cross join lateral next_openable_card(auth.uid()) c
$$;
revoke all on function public.intro_teaser_with_evidence() from public,anon;
grant execute on function public.intro_teaser_with_evidence() to authenticated;
CREATE OR REPLACE FUNCTION public.next_candidate()
 RETURNS SETOF public_profiles
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_uid uuid := auth.uid();
  v_candidate uuid;
  pref text; remaining text[];
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
    remaining := remaining_intro_signals(v_uid);
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
              (case when cardinality(remaining)>0 then public_intro_topics(p) && remaining else false end) desc,
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
declare pref text; remaining text[];
begin
  if not public.is_admin() then raise exception 'admin only' using errcode='42501'; end if;
  pref := public.latest_date_preference(p_male);
  remaining := remaining_intro_signals(p_male);
  perform public.curation_recommendation_tick(p_male);
  return jsonb_build_object('batch', (select to_jsonb(s)-'singleton' from public.curation_batch_state s),
    'as_of',now(),'items',coalesce((select jsonb_agg(to_jsonb(r) order by
      (r.liked_at<now()-interval '72 hours') desc,
      public.published_date_matches(pref,source.profile_public_signals,source.profile_story is null,source.interests) desc,
      (case when cardinality(remaining)>0 then public_intro_topics(source) && remaining else false end) desc,
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

-- The introduction tab can evaluate its own card even when the home is showing a meeting request.
create function public.next_candidate_with_evidence() returns jsonb
language sql volatile security definer set search_path=public,pg_temp as $$
  select to_jsonb(p) || jsonb_build_object('evidence',intro_reason_evidence(p.id,null))
    from next_candidate() p
$$;
revoke all on function public.next_candidate_with_evidence() from public,anon;
grant execute on function public.next_candidate_with_evidence() to authenticated;
