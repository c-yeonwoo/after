-- 로컬 데모 계정 — `supabase db reset` 이 끝나면 자동으로 실행된다.
--
-- 리셋할 때마다 계정을 다시 만들 필요가 없게 고정해 둔다.
-- 진행 상태(소개·티켓·만남)는 여기서 만들지 않는다 — `bun run demo:state <상태>` 가 담당한다.
--
-- 로그인: 비밀번호 없음. /login 에서 이메일만 넣으면 개발환경에서 코드가 자동으로 채워진다.

-- 토큰 컬럼들은 nullable 이지만 **빈 문자열로 넣어야 한다.**
-- GoTrue 는 이 값들을 non-nullable 문자열로 스캔해서, NULL 이면 로그인 시
-- `Database error finding user` (500) 로 죽는다. 메타데이터 jsonb 도 마찬가지.
insert into auth.users (
  id, instance_id, aud, role, email, encrypted_password,
  created_at, updated_at, email_confirmed_at,
  confirmation_token, recovery_token, email_change, email_change_token_new,
  email_change_token_current, phone_change, phone_change_token, reauthentication_token,
  raw_app_meta_data, raw_user_meta_data
)
select
  u.id, '00000000-0000-0000-0000-000000000000',
  'authenticated', 'authenticated', u.email, '',
  now(), now(), now(),
  '', '', '', '', '', '', '', '',
  '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb
from (values
  ('11111111-1111-1111-1111-111111111111'::uuid, 'hana@demo.after'),
  ('22222222-2222-2222-2222-222222222222'::uuid, 'yeonwoo@demo.after'),
  ('33333333-3333-3333-3333-333333333333'::uuid, 'minsu@demo.after'),
  ('44444444-4444-4444-4444-444444444444'::uuid, 'jiho@demo.after')
) as u(id, email)
on conflict (id) do nothing;

insert into profiles (
  id, gender, hub_id, company_email, email_verified_at, onboarding_step,
  terms_agreed_at, privacy_agreed_at, agreed_policy_version,
  name, birth, job, mbti, smoking, drinking, religion, headline, intro,
  interests, match_tags, topics, details
) values
  ('11111111-1111-1111-1111-111111111111', 'female', 'gangnam', 'hana@demo.after', now(), 7,
   now(), now(), '2026-08-01',
   '하나', '1995-03-14', '브랜드 디자이너', 'ENFP', 'none', 'rare', 'none',
   '퇴근 후 러닝과 주말 등산 사이에서 평일 저녁을 채우는 사람.',
   E'요즘은 퇴근 후 러닝, 주말 등산, 오래된 영화 보기에 시간을 씁니다.\n\n약속을 잘 지키는 사람, 혼자 있는 시간도 필요한 사람과(와) 잘 맞았습니다.',
   array['퇴근 후 러닝','주말 등산','오래된 영화 보기'],
   array['약속을 잘 지키는 사람','혼자 있는 시간도 필요한 사람'],
   array['요즘 빠져 있는 것','최근에 바꾼 생각'],
   '{"퇴근 후 러닝":"선릉역에서 한강까지 5km 정도. 요즘은 페이스보다 그날 기분을 봅니다."}'::jsonb),

  ('22222222-2222-2222-2222-222222222222', 'male', 'gangnam', 'yeonwoo@demo.after', now(), 7,
   now(), now(), '2026-08-01',
   '연우', '1992-06-21', '백엔드 엔지니어', 'INTJ', 'none', 'social', 'none',
   '코드는 조용히, 저녁은 느긋하게 보내는 편입니다.',
   E'요즘은 홈카페, 클라이밍, 사진 현상에 시간을 씁니다.',
   array['홈카페','클라이밍','사진 현상'],
   array['말이 느긋한 사람','질문을 잘하는 사람'],
   array['요즘 빠져 있는 것','일 이야기'],
   '{"클라이밍":"주 2회 정도. 볼더링만 합니다."}'::jsonb),

  ('33333333-3333-3333-3333-333333333333', 'male', 'gangnam', 'minsu@demo.after', now(), 7,
   now(), now(), '2026-08-01',
   '민수', '1993-05-02', '프로덕트 매니저', 'ENTP', 'none', 'social', 'none',
   '주말엔 자전거로 한강을 답니다.',
   E'자전거와 커피를 좋아합니다. 평일 저녁엔 주로 산책을 합니다.',
   array['자전거','커피','산책'],
   array['유머 코드가 맞는 사람','새로운 걸 잘 시도하는 사람'],
   array['인생 최고의 여행','취향 자랑'],
   '{"자전거":"주말마다 한강 40km 정도 답니다."}'::jsonb),

  ('44444444-4444-4444-4444-444444444444', 'male', 'gangnam', 'jiho@demo.after', now(), 7,
   now(), now(), '2026-08-01',
   '지호', '1994-11-08', '데이터 분석가', 'ISTP', 'none', 'rare', 'none',
   '퇴근길에 서점 들르는 걸 좋아합니다.',
   E'책과 산책을 좋아합니다. 요즘은 통계 관련 책을 읽고 있어요.',
   array['서점 산책','통계 공부','재즈'],
   array['자기 일에 꾸준한 사람','감정 표현이 솔직한 사람'],
   array['최근에 바꾼 생각','쓸데없이 진지한 토론'],
   '{"서점 산책":"교보문고 강남점을 자주 갑니다."}'::jsonb)
on conflict (id) do nothing;

-- ─────────────────────── 운영자 (S16) ───────────────────────
--
-- 앱에는 운영자 승격 경로가 없다 — 첫 운영자는 반드시 SQL 로 심는다.
-- 호스팅에서도 같은 방식이다:
--   update profiles set role = 'admin' where company_email = '...';
--
-- 회원 프로필과 겸하지 않는다. 운영자가 자기 소개를 받으면 후보 풀과 지표가
-- 지저분해진다. 그래서 onboarding_step 을 7 로 두되 paused_at 을 채워
-- 후보 풀에서는 빠지게 한다.
-- instance_id 를 빼면 GoTrue 가 사용자를 못 찾아 OTP 요청이 422
-- otp_disabled 로 떨어진다(실제로 그렇게 막혔다). 위쪽 데모 계정들과 같은 값을 쓴다.
-- instance_id · created_at · updated_at 을 빼면 GoTrue 가 행을 읽다 실패한다.
-- 각각 422 otp_disabled, 500 "Database error finding user" 로 나타났다.
-- 위쪽 데모 계정들이 넣는 값과 같은 형태여야 한다.
insert into auth.users (instance_id, id, email, encrypted_password, email_confirmed_at, aud, role,
                        confirmation_token, recovery_token, email_change,
                        email_change_token_new, email_change_token_current,
                        phone_change, phone_change_token, reauthentication_token,
                        raw_app_meta_data, raw_user_meta_data,
                        created_at, updated_at)
values ('00000000-0000-0000-0000-000000000000'::uuid,
        '00000000-0000-0000-0000-0000000000ad'::uuid, 'admin@demo.after', 'x', now(),
        'authenticated', 'authenticated', '', '', '', '', '', '', '', '',
        '{}'::jsonb, '{}'::jsonb,
        now(), now())
on conflict (id) do nothing;

insert into profiles (
  id, gender, hub_id, company_email, email_verified_at, onboarding_step,
  terms_agreed_at, privacy_agreed_at, agreed_policy_version,
  name, birth, job, role, paused_at
) values
  ('00000000-0000-0000-0000-0000000000ad', 'male', 'gangnam', 'admin@demo.after', now(), 7,
   now(), now(), '2026-08-01', '운영자', '1990-01-01', '운영', 'admin', now())
on conflict (id) do update set role = 'admin';
