begin;
select plan(9);

insert into auth.users (id, email, encrypted_password, email_confirmed_at, aud, role,
                        confirmation_token, recovery_token, email_change,
                        email_change_token_new, email_change_token_current,
                        phone_change, phone_change_token, reauthentication_token,
                        raw_app_meta_data, raw_user_meta_data)
values
  ('61b00000-0000-0000-0000-000000000001','admin61b@t.co','x',now(),'authenticated','authenticated','','','','','','','','','{}'::jsonb,'{}'::jsonb),
  ('61b00000-0000-0000-0000-000000000002','man61b@t.co','x',now(),'authenticated','authenticated','','','','','','','','','{}'::jsonb,'{}'::jsonb);
insert into profiles (id, gender, hub_id, company_email, email_verified_at,
                      name, onboarding_step, terms_agreed_at, privacy_agreed_at, role)
values
  ('61b00000-0000-0000-0000-000000000001','male','gangnam','admin61b@t.co',now(),'운영자61b',7,now(),now(),'admin'),
  ('61b00000-0000-0000-0000-000000000002','male','gangnam','man61b@t.co',now(),'남성61b',7,now(),now(),'member');
insert into ticket_orders (order_id, user_id, amount, quantity, kind, payment_required)
values ('ticket_61b00000000000000000000000000001',
        '61b00000-0000-0000-0000-000000000002', 30000, 1, 'meeting', true);

select ok(not has_function_privilege('authenticated',
  'public.apply_payment_reconciliation(text,uuid,text,text,integer,integer,text)', 'EXECUTE'),
  '회원은 대사 전이 RPC를 실행할 수 없다');
select ok(not has_function_privilege('authenticated',
  'public.record_payment_provider_check(text,text,boolean)', 'EXECUTE'),
  '회원은 결과 미상 기록을 조작할 수 없다');
select throws_ok($$
  select apply_payment_reconciliation(
    'ticket_61b00000000000000000000000000001',
    '61b00000-0000-0000-0000-000000000002',
    'DONE','key61b',30000,30000,'카드')
$$, '42501', null, '일반 회원을 운영자로 넘겨도 거부한다');
select throws_ok($$
  select apply_payment_reconciliation(
    'ticket_61b00000000000000000000000000001',
    '61b00000-0000-0000-0000-000000000001',
    'DONE','key61b',30001,30000,'카드')
$$, 'PT409', null, '금액이 다르면 발급할 수 없다');
select is(apply_payment_reconciliation(
    'ticket_61b00000000000000000000000000001',
    '61b00000-0000-0000-0000-000000000001',
    'DONE','key61b',30000,30000,'카드'),
  'fulfilled', '일치하는 공급자 완료만 티켓을 발급한다');
select is((select count(*) from tickets where payment_id =
  'ticket_61b00000000000000000000000000001#1')::integer,
  1, '티켓 한 장만 발급한다');
select is((select count(*) from admin_actions where kind = 'reconcile_payment'
  and target_user = '61b00000-0000-0000-0000-000000000002')::integer,
  1, '금전 전이와 운영 감사가 함께 남는다');

select is((select state from reserve_paid_order_cancel(
  'ticket_61b00000000000000000000000000001')),
  'canceling', '미사용 티켓은 취소 중 잠긴다');
select is(apply_payment_reconciliation(
    'ticket_61b00000000000000000000000000001',
    '61b00000-0000-0000-0000-000000000001',
    'CANCELED','key61b',30000,0,'카드'),
  'canceled', '전액 취소 확인 시 티켓 환불과 감사가 함께 남는다');

select * from finish();
rollback;
