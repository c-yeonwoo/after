-- S13 — 티켓 묶음 · 알림 수신 설정

begin;
select plan(10);

insert into auth.users (id, email, encrypted_password, email_confirmed_at, aud, role,
                        confirmation_token, recovery_token, email_change,
                        email_change_token_new, email_change_token_current,
                        phone_change, phone_change_token, reauthentication_token,
                        raw_app_meta_data, raw_user_meta_data)
values
  ('e0000000-0000-0000-0000-00000000000a','sf@t.co','x',now(),'authenticated','authenticated','','','','','','','','','{}'::jsonb,'{}'::jsonb),
  ('e0000000-0000-0000-0000-00000000000b','sm@t.co','x',now(),'authenticated','authenticated','','','','','','','','','{}'::jsonb,'{}'::jsonb);

insert into profiles (id, gender, hub_id, company_email, email_verified_at, name, birth, job,
                      onboarding_step, terms_agreed_at, privacy_agreed_at)
values
  ('e0000000-0000-0000-0000-00000000000a','female','gangnam','sf@t.co',now(),'에스여','1995-03-14','디자이너',7,now(),now()),
  ('e0000000-0000-0000-0000-00000000000b','male',  'gangnam','sm@t.co',now(),'에스남','1992-06-21','엔지니어',7,now(),now());

-- ─────────────── 가격 ───────────────

select is(ticket_bundle_amount(1::smallint), 30000, 'T1 1장 30,000원');
select is(ticket_bundle_amount(3::smallint), 80000, 'T2 3장 80,000원');
select is(ticket_bundle_amount(2::smallint), null,  'T3 정의되지 않은 수량은 null');

select throws_ok(
  $$ insert into ticket_orders (order_id, user_id, amount, quantity)
     values ('forged', 'e0000000-0000-0000-0000-00000000000b', 1000, 3) $$,
  '23514',
  null,
  'T4 [차단] 수량에 맞지 않는 금액은 CHECK 로 거부된다'
);

-- ─────────────── 주문 → 이행 ───────────────

set local role authenticated;
set local request.jwt.claims = '{"sub":"e0000000-0000-0000-0000-00000000000b","role":"authenticated"}';

select is(
  (select quantity from create_ticket_order(3::smallint)),
  3::smallint,
  'T5 [통과] 3장 주문이 만들어진다'
);

select throws_ok(
  $$ select create_ticket_order(2::smallint) $$,
  '22023',
  null,
  'T6 [차단] 지원하지 않는 수량은 주문할 수 없다'
);

reset role;

select is(
  fulfill_ticket_order((select order_id from ticket_orders
                         where user_id='e0000000-0000-0000-0000-00000000000b' and quantity=3)),
  3,
  'T7 [통과] 이행하면 수량만큼 발급된다'
);

-- 같은 주문으로 다시 이행해도 늘지 않는다 (payment_id 를 주문에서 파생)
select fulfill_ticket_order((select order_id from ticket_orders
                              where user_id='e0000000-0000-0000-0000-00000000000b' and quantity=3));

select is(
  (select count(*)::int from tickets where user_id='e0000000-0000-0000-0000-00000000000b'),
  3,
  'T8 [멱등] 재이행해도 티켓이 3장을 넘지 않는다'
);

-- ─────────────── 알림 수신 설정 ───────────────

select is(
  (select feedback_emails from profiles where id='e0000000-0000-0000-0000-00000000000b'),
  true,
  'T9 기본값은 수신함'
);

-- 끈 사람은 아웃박스에 아예 들어가지 않는다
insert into affinities (from_id, to_id, verdict)
values ('e0000000-0000-0000-0000-00000000000a','e0000000-0000-0000-0000-00000000000b','like');

set local role authenticated;
set local request.jwt.claims = '{"sub":"e0000000-0000-0000-0000-00000000000b","role":"authenticated"}';
select open_intro();
select use_meeting_ticket((select id from intros where male_id=auth.uid() and closed_at is null));
-- 선호 제출은 여성 당사자만 할 수 있다(S1 이 강제하는 게이트).
set local request.jwt.claims = '{"sub":"e0000000-0000-0000-0000-00000000000a","role":"authenticated"}';
select submit_meeting_prefs(
  (select m.id from meetings m join intros i on i.id=m.intro_id where i.female_id=auth.uid()),
  '{"dates":["2026-08-20T10:00:00.000Z"],"stations":[],"anywhere":true}'::jsonb
);

-- 확정은 남성이 한다.
set local request.jwt.claims = '{"sub":"e0000000-0000-0000-0000-00000000000b","role":"authenticated"}';
select confirm_meeting(
  (select m.id from meetings m join intros i on i.id=m.intro_id where i.male_id=auth.uid()),
  '2026-08-20T10:00:00.000Z'::timestamptz, '강남역', '카페'
);

reset role;
-- 남성만 후기 요청을 끈다
update profiles set feedback_emails = false where id='e0000000-0000-0000-0000-00000000000b';
update meetings set scheduled_at = now() - interval '1 day'
 where intro_id in (select id from intros where male_id='e0000000-0000-0000-0000-00000000000b');

delete from notifications
 where kind='feedback_due'
   and user_id in ('e0000000-0000-0000-0000-00000000000a','e0000000-0000-0000-0000-00000000000b');
select enqueue_feedback_due();

select is(
  (select count(*)::int from notifications
    where kind='feedback_due'
      and user_id in ('e0000000-0000-0000-0000-00000000000a','e0000000-0000-0000-0000-00000000000b')),
  1,
  'T10 [통과] 끈 사람은 빠지고 안 끈 사람에게만 쌓인다'
);

select * from finish();
rollback;
