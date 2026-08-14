-- S27 — 베타 무료 발급과 결제 스위치
--
-- 실행: supabase test db
--
-- 핵심: 티켓을 내는 문은 **한 번에 하나만** 열려 있어야 한다. 결제를 켠 뒤에도
-- 운영자가 무료로 낼 수 있으면, 돈을 낸 사람과 안 낸 사람이 같은 표에 구분 없이
-- 섞이고 매출도 회원 수도 믿을 수 없게 된다.

begin;
select plan(10);

insert into auth.users (id, instance_id, aud, role, email, encrypted_password, created_at, updated_at)
values
  ('aaaa2700-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000000',
   'authenticated', 'authenticated', 'a27@corp.example', '', now(), now()),
  ('dddd2700-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000000',
   'authenticated', 'authenticated', 'm27@corp.example', '', now(), now());

insert into profiles (id, gender, hub_id, company_email, email_verified_at, onboarding_step, name, role)
values
  ('aaaa2700-0000-0000-0000-000000000001', 'male', 'gangnam', 'a27@corp.example', now(), 7, '운영자', 'admin'),
  ('dddd2700-0000-0000-0000-000000000001', 'male', 'gangnam', 'm27@corp.example', now(), 7, '민수', 'member');

insert into ticket_orders (order_id, user_id, amount, quantity, kind)
values ('ticket_t27_a', 'dddd2700-0000-0000-0000-000000000001', 5000, 1, 'intro'),
       ('ticket_t27_b', 'dddd2700-0000-0000-0000-000000000001', 30000, 1, 'meeting');

update app_settings set payments_enabled = false where id;


-- ═════════ T1~T2 — 설정은 읽되 쓰지는 못한다 ═════════
--
-- 상점 화면이 이 값으로 문구를 가르므로 읽기는 열려 있어야 하고, 그렇다고
-- 회원이 스스로 결제를 꺼서 무료 발급 대기열에 들어갈 수는 없어야 한다.

set local "request.jwt.claims" to '{"sub":"dddd2700-0000-0000-0000-000000000001","role":"authenticated"}';
set local role authenticated;

select is(
  (select payments_enabled from app_settings),
  false,
  'T1: 일반 회원도 결제 활성화 여부를 읽는다'
);

select throws_ok(
  $$ select admin_set_payments(true, '내가 켜겠다') $$,
  '42501',
  null,
  'T2: 일반 회원은 결제 스위치를 만질 수 없다'
);
reset role;


-- ═════════ T3~T6 — 베타 발급 ═════════

set local "request.jwt.claims" to '{"sub":"aaaa2700-0000-0000-0000-000000000001","role":"authenticated"}';
set local role authenticated;

select throws_ok(
  $$ select admin_fulfill_order('ticket_t27_a', '   ') $$,
  '22023',
  null,
  'T3: 사유 없이는 발급하지 않는다'
);

select is(
  (select admin_fulfill_order('ticket_t27_a', '베타 참여자')),
  1,
  'T4: 승인하면 주문 수량만큼 발급된다'
);
reset role;

-- 0원이어야 한다. 가격이 붙으면 매출 집계가 받지 않은 돈을 셈한다.
select is(
  (select price_krw from tickets where payment_id = 'ticket_t27_a#1'),
  0,
  'T5: 베타 발급 티켓은 0원이다'
);

select is(
  (select fulfill_note from ticket_orders where order_id = 'ticket_t27_a'),
  '베타 참여자',
  'T6: 승인 사유를 주문에서 되읽을 수 있다'
);


-- ═════════ T7 — 재승인은 양성 경합이다 ═════════
--
-- 운영자 둘이 같은 목록을 보고 있으면 반드시 일어난다. 500 이 아니라 409 로
-- 내야 화면이 "다른 분이 먼저 처리했습니다" 라고 말할 수 있다(s16c 와 같은 규약).

set local "request.jwt.claims" to '{"sub":"aaaa2700-0000-0000-0000-000000000001","role":"authenticated"}';
set local role authenticated;

select throws_ok(
  $$ select admin_fulfill_order('ticket_t27_a', '재시도') $$,
  'PT409',
  null,
  'T7: 이미 발급된 주문을 다시 승인하면 409'
);


-- ═════════ T8~T10 — 결제를 켜면 무료 문이 닫힌다 ═════════

select is(
  (select payments_enabled from admin_set_payments(true, '토스 심사 완료')),
  true,
  'T8: 운영자는 결제를 켤 수 있다'
);

select throws_ok(
  $$ select admin_fulfill_order('ticket_t27_b', '무료로 주자') $$,
  '42501',
  null,
  'T9: 결제가 켜져 있으면 무료 발급이 막힌다'
);
reset role;

-- 막혔으면 티켓도 없어야 한다. 예외를 던지기 전에 발급하면 롤백돼도
-- "일부만 나간" 상태가 생길 수 있다.
select is(
  (select count(*) from tickets where payment_id like 'ticket_t27_b%'),
  0::bigint,
  'T10: 막힌 주문은 티켓을 남기지 않는다'
);

select * from finish();
rollback;
