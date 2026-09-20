-- S38 — 초기 마켓플레이스 노출 균형과 성별 대기시간 계측
--
-- 가입순으로 같은 남성을 모든 여성에게 먼저 보여주면, 작은 풀에서는 호감과
-- 큐가 소수에게 몰리고 뒤에 가입한 남성은 영원히 노출되지 않는다. 후보를 본
-- 사실을 서버에 기록하고, 아직 덜 노출된 사람부터 배정한다.

create table candidate_impressions (
  viewer_id      uuid not null references profiles(id) on delete cascade,
  candidate_id   uuid not null references profiles(id) on delete cascade,
  first_shown_at timestamptz not null default now(),
  last_shown_at  timestamptz not null default now(),
  show_count     integer not null default 1 check (show_count > 0),
  primary key (viewer_id, candidate_id),
  check (viewer_id <> candidate_id)
);

create index candidate_impressions_candidate
  on candidate_impressions (candidate_id, first_shown_at);

alter table candidate_impressions enable row level security;
revoke all on candidate_impressions from public, anon, authenticated;
grant select, insert, update on candidate_impressions to service_role;

comment on table candidate_impressions is
  '여성 후보 화면의 실제 노출 원장. 클라이언트는 직접 읽거나 쓰지 않고 next_candidate()만 사용한다.';

/*
  평가 전 새로고침은 같은 사람을 돌려준다. 그래야 사용자가 새로고침으로 전체
  풀을 훑을 수 없고, 단순 재렌더를 새로운 노출로 과대계상하지 않는다.

  새 후보는 권역 안에서 고유 노출자 수가 가장 적은 사람부터 고른다. 동률이면
  가입이 오래된 사람을 먼저 둔다. SKIP LOCKED는 동시에 들어온 두 여성이 같은
  최저 노출 후보에 몰리는 것을 줄인다.
*/
create or replace function next_candidate()
  returns setof public_profiles
  language plpgsql volatile security definer set search_path = public, pg_temp as $$
declare
  v_uid       uuid := auth.uid();
  v_candidate uuid;
begin
  if v_uid is null or my_gender() <> 'female' then
    return;
  end if;

  select ci.candidate_id
    into v_candidate
    from candidate_impressions ci
   where ci.viewer_id = v_uid
     and is_eligible_candidate(ci.candidate_id)
     and not exists (
       select 1 from affinities a
        where a.from_id = v_uid and a.to_id = ci.candidate_id
     )
     and not is_excluded(v_uid, ci.candidate_id)
   order by ci.last_shown_at desc
   limit 1;

  if v_candidate is null then
    select p.id
      into v_candidate
      from profiles p
      left join lateral (
        select count(*)::integer as viewer_count,
               max(ci.last_shown_at) as last_shown_at
          from candidate_impressions ci
         where ci.candidate_id = p.id
      ) exposure on true
     where is_eligible_candidate(p.id)
       and not exists (
         select 1 from affinities a
          where a.from_id = v_uid and a.to_id = p.id
       )
       and not is_excluded(v_uid, p.id)
     order by exposure.viewer_count asc,
              exposure.last_shown_at asc nulls first,
              p.created_at asc,
              p.id asc
     for update of p skip locked
     limit 1;

    if v_candidate is not null then
      insert into candidate_impressions (viewer_id, candidate_id)
      values (v_uid, v_candidate)
      on conflict (viewer_id, candidate_id) do update
        set last_shown_at = now(),
            show_count = candidate_impressions.show_count + 1;
    end if;
  end if;

  return query
    select pp.* from public_profiles pp where pp.id = v_candidate;
end $$;

comment on function next_candidate() is
  '평가 전에는 같은 후보, 평가 후에는 권역 내 고유 노출 수가 가장 적은 후보 한 명을 반환한다.';

revoke all on function next_candidate() from public, anon;
grant execute on function next_candidate() to authenticated;

-- 운영자가 성별 공급 부족과 실제 대기시간을 추측하지 않도록 한 화면에 모은다.
create function admin_marketplace_health() returns jsonb
  language plpgsql stable security definer set search_path = public, pg_temp as $$
declare v jsonb;
begin
  if not is_admin() then
    raise exception 'admin only' using errcode = '42501';
  end if;

  with eligible as (
    select p.*
      from profiles p
     where p.role = 'member'
       and p.email_verified_at is not null
       and p.account_state = 'active'
       and p.onboarding_step = 7
       and p.terms_agreed_at is not null
       and p.privacy_agreed_at is not null
       and p.paused_at is null
       and p.name is not null
       and (p.photo_url is null or p.photo_state = 'approved')
  ),
  male_exposure as (
    select p.id, p.created_at, min(ci.first_shown_at) as first_at
      from eligible p
      left join candidate_impressions ci on ci.candidate_id = p.id
     where p.gender = 'male'
     group by p.id, p.created_at
  ),
  male_like as (
    select p.id, p.created_at, min(a.created_at) as first_at
      from eligible p
      left join affinities a on a.to_id = p.id and a.verdict = 'like'
     where p.gender = 'male'
     group by p.id, p.created_at
  ),
  exposure_wait as (
    select extract(epoch from (first_at - created_at)) / 3600.0 as hours
      from male_exposure where first_at is not null
  ),
  like_wait as (
    select extract(epoch from (first_at - created_at)) / 3600.0 as hours
      from male_like where first_at is not null
  ),
  queue_wait as (
    select extract(epoch from (q.created_at - a.created_at)) / 3600.0 as hours
      from affinities a
      join intro_queue q on q.male_id = a.to_id and q.female_id = a.from_id
     where a.verdict = 'like'
  ),
  open_wait as (
    select extract(epoch from (i.opened_at - a.created_at)) / 3600.0 as hours
      from affinities a
      join intros i on i.male_id = a.to_id and i.female_id = a.from_id
     where a.verdict = 'like'
  )
  select jsonb_build_object(
    'pool', jsonb_build_object(
      'eligible_female', (select count(*) from eligible where gender = 'female'),
      'eligible_male', (select count(*) from eligible where gender = 'male'),
      'males_never_shown', (select count(*) from male_exposure where first_at is null),
      'males_without_like', (select count(*) from male_like where first_at is null)
    ),
    'male_first_exposure', jsonb_build_object(
      'sample', (select count(*) from exposure_wait),
      'p50_hours', (select round(percentile_cont(0.5) within group (order by hours)::numeric, 1) from exposure_wait),
      'p90_hours', (select round(percentile_cont(0.9) within group (order by hours)::numeric, 1) from exposure_wait)
    ),
    'male_first_like', jsonb_build_object(
      'sample', (select count(*) from like_wait),
      'p50_hours', (select round(percentile_cont(0.5) within group (order by hours)::numeric, 1) from like_wait),
      'p90_hours', (select round(percentile_cont(0.9) within group (order by hours)::numeric, 1) from like_wait)
    ),
    'female_like_to_queue', jsonb_build_object(
      'sample', (select count(*) from queue_wait),
      'p50_hours', (select round(percentile_cont(0.5) within group (order by hours)::numeric, 1) from queue_wait),
      'p90_hours', (select round(percentile_cont(0.9) within group (order by hours)::numeric, 1) from queue_wait)
    ),
    'female_like_to_open', jsonb_build_object(
      'sample', (select count(*) from open_wait),
      'p50_hours', (select round(percentile_cont(0.5) within group (order by hours)::numeric, 1) from open_wait),
      'p90_hours', (select round(percentile_cont(0.9) within group (order by hours)::numeric, 1) from open_wait)
    )
  ) into v;

  return v;
end $$;

comment on function admin_marketplace_health() is
  '활성 성비, 무노출·무호감 남성, 남성 첫 노출·호감과 여성 호감 이후 큐·열람 대기시간.';

revoke all on function admin_marketplace_health() from public, anon;
grant execute on function admin_marketplace_health() to authenticated;
