-- S55 — 앱 알림: 기기 토큰과 화면 속 알림 목록

begin;
select plan(10);

insert into auth.users (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at, created_at, updated_at)
values
  ('55000000-0000-0000-0000-0000000000a1','00000000-0000-0000-0000-000000000000','authenticated','authenticated','m55@corp.example','',now(),now(),now()),
  ('55000000-0000-0000-0000-0000000000f1','00000000-0000-0000-0000-000000000000','authenticated','authenticated','f55@corp.example','',now(),now(),now());

insert into profiles (id, gender, hub_id, company_email, email_verified_at, name, onboarding_step, role)
values
  ('55000000-0000-0000-0000-0000000000a1','male','gangnam','m55@corp.example',now(),'남오오',7,'member'),
  ('55000000-0000-0000-0000-0000000000f1','female','gangnam','f55@corp.example',now(),'여오오',7,'member');

insert into notifications (user_id, kind, payload, created_at)
values
  ('55000000-0000-0000-0000-0000000000f1','meeting_requested',
   '{"counterpart_id":"55000000-0000-0000-0000-0000000000a1"}', now() - interval '1 minute'),
  ('55000000-0000-0000-0000-0000000000f1','candidates_refilled','{}', now()),
  ('55000000-0000-0000-0000-0000000000f1','notification_email_verify','{"verification_code":"123456"}', now());

set local role authenticated;
set local request.jwt.claims = '{"sub":"55000000-0000-0000-0000-0000000000f1","role":"authenticated"}';

select is((select count(*)::int from my_notifications()), 2,
  'T1 내 알림 목록이 보인다 (메일 인증 코드 알림은 빼고)');
select is((select counterpart_name from my_notifications() where kind = 'meeting_requested'),
  '남오오', 'T2 알림에 상대 이름이 붙는다');
select is(unread_notification_count(), 2, 'T3 안 읽은 알림 수');
select mark_notifications_read();
select is(unread_notification_count(), 0, 'T4 열어 보면 모두 읽음이 된다');
select throws_ok($$ select * from notifications $$, '42501', null,
  'T5 알림 행은 직접 읽을 수 없다 (함수로만)');

set local request.jwt.claims = '{"sub":"55000000-0000-0000-0000-0000000000a1","role":"authenticated"}';
select is((select count(*)::int from my_notifications()), 0, 'T6 남의 알림은 보이지 않는다');

-- 기기 토큰
select register_device_token('device-token-0000000000000000000000000001');
select throws_ok($$ select * from device_tokens $$, '42501', null,
  'T7 기기 토큰은 직접 읽을 수 없다');

-- 같은 기기를 다른 계정이 쓰면 토큰이 그 계정으로 옮겨 간다
set local request.jwt.claims = '{"sub":"55000000-0000-0000-0000-0000000000f1","role":"authenticated"}';
select register_device_token('device-token-0000000000000000000000000001');
reset role;
select is((select user_id from device_tokens where token = 'device-token-0000000000000000000000000001'),
  '55000000-0000-0000-0000-0000000000f1'::uuid, 'T8 기기를 넘겨받은 계정으로 토큰이 옮겨 간다');

set local role authenticated;
set local request.jwt.claims = '{"sub":"55000000-0000-0000-0000-0000000000a1","role":"authenticated"}';
select unregister_device_token('device-token-0000000000000000000000000001');
reset role;
select is((select count(*)::int from device_tokens where token = 'device-token-0000000000000000000000000001'),
  1, 'T9 남의 토큰은 지우지 못한다');

set local role authenticated;
set local request.jwt.claims = '{"sub":"55000000-0000-0000-0000-0000000000f1","role":"authenticated"}';
select unregister_device_token('device-token-0000000000000000000000000001');
reset role;
select is((select count(*)::int from device_tokens where token = 'device-token-0000000000000000000000000001'),
  0, 'T10 로그아웃하면 내 토큰을 지운다');

select * from finish();
rollback;
