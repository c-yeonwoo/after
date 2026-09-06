-- S31 — 취향 문답
--
-- 여기서 지켜야 하는 것.
--
--   1) **상대의 답은 어떤 경로로도 안 보인다.** 서로의 취향을 대조하는 일은
--      큐레이터의 몫이다. 사용자에게 열면 "나랑 몇 개 맞나" 를 보려고 프로필을
--      뒤지는 화면이 되고, 그건 이 제품이 피하려는 바로 그 행동이다.
--   2) **한쪽만 답한 문항은 세지 않는다.** 세면 답을 적게 한 사람이 불리해지고,
--      그건 성실함을 매칭 점수로 바꾸는 일이다. 우리가 재려는 것은 취향이지
--      성실함이 아니다.
--   3) **분모가 함께 나온다.** 3중 3과 9중 7은 다른 신호다.

begin;
select plan(10);

insert into auth.users (id, email, encrypted_password, email_confirmed_at, aud, role,
                        confirmation_token, recovery_token, email_change,
                        email_change_token_new, email_change_token_current,
                        phone_change, phone_change_token, reauthentication_token,
                        raw_app_meta_data, raw_user_meta_data)
values
  ('31000000-0000-0000-0000-0000000000a1','z31a1@t.co','x',now(),'authenticated','authenticated','','','','','','','','','{}'::jsonb,'{}'::jsonb),
  ('31000000-0000-0000-0000-0000000000f1','z31f1@t.co','x',now(),'authenticated','authenticated','','','','','','','','','{}'::jsonb,'{}'::jsonb),
  ('31000000-0000-0000-0000-0000000000ad','z31ad@t.co','x',now(),'authenticated','authenticated','','','','','','','','','{}'::jsonb,'{}'::jsonb);

insert into profiles (id, gender, hub_id, company_email, email_verified_at, name, birth, job,
                      onboarding_step, terms_agreed_at, privacy_agreed_at, role)
values
  ('31000000-0000-0000-0000-0000000000a1','male',  'gangnam','z31a1@t.co',now(),'문답남','1992-01-01','엔지니어',7,now(),now(),'member'),
  ('31000000-0000-0000-0000-0000000000f1','female','gangnam','z31f1@t.co',now(),'문답녀','1994-01-01','디자이너',7,now(),now(),'member'),
  ('31000000-0000-0000-0000-0000000000ad','male',  'gangnam','z31ad@t.co',now(),'운영자','1990-01-01','운영',   7,now(),now(),'admin');

-- 남성 1·2·3·5 / 여성 1·2·3·7 → 둘 다 답한 것은 1·2·3, 그중 1·2 가 일치
insert into preference_answers (user_id, question_id, choice) values
  ('31000000-0000-0000-0000-0000000000a1',1,0),
  ('31000000-0000-0000-0000-0000000000a1',2,1),
  ('31000000-0000-0000-0000-0000000000a1',3,0),
  ('31000000-0000-0000-0000-0000000000a1',5,1),
  ('31000000-0000-0000-0000-0000000000f1',1,0),
  ('31000000-0000-0000-0000-0000000000f1',2,1),
  ('31000000-0000-0000-0000-0000000000f1',3,1),
  ('31000000-0000-0000-0000-0000000000f1',7,0);

-- ─────────── 셈이 맞는가 ───────────

select is(
  (select answered_both from preference_agreement(
     '31000000-0000-0000-0000-0000000000a1','31000000-0000-0000-0000-0000000000f1')),
  3, 'T1 한쪽만 답한 문항(5·7)은 분모에서 빠진다'
);
select is(
  (select agree from preference_agreement(
     '31000000-0000-0000-0000-0000000000a1','31000000-0000-0000-0000-0000000000f1')),
  2, 'T2 둘 다 답한 3문항 중 2개 일치'
);
select is(
  (select agree from preference_agreement(
     '31000000-0000-0000-0000-0000000000f1','31000000-0000-0000-0000-0000000000a1')),
  2, 'T3 방향을 바꿔도 같다'
);

-- ─────────── 내 답만 보인다 ───────────

set local role authenticated;
set local request.jwt.claims = '{"sub":"31000000-0000-0000-0000-0000000000a1"}';

select is(
  (select count(*)::int from preference_answers),
  4, 'T4 내 답 4개가 보인다'
);
select is_empty(
  $$ select choice from preference_answers
      where user_id = '31000000-0000-0000-0000-0000000000f1' $$,
  'T5 **상대의 답은 한 줄도 안 보인다**'
);

/*
  겹침을 알아내는 함수 자체를 막아 둔다. 열려 있으면 위 정책이 막아 둔 것을
  우회하는 통로가 된다 — 답을 못 읽어도 "몇 개 맞는지" 를 알면 대부분 복원된다.
*/
select ok(
  not has_function_privilege('authenticated',
    'preference_agreement(uuid,uuid)'::regprocedure, 'EXECUTE'),
  'T6 겹침 계산 함수는 사용자에게 열려 있지 않다'
);

-- ─────────── 쓰기 ───────────

select lives_ok(
  $$ insert into preference_answers (user_id, question_id, choice)
     values ('31000000-0000-0000-0000-0000000000a1', 9, 1) $$,
  'T7 내 답은 넣을 수 있다'
);
select throws_ok(
  $$ insert into preference_answers (user_id, question_id, choice)
     values ('31000000-0000-0000-0000-0000000000f1', 9, 1) $$,
  '42501', null,
  'T8 남의 이름으로는 못 넣는다'
);
select lives_ok(
  $$ update preference_answers set choice = 0
      where user_id = '31000000-0000-0000-0000-0000000000a1' and question_id = 9 $$,
  'T9 마음이 바뀌면 고칠 수 있다'
);

-- ─────────── 큐레이터 ───────────

set local request.jwt.claims = '{"sub":"31000000-0000-0000-0000-0000000000ad"}';
select is(
  (select count(*)::int from admin_preference_compare(
     '31000000-0000-0000-0000-0000000000a1','31000000-0000-0000-0000-0000000000f1')),
  6, 'T10 대조표에는 한쪽만 답한 문항도 나온다 (1·2·3·5·7·9)'
);

select * from finish();
rollback;
