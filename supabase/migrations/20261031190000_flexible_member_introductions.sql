-- Personal-manager onboarding: email ownership is not employment verification.
-- Existing location choices remain narrow until the owner explicitly changes them.
create function public.meeting_area_catalog() returns text[] language sql immutable
set search_path=public,pg_temp as $$ select array['gangnam','pangyo','jongno','yeouido','seoul','gyeonggi','incheon','busan','daegu','daejeon','gwangju','ulsan','gyeongbuk','gangwon','chungcheong','jeonbuk','jeju']::text[] $$;
revoke all on function public.meeting_area_catalog() from public,anon;
grant execute on function public.meeting_area_catalog() to authenticated,service_role;

alter table public.profiles drop constraint profiles_hub_id_check;
alter table public.profiles add constraint profiles_hub_id_check
 check(hub_id='undecided' or hub_id=any(public.meeting_area_catalog()));
comment on column public.profiles.hub_id is '선호 만남 지역. 가입 시 미정 가능; 직장 소재지나 동일 지역 소개 경계가 아니다.';
comment on column public.profiles.company_email is '기존 컬럼명을 유지한 로그인 이메일. 개인 메일 허용; 직장·재직 증명이 아니다.';
comment on column public.profiles.email_verified_at is '로그인 이메일 소유 확인 시각. 기존 회사 이메일 확인 이력도 그대로 보존한다.';

create table public.member_meeting_areas (
 user_id uuid primary key references public.profiles(id) on delete cascade,
 area_ids text[] not null check(cardinality(area_ids) between 1 and 17 and area_ids <@ public.meeting_area_catalog() and array_position(area_ids,null) is null),
 updated_at timestamptz not null default now()
);
alter table public.member_meeting_areas enable row level security;
revoke all on public.member_meeting_areas from public,anon,authenticated;
grant select on public.member_meeting_areas to authenticated;
grant all on public.member_meeting_areas to service_role;
create policy meeting_areas_owner on public.member_meeting_areas for select to authenticated using(user_id=auth.uid());

create function public.member_area_ids(p_user uuid) returns text[] language sql stable security definer
set search_path=public,pg_temp as $$
 select coalesce(a.area_ids,case when p.hub_id='undecided' then '{}'::text[] else array[p.hub_id] end)
 from public.profiles p left join public.member_meeting_areas a on a.user_id=p.id where p.id=p_user
$$;
create function public.meeting_areas_overlap(p_first uuid,p_second uuid) returns boolean
language sql stable security definer set search_path=public,pg_temp as $$
 select coalesce(public.member_area_ids(p_first) && public.member_area_ids(p_second),false)
$$;
revoke all on function public.member_area_ids(uuid),public.meeting_areas_overlap(uuid,uuid) from public,anon,authenticated;
grant execute on function public.member_area_ids(uuid),public.meeting_areas_overlap(uuid,uuid) to service_role;

create function public.my_meeting_areas() returns text[] language plpgsql stable security definer
set search_path=public,pg_temp as $$
begin
 if auth.uid() is null then raise exception 'unauthenticated' using errcode='28000'; end if;
 return coalesce(public.member_area_ids(auth.uid()),'{}'::text[]);
end $$;
create function public.set_my_meeting_areas(p_primary text,p_areas text[]) returns public.profiles
language plpgsql security definer set search_path=public,pg_temp as $$
declare p public.profiles; normalized text[];
begin
 select * into p from public.profiles where id=auth.uid() and account_state='active' for update;
 if p.id is null then raise exception 'unauthenticated' using errcode='28000'; end if;
 if p_primary is null or p_areas is null or cardinality(p_areas) not between 1 and 17
    or array_position(p_areas,null) is not null or not p_areas <@ public.meeting_area_catalog()
    or not p_primary=any(p_areas) then
  raise exception 'choose meeting areas' using errcode='22023';
 end if;
 select array_agg(distinct area order by area) into normalized from unnest(p_areas) area;
 insert into public.member_meeting_areas(user_id,area_ids) values(p.id,normalized)
 on conflict(user_id) do update set area_ids=excluded.area_ids,updated_at=now();
 update public.profiles set hub_id=p_primary where id=p.id returning * into p;
 -- Hide unmatched queued introductions outside the newly chosen area. Opened
 -- introductions and confirmed appointments keep their rights and history.
 delete from public.intro_queue q where q.opened_at is null
   and (q.male_id=p.id or q.female_id=p.id)
   and not public.meeting_areas_overlap(q.male_id,q.female_id);
 delete from public.curation_recommendations r where r.male_id=p.id or r.female_id=p.id;
 return p;
end $$;
revoke all on function public.my_meeting_areas(),public.set_my_meeting_areas(text,text[]) from public,anon;
grant execute on function public.my_meeting_areas(),public.set_my_meeting_areas(text,text[]) to authenticated;

CREATE OR REPLACE FUNCTION public.create_my_profile_base(p_gender gender, p_hub_id text)
 RETURNS profiles
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'auth', 'pg_temp'
AS $function$
declare
  v_uid       uuid := auth.uid();
  v_email     text;
  v_confirmed timestamptz;
  v_profile   profiles;
begin
  if v_uid is null then
    raise exception 'not authenticated' using errcode = '42501';
  end if;

  select lower(email), email_confirmed_at into v_email, v_confirmed
    from auth.users where id = v_uid;

  select * into v_profile from profiles where id = v_uid;
  if found then
    if v_profile.email_verified_at is null
       and v_confirmed is not null
       and lower(v_profile.company_email) = v_email then
      update profiles set email_verified_at = v_confirmed
       where id = v_uid
      returning * into v_profile;
    end if;
    return v_profile;
  end if;

  if v_confirmed is null then
    raise exception 'email not confirmed' using errcode = '42501';
  end if;
  if nullif(trim(p_hub_id), '') is null then
    raise exception 'hub required' using errcode = '22023';
  end if;

  insert into profiles (id, gender, hub_id, company_email, email_verified_at)
  values (v_uid, p_gender, p_hub_id, v_email, v_confirmed)
  returning * into v_profile;

  return v_profile;
end $function$
;

CREATE OR REPLACE FUNCTION public.sync_email_verified()
 RETURNS profiles
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'auth', 'pg_temp'
AS $function$
declare
  v_email     text;
  v_confirmed timestamptz;
  v_profile   profiles;
begin
  select lower(email), email_confirmed_at into v_email, v_confirmed
    from auth.users where id = auth.uid();
  if v_confirmed is null then
    raise exception 'email not confirmed' using errcode = '42501';
  end if;

  update profiles set email_verified_at = coalesce(email_verified_at, v_confirmed)
   where id = auth.uid()
     and lower(company_email) = v_email
  returning * into v_profile;

  return v_profile;
end $function$
;

CREATE OR REPLACE FUNCTION public.member_readiness_snapshot(p profiles)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare blockers text[] := '{}';
begin
  if p.id is null or p.account_state <> 'active' or p.role <> 'member' then
    blockers := array_append(blockers,'account_inactive');
  end if;
  if p.paused_at is not null then blockers := array_append(blockers,'paused'); end if;
  if p.onboarding_step <> 7 or p.name is null then
    blockers := array_append(blockers,'profile_incomplete');
  end if;
  if p.email_verified_at is null then
    blockers := array_append(blockers,'email_unverified');
  end if;
  if p.hub_id='undecided' then blockers:=array_append(blockers,'meeting_area_required'); end if;
  if p.phone_verified_at is null then
    blockers := array_append(blockers,'phone_unverified');
  end if;
  if public.carrier_identity_required() and (
    p.identity_verified_at is null or p.birth is null or
    extract(year from age((now() at time zone 'Asia/Seoul')::date,p.birth)) < 19
  ) then blockers := array_append(blockers,'adult_unverified'); end if;
  if coalesce(cardinality(p.photo_paths),0) < 3 then
    blockers := array_append(blockers,'photos_missing');
  elsif p.photo_state='rejected' then
    blockers := array_append(blockers,'photos_rejected');
  elsif p.photo_state<>'approved' then
    blockers := array_append(blockers,'photos_pending');
  end if;
  if p.terms_agreed_at is null or p.privacy_agreed_at is null
     or not public.member_policy_current(p.id) then
    blockers := array_append(blockers,'policy_required');
  end if;
  return jsonb_build_object('ready',cardinality(blockers)=0,'blockers',blockers);
end $function$
;

CREATE OR REPLACE FUNCTION public.profile_candidate_ready(p profiles)
 RETURNS boolean
 LANGUAGE sql
 STABLE
 SET search_path TO 'public', 'pg_temp'
AS $function$
  select p.role = 'member' and p.gender = 'male'
     and p.hub_id<>'undecided' and public.member_policy_current(p.id)
     and p.email_verified_at is not null and p.account_state = 'active'
     and p.onboarding_step = 7 and p.terms_agreed_at is not null
     and p.privacy_agreed_at is not null and p.paused_at is null
     and p.name is not null and coalesce(cardinality(p.photo_paths), 0) >= 3
     and p.phone_verified_at is not null and p.photo_state = 'approved'
     and (not carrier_identity_required() or (
       p.identity_verified_at is not null and p.birth is not null
       and extract(year from age((now() at time zone 'Asia/Seoul')::date, p.birth)) >= 19
     ))
$function$
;

CREATE OR REPLACE FUNCTION public.is_eligible_candidate(p_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
  select exists (select 1 from profiles t where t.id = p_id
    and profile_candidate_ready(t) and public.meeting_areas_overlap(auth.uid(), t.id))
$function$
;

CREATE OR REPLACE FUNCTION public.remaining_candidates()
 RETURNS integer
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
  select count(*)::integer from public.eligible_profiles p
   where public.my_gender() = 'female'
     and (public.member_readiness(auth.uid())->>'ready')::boolean
     and p.gender = 'male' and public.meeting_areas_overlap(auth.uid(), p.id)
     and not exists (select 1 from public.affinities a
                      where a.from_id = auth.uid() and a.to_id = p.id)
     and not public.is_excluded(auth.uid(), p.id)
$function$
;

CREATE OR REPLACE FUNCTION public.guard_pair_work_zone()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_first uuid;
  v_second uuid;
begin
  if tg_table_name = 'affinities' then
    v_first := new.from_id;
    v_second := new.to_id;
  else
    v_first := new.male_id;
    v_second := new.female_id;
  end if;

  perform 1 from public.profiles where id in (v_first,v_second) order by id for update;
  if exists (
    select 1 from public.profiles a join public.profiles b on b.id = v_second
     where a.id = v_first and not public.meeting_areas_overlap(a.id,b.id)
  ) then
    raise exception 'meeting areas do not overlap' using errcode = '23514';
  end if;
  return new;
end $function$
;

CREATE OR REPLACE FUNCTION public.next_candidate()
 RETURNS SETOF public_profiles
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
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
     order by (p.hub_id=public.my_hub_id()) desc, exposure.viewer_count asc, exposure.last_shown_at asc nulls first,
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

CREATE OR REPLACE FUNCTION public.curation_recommendation_tick(p_male uuid DEFAULT NULL::uuid)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare n integer;
begin
  -- The global and per-member refreshes share a lock: never overwrite each
  -- other's newer snapshot. A read can keep the last snapshot if another runs.
  if not pg_try_advisory_xact_lock(hashtextextended('curation_recommendation_tick',0)) then return 0; end if;
  delete from public.curation_recommendations where p_male is null or male_id=p_male;
  insert into public.curation_recommendations(male_id,female_id,score,
    preference_dimensions,shared_interests,schedule_overlap,liked_at)
  select m.id,f.id,
    case when m.hub_id=f.hub_id then 1 else 0 end + dimensions.n + least(shared.n,2) + case when availability.n>0 then 3 else 0 end,
    dimensions.n,shared.n,availability.n,a.created_at
  from public.affinities a
  join public.eligible_profiles em on em.id=a.to_id and em.gender='male'
  join public.eligible_profiles ef on ef.id=a.from_id and ef.gender='female' and public.meeting_areas_overlap(em.id,ef.id)
  join public.profiles m on m.id=em.id join public.profiles f on f.id=ef.id
  left join public.meet_windows mw on mw.user_id=m.id and mw.updated_at>now()-interval '14 days'
  left join public.meet_windows fw on fw.user_id=f.id and fw.updated_at>now()-interval '14 days'
  cross join lateral (select count(*)::integer n from unnest(array['rhythm','first_date','closeness','topics','relationship_goal','care']) k
    where exists(select 1 from jsonb_array_elements_text(case
      when jsonb_typeof(m.profile_public_signals->k)='array' then m.profile_public_signals->k
      else '[]'::jsonb end) x
      where (case when jsonb_typeof(f.profile_public_signals->k)='array'
        then f.profile_public_signals->k else '[]'::jsonb end) ? x)) dimensions
  cross join lateral (select count(distinct x)::integer n from unnest(m.interests) x
    where x=any(f.interests) and btrim(x)<>'' and m.profile_story is null and f.profile_story is null) shared
  cross join lateral (select case when mw.user_id is null or fw.user_id is null then null
    else (select count(distinct x)::integer from unnest(mw.weekdays) x where x=any(fw.weekdays)) end n) availability
  where a.verdict='like' and (p_male is null or m.id=p_male)
    and not public.is_excluded(m.id,f.id)
    and not exists(select 1 from public.intros i where i.male_id=m.id and i.female_id=f.id)
    and not exists(select 1 from public.intro_queue q where q.male_id=m.id and q.female_id=f.id);
  get diagnostics n=row_count;
  if p_male is null then
    insert into public.curation_batch_state values(true,now(),n)
      on conflict(singleton) do update set last_success_at=excluded.last_success_at,pair_count=excluded.pair_count;
  end if;
  -- Text is a short-lived drafting aid, not a second permanent profile store.
  delete from public.pair_brief_drafts where created_at<now()-interval '24 hours';
  return n;
end $function$
;

CREATE OR REPLACE FUNCTION public.pair_brief_context(p_male uuid, p_female uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare m public.profiles; f public.profiles; material jsonb;
begin
  select p.* into m from public.profiles p join public.eligible_profiles e on e.id=p.id
    where p.id=p_male and p.gender='male';
  select p.* into f from public.profiles p join public.eligible_profiles e on e.id=p.id
    where p.id=p_female and p.gender='female';
  if m.id is null or f.id is null or not public.meeting_areas_overlap(m.id,f.id) or public.is_excluded(m.id,f.id)
     or not exists(select 1 from public.affinities a where a.from_id=f.id and a.to_id=m.id and a.verdict='like') then
    return null;
  end if;
  select jsonb_object_agg(person, jsonb_build_object(
    'job',p.job,'profile_story',p.profile_story,'profile_public_signals',p.profile_public_signals,
    'intro',case when p.profile_story is null then p.intro end,
    'evening_note',case when p.profile_story is null then p.evening_note end,
    'known_as',case when p.profile_story is null then p.known_as end,
    'topic_note',case when p.profile_story is null then p.topic_note end,
    'match_note',case when p.profile_story is null then p.match_note end,
    'interests',case when p.profile_story is null then p.interests else '{}'::text[] end,
    'match_tags',case when p.profile_story is null then p.match_tags else '{}'::text[] end,
    'topics',case when p.profile_story is null then p.topics else '{}'::text[] end,
    'details',case when p.profile_story is null then p.details else '{}'::jsonb end
  )) into material from (select 'a' person,m.* union all select 'b',f.*) p;
  return jsonb_build_object('sources',material,'source_hash',
    encode(extensions.digest(material::text,'sha256'),'hex'));
end $function$
;

CREATE OR REPLACE FUNCTION public.admin_curation_recommendations(p_male uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
begin
  if not public.is_admin() then raise exception 'admin only' using errcode='42501'; end if;
  perform public.curation_recommendation_tick(p_male);
  return jsonb_build_object('batch', (select to_jsonb(s)-'singleton' from public.curation_batch_state s),
    'as_of',now(),'items',coalesce((select jsonb_agg(to_jsonb(r) order by
      (r.liked_at<now()-interval '72 hours') desc,r.score desc,r.liked_at,r.female_id)
      from public.curation_recommendations r
      join public.eligible_profiles m on m.id=r.male_id
      join public.eligible_profiles f on f.id=r.female_id and public.meeting_areas_overlap(m.id,f.id)
      where r.male_id=p_male and not public.is_excluded(r.male_id,r.female_id)
        and exists(select 1 from public.affinities a where a.from_id=r.female_id and a.to_id=r.male_id and a.verdict='like')
        and not exists(select 1 from public.intros i where i.male_id=r.male_id and i.female_id=r.female_id)
        and not exists(select 1 from public.intro_queue q where q.male_id=r.male_id and q.female_id=r.female_id)), '[]'::jsonb));
end $function$
;

CREATE OR REPLACE FUNCTION public.admin_like_pool(p_male uuid)
 RETURNS TABLE(id uuid, name text, birth date, job text, photo_url text, photo_state photo_state, mbti text, smoking text, drinking text, religion text, hub_id text, headline text, intro text, interests text[], match_tags text[], topics text[], details jsonb, liked_at timestamp with time zone, waiting_hours integer)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
begin
  if not is_admin() then
    raise exception 'admin only' using errcode = '42501';
  end if;

  return query
  select p.id, p.name, p.birth, p.job, p.photo_url, p.photo_state,
         p.mbti, p.smoking, p.drinking, p.religion, p.hub_id,
         p.headline, p.intro, p.interests, p.match_tags, p.topics, p.details,
         a.created_at,
         round(extract(epoch from (now() - a.created_at)) / 3600)::integer
    from affinities a
    join eligible_profiles p on p.id = a.from_id
   where a.to_id = p_male
     and a.verdict = 'like'
     and public.meeting_areas_overlap(p_male,a.from_id)
     and p.gender = 'female'
     and not is_excluded(p_male, a.from_id)
     and not exists (select 1 from intro_queue q
                      where q.male_id = p_male and q.female_id = a.from_id)
     and not exists (select 1 from intros i
                      where i.male_id = p_male and i.female_id = a.from_id)
   order by a.created_at;
end $function$
;

CREATE OR REPLACE FUNCTION public.admin_curation_targets()
 RETURNS TABLE(id uuid, name text, hub_id text, photo_url text, receiving boolean, pool_count bigint, blocked_count bigint, queued_count bigint, delivered_count bigint, oldest_like_hours integer, has_open_intro boolean)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
begin
  if not is_admin() then
    raise exception 'admin only' using errcode = '42501';
  end if;

  return query
  with pool as (
    /*
      admin_like_pool 과 **같은 조건**을 쓴다. 두 곳이 갈리면 목록의 숫자와
      작업판의 내용이 어긋나고, 그게 이 함수를 고치는 이유였다.

      eligible_profiles 가 후보 자격(사진 검수·쉬는 중·정지·온보딩)을 단독으로
      판정한다 — 조건을 여기 복제하면 s14·s18 이 경고한 함정에 다시 빠진다.
    */
    select a.to_id as male_id,
           count(*) filter (where e.id is not null)     as available,
           count(*) filter (where e.id is null)         as blocked,
           min(a.created_at) filter (where e.id is not null) as oldest_available
      from affinities a
      join profiles f on f.id = a.from_id and f.gender = 'female'
      left join eligible_profiles e on e.id = a.from_id and public.meeting_areas_overlap(a.to_id,a.from_id)
     where a.verdict = 'like'
       and not is_excluded(a.to_id, a.from_id)
       and not exists (select 1 from intro_queue q
                        where q.male_id = a.to_id and q.female_id = a.from_id)
       and not exists (select 1 from intros i
                        where i.male_id = a.to_id and i.female_id = a.from_id)
     group by a.to_id
  )
  select p.id, p.name, p.hub_id, p.photo_url,
         (p.paused_at is null) as receiving,
         coalesce(pl.available, 0),
         coalesce(pl.blocked, 0),
         (select count(*) from intro_queue q
           where q.male_id = p.id and q.opened_at is null),
         (select count(*) from intro_queue q
           where q.male_id = p.id and q.opened_at is null
             and q.delivered_at is not null and q.expires_at > now()),
         -- 담을 수 있는 사람 중 가장 오래 기다린 시간. 담을 수 없는 사람의
         -- 대기 시간을 여기 섞으면 "손대면 해결되는 적체" 와 구분이 안 된다.
         (select round(extract(epoch from (now() - pl.oldest_available)) / 3600)::integer),
         exists (select 1 from intros i where i.male_id = p.id and i.closed_at is null)
    from profiles p
    left join pool pl on pl.male_id = p.id
   where p.gender = 'male'
     and p.account_state = 'active'
     and p.onboarding_step = 7
     and p.role <> 'admin'
   order by
     (select count(*) from intro_queue q
       where q.male_id = p.id and q.opened_at is null) asc,
     pl.oldest_available asc nulls last,
     p.created_at;
end $function$
;

CREATE OR REPLACE FUNCTION public.next_openable_card(p_male uuid)
 RETURNS SETOF intro_queue
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
  select q.* from intro_queue q
   where q.male_id = p_male
     and q.opened_at is null
     and public.meeting_areas_overlap(q.male_id,q.female_id)
     and q.delivered_at is not null
     and q.expires_at > now()
     and not is_excluded(p_male, q.female_id)
     and exists (select 1 from eligible_profiles e
                  where e.id = q.female_id and e.gender = 'female')
   order by q.position, q.created_at
   limit 1
$function$
;

CREATE OR REPLACE FUNCTION public.promote_intro_queue(p_male uuid)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare v_count integer;
begin
  if exists (select 1 from profiles where id = p_male and paused_at is not null) then
    return 0;
  end if;

  with top3 as (
    select q.id from intro_queue q
     where q.male_id = p_male and q.opened_at is null
     and public.meeting_areas_overlap(q.male_id,q.female_id)
       and exists (select 1 from eligible_profiles e
                    where e.id = q.female_id and e.gender = 'female')
     order by q.position, q.created_at
     limit 3
  )
  update intro_queue q
     set delivered_at = now(),
         expires_at   = now() + interval '3 weeks'
    from top3
   where q.id = top3.id and q.delivered_at is null;
  get diagnostics v_count = row_count;
  return v_count;
end $function$
;

CREATE OR REPLACE FUNCTION public.meet_places_for_me()
 RETURNS TABLE(id uuid, name text, station text, kind text, address text, map_url text, note text)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
  select p.id, p.name, p.station, p.kind, p.address, p.map_url, p.note
    from meet_places p
   where p.active and p.hub_id=any(public.member_area_ids(auth.uid()))
   order by p.station, p.name
$function$
;

CREATE OR REPLACE FUNCTION public.request_meeting(p_intro_id uuid, p_slots timestamp with time zone[], p_place_id uuid, p_place_name text)
 RETURNS meetings
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_n       integer := coalesce(array_length(p_slots, 1), 0);
  v_place   meet_places;
  v_name    text;
  v_meeting meetings;
begin
  if auth.uid() is null then
    raise exception 'unauthenticated' using errcode = '28000';
  end if;
  if v_n < 1 or v_n > 3 then
    raise exception 'propose 1 to 3 slots' using errcode = '22023';
  end if;
  if (select count(distinct s) from unnest(p_slots) s) <> v_n then
    raise exception 'slots must be distinct' using errcode = '22023';
  end if;
  if exists (select 1 from unnest(p_slots) s
              where s < now() + interval '3 hours' or s > now() + interval '21 days') then
    raise exception 'slots must be between 3 hours and 21 days from now' using errcode = '22023';
  end if;
  if exists (select 1 from unnest(p_slots) s
              where extract(isodow from s at time zone 'Asia/Seoul') not between 1 and 5
                 or (s at time zone 'Asia/Seoul')::time not in
                    (time '18:30', time '19:00', time '19:30', time '20:00')) then
    raise exception 'slots must be weekday evenings' using errcode = '22023';
  end if;

  if p_place_id is not null then
    select * into v_place from meet_places
     where id = p_place_id and active and hub_id=any(public.member_area_ids(auth.uid()))
       and exists(select 1 from public.intros i where i.id=p_intro_id and i.male_id=auth.uid()
         and meet_places.hub_id=any(public.member_area_ids(i.female_id)));
    if not found then
      raise exception 'place not available' using errcode = '22023';
    end if;
    v_name := v_place.name || ' · ' || v_place.station || '역';
  else
    v_name := nullif(btrim(coalesce(p_place_name, '')), '');
    if v_name is null or char_length(v_name) > 60 then
      raise exception 'place required' using errcode = '22023';
    end if;
  end if;

  v_meeting := use_meeting_ticket(p_intro_id);
  update meetings
     set proposed_slots = (select array_agg(s order by s) from unnest(p_slots) s),
         proposed_place_id = p_place_id,
         proposed_place_name = v_name
   where id = v_meeting.id
  returning * into v_meeting;
  return v_meeting;
end $function$
;

-- An undecided signup can never become a candidate through direct onboarding writes.
create function public.guard_profile_meeting_area() returns trigger language plpgsql
set search_path=public,pg_temp as $$
begin
 if new.onboarding_step=7 and new.hub_id='undecided' then
  raise exception 'choose meeting areas' using errcode='22023';
 end if;
 return new;
end $$;
revoke all on function public.guard_profile_meeting_area() from public,anon,authenticated;
create trigger profiles_meeting_area_ready before insert or update of onboarding_step,hub_id on public.profiles
for each row execute function public.guard_profile_meeting_area();

create function public.erase_member_meeting_areas() returns trigger language plpgsql security definer
set search_path=public,pg_temp as $$
begin
 if new.account_state<>'active' then delete from public.member_meeting_areas where user_id=new.id; end if;
 return new;
end $$;
revoke all on function public.erase_member_meeting_areas() from public,anon,authenticated;
create trigger profiles_erase_meeting_areas after update of account_state on public.profiles
for each row execute function public.erase_member_meeting_areas();
notify pgrst,'reload schema';

CREATE OR REPLACE FUNCTION public.notify_candidate_refill()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
begin
  if profile_candidate_ready(old) or not profile_candidate_ready(new) then
    return new;
  end if;

  insert into notifications (user_id, kind, event_id, payload)
  select f.id, 'candidates_refilled', new.id,
         jsonb_build_object('counterpart_id', new.id)
    from eligible_profiles f
   where f.gender = 'female'
     and public.meeting_areas_overlap(f.id,new.id)
     and not is_excluded(f.id, new.id)
     and not exists (
       select 1 from affinities a
        where a.from_id = f.id and a.to_id = new.id
     )
     -- 새 후보를 빼면 평가할 사람이 없던 여성에게만 보낸다.
     and not exists (
       select 1
         from eligible_profiles m
        where m.gender = 'male'
          and public.meeting_areas_overlap(m.id,f.id)
          and m.id <> new.id
          and not is_excluded(f.id, m.id)
          and not exists (
            select 1 from affinities a
             where a.from_id = f.id and a.to_id = m.id
          )
     )
  on conflict (user_id, kind, event_id) where event_id is not null do nothing;

  return new;
end $function$
;

CREATE OR REPLACE FUNCTION public.home_state_v2_base()
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  h jsonb;
  r jsonb;
  p public.profiles;
  m public.meetings;
  v_state text;
  v_action text;
  v_target uuid;
  v_deadline timestamptz;
  v_intro_tix integer;
  v_meet_tix integer;
  v_request_count integer;
begin
  if auth.uid() is null then
    raise exception 'unauthenticated' using errcode = '28000';
  end if;
  select * into p from public.profiles where id = auth.uid();
  if not found then
    return jsonb_build_object('schema_version', 2, 'as_of', now(),
      'primary_state', 'account_unavailable', 'readiness', public.member_readiness(auth.uid()),
      'next_action', null, 'deadline_at', null);
  end if;
  if p.account_state <> 'active' or p.role <> 'member' then
    return jsonb_build_object('schema_version', 2, 'as_of', now(),
      'primary_state', 'account_unavailable', 'readiness', public.member_readiness(p.id),
      'next_action', null, 'deadline_at', null);
  end if;

  h := public.home_state();
  r := public.member_readiness(p.id);
  if p.gender = 'female' then
    select count(*) into v_request_count
      from public.meetings rm join public.intros ri on ri.id = rm.intro_id
     where ri.female_id = p.id and ri.closed_at is null
       and rm.prefs_submitted_at is null and rm.cancelled_at is null
       and rm.completed_at is null;
    h := h || jsonb_build_object('request_count', v_request_count);
  end if;
  if h->'meeting' is not null and h->'meeting' <> 'null'::jsonb then
    select * into m from public.meetings where id = (h #>> '{meeting,id}')::uuid;
    if m.completed_at is not null then
      -- v1은 완료된 확정 약속도 돌려줄 수 있다. 새 상태에서는 진행 중으로 보지 않는다.
      h := h || jsonb_build_object('meeting', null, 'candidate', null);
      m := null;
    end if;
  end if;

  if p.account_state <> 'active' then
    v_state := 'account_unavailable';
  elsif h->'pending_no_show' is not null and h->'pending_no_show' <> 'null'::jsonb
        and h #>> '{pending_no_show,responded_at}' is null then
    v_state := 'report_response_required'; v_action := 'respond_report';
    v_target := (h #>> '{pending_no_show,id}')::uuid;
  elsif m.id is not null and m.confirmed_at is not null then
    if m.completed_at is null and m.scheduled_at < now() then
      v_state := 'meeting_outcome_required'; v_action := 'view_meeting';
    else
      v_state := 'meeting_confirmed'; v_action := 'view_meeting';
    end if;
    v_target := m.id;
  elsif p.onboarding_step < 7 then
    v_state := 'profile_incomplete'; v_action := 'complete_profile';
  elsif r->'blockers' ? 'adult_unverified' then
    v_state := 'identity_required'; v_action := 'verify_identity';
  elsif r->'blockers' ? 'phone_unverified' then
    v_state := 'phone_required'; v_action := 'verify_phone';
  elsif r->'blockers' ? 'photos_missing' or r->'blockers' ? 'photos_rejected' then
    v_state := 'photos_required'; v_action := 'edit_photos';
  elsif r->'blockers' ? 'photos_pending' then
    v_state := 'photos_pending';
  elsif r->'blockers' ? 'email_unverified' or r->'blockers' ? 'meeting_area_required' or r->'blockers' ? 'policy_required' then
    v_state := 'profile_incomplete'; v_action := 'complete_profile';
  elsif m.id is not null and m.prefs_submitted_at is not null then
    v_state := case when p.gender = 'male' then 'schedule_selection' else 'schedule_waiting' end;
    v_action := case when p.gender = 'male' then 'select_slot' else 'view_meeting' end;
    v_target := m.id;
  elsif coalesce((h->>'request_count')::integer, 0) > 0 and p.gender = 'female' then
    v_state := 'request_received'; v_action := 'view_requests';
  elsif m.id is not null then
    v_state := 'request_waiting'; v_action := 'view_meeting'; v_target := m.id;
  elsif h->'candidate' is not null and h->'candidate' <> 'null'::jsonb then
    v_state := 'intro_available'; v_action := 'view_intro';
  elsif p.gender = 'male' and coalesce((h->>'queued_intros')::integer, 0) > 0 then
    v_state := 'intro_delivered'; v_action := 'view_intro';
  elsif p.paused_at is not null then
    v_state := 'paused'; v_action := 'resume_intros';
  else
    v_state := 'waiting';
  end if;

  if m.id is not null and m.confirmed_at is null and m.prefs_submitted_at is null then
    select t.used_at + interval '24 hours' into v_deadline
      from public.tickets t where t.id = m.ticket_id;
  end if;
  select count(*) filter (where kind = 'intro'), count(*) filter (where kind = 'meeting')
    into v_intro_tix, v_meet_tix from public.tickets
   where user_id = p.id and state = 'unused' and expires_at > now() and not refund_locked;

  return h || jsonb_build_object(
    'schema_version', 2, 'as_of', now(), 'primary_state', v_state,
    'readiness', r, 'next_action', case when v_action is null then null
      else jsonb_build_object('type', v_action, 'target_id', v_target) end,
    'deadline_at', v_deadline,
    'ticket_summary', jsonb_build_object('intro_available', v_intro_tix,
                                          'meeting_available', v_meet_tix),
    'intro_tickets', v_intro_tix, 'meeting_tickets', v_meet_tix
  );
end $function$
;

CREATE OR REPLACE FUNCTION public.admin_marketplace_health_v2(p_hub text DEFAULT NULL::text, p_days integer DEFAULT 14)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare v jsonb; v_started timestamptz;
begin
  if not public.is_admin() then raise exception 'admin only' using errcode='42501'; end if;
  if p_days is null or p_days not in (7,14,28) or
     (p_hub is not null and not p_hub=any(public.meeting_area_catalog())) then
    raise exception 'invalid metric filter' using errcode='22023';
  end if;
  select readiness_started_at into v_started from public.metric_instrumentation where id;
  with ready_now as (
    select p.id,p.gender,p.hub_id from public.eligible_profiles p
     where p_hub is null or p.hub_id=p_hub
  ), pending_request as (
    select m.id,t.used_at,p.hub_id,
           extract(epoch from (now()-t.used_at))/3600.0 hours
      from public.meetings m join public.intros i on i.id=m.intro_id
      join public.tickets t on t.id=m.ticket_id
      join public.profiles p on p.id=i.female_id
     where m.prefs_submitted_at is null and m.confirmed_at is null
       and m.cancelled_at is null and m.completed_at is null
       and i.closed_at is null and t.used_at is not null
       and t.used_at+interval '24 hours'>now()
       and (p_hub is null or p.hub_id=p_hub)
  ), completed_response as (
    select extract(epoch from (m.prefs_submitted_at-t.used_at))/3600.0 hours
      from public.meetings m join public.intros i on i.id=m.intro_id
      join public.tickets t on t.id=m.ticket_id
      join public.profiles p on p.id=i.female_id
     where m.prefs_submitted_at>=now()-make_interval(days=>p_days)
       and t.used_at is not null and m.prefs_submitted_at>=t.used_at
       and (p_hub is null or p.hub_id=p_hub)
  ), delivery_cohort as (
    select e.aggregate_id,e.subject_id,e.occurred_at
      from public.domain_events e
     where e.event_type='intro_delivered'
       and e.occurred_at>=greatest(v_started,now()-make_interval(days=>p_days+7))
       and e.occurred_at<=now()-interval '7 days'
       and (p_hub is null or e.props->>'hub_id'=p_hub)
  ), opened_delivery as (
    select d.aggregate_id from delivery_cohort d
     where exists (select 1 from public.domain_events e
       where e.event_type='intro_opened' and e.aggregate_id=d.aggregate_id
         and e.occurred_at between d.occurred_at and d.occurred_at+interval '7 days')
  ), first_ready as (
    select distinct on (e.subject_id) e.subject_id,e.occurred_at,e.props->>'hub' hub
      from public.domain_events e
     where e.event_type='member_became_ready' and e.subject_id is not null
     order by e.subject_id,e.occurred_at
  ), ready_cohort as (
    select r.* from first_ready r
     where r.occurred_at>=greatest(v_started,now()-make_interval(days=>p_days+7))
       and r.occurred_at<=now()-interval '7 days'
       and (p_hub is null or r.hub=p_hub)
  ), first_intro as (
    select r.subject_id from ready_cohort r
     where exists (select 1 from public.domain_events e
       where e.subject_id=r.subject_id and e.event_type='intro_delivered'
         and e.occurred_at between r.occurred_at and r.occurred_at+interval '7 days')
  ), meeting_cohort as (
    select m.id,m.completed_by,m.completed_at,m.scheduled_at
      from public.meetings m join public.intros i on i.id=m.intro_id
      join public.profiles p on p.id=i.female_id
     where m.confirmed_at>=now()-make_interval(days=>p_days)
       and m.cancelled_at is null and (p_hub is null or p.hub_id=p_hub)
  )
  select jsonb_build_object(
    'as_of',now(),'filters',jsonb_build_object('hub',p_hub,'days',p_days),
    'coverage',jsonb_build_object('readiness_started_at',v_started,
      'historical_readiness_unknown',true,
      'withdrawn_event_history_removed',true),
    'ready_now',jsonb_build_object(
      'female',(select count(*) from ready_now where gender='female'),
      'male',(select count(*) from ready_now where gender='male')),
    'pending_request',jsonb_build_object(
      'count',(select count(*) from pending_request),
      'oldest_hours',(select round(max(hours)::numeric,1) from pending_request),
      'p50_hours',(select round(percentile_cont(0.5) within group(order by hours)::numeric,1)
                     from pending_request),
      'p90_hours',(select round(percentile_cont(0.9) within group(order by hours)::numeric,1)
                     from pending_request)),
    'completed_response',jsonb_build_object(
      'sample',(select count(*) from completed_response),
      'p50_hours',(select round(percentile_cont(0.5) within group(order by hours)::numeric,1)
                     from completed_response),
      'p90_hours',(select round(percentile_cont(0.9) within group(order by hours)::numeric,1)
                     from completed_response)),
    'intro_open_7d',jsonb_build_object(
      'denominator',(select count(*) from delivery_cohort),
      'numerator',(select count(*) from opened_delivery),
      'rate',case when (select count(*) from delivery_cohort)=0 then null
        else round((select count(*) from opened_delivery)::numeric/
                   (select count(*) from delivery_cohort),3) end),
    'first_intro_7d',jsonb_build_object(
      'denominator',(select count(*) from ready_cohort),
      'numerator',(select count(*) from first_intro),
      'rate',case when (select count(*) from ready_cohort)=0 then null
        else round((select count(*) from first_intro)::numeric/
                   (select count(*) from ready_cohort),3) end),
    'meeting_confirmation',jsonb_build_object(
      'confirmed',(select count(*) from meeting_cohort),
      'both_reported',(select count(*) from meeting_cohort where cardinality(completed_by)>=2),
      'one_reported',(select count(*) from meeting_cohort where cardinality(completed_by)=1),
      'not_reported',(select count(*) from meeting_cohort where cardinality(completed_by)=0
                        and scheduled_at<now()))
  ) into v;
  return v;
end $function$
;

CREATE OR REPLACE FUNCTION public.guard_meeting_confirmation()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_participants uuid[];
  v_member uuid;
  v_active integer;
begin
  if new.confirmed_at is null or (
    old.confirmed_at is not null and new.scheduled_at is not distinct from old.scheduled_at
    and new.place_id is not distinct from old.place_id
    and new.accepted_slot is not distinct from old.accepted_slot
  ) then
    return new;
  end if;
  -- 이미 확정된 약속의 실제 만남 후 기록/정정은 과거 시각일 수 있다.
  -- 회원이 호출하는 confirm_meeting 은 자체적으로 미래 시각만 받는다.
  if new.completed_at is not null or
     (old.confirmed_at is not null and new.scheduled_at <= now()) then
    return new;
  end if;
  if new.cancelled_at is not null or new.scheduled_at is null or new.scheduled_at <= now() then
    raise exception 'meeting slot is no longer available' using errcode = '22007';
  end if;

  select array[i.male_id, i.female_id] into v_participants
    from public.intros i where i.id = new.intro_id;
  if coalesce(cardinality(v_participants), 0) <> 2 then
    raise exception 'meeting participants missing' using errcode = '23503';
  end if;

  -- 두 회원을 항상 동일한 순서로 잠가, 다른 meeting 행에서 동시에 확정해도
  -- 뒤의 트랜잭션이 앞의 확정 결과를 본 뒤 충돌을 검사하게 한다.
  for v_member in select unnest(v_participants) order by 1 loop
    perform 1 from public.profiles where id = v_member for update;
  end loop;
  select count(*) into v_active from public.profiles
   where id = any(v_participants) and account_state = 'active';
  if v_active <> 2 then
    raise exception 'participant account is no longer active' using errcode = '42501';
  end if;

  if new.accepted_slot is not null and (
    new.proposed_slots is null or new.accepted_slot < 0 or
    new.accepted_slot >= coalesce(cardinality(new.proposed_slots), 0) or
    new.scheduled_at is distinct from new.proposed_slots[new.accepted_slot + 1]
  ) then
    raise exception 'proposed slot changed' using errcode = '22023';
  end if;
  if new.place_id is not null and not exists (
    select 1 from public.meet_places p join public.profiles member
      on member.id = v_participants[1]
     where p.id = new.place_id and p.active and p.hub_id=any(public.member_area_ids(v_participants[1]))
       and p.hub_id=any(public.member_area_ids(v_participants[2]))
  ) then
    raise exception 'place no longer available' using errcode = '22023';
  end if;

  if exists (
    select 1 from public.meetings m join public.intros i on i.id = m.intro_id
     where m.id <> new.id and m.confirmed_at is not null
       and m.cancelled_at is null and m.completed_at is null
       and m.scheduled_at = new.scheduled_at
       and (i.male_id = any(v_participants) or i.female_id = any(v_participants))
  ) then
    raise exception 'participant already has a meeting at this time' using errcode = '23505';
  end if;
  return new;
end $function$
;

create function public.meet_places_for_intro(p_intro uuid)
returns table(id uuid,name text,station text,kind text,address text,map_url text,note text)
language sql stable security definer set search_path=public,pg_temp as $$
 select p.id,p.name,p.station,p.kind,p.address,p.map_url,p.note
 from public.meet_places p join public.intros i on i.id=p_intro
 where auth.uid() in(i.male_id,i.female_id) and not public.is_excluded(i.male_id,i.female_id)
   and i.closed_at is null and p.active
   and p.hub_id=any(public.member_area_ids(i.male_id))
   and p.hub_id=any(public.member_area_ids(i.female_id))
 order by p.station,p.name
$$;
revoke all on function public.meet_places_for_intro(uuid) from public,anon;
grant execute on function public.meet_places_for_intro(uuid) to authenticated;

-- Publish the changed service notice for new signups. Existing explicit consent
-- receipts are not rewritten and global reconsent is not silently activated.
insert into public.policy_catalog(version,status,published_at,note) values('2026-10-31.1','published',now(),'개인 이메일 가입·선택 만남 지역·개인 소개 매니저 서비스 안내');
update public.policy_control set signup_version='2026-10-31.1',version=version+1,updated_at=now()
 where id and required_reconsent_version is null;
do $$ begin
 if (select signup_version from public.policy_control where id) is distinct from '2026-10-31.1' then
  raise exception 'review active reconsent before changing signup policy';
 end if;
end $$;
notify pgrst,'reload schema';
