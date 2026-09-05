-- S28 — 배제 재확인 · 발급 권한 · 여성의 거절
--
-- 여기서 지켜야 하는 것.
--
--   1) **비로그인은 티켓을 만들 수 없다.** issue_ticket 이 PUBLIC 에 열려 있던
--      기간이 있었다 — s19 가 인자를 늘리며 새 함수를 만들고 revoke 를 잊었다.
--      한 함수만 보지 않고 "anon 이 실행 가능한 SECURITY DEFINER 함수" 전체를
--      0건으로 고정한다. 다음에 누가 또 잊어도 여기서 걸린다.
--   2) **배제는 세 지점에서 성립한다.** 큐 · 개시 · 열람. 한 곳만 막으면
--      "차단했는데 또 나왔다" 가 다시 생긴다.
--   3) **여성은 거절할 수 있고, 거절은 상대의 돈을 즉시 푼다.**
--   4) **탈퇴는 되돌릴 수 없고, 탈퇴하면 내가 쓴 것이 지워진다.**

begin;
select plan(21);

insert into auth.users (id, email, encrypted_password, email_confirmed_at, aud, role,
                        confirmation_token, recovery_token, email_change,
                        email_change_token_new, email_change_token_current,
                        phone_change, phone_change_token, reauthentication_token,
                        raw_app_meta_data, raw_user_meta_data)
values
  ('28000000-0000-0000-0000-0000000000f1','x28f1@t.co','x',now(),'authenticated','authenticated','','','','','','','','','{}'::jsonb,'{}'::jsonb),
  ('28000000-0000-0000-0000-0000000000f2','x28f2@t.co','x',now(),'authenticated','authenticated','','','','','','','','','{}'::jsonb,'{}'::jsonb),
  ('28000000-0000-0000-0000-0000000000f3','x28f3@t.co','x',now(),'authenticated','authenticated','','','','','','','','','{}'::jsonb,'{}'::jsonb),
  ('28000000-0000-0000-0000-0000000000a1','x28a1@t.co','x',now(),'authenticated','authenticated','','','','','','','','','{}'::jsonb,'{}'::jsonb),
  ('28000000-0000-0000-0000-0000000000a2','x28a2@t.co','x',now(),'authenticated','authenticated','','','','','','','','','{}'::jsonb,'{}'::jsonb),
  ('28000000-0000-0000-0000-0000000000a3','x28a3@t.co','x',now(),'authenticated','authenticated','','','','','','','','','{}'::jsonb,'{}'::jsonb),
  ('28000000-0000-0000-0000-0000000000ad','x28ad@t.co','x',now(),'authenticated','authenticated','','','','','','','','','{}'::jsonb,'{}'::jsonb);

insert into profiles (id, gender, hub_id, company_email, email_verified_at, name, birth, job,
                      onboarding_step, terms_agreed_at, privacy_agreed_at, role)
values
  ('28000000-0000-0000-0000-0000000000f1','female','gangnam','x28f1@t.co',now(),'여일','1994-01-01','디자이너',7,now(),now(),'member'),
  ('28000000-0000-0000-0000-0000000000f2','female','gangnam','x28f2@t.co',now(),'여이','1995-01-01','기획자', 7,now(),now(),'member'),
  ('28000000-0000-0000-0000-0000000000f3','female','gangnam','x28f3@t.co',now(),'여삼','1996-01-01','마케터', 7,now(),now(),'member'),
  ('28000000-0000-0000-0000-0000000000a1','male',  'gangnam','x28a1@t.co',now(),'남일','1992-01-01','엔지니어',7,now(),now(),'member'),
  ('28000000-0000-0000-0000-0000000000a2','male',  'gangnam','x28a2@t.co',now(),'남이','1991-01-01','변호사', 7,now(),now(),'member'),
  ('28000000-0000-0000-0000-0000000000a3','male',  'gangnam','x28a3@t.co',now(),'남삼','1990-06-01','회계사', 7,now(),now(),'member'),
  ('28000000-0000-0000-0000-0000000000ad','male',  'gangnam','x28ad@t.co',now(),'운영','1990-01-01','운영',   7,now(),now(),'admin');

-- ─────────────── ① 발급 권한 ───────────────

/*
  함수 하나가 아니라 **표면 전체**를 검사한다. 트리거 함수까지 revoke 해 둔 것이
  여기서 값을 한다 — 예외 목록이 없으면 이 검사가 "0건" 이라는 단순한 참이 되고,
  단순한 참은 다음 사람이 읽고 지킬 수 있다.
*/
select is_empty(
  $$ select p.proname::text
       from pg_proc p join pg_namespace n on n.oid = p.pronamespace
      where n.nspname = 'public' and p.prokind = 'f' and p.prosecdef
        and has_function_privilege('anon', p.oid, 'EXECUTE') $$,
  'T1 anon 이 실행할 수 있는 SECURITY DEFINER 함수가 하나도 없다'
);

select ok(
  not has_function_privilege('authenticated',
    'issue_ticket(uuid,text,integer,ticket_kind)'::regprocedure, 'EXECUTE'),
  'T2 로그인 사용자도 티켓을 직접 발급할 수 없다'
);

-- ─────────────── ② 후보 자격 ───────────────

set local role authenticated;
set local request.jwt.claims = '{"sub":"28000000-0000-0000-0000-0000000000f1"}';

select is(is_eligible_candidate('28000000-0000-0000-0000-0000000000a1'), true,
          'T3 같은 권역의 일반 남성은 후보다');
select is(is_eligible_candidate('28000000-0000-0000-0000-0000000000ad'), false,
          'T4 운영자 계정은 후보로 나오지 않는다');

-- ─────────────── ③ 여성에게 티켓을 팔지 않는다 ───────────────

select throws_ok(
  $$ select create_ticket_order(1::smallint, 'meeting') $$,
  '42501', null,
  'T5 여성은 티켓 주문을 만들 수 없다'
);

set local request.jwt.claims = '{"sub":"28000000-0000-0000-0000-0000000000a1"}';
select lives_ok(
  $$ select create_ticket_order(1::smallint, 'meeting') $$,
  'T6 남성은 여전히 주문할 수 있다'
);

-- ─────────────── ④ 차단 ───────────────

set local role postgres;

-- a2 의 큐에 f2 카드가 전송돼 있다.
insert into intro_queue (male_id, female_id, position, curated_by, delivered_at, expires_at)
values ('28000000-0000-0000-0000-0000000000a2','28000000-0000-0000-0000-0000000000f2',
        1,'28000000-0000-0000-0000-0000000000ad', now(), now() + interval '3 weeks');

-- a1 과 f1 사이에는 소개가 열려 있다.
insert into intros (male_id, female_id)
values ('28000000-0000-0000-0000-0000000000a1','28000000-0000-0000-0000-0000000000f1');

set local role authenticated;
set local request.jwt.claims = '{"sub":"28000000-0000-0000-0000-0000000000a2"}';
select lives_ok(
  $$ select block_user('28000000-0000-0000-0000-0000000000f2', 'test') $$,
  'T7 차단할 수 있다'
);
select is(
  (select count(*)::int from intro_queue
    where male_id = '28000000-0000-0000-0000-0000000000a2'
      and female_id = '28000000-0000-0000-0000-0000000000f2'),
  0, 'T8 차단하면 아직 열리지 않은 큐 카드가 사라진다'
);

set local request.jwt.claims = '{"sub":"28000000-0000-0000-0000-0000000000f1"}';
select lives_ok(
  $$ select block_user('28000000-0000-0000-0000-0000000000a1', 'test') $$,
  'T9 진행 중 소개의 상대도 차단할 수 있다'
);
select is(
  (select outcome::text from intros
    where male_id = '28000000-0000-0000-0000-0000000000a1'
      and female_id = '28000000-0000-0000-0000-0000000000f1'),
  'blocked', 'T10 차단은 열려 있던 소개를 닫는다 (다음 소개를 받을 수 있다)'
);
-- s30 이후 뷰는 직접 못 읽는다. 조회 함수로 같은 것을 묻는다.
select is_empty(
  $$ select id from get_public_profile('28000000-0000-0000-0000-0000000000a1') $$,
  'T11 차단한 상대의 프로필은 더 이상 보이지 않는다'
);

-- ─────────────── ⑤ 개시 직전 재확인 ───────────────

/*
  청소를 우회해 배제된 카드가 남은 상태를 손으로 만든다 — 청소가 도달하지
  못하는 경로가 생겨도 **돈이 나가지 않는지**가 이 검사의 요점이다.
*/
set local role postgres;
insert into intro_queue (male_id, female_id, position, curated_by, delivered_at, expires_at)
values ('28000000-0000-0000-0000-0000000000a2','28000000-0000-0000-0000-0000000000f2',
        1,'28000000-0000-0000-0000-0000000000ad', now(), now() + interval '3 weeks');
insert into tickets (user_id, kind, price_krw, payment_id)
values ('28000000-0000-0000-0000-0000000000a2','intro', 5000, 't28-intro-1');

set local role authenticated;
set local request.jwt.claims = '{"sub":"28000000-0000-0000-0000-0000000000a2"}';
select throws_ok(
  $$ select open_intro() $$,
  'P0002', null,
  'T12 배제된 카드만 남아 있으면 소개가 열리지 않는다 (티켓도 안 나간다)'
);
select is(
  (select state::text from tickets where payment_id = 't28-intro-1'),
  'unused', 'T13 열리지 않았으므로 소개 티켓은 그대로다'
);

-- ─────────────── ⑥ 여성의 거절 ───────────────

set local role postgres;
insert into intros (male_id, female_id)
values ('28000000-0000-0000-0000-0000000000a3','28000000-0000-0000-0000-0000000000f3');
insert into tickets (user_id, kind, price_krw, payment_id)
values ('28000000-0000-0000-0000-0000000000a3','meeting', 30000, 't28-meet-1');

set local role authenticated;
set local request.jwt.claims = '{"sub":"28000000-0000-0000-0000-0000000000a3"}';
select lives_ok(
  $$ select use_meeting_ticket((select id from intros
       where male_id = '28000000-0000-0000-0000-0000000000a3')) $$,
  'T14 남성이 만남 티켓을 쓴다'
);
select throws_ok(
  $$ select decline_meeting((select id from meetings
       order by created_at desc limit 1)) $$,
  '42501', null,
  'T15 남성은 자기가 보낸 요청을 이 길로 취소할 수 없다'
);

set local request.jwt.claims = '{"sub":"28000000-0000-0000-0000-0000000000f3"}';
select lives_ok(
  $$ select decline_meeting((select id from meetings
       order by created_at desc limit 1), '일정이 안 맞아요') $$,
  'T16 여성은 거절할 수 있다'
);
-- 티켓 RLS 는 본인 것만 보여준다. 상대의 환불을 확인하려면 롤을 내려놓아야 한다.
set local role postgres;
select is(
  (select state::text from tickets where payment_id = 't28-meet-1'),
  'refunded', 'T17 거절하면 상대의 만남 티켓이 즉시 환불된다 (24시간 기다리지 않는다)'
);
set local role authenticated;
select is(
  (select outcome::text from intros
    where male_id = '28000000-0000-0000-0000-0000000000a3'),
  'declined', 'T18 거절은 만료와 다른 이름으로 남는다'
);
select ok(
  is_excluded('28000000-0000-0000-0000-0000000000a3','28000000-0000-0000-0000-0000000000f3'),
  'T19 거절한 상대에게 티켓을 또 쓸 수 없다'
);

-- ─────────────── ⑦ 탈퇴 ───────────────

set local role postgres;
-- 위 만남에 양쪽의 대화가 하나씩 남아 있다.
insert into messages (meeting_id, sender_id, channel, body)
values
  ((select id from meetings order by created_at desc limit 1),
   '28000000-0000-0000-0000-0000000000f3','coord','제가 쓴 말'),
  ((select id from meetings order by created_at desc limit 1),
   '28000000-0000-0000-0000-0000000000a3','coord','상대가 쓴 말');

set local role authenticated;
set local request.jwt.claims = '{"sub":"28000000-0000-0000-0000-0000000000f3"}';
select lives_ok($$ select withdraw_account('테스트') $$, 'T20 탈퇴할 수 있다');

set local role postgres;
select is(
  (select string_agg(body, '|' order by body) from messages
    where sender_id in ('28000000-0000-0000-0000-0000000000f3',
                        '28000000-0000-0000-0000-0000000000a3')),
  '상대가 쓴 말',
  'T21 탈퇴하면 내가 쓴 대화만 지워지고 상대의 말은 남는다'
);

select * from finish();
rollback;
