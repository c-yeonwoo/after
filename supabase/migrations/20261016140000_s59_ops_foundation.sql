-- 운영 집계는 실제 소개 자격과 동일한 뷰를 사용한다.
create or replace function public.admin_marketplace_health() returns jsonb
  language plpgsql stable security definer set search_path = public, pg_temp as $$
declare v jsonb;
begin
  if not public.is_admin() then
    raise exception 'admin only' using errcode = '42501';
  end if;

  with eligible as (
    select id, gender, created_at from public.eligible_profiles
  ), male_exposure as (
    select p.id, p.created_at, min(ci.first_shown_at) as first_at
      from eligible p left join public.candidate_impressions ci on ci.candidate_id = p.id
     where p.gender = 'male' group by p.id, p.created_at
  ), male_like as (
    select p.id, p.created_at, min(a.created_at) as first_at
      from eligible p left join public.affinities a on a.to_id = p.id and a.verdict = 'like'
     where p.gender = 'male' group by p.id, p.created_at
  ), exposure_wait as (
    select extract(epoch from (first_at - created_at)) / 3600.0 as hours
      from male_exposure where first_at is not null
  ), like_wait as (
    select extract(epoch from (first_at - created_at)) / 3600.0 as hours
      from male_like where first_at is not null
  ), queue_wait as (
    select extract(epoch from (q.created_at - a.created_at)) / 3600.0 as hours
      from public.affinities a join public.intro_queue q
        on q.male_id = a.to_id and q.female_id = a.from_id where a.verdict = 'like'
  ), open_wait as (
    select extract(epoch from (i.opened_at - a.created_at)) / 3600.0 as hours
      from public.affinities a join public.intros i
        on i.male_id = a.to_id and i.female_id = a.from_id where a.verdict = 'like'
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

-- 기존 목록 RPC는 호환 유지. 새 화면은 동일 스냅샷의 total과 cursor를 받는다.
create function public.admin_support_page(
  p_status text default 'open', p_before timestamptz default null,
  p_before_id uuid default null, p_limit integer default 30
) returns jsonb language plpgsql stable security definer
  set search_path = public, pg_temp as $$
declare v jsonb;
begin
  if not public.is_admin() then
    raise exception 'admin only' using errcode = '42501';
  end if;
  if p_status is not null and p_status not in ('open', 'answered') then
    raise exception 'invalid status' using errcode = '22023';
  end if;
  if p_limit not between 1 and 50 or (p_before is null) <> (p_before_id is null) then
    raise exception 'invalid cursor or limit' using errcode = '22023';
  end if;

  with filtered as (
    select r.id, r.user_id, p.name::text as member_name, r.category,
           r.body, r.status, r.response, r.created_at, r.responded_at
      from public.support_requests r join public.profiles p on p.id = r.user_id
     where p_status is null or r.status = p_status
  ), page as (
    select f.*, row_number() over (order by f.created_at desc, f.id desc) as rn
      from filtered f
     where p_before is null or (f.created_at, f.id) < (p_before, p_before_id)
     order by f.created_at desc, f.id desc limit p_limit + 1
  )
  select jsonb_build_object(
    'items', coalesce((select jsonb_agg(to_jsonb(x) - 'rn' order by x.created_at desc, x.id desc)
                         from page x where x.rn <= p_limit), '[]'::jsonb),
    'total', (select count(*) from filtered),
    'next_cursor', (select jsonb_build_object('created_at', x.created_at, 'id', x.id)
                      from page x where x.rn = p_limit and (select count(*) from page) > p_limit),
    'as_of', now()
  ) into v;
  return v;
end $$;
revoke all on function public.admin_support_page(text,timestamptz,uuid,integer) from public, anon;
grant execute on function public.admin_support_page(text,timestamptz,uuid,integer) to authenticated;
