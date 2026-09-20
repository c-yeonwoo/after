-- S36 — 사람 검토 안전 정책과 AI 계측 표면

begin;
select plan(6);

insert into auth.users (id, email, encrypted_password, email_confirmed_at, aud, role,
                        confirmation_token, recovery_token, email_change,
                        email_change_token_new, email_change_token_current,
                        phone_change, phone_change_token, reauthentication_token,
                        raw_app_meta_data, raw_user_meta_data)
values
  ('36000000-0000-0000-0000-000000000001','admin36@t.co','x',now(),'authenticated','authenticated','','','','','','','','','{}'::jsonb,'{}'::jsonb),
  ('36000000-0000-0000-0000-000000000002','member36@t.co','x',now(),'authenticated','authenticated','','','','','','','','','{}'::jsonb,'{}'::jsonb);

insert into profiles
  (id, gender, hub_id, company_email, email_verified_at, name, onboarding_step,
   terms_agreed_at, privacy_agreed_at, role)
values
  ('36000000-0000-0000-0000-000000000001','male','gangnam','admin36@t.co',now(),'운영36',7,now(),now(),'admin'),
  ('36000000-0000-0000-0000-000000000002','male','gangnam','member36@t.co',now(),'회원36',7,now(),now(),'member');

select ok(
  not has_table_privilege('authenticated', 'ai_runs', 'SELECT'),
  'T1 로그인 사용자도 AI 운영 계측 원장을 읽을 수 없다'
);

select ok(
  not has_table_privilege('authenticated', 'ai_runs', 'INSERT'),
  'T2 클라이언트가 AI 성공률·비용 계측을 조작할 수 없다'
);

select ok(
  has_table_privilege('service_role', 'ai_runs', 'SELECT,INSERT'),
  'T3 Edge Function service_role 만 AI 계측을 읽고 쓴다'
);

set local role authenticated;
set local request.jwt.claims =
  '{"sub":"36000000-0000-0000-0000-000000000002","role":"authenticated"}';
select throws_ok(
  $$ select admin_operational_health() $$,
  '42501',
  null,
  'T4 일반 회원은 운영 품질 지표를 읽을 수 없다'
);
reset role;

insert into ai_runs
  (user_id, feature, prompt_version, model, status, latency_ms, input_tokens, output_tokens)
values
  ('36000000-0000-0000-0000-000000000002', 'profile_copy', 'profile-copy-v2',
   'model-test', 'success', 900, 100, 50);

set local role authenticated;
set local request.jwt.claims =
  '{"sub":"36000000-0000-0000-0000-000000000001","role":"authenticated"}';
select lives_ok(
  $$ select admin_operational_health() $$,
  'T5 운영자는 안전·일정·알림·AI 품질 지표를 읽을 수 있다'
);
select is(
  (admin_operational_health() #>> '{ai,runs_24h}')::integer,
  1,
  'T6 대시보드의 AI 24시간 호출 수가 운영 원장과 일치한다'
);
reset role;

select * from finish();
rollback;

