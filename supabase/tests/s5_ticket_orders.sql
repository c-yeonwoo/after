-- S5 — 결제 주문 생성(ticket_orders) 부정 테스트
--
-- 실행: supabase test db
--
-- 핵심: orderId ↔ user_id 매핑은 클라이언트가 만들 수 없다. create_ticket_order()
-- RPC로만 생기고, 가격도 서버가 고정한다(30,000원) — 결제 승인 콜백이 신뢰하는
-- 유일한 소스가 이 테이블이므로, 여기가 뚫리면 결제 없이 티켓을 만들 수 있다.

begin;
select plan(7);

insert into auth.users (id, instance_id, aud, role, email, encrypted_password, created_at, updated_at)
values
  ('dddd0001-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000000',
   'authenticated', 'authenticated', 'm5a@corp.example', '', now(), now()),
  ('dddd0002-0000-0000-0000-000000000002', '00000000-0000-0000-0000-000000000000',
   'authenticated', 'authenticated', 'm5b@corp.example', '', now(), now());

insert into profiles (id, gender, hub_id, company_email, email_verified_at, onboarding_step, name)
values
  ('dddd0001-0000-0000-0000-000000000001', 'male', 'gangnam', 'm5a@corp.example', now(), 7, '민수'),
  ('dddd0002-0000-0000-0000-000000000002', 'male', 'gangnam', 'm5b@corp.example', now(), 7, '준영');


-- ═════════ T1 — 인증된 사용자는 주문을 만들 수 있다 ═════════

set local "request.jwt.claims" to '{"sub":"dddd0001-0000-0000-0000-000000000001","role":"authenticated"}';
set local role authenticated;
select lives_ok(
  $$ select create_ticket_order() $$,
  'T1: 인증된 사용자는 주문을 만들 수 있다'
);
reset role;

select is(
  (select amount from ticket_orders where user_id = 'dddd0001-0000-0000-0000-000000000001'),
  30000,
  'T2: 가격은 서버가 30,000원으로 고정한다'
);

select is(
  (select state from ticket_orders where user_id = 'dddd0001-0000-0000-0000-000000000001'),
  'pending',
  'T3: 생성 직후 상태는 pending 이다'
);


-- ═════════ T4 — 같은 유저가 두 번 만들어도 orderId가 겹치지 않는다 ═════════

set local "request.jwt.claims" to '{"sub":"dddd0001-0000-0000-0000-000000000001","role":"authenticated"}';
set local role authenticated;
select create_ticket_order();
reset role;

select is(
  (select count(distinct order_id)::int from ticket_orders
    where user_id = 'dddd0001-0000-0000-0000-000000000001'),
  2,
  'T4: 매 호출마다 orderId가 새로 생긴다'
);


-- ═════════ T5 — 클라이언트가 RPC를 거치지 않고 직접 INSERT 할 수 없다 ═════════

set local "request.jwt.claims" to '{"sub":"dddd0002-0000-0000-0000-000000000002","role":"authenticated"}';
set local role authenticated;
select throws_ok(
  $$ insert into ticket_orders (order_id, user_id, amount)
     values ('ticket_forged', 'dddd0002-0000-0000-0000-000000000002', 30000) $$,
  '42501',
  null,
  'T5: 클라이언트는 ticket_orders 에 직접 INSERT 할 수 없다'
);
reset role;


-- ═════════ T6 — 클라이언트는 자기 주문 상태를 직접 바꿀 수 없다 ═════════

set local "request.jwt.claims" to '{"sub":"dddd0001-0000-0000-0000-000000000001","role":"authenticated"}';
set local role authenticated;
select throws_ok(
  $$ update ticket_orders set state = 'confirmed'
      where user_id = 'dddd0001-0000-0000-0000-000000000001' $$,
  '42501',
  null,
  'T6: 클라이언트는 상태를 직접 confirmed 로 바꿀 수 없다'
);
reset role;


-- ═════════ T7 — RLS: 남의 주문은 보이지 않는다 ═════════

set local "request.jwt.claims" to '{"sub":"dddd0002-0000-0000-0000-000000000002","role":"authenticated"}';
set local role authenticated;
select is(
  (select count(*)::int from ticket_orders
    where user_id = 'dddd0001-0000-0000-0000-000000000001'),
  0,
  'T7: RLS 로 남의 주문은 조회되지 않는다'
);
reset role;


select * from finish();
rollback;
