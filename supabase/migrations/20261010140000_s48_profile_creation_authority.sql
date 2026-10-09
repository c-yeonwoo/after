-- S48 — 프로필은 서버가 만든다
--
-- 2026-10-10 제품 진단에서 운영 DB 로 확인한 두 건을 한 번에 닫는다. 뿌리가 같다 —
-- **가입의 마지막 결정을 클라이언트가 하고 있었다.**
--
-- ① 누구나 스스로를 운영자로 만들 수 있었다.
--    s1_rls 가 `grant insert on profiles to authenticated` 를 컬럼 제한 없이 줬고,
--    정책은 `id = auth.uid()` 하나였다. 그래서 로그인 세션 하나(개인 메일 OTP 로도
--    얻는다)로 role='admin' · email_verified_at · company_email · photo_state 를 직접
--    넣은 프로필을 만들 수 있었다. is_admin() 은 profiles.role 만 본다.
--    s2 가 "클라이언트가 인증됐다고 자기 선언하게 두지 않는다" 고 막은 바로 그
--    자기 선언이, UPDATE 가 아니라 INSERT 쪽으로 열려 있었다. UPDATE 는 컬럼 18개로
--    좁혀져 있었으므로 INSERT 만 빠진 것이다.
--
-- ② 2026-09-06 이후 가입자는 아무도 매칭 대상이 될 수 없었다.
--    s28b 가 "트리거 함수도 함께 잠근다" 목록에 sync_email_verified() 를 넣었는데,
--    이건 트리거가 아니라 가입 3단계에서 클라이언트가 부르는 RPC 다. 다시 준 곳이
--    없어서 가입 화면은 403 을 "[object Object]" 로 보여 주고 멈췄고, 로그인 경로는
--    실패를 삼켰다. email_verified_at 이 비면 is_eligible_candidate 를 영영 못 넘는다.
--    e2e 시드는 이 값을 직접 쓰고 pgTAP 은 이 함수를 로그인 사용자로 부르지 않아서
--    아무 장치도 잡지 못했다.
--
-- 권한만 되돌리면 ② 는 풀리지만 ③ 이 드러난다.
-- ③ 회사 메일 판정이 화면(brand.ts)에만 있었다. 서버는 개인 메일 OTP 로 받은
--    email_confirmed_at 도 "회사 인증" 으로 옮겨 적는다.
--
-- 그래서 프로필 생성을 create_my_profile() 하나로 옮긴다. 회사 메일과 인증 시각은
-- 클라이언트가 보낸 값이 아니라 auth.users 의 실제 이메일·확인 시각을 쓰고,
-- 개인 도메인은 서버가 거절한다. role 은 받지 않는다.
--
-- 같은 진단에서 확인한 ④ 도 함께 닫는다.
-- ④ 남성이 결제 전에 큐 카드의 운영자 메모(note)와 상대 id 를 API 로 읽을 수 있었다.
--    intro_queue 에 테이블 단위 select 가 있고, 전송된 미열람 카드를 남성 본인에게
--    보여 주는 정책이 있었다. 화면은 이 테이블을 직접 읽지 않는다 — 큐를 만지는
--    함수 15개가 전부 SECURITY DEFINER 다. 직접 읽는 문을 닫는다.

-- ═══════════════════ 회사 메일 판정 ═══════════════════

/*
  화면 쪽 목록(src/lib/brand.ts PERSONAL_EMAIL_DOMAINS)과 같은 11개다. 화면 목록은
  입력 안내용으로 남고, 거절의 권위는 여기에 있다. 하나를 고치면 둘 다 고친다 —
  s48_profile_authority.sql 이 이 함수의 판정을 고정한다.
*/
create or replace function is_company_email(p_email text) returns boolean
  language sql immutable set search_path = pg_temp as $$
  select coalesce(
    nullif(split_part(lower(trim(p_email)), '@', 2), '') is not null
      and position('.' in split_part(lower(trim(p_email)), '@', 2)) > 0
      and split_part(lower(trim(p_email)), '@', 2) not in (
        'gmail.com', 'naver.com', 'daum.net', 'hanmail.net', 'kakao.com', 'nate.com',
        'outlook.com', 'hotmail.com', 'icloud.com', 'yahoo.com', 'protonmail.com'
      ),
    false)
$$;

comment on function is_company_email is
  '개인 메일 도메인이 아닌지 판정한다. 화면 목록(brand.ts)은 안내용이고 거절의 권위는 이 함수다.';

revoke all on function is_company_email(text) from public, anon, authenticated;

-- ═══════════════════ ① 직접 INSERT 를 닫는다 ═══════════════════

revoke insert on profiles from authenticated, anon;
drop policy if exists profiles_insert_self on profiles;

-- ═══════════════════ 프로필 생성 ═══════════════════

/*
  gender·hub_id 만 받는다. 나머지 서버 전용 값은 전부 여기서 정한다.

  · company_email = auth.users.email — 클라이언트가 다른 주소를 적어 넣지 못한다.
  · email_verified_at = auth.users.email_confirmed_at — OTP 성공 시 Supabase 가 채운 값.
  · role / account_state / photo_state 는 컬럼 기본값(member / active / pending).

  이미 프로필이 있으면 그 행을 돌려준다. 재인증·재시도에서 같은 호출이 다시 와도
  성별·권역은 바뀌지 않는다 — 둘은 가입 후 변경 불가다. 다만 ② 의 기간에 프로필만
  생기고 인증 시각이 빈 계정이면, sync 와 같은 조건으로 그 칸을 채운다.
*/
create or replace function create_my_profile(p_gender gender, p_hub_id text) returns profiles
  language plpgsql security definer set search_path = public, auth, pg_temp as $$
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
       and is_company_email(v_email)
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
  if not is_company_email(v_email) then
    raise exception 'personal email not allowed' using errcode = '22023';
  end if;
  if nullif(trim(p_hub_id), '') is null then
    raise exception 'hub required' using errcode = '22023';
  end if;

  insert into profiles (id, gender, hub_id, company_email, email_verified_at)
  values (v_uid, p_gender, p_hub_id, v_email, v_confirmed)
  returning * into v_profile;

  return v_profile;
end $$;

comment on function create_my_profile is
  '가입 3단계의 유일한 프로필 생성 경로. 회사 메일·인증 시각은 auth.users 에서 읽고, 개인 도메인은 거절한다.';

revoke all on function create_my_profile(gender, text) from public, anon;
grant execute on function create_my_profile(gender, text) to authenticated;

-- ═══════════════════ ② 인증 동기화 ═══════════════════

/*
  로그인 경로(signInExisting)가 부른다. 인증 시각을 옮겨 적는 조건에 ③ 을 더한다 —
  확인된 주소가 회사 도메인이고, 프로필에 적힌 회사 메일과 같을 때만.
*/
create or replace function sync_email_verified() returns profiles
  language plpgsql security definer set search_path = public, auth, pg_temp as $$
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
  if not is_company_email(v_email) then
    raise exception 'personal email not allowed' using errcode = '22023';
  end if;

  update profiles set email_verified_at = coalesce(email_verified_at, v_confirmed)
   where id = auth.uid()
     and lower(company_email) = v_email
  returning * into v_profile;

  return v_profile;
end $$;

revoke all on function sync_email_verified() from public, anon;
grant execute on function sync_email_verified() to authenticated;

-- ─────────── 막혀 있던 동안의 가입자 ───────────

/*
  s28b 이후 3단계에서 멈춘 계정. sync 가 했어야 할 일을 같은 조건으로 한 번 한다.
  조건에 맞지 않는(개인 도메인 · 주소 불일치) 계정은 건드리지 않는다.
*/
update profiles p
   set email_verified_at = u.email_confirmed_at
  from auth.users u
 where u.id = p.id
   and p.email_verified_at is null
   and u.email_confirmed_at is not null
   and lower(u.email) = lower(p.company_email)
   and is_company_email(u.email);

-- ═══════════════════ ④ 큐는 함수로만 읽는다 ═══════════════════

revoke select on intro_queue from authenticated, anon;
drop policy if exists intro_queue_own_delivered on intro_queue;
drop policy if exists intro_queue_admin on intro_queue;
