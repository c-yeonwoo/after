-- S30 — 프로필 뷰를 직접 조회하지 못하게 한다
--
-- ── 무엇이 문제였나 ──
--
-- `public_profiles` 는 노출해도 되는 **컬럼**을 고르는 일을 아주 잘 한다
-- (company_email 없음, birth 는 age 로). 그런데 노출해도 되는 **행**을 고르는
-- 일은 화면이 하고 있었다 — `next_candidate()` 가 한 명씩 주는 것은 UI 규약일
-- 뿐이고, 뷰 자체에는 `grant select ... to authenticated` 가 붙어 있었다.
--
-- 그래서 여성 세션은 `GET /rest/v1/public_profiles` **한 번**으로 자기 권역의
-- 자격 있는 남성 **전원**을 받는다 — 이름·나이·직업·사진 경로·MBTI·흡연·음주·
-- 종교·한줄·소개글·관심사·태그·인터뷰 답변(details)까지. 그리고 s11 의
-- `photos_select_visible` 이 이 뷰를 그대로 재사용하므로 **사진도 전량 서명
-- URL 발급이 된다.**
--
-- 이 제품은 회사 메일로 신원을 세운다. **"우리 회사 사람이 이 앱에 있더라"가
-- 한 방에 가능해지는 것**이 여기서 가장 아픈 사고 유형이다. 지인 소개의 신뢰를
-- 파는데 그 신뢰가 한 번의 GET 으로 무너진다.
--
-- ── 어떻게 고치는가 ──
--
-- 뷰를 없애지 않는다. 컬럼 선택과 가시성 판정이 한 곳에 모여 있는 것은 이
-- 스키마의 **좋은 성질**이고, 그걸 화면마다 복제하면 반드시 어긋난다.
-- 대신 **뷰에 닿는 문을 좁힌다** — 직접 SELECT 를 회수하고, 이미 있던 패턴
-- (secdef 함수가 뷰를 대신 읽어 준다)을 두 자리에 더 적용한다.
--
--   전  authenticated → public_profiles (전량)
--   후  authenticated → next_candidate() (1건) · get_public_profile(id) (1건)
--                     · get_public_profiles(ids) (아는 id 만)
--
-- id 를 아는 사람만 읽을 수 있으므로 열거가 불가능해진다. 여성이 남성 id 를
-- 얻는 경로는 `next_candidate()` 뿐이고 그건 한 번에 한 명이다.

-- ─────────── 가시성 판정을 함수로 꺼낸다 ───────────

/*
  스토리지 정책이 뷰를 직접 읽고 있었다. SELECT 를 회수하면 **정책도 함께
  죽는다**(로컬에서 확인: `permission denied for view public_profiles`).
  RLS 정책 표현식은 호출자의 권한으로 평가되기 때문이다.

  집합을 그대로 돌려주는 모양을 유지한다. `can_view(uuid)` 같은 스칼라로 바꾸면
  정책에서 폴더 이름을 uuid 로 캐스팅해야 하는데, uuid 가 아닌 폴더가 하나라도
  섞이면 정책 전체가 예외로 죽는다 — 조회가 막히는 것보다 나쁘다.
*/
/*
  ⚠️ **출력 컬럼에 이름을 준다.** `returns setof uuid` 로 두면 결과 컬럼 이름이
  함수 이름(`visible_profile_ids`)이 되고, 정책에서 무심코
  `select id::text from visible_profile_ids()` 라고 쓰면 그 `id` 가 함수 결과가
  아니라 **바깥 storage.objects.id 로 상관 참조된다.** 술어가
  `objects.id = 프로필 id` 가 되어 항상 거짓 — 에러 없이 조용히 0건이 된다.
  실제로 이 마이그레이션을 쓰면서 한 번 걸렸다(사진이 5장에서 0장이 됐다).
  이름을 주고 호출부에서 별칭으로 한정하면 두 겹으로 막힌다.
*/
create or replace function visible_profile_ids() returns table (id uuid)
  language sql stable security definer set search_path = public, pg_temp as $$
  select pp.id from public_profiles pp
$$;

revoke all on function visible_profile_ids() from public, anon;
grant execute on function visible_profile_ids() to authenticated;

comment on function visible_profile_ids() is
  '내가 프로필을 볼 수 있는 사람들의 id. 규칙은 public_profiles 가 단독으로 갖는다.';

drop policy if exists photos_select_visible on storage.objects;

-- 읽기: 본인 + public_profiles 로 볼 수 있는 사람.
-- 판단은 여전히 뷰 하나가 소유한다 — 여기서는 그 결과를 쓰기만 한다.
create policy photos_select_visible on storage.objects
  for select to authenticated using (
    bucket_id = 'profile-photos'
    and (storage.foldername(name))[1] in (
      select v.id::text from visible_profile_ids() v
    )
  );

-- ─────────── 화면이 쓰던 두 조회를 함수로 옮긴다 ───────────

/*
  `src/lib/api.ts` 의 getProfile / getProfiles 가 뷰를 직접 읽고 있었다.
  둘 다 **항상 id 로 좁혀서** 읽으므로 함수로 옮기는 데 잃는 것이 없다.
  잃지 않으면서 얻는 것은 "id 를 모르면 아무것도 못 읽는다" 이다.
*/
/*
  `returns public_profiles`(스칼라 복합형)가 아니라 **setof** 다. 스칼라로 두면
  볼 수 없는 사람을 물었을 때 0행이 아니라 **전 컬럼이 NULL 인 한 행**이 나온다.
  화면에서는 `data ?? null` 이 그 객체를 통과시켜 "이름 없음" 카드가 그려지고,
  SQL 에서는 `is_empty` 가 실패한다. 없는 것은 없는 것으로 나와야 한다.
*/
create or replace function get_public_profile(p_id uuid) returns setof public_profiles
  language sql stable security definer set search_path = public, pg_temp as $$
  select pp.* from public_profiles pp where pp.id = p_id
$$;

revoke all on function get_public_profile(uuid) from public, anon;
grant execute on function get_public_profile(uuid) to authenticated;

comment on function get_public_profile(uuid) is
  '한 사람의 공개 프로필. 볼 수 없는 사람이면 아무것도 돌려주지 않는다.';

/*
  목록 화면의 N+1 을 없애려고 여러 명을 한 번에 받는 자리다(진단 PERF-3).
  상한을 둔다 — 이 함수의 쓰임은 화면 하나에 보이는 사람 수만큼이고, 그보다
  큰 요청은 조회가 아니라 **수집**이다. 상한이 없으면 방금 닫은 문에 창을
  하나 내는 셈이 된다.
*/
create or replace function get_public_profiles(p_ids uuid[]) returns setof public_profiles
  language plpgsql stable security definer set search_path = public, pg_temp as $$
begin
  if coalesce(array_length(p_ids, 1), 0) > 100 then
    raise exception 'too many ids' using errcode = '22023';
  end if;
  return query select pp.* from public_profiles pp where pp.id = any(p_ids);
end $$;

revoke all on function get_public_profiles(uuid[]) from public, anon;
grant execute on function get_public_profiles(uuid[]) to authenticated;

comment on function get_public_profiles(uuid[]) is
  '아는 id 들의 공개 프로필. 한 번에 100명까지 — 그 이상은 조회가 아니라 수집이다.';

-- ─────────── 문을 닫는다 ───────────

/*
  이 한 줄이 이 마이그레이션의 요점이다. 위의 함수들은 전부 이 줄을 감당하기
  위한 것이다.

  service_role 은 건드리지 않는다(BYPASSRLS 라 애초에 이 grant 와 무관하다).
*/
revoke select on public_profiles from authenticated, anon, public;

comment on view public_profiles is
  '상대에게 노출해도 되는 컬럼만. **직접 조회할 수 없다** — next_candidate() · '
  'get_public_profile() · get_public_profiles() 를 거친다. 뷰를 열어 두면 '
  '권역 남성 전원이 한 번의 GET 으로 나간다.';
