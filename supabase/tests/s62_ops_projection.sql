begin;
select plan(14);

insert into auth.users (id, email, encrypted_password, email_confirmed_at, aud, role,
                        confirmation_token, recovery_token, email_change,
                        email_change_token_new, email_change_token_current,
                        phone_change, phone_change_token, reauthentication_token,
                        raw_app_meta_data, raw_user_meta_data)
values ('62000000-0000-0000-0000-000000000001','member62@t.co','x',now(),
        'authenticated','authenticated','','','','','','','','','{}'::jsonb,'{}'::jsonb);
insert into profiles (id, gender, hub_id, company_email, email_verified_at,
                      name, onboarding_step, terms_agreed_at, privacy_agreed_at, role)
values ('62000000-0000-0000-0000-000000000001','male','gangnam',
        'member62@t.co',now(),'회원62',7,now(),now(),'member');

insert into support_requests(id, user_id, category, body)
values ('62000000-0000-0000-0000-000000000002',
        '62000000-0000-0000-0000-000000000001', 'account', '로그인이 제대로 되지 않아요');
select is((select count(*) from ops_cases where case_type = 'support'
  and source_id = '62000000-0000-0000-0000-000000000002')::integer,
  1, '문의가 한 작업으로 적재된다');
select is((select count(*) from domain_events where event_type = 'support_requested'
  and aggregate_id = '62000000-0000-0000-0000-000000000002')::integer,
  1, '신뢰 이벤트가 한 번 기록된다');
update support_requests set category = 'safety'
 where id = '62000000-0000-0000-0000-000000000002';
select is((select count(*) from ops_cases where case_type = 'support'
  and source_id = '62000000-0000-0000-0000-000000000002')::integer,
  1, '같은 원본의 반복 감지는 작업을 중복 생성하지 않는다');
select is((select priority from ops_cases where case_type = 'support'
  and source_id = '62000000-0000-0000-0000-000000000002'),
  'high', '안전 문의는 높은 우선순위로 갱신된다');
update support_requests set status = 'answered', response = '확인했습니다.',
       responded_at = now(), responded_by = '62000000-0000-0000-0000-000000000001'
 where id = '62000000-0000-0000-0000-000000000002';
select is((select status from ops_cases where case_type = 'support'
  and source_id = '62000000-0000-0000-0000-000000000002'),
  'resolved', '원본 답변 후 작업이 자동 해결된다');
update support_requests set status = 'open', response = null,
       responded_at = null, responded_by = null
 where id = '62000000-0000-0000-0000-000000000002';
select is((select max(occurrence) from ops_cases where case_type = 'support'
  and source_id = '62000000-0000-0000-0000-000000000002'),
  2, '해결 뒤 같은 문제가 다시 열리면 새 회차로 기록된다');

insert into ticket_orders (order_id, user_id, amount, quantity, kind, payment_required)
values ('ticket_62000000000000000000000000000001',
        '62000000-0000-0000-0000-000000000001', 30000, 1, 'meeting', true);
select record_payment_provider_check('ticket_62000000000000000000000000000001',
  'confirm_unknown', false);
select is((select status from ops_cases where case_type = 'payment_unknown'
  and source_id = 'ticket_62000000000000000000000000000001'),
  'open', '결제 결과 미상이 작업으로 열린다');
select record_payment_provider_check('ticket_62000000000000000000000000000001',
  null, true);
select is((select status from ops_cases where case_type = 'payment_unknown'
  and source_id = 'ticket_62000000000000000000000000000001'),
  'resolved', '공급자 상태 확인으로 미상 플래그가 사라지면 작업도 해결된다');

select is((select count(*) from ops_case_events where event_type = 'opened'
  and case_id in (select id from ops_cases where case_type = 'support'))::integer,
  2, '회차별 작업 이력이 남는다');
select ok(not has_table_privilege('authenticated', 'public.ops_cases', 'SELECT'),
  '회원은 작업 원장에 직접 접근하지 못한다');
select ok(not has_table_privilege('authenticated', 'public.domain_events', 'INSERT'),
  '회원은 신뢰 이벤트를 조작할 수 없다');
update profiles set account_state = 'withdrawn'
 where id = '62000000-0000-0000-0000-000000000001';
select is((select count(*) from domain_events
  where subject_id = '62000000-0000-0000-0000-000000000001')::integer,
  0, '탈퇴 후 운영 계측의 회원 연결이 삭제된다');
select is((select count(*) from ops_cases
  where subject_id = '62000000-0000-0000-0000-000000000001')::integer,
  0, '탈퇴 후 작업 원장에 회원 연결이 남지 않는다');
select is((select count(*) from ops_cases where case_type = 'support'
  and source_id = '62000000-0000-0000-0000-000000000002')::integer,
  0, '탈퇴 후 문의 작업의 원본 링크가 제거된다');

select * from finish();
rollback;
