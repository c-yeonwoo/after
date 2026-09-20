-- S35 — 운영자 회원 정지/해제와 감사 로그 회귀 테스트

begin;
select plan(4);

insert into auth.users (id, email, encrypted_password, email_confirmed_at, aud, role,
                        confirmation_token, recovery_token, email_change,
                        email_change_token_new, email_change_token_current,
                        phone_change, phone_change_token, reauthentication_token,
                        raw_app_meta_data, raw_user_meta_data)
values
  ('35000000-0000-0000-0000-000000000001','admin35@t.co','x',now(),'authenticated','authenticated','','','','','','','','','{}'::jsonb,'{}'::jsonb),
  ('35000000-0000-0000-0000-000000000002','member35@t.co','x',now(),'authenticated','authenticated','','','','','','','','','{}'::jsonb,'{}'::jsonb);

insert into profiles
  (id, gender, hub_id, company_email, email_verified_at, name, onboarding_step,
   terms_agreed_at, privacy_agreed_at, role)
values
  ('35000000-0000-0000-0000-000000000001','male','yeouido','admin35@t.co',now(),'운영35',7,now(),now(),'admin'),
  ('35000000-0000-0000-0000-000000000002','male','yeouido','member35@t.co',now(),'회원35',7,now(),now(),'member');

set local role authenticated;
set local request.jwt.claims =
  '{"sub":"35000000-0000-0000-0000-000000000001","role":"authenticated"}';

select lives_ok(
  $$ select admin_set_account_state(
       '35000000-0000-0000-0000-000000000002', 'banned', '회귀 테스트') $$,
  'T1 운영자는 회원을 정지할 수 있다'
);

reset role;
select is(
  (select account_state::text from profiles
    where id = '35000000-0000-0000-0000-000000000002'),
  'banned',
  'T2 회원 상태가 정지로 바뀐다'
);
select is(
  (select actor_id from admin_actions
    where target_user = '35000000-0000-0000-0000-000000000002'
    order by created_at desc limit 1),
  '35000000-0000-0000-0000-000000000001'::uuid,
  'T3 실제 actor_id 컬럼에 운영자가 기록된다'
);
select is(
  (select kind from admin_actions
    where target_user = '35000000-0000-0000-0000-000000000002'
    order by created_at desc limit 1),
  'ban',
  'T4 감사 로그에 정지 종류가 기록된다'
);

select * from finish();
rollback;

