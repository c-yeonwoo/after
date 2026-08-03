-- S2 — 이메일 인증 완료를 실제로 기록한다
--
-- ★ 실제 브라우저로 온보딩을 끝까지 걸어보다가 잡힌 버그.
--
-- profiles.email_verified_at 은 서버 전용 컬럼이라 클라이언트에 UPDATE 권한이 없다
-- (의도된 설계). 그런데 그 값을 실제로 채우는 경로가 어디에도 없었다 — OTP 인증
-- (verifyEmailCode)은 세션만 만들고 이 컬럼은 그대로 null 로 남는다. 그 결과
-- 온보딩을 7단계까지 전부 마쳐도 eligible_profiles / profiles_select_counterpart /
-- affinities_insert_female_only 의 email_verified_at is not null 조건을 영원히
-- 통과하지 못해 아무도 매칭되지 않는다.
--
-- 고치는 방법: 클라이언트가 "인증됐다"고 자기 선언하게 두지 않는다(그건 위조 가능).
-- 대신 Supabase Auth 자신의 auth.users.email_confirmed_at — OTP 검증에 실제로
--성공했을 때만 Supabase 가 서버 측에서 채우는 값 — 에서 읽어온다.

create or replace function sync_email_verified() returns profiles
  language plpgsql security definer set search_path = public, auth, pg_temp as $$
declare
  v_confirmed timestamptz;
  v_profile   profiles;
begin
  select email_confirmed_at into v_confirmed from auth.users where id = auth.uid();
  if v_confirmed is null then
    raise exception 'email not confirmed' using errcode = '42501';
  end if;

  update profiles set email_verified_at = coalesce(email_verified_at, v_confirmed)
   where id = auth.uid()
  returning * into v_profile;

  return v_profile;
end $$;

comment on function sync_email_verified is
  'auth.users.email_confirmed_at (Supabase Auth 가 OTP 검증 성공 시에만 서버에서 채움) 에서
   profiles.email_verified_at 을 끌어온다. 클라이언트가 스스로 인증됐다고 선언하지 못하게 한다.';

grant execute on function sync_email_verified() to authenticated;
