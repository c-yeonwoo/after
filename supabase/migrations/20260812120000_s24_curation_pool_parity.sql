-- S24 — 큐레이션 목록의 호감 수를 실제 풀과 맞춘다
--
-- 출시 전 검증(docs/release-scenarios.md D2·D4)에서 나온 불일치다.
--
--   작업 대상 목록:  민수 · 대기 호감 3
--   호감 풀 화면:    서연 · 하람  (2명)
--
-- 빠진 사람은 사진 검수 대기(지우)였다. admin_like_pool 은 eligible_profiles 를
-- 조인해 후보 자격을 판정하지만, admin_curation_targets 의 pool_count 는
-- affinities 만 세고 있었다.
--
-- ── 왜 숫자를 낮추는 대신 갈라서 내는가 ──
-- pool_count 를 eligible 기준으로 바꾸면 숫자는 맞지만 **적체의 원인이 사라진다.**
-- 운영자는 "3명이라더니 2명" 을 겪고, 나머지 1명이 왜 없는지 알 방법이 없다.
-- 그 1명은 사진을 검수하면 곧바로 큐레이션 가능한 사람이다 — 이 화면의 목적이
-- "지금 무엇이 막혀 있는가" 를 말하는 것이므로, 막힌 이유를 함께 낸다.
--
--   pool_count    지금 큐에 담을 수 있는 사람 (= 호감 풀 화면과 일치)
--   blocked_count 호감은 줬지만 후보 자격이 없어 담을 수 없는 사람

drop function if exists admin_curation_targets();

create function admin_curation_targets()
  returns table (
    id                uuid,
    name              text,
    hub_id            text,
    photo_url         text,
    receiving         boolean,
    pool_count        bigint,
    blocked_count     bigint,
    queued_count      bigint,
    delivered_count   bigint,
    oldest_like_hours integer,
    has_open_intro    boolean
  )
  language plpgsql stable security definer set search_path = public, pg_temp as $$
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
      left join eligible_profiles e on e.id = a.from_id
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
end $$;

comment on function admin_curation_targets() is
  '큐레이션 작업 대상. pool_count 는 지금 담을 수 있는 사람, blocked_count 는 '
  '자격이 없어 담을 수 없는 사람 — 적체의 원인을 함께 낸다.';

revoke all on function admin_curation_targets() from public, anon;
grant execute on function admin_curation_targets() to authenticated;
