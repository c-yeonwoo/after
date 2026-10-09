begin;
select plan(19);

insert into auth.users (id, instance_id, aud, role, email, encrypted_password, created_at, updated_at)
values
  ('aaaa4300-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000000',
   'authenticated', 'authenticated', 'admin43@corp.example', '', now(), now()),
  ('dddd4300-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000000',
   'authenticated', 'authenticated', 'member43@corp.example', '', now(), now());

insert into profiles (id, gender, hub_id, company_email, email_verified_at, onboarding_step, name, role)
values
  ('aaaa4300-0000-0000-0000-000000000001', 'male', 'gangnam', 'admin43@corp.example', now(), 7, '운영자', 'admin'),
  ('dddd4300-0000-0000-0000-000000000001', 'male', 'gangnam', 'member43@corp.example', now(), 7, '회원', 'member');

update app_settings set payments_enabled = false where id;
set local "request.jwt.claims" to '{"sub":"dddd4300-0000-0000-0000-000000000001","role":"authenticated"}';
set local role authenticated;

select is((select payment_required from create_ticket_order(1::smallint, 'intro'::ticket_kind)), false,
          'T1: beta order keeps free mode');
reset role;

set local "request.jwt.claims" to '{"sub":"aaaa4300-0000-0000-0000-000000000001","role":"authenticated"}';
set local role authenticated;
select is((select payments_enabled from admin_set_payments(true, 'paid mode test')), true,
          'T2: operator enables paid mode');
reset role;

set local "request.jwt.claims" to '{"sub":"dddd4300-0000-0000-0000-000000000001","role":"authenticated"}';
set local role authenticated;
select is((select payment_required from create_ticket_order(3::smallint, 'meeting'::ticket_kind)), true,
          'T3: new order requires payment');
reset role;

set local "request.jwt.claims" to '{"sub":"aaaa4300-0000-0000-0000-000000000001","role":"authenticated"}';
set local role authenticated;
select is((select payments_enabled from admin_set_payments(false, 'switch back test')), false,
          'T4: operator returns to beta mode');

select throws_ok(
  $$ select admin_fulfill_order((select order_id from admin_ticket_orders('pending') where quantity = 3 and user_id = 'dddd4300-0000-0000-0000-000000000001' limit 1), 'free grant') $$,
  '23514', null,
  'T5: paid order cannot be granted for free after switch-off'
);
select is(
  (select payment_required from admin_ticket_orders('pending') where quantity = 3 and user_id = 'dddd4300-0000-0000-0000-000000000001' limit 1),
  true,
  'T5b: admin sees paid order mode after the global switch is off'
);
reset role;

select is((select count(*) from tickets where user_id = 'dddd4300-0000-0000-0000-000000000001'), 0::bigint,
          'T6: rejected free grant leaves no tickets');

set local role service_role;
select is(
  (select fulfill_paid_ticket_order(
    (select order_id from ticket_orders where payment_required and user_id = 'dddd4300-0000-0000-0000-000000000001' limit 1), 'pay_s43_one', '카드')),
  3,
  'T7: paid order confirms after global switch-off'
);
reset role;

select is((select payment_key from ticket_orders where payment_required and user_id = 'dddd4300-0000-0000-0000-000000000001'), 'pay_s43_one',
          'T8: Toss payment key is retained for refunds');
select is((select sum(price_krw) from tickets where user_id = 'dddd4300-0000-0000-0000-000000000001'),
          85000::bigint, 'T9: bundle ticket prices reconcile to 85,000 KRW');

set local role service_role;
select is(
  (select fulfill_paid_ticket_order(
    (select order_id from ticket_orders where payment_required and user_id = 'dddd4300-0000-0000-0000-000000000001' limit 1), 'pay_s43_one', '카드')),
  3,
  'T10: confirmation retry is idempotent'
);
select throws_ok(
  $$ select fulfill_paid_ticket_order((select order_id from ticket_orders where payment_required and user_id = 'dddd4300-0000-0000-0000-000000000001' limit 1), 'pay_other', '카드') $$,
  'PT409', null,
  'T11: different payment key cannot confirm the same order'
);
select throws_ok(
  $$ select fulfill_paid_ticket_order((select order_id from ticket_orders where not payment_required and user_id = 'dddd4300-0000-0000-0000-000000000001' limit 1), 'pay_beta', '카드') $$,
  '42501', null,
  'T12: beta order cannot enter paid fulfillment'
);

select is(
  (select state from reserve_paid_order_cancel(
    (select order_id from ticket_orders where payment_required and user_id = 'dddd4300-0000-0000-0000-000000000001' limit 1))),
  'canceling', 'T13: cancellation reserves the order'
);
select is((select count(*) from tickets where refund_locked), 3::bigint,
          'T14: all purchased tickets are locked against consumption');
select throws_ok(
  $$ update tickets set state = 'used' where payment_id =
     (select order_id from ticket_orders where payment_required and user_id = 'dddd4300-0000-0000-0000-000000000001' limit 1) || '#1' $$,
  '23514', null,
  'T14b: a reserved ticket cannot be consumed'
);

select is(
  (select finalize_paid_order_cancel(
    (select order_id from ticket_orders where payment_required and user_id = 'dddd4300-0000-0000-0000-000000000001' limit 1), 'buyer request')),
  3,
  'T15: provider cancellation refunds all tickets'
);
reset role;

select is((select state from ticket_orders where payment_required and user_id = 'dddd4300-0000-0000-0000-000000000001'), 'canceled',
          'T16: order state is canceled');
select is((select count(*) from tickets
            where user_id = 'dddd4300-0000-0000-0000-000000000001'
              and state = 'refunded' and not refund_locked),
          3::bigint, 'T17: all tickets are unusable after refund');

select * from finish();
rollback;
