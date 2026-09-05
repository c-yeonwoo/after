-- S30 — 프로필 뷰는 직접 조회할 수 없다
--
-- 여기서 지켜야 하는 것.
--
--   1) **한 번의 조회로 여러 명이 나오지 않는다.** 뷰가 열려 있던 동안에는
--      `GET /rest/v1/public_profiles` 한 번이 권역 남성 전원이었다. 화면이
--      한 명씩 보여 주는 것은 UI 규약일 뿐 데이터 계층의 규약이 아니었다.
--   2) **id 를 모르면 못 읽는다.** 조회 함수는 전부 id 를 받는다.
--   3) **문을 좁히면서 사진이 죽지 않았다.** 스토리지 읽기 정책이 이 뷰를
--      재사용하고 있었다 — 여기가 이 마이그레이션에서 제일 잘 깨지는 자리다.
--
-- 3번에 실제로 한 번 걸렸다. 정책 안에서
-- `select id::text from visible_profile_ids()` 라고 쓰자 그 `id` 가 함수 결과가
-- 아니라 **바깥 storage.objects.id 로 상관 참조**됐다. 술어가 항상 거짓이 되어
-- **에러 없이** 사진이 5장에서 0장이 됐다. 그래서 이 파일의 마지막 검사가
-- "사진이 보인다" 를 명시적으로 붙든다.

begin;
select plan(9);

insert into auth.users (id, email, encrypted_password, email_confirmed_at, aud, role,
                        confirmation_token, recovery_token, email_change,
                        email_change_token_new, email_change_token_current,
                        phone_change, phone_change_token, reauthentication_token,
                        raw_app_meta_data, raw_user_meta_data)
values
  ('30000000-0000-0000-0000-0000000000f1','y30f1@t.co','x',now(),'authenticated','authenticated','','','','','','','','','{}'::jsonb,'{}'::jsonb),
  ('30000000-0000-0000-0000-0000000000a1','y30a1@t.co','x',now(),'authenticated','authenticated','','','','','','','','','{}'::jsonb,'{}'::jsonb),
  ('30000000-0000-0000-0000-0000000000a2','y30a2@t.co','x',now(),'authenticated','authenticated','','','','','','','','','{}'::jsonb,'{}'::jsonb);

insert into profiles (id, gender, hub_id, company_email, email_verified_at, name, birth, job,
                      onboarding_step, terms_agreed_at, privacy_agreed_at, role, photo_url, photo_state)
values
  ('30000000-0000-0000-0000-0000000000f1','female','gangnam','y30f1@t.co',now(),'삼십여','1994-01-01','디자이너',7,now(),now(),'member',null,'pending'),
  -- 같은 권역 남성 — 이 여성에게 후보로 보인다
  ('30000000-0000-0000-0000-0000000000a1','male',  'gangnam','y30a1@t.co',now(),'삼십남','1992-01-01','엔지니어',7,now(),now(),'member',
   '30000000-0000-0000-0000-0000000000a1/portrait.png','approved'),
  -- 다른 권역 남성 — 보이면 안 된다
  ('30000000-0000-0000-0000-0000000000a2','male',  'pangyo', 'y30a2@t.co',now(),'판교남','1991-01-01','변호사', 7,now(),now(),'member',null,'pending');

insert into storage.objects (bucket_id, name, owner_id)
values ('profile-photos', '30000000-0000-0000-0000-0000000000a1/portrait.png',
        '30000000-0000-0000-0000-0000000000a1');

-- ─────────────── 문이 닫혔는가 ───────────────

select ok(
  not has_table_privilege('authenticated', 'public_profiles', 'SELECT'),
  'T1 로그인 사용자는 뷰를 직접 조회할 권한이 없다'
);
select ok(
  not has_table_privilege('anon', 'public_profiles', 'SELECT'),
  'T2 비로그인도 마찬가지다'
);

set local role authenticated;
set local request.jwt.claims = '{"sub":"30000000-0000-0000-0000-0000000000f1"}';

select throws_ok(
  $$ select count(*) from public_profiles $$,
  '42501', null,
  'T3 뷰를 읽으려 하면 거부된다 (한 번에 전원이 나오던 경로)'
);

-- ─────────────── 열어 둔 길은 도는가 ───────────────

select is(
  (select name from get_public_profile('30000000-0000-0000-0000-0000000000a1')),
  '삼십남',
  'T4 볼 수 있는 사람은 id 로 읽힌다'
);
select is_empty(
  $$ select name from get_public_profile('30000000-0000-0000-0000-0000000000a2') $$,
  'T5 볼 수 없는 사람은 id 를 알아도 안 나온다'
);
select is(
  (select string_agg(name, ',') from get_public_profiles(
     array['30000000-0000-0000-0000-0000000000a1',
           '30000000-0000-0000-0000-0000000000a2']::uuid[])),
  '삼십남',
  'T6 여러 건도 볼 수 있는 사람만 걸러 나온다'
);

/*
  상한이 없으면 방금 닫은 문에 창을 하나 내는 셈이다 — id 를 긁어모을 수단이
  생기면 "한 번에 전원" 이 "여러 번에 전원" 이 될 뿐이다.
*/
select throws_ok(
  $$ select count(*) from get_public_profiles(
       (select array_agg(gen_random_uuid()) from generate_series(1, 101))) $$,
  '22023', null,
  'T7 한 번에 100명을 넘기면 거절한다'
);

-- ─────────────── 사진이 죽지 않았는가 ───────────────

/*
  **이 검사가 이 파일의 핵심이다.** 뷰를 잠그면 스토리지 읽기 정책이 함께
  죽는다(정책 표현식은 호출자 권한으로 평가된다). 그걸 secdef 함수로 우회하면서
  상관 참조 실수를 하면 **에러 없이 조용히 0장**이 된다. 조용한 실패라 사람 눈에
  안 걸린다 — 그래서 여기 붙든다.
*/
select is(
  (select count(*)::int from storage.objects
    where name = '30000000-0000-0000-0000-0000000000a1/portrait.png'),
  1,
  'T8 볼 수 있는 사람의 사진은 여전히 보인다'
);

set local request.jwt.claims = '{"sub":"30000000-0000-0000-0000-0000000000a2"}';
select is(
  (select count(*)::int from storage.objects
    where name = '30000000-0000-0000-0000-0000000000a1/portrait.png'),
  0,
  'T9 볼 수 없는 사람의 사진은 여전히 안 보인다'
);

select * from finish();
rollback;
