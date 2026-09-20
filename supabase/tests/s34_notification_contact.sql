-- S34 — 개인 알림 메일 확인 + 빠진 사건 알림

begin;
select plan(15);

insert into auth.users (id, instance_id, aud, role, email, encrypted_password, created_at, updated_at)
values
  ('34000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000000',
   'authenticated', 'authenticated', 'female34@corp.example', '', now(), now()),
  ('34000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-000000000000',
   'authenticated', 'authenticated', 'male34@corp.example', '', now(), now());

insert into profiles
  (id, gender, hub_id, company_email, email_verified_at, onboarding_step, name,
   terms_agreed_at, privacy_agreed_at, agreed_policy_version)
values
  ('34000000-0000-0000-0000-000000000001', 'female', 'pangyo',
   'female34@corp.example', now(), 7, '여성34', now(), now(), '2026-08-01'),
  ('34000000-0000-0000-0000-000000000002', 'male', 'pangyo',
   'male34@corp.example', now(), 6, '남성34', now(), now(), '2026-08-01');

select has_column('profiles', 'notification_email', 'T1 개인 알림 메일 컬럼이 있다');
select has_column('profiles', 'notification_email_verified_at', 'T2 확인 시각 컬럼이 있다');
select ok(
  not has_column_privilege('authenticated', 'profiles', 'notification_email', 'update'),
  'T3 클라이언트는 확인된 주소를 직접 쓸 수 없다'
);
select ok(
  has_function_privilege('authenticated', 'request_notification_email(text)', 'execute'),
  'T4 로그인 사용자는 확인 코드를 요청할 수 있다'
);
select ok(
  has_function_privilege('authenticated', 'verify_notification_email(text)', 'execute'),
  'T5 로그인 사용자는 확인 코드를 검증할 수 있다'
);

set local role authenticated;
set local request.jwt.claims =
  '{"sub":"34000000-0000-0000-0000-000000000001","role":"authenticated"}';

select is(
  request_notification_email('Personal34@Example.com'),
  'personal34@example.com',
  'T6 알림 주소를 정규화하고 코드 요청을 받는다'
);

select throws_ok(
  'select * from notification_email_verifications',
  '42501', null,
  'T7 로그인 사용자는 코드 해시 표를 읽을 수 없다'
);

reset role;

select is(
  (select payload->>'email' from notifications
    where user_id = '34000000-0000-0000-0000-000000000001'
      and kind = 'notification_email_verify'
    order by created_at desc limit 1),
  'personal34@example.com',
  'T8 확인 메일은 요청한 개인 주소로 간다'
);

set local role authenticated;
set local request.jwt.claims =
  '{"sub":"34000000-0000-0000-0000-000000000001","role":"authenticated"}';

select is(verify_notification_email('000000'), false, 'T9 틀린 코드는 거부한다');

reset role;
select is(
  (select attempts::int from notification_email_verifications
    where user_id = '34000000-0000-0000-0000-000000000001'),
  1,
  'T10 틀린 코드 시도 횟수를 서버에 남긴다'
);

-- 테스트에서는 아웃박스의 원문 코드를 읽어 실제 사용자가 메일에서 옮기는 과정을 대신한다.
create temp table verification_code_fixture as
  select payload->>'verification_code' as code
    from notifications
   where user_id = '34000000-0000-0000-0000-000000000001'
     and kind = 'notification_email_verify'
   order by created_at desc limit 1;
grant select on verification_code_fixture to authenticated;

set local role authenticated;
set local request.jwt.claims =
  '{"sub":"34000000-0000-0000-0000-000000000001","role":"authenticated"}';
select ok(
  verify_notification_email((select code from verification_code_fixture)),
  'T11 메일에 도착한 코드는 주소를 확인한다'
);
reset role;

select is(
  (select notification_email from profiles
    where id = '34000000-0000-0000-0000-000000000001'),
  'personal34@example.com',
  'T12 확인된 주소만 프로필에 저장한다'
);

-- 남성이 실제 후보 자격을 갖추는 전이에, 후보가 비었던 여성에게만 알린다.
update profiles set onboarding_step = 7
 where id = '34000000-0000-0000-0000-000000000002';

select is(
  (select count(*)::int from notifications
    where user_id = '34000000-0000-0000-0000-000000000001'
      and kind = 'candidates_refilled'
      and event_id = '34000000-0000-0000-0000-000000000002'),
  1,
  'T13 후보가 0명에서 1명이 되면 한 번 알린다'
);

-- 소개 카드 전송 알림은 같은 큐 사건으로 중복되지 않는다.
insert into intro_queue (id, male_id, female_id, position, curated_by, delivered_at, expires_at)
values ('34000000-0000-0000-0000-000000000010',
        '34000000-0000-0000-0000-000000000002',
        '34000000-0000-0000-0000-000000000001', 1,
        '34000000-0000-0000-0000-000000000002', now(), now() + interval '3 weeks');

update intro_queue set delivered_at = delivered_at
 where id = '34000000-0000-0000-0000-000000000010';

select is(
  (select count(*)::int from notifications
    where user_id = '34000000-0000-0000-0000-000000000002'
      and kind = 'intro_delivered'
      and event_id = '34000000-0000-0000-0000-000000000010'),
  1,
  'T14 소개 전달 알림은 같은 카드로 한 번만 쌓인다'
);

-- 노쇼 신고 접수 즉시 피신고자에게 응답 요청을 쌓는다.
insert into intros (id, male_id, female_id)
values ('34000000-0000-0000-0000-000000000020',
        '34000000-0000-0000-0000-000000000002',
        '34000000-0000-0000-0000-000000000001');
select issue_ticket('34000000-0000-0000-0000-000000000002', 's34-meeting-ticket', 30000, 'meeting');
insert into meetings (id, intro_id, ticket_id)
select '34000000-0000-0000-0000-000000000021',
       '34000000-0000-0000-0000-000000000020', id
  from tickets where payment_id = 's34-meeting-ticket';
insert into no_show_reports
  (id, meeting_id, reporter_id, accused_id, confirm_by)
values
  ('34000000-0000-0000-0000-000000000022',
   '34000000-0000-0000-0000-000000000021',
   '34000000-0000-0000-0000-000000000001',
   '34000000-0000-0000-0000-000000000002', now() + interval '24 hours');

select is(
  (select count(*)::int from notifications
    where user_id = '34000000-0000-0000-0000-000000000002'
      and kind = 'no_show_response_required'
      and event_id = '34000000-0000-0000-0000-000000000022'),
  1,
  'T15 노쇼 신고를 받은 사람에게 응답 요청을 즉시 쌓는다'
);

select * from finish();
rollback;
