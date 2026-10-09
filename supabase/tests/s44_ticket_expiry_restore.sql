begin;
select plan(11);

insert into auth.users (id, instance_id, aud, role, email, encrypted_password, created_at, updated_at)
values
  ('44000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000000',
   'authenticated', 'authenticated', 'male44@corp.example', '', now(), now()),
  ('44000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-000000000000',
   'authenticated', 'authenticated', 'female44a@corp.example', '', now(), now()),
  ('44000000-0000-0000-0000-000000000003', '00000000-0000-0000-0000-000000000000',
   'authenticated', 'authenticated', 'female44b@corp.example', '', now(), now());

insert into profiles (id, gender, hub_id, company_email, email_verified_at, onboarding_step, name)
values
  ('44000000-0000-0000-0000-000000000001', 'male', 'gangnam', 'male44@corp.example', now(), 7, '남성'),
  ('44000000-0000-0000-0000-000000000002', 'female', 'gangnam', 'female44a@corp.example', now(), 7, '여성A'),
  ('44000000-0000-0000-0000-000000000003', 'female', 'gangnam', 'female44b@corp.example', now(), 7, '여성B');

insert into intros (male_id, female_id)
values ('44000000-0000-0000-0000-000000000001', '44000000-0000-0000-0000-000000000002');

insert into tickets (user_id, kind, payment_id, price_krw, issued_at, expires_at)
values
  ('44000000-0000-0000-0000-000000000001', 'meeting', 's44-expired', 30000,
   now() - interval '12 months', now() - interval '1 day');

select ok(
  (select expires_at <= issued_at + interval '12 months' from tickets where payment_id = 's44-expired'),
  'T1 existing issue date can have a 12-month deadline'
);

set local "request.jwt.claims" to '{"sub":"44000000-0000-0000-0000-000000000001","role":"authenticated"}';
set local role authenticated;
select throws_ok(
  $$ select use_meeting_ticket((select id from intros where male_id = '44000000-0000-0000-0000-000000000001')) $$,
  'P0002', null, 'T2 expired ticket cannot start a meeting'
);
reset role;

insert into tickets (user_id, kind, payment_id, price_krw, expires_at)
values ('44000000-0000-0000-0000-000000000001', 'meeting', 's44-valid', 30000,
        now() + interval '9 months');

select ok(
  (select expires_at > now() from tickets where payment_id = 's44-valid'),
  'T3 new ticket has a future deadline'
);

set local "request.jwt.claims" to '{"sub":"44000000-0000-0000-0000-000000000001","role":"authenticated"}';
set local role authenticated;
select lives_ok(
  $$ select use_meeting_ticket((select id from intros where male_id = '44000000-0000-0000-0000-000000000001')) $$,
  'T4 valid ticket starts a meeting'
);
reset role;

select is((select state::text from tickets where payment_id = 's44-valid'), 'used',
          'T5 the valid ticket was selected instead of the expired ticket');

set local role service_role;
select lives_ok(
  $$ select refund_ticket((select id from tickets where payment_id = 's44-valid'), 'no_response_24h') $$,
  'T6 failed meeting restores a replacement ticket'
);
reset role;

select is((select state::text from tickets where payment_id = 's44-valid'), 'refunded',
          'T7 original usage remains in history');
select is(
  (select count(*)::integer from tickets r join tickets original
    on r.restored_from_ticket_id = original.id
   where original.payment_id = 's44-valid' and r.state = 'unused'),
  1, 'T8 exactly one usable replacement exists'
);
select is(
  (select r.expires_at from tickets r join tickets original
    on r.restored_from_ticket_id = original.id where original.payment_id = 's44-valid'),
  (select expires_at from tickets where payment_id = 's44-valid'),
  'T9 restoration does not extend the paid service period'
);
select is(
  (select r.price_krw from tickets r join tickets original
    on r.restored_from_ticket_id = original.id where original.payment_id = 's44-valid'),
  0, 'T9b returned ticket is a no-charge replacement'
);

set local role service_role;
select throws_ok(
  $$ select refund_ticket((select id from tickets where payment_id = 's44-valid'), 'retry') $$,
  'P0002', null, 'T10 repeated restoration cannot mint another ticket'
);
reset role;

select * from finish();
rollback;
