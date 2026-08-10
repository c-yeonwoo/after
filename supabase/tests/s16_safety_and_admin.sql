-- S16 — 신고 · 차단 · 운영자 권한
--
-- 여기서 지켜야 하는 것.
--
--   1) **차단은 되돌릴 수 없고 환불하지 않는다.** 끊는 비용을 끊는 쪽이 진다.
--   2) **신고자는 드러나지 않는다.** 피신고자가 신고를 볼 수 있으면 보복이
--      가능해지고, 그러면 아무도 신고하지 않는다.
--   3) **운영자 함수는 운영자만.** is_admin() 이 유일한 관문이다.
--   4) **사유 없는 강제 조작이 남지 않는다.** note 는 필수다.
--
-- 차단만 검사하면 "아무도 못 쓰는 기능"도 초록불이 되므로, 되는 경우를 항상
-- 짝으로 붙인다.

begin;
select plan(22);

insert into auth.users (id, email, encrypted_password, email_confirmed_at, aud, role,
                        confirmation_token, recovery_token, email_change,
                        email_change_token_new, email_change_token_current,
                        phone_change, phone_change_token, reauthentication_token,
                        raw_app_meta_data, raw_user_meta_data)
values
  ('50000000-0000-0000-0000-00000000000a','sf@t.co','x',now(),'authenticated','authenticated','','','','','','','','','{}'::jsonb,'{}'::jsonb),
  ('50000000-0000-0000-0000-00000000000b','sm@t.co','x',now(),'authenticated','authenticated','','','','','','','','','{}'::jsonb,'{}'::jsonb),
  ('50000000-0000-0000-0000-00000000000c','sa@t.co','x',now(),'authenticated','authenticated','','','','','','','','','{}'::jsonb,'{}'::jsonb);

insert into profiles (id, gender, hub_id, company_email, email_verified_at, name, birth, job,
                      onboarding_step, terms_agreed_at, privacy_agreed_at, role)
values
  ('50000000-0000-0000-0000-00000000000a','female','gangnam','sf@t.co',now(),'에스여','1994-02-02','디자이너',7,now(),now(),'member'),
  ('50000000-0000-0000-0000-00000000000b','male',  'gangnam','sm@t.co',now(),'에스남','1992-03-03','엔지니어',7,now(),now(),'member'),
  ('50000000-0000-0000-0000-00000000000c','male',  'gangnam','sa@t.co',now(),'운영자','1990-01-01','운영',   7,now(),now(),'admin');

-- ─────────────── is_admin ───────────────

set local role authenticated;
set local request.jwt.claims = '{"sub":"50000000-0000-0000-0000-00000000000b"}';
select is(is_admin(), false, 'T1 일반 회원은 운영자가 아니다');

set local request.jwt.claims = '{"sub":"50000000-0000-0000-0000-00000000000c"}';
select is(is_admin(), true,  'T2 role=admin 은 운영자다');

-- ─────────────── 차단 ───────────────

set local request.jwt.claims = '{"sub":"50000000-0000-0000-0000-00000000000b"}';

select lives_ok(
  $$ select block_user('50000000-0000-0000-0000-00000000000a', 'test') $$,
  'T3 차단할 수 있다'
);
select ok(
  is_excluded('50000000-0000-0000-0000-00000000000b','50000000-0000-0000-0000-00000000000a'),
  'T4 차단하면 영구 배제된다'
);
select ok(
  is_excluded('50000000-0000-0000-0000-00000000000a','50000000-0000-0000-0000-00000000000b'),
  'T5 배제는 대칭이다 (상대 방향에서도 성립)'
);
select throws_ok(
  $$ select block_user('50000000-0000-0000-0000-00000000000b') $$,
  '42501', null,
  'T6 자기 자신은 차단할 수 없다'
);

-- ─────────────── 신고 ───────────────

set local request.jwt.claims = '{"sub":"50000000-0000-0000-0000-00000000000a"}';

select throws_ok(
  $$ select report_content('50000000-0000-0000-0000-00000000000a','profile','자기신고') $$,
  '42501', null,
  'T7 자기 자신은 신고할 수 없다'
);
select throws_ok(
  $$ select report_content('50000000-0000-0000-0000-00000000000b','message','메시지없음') $$,
  '22023', null,
  'T8 메시지 신고인데 message_id 가 없으면 거부한다'
);
select lives_ok(
  $$ select report_content('50000000-0000-0000-0000-00000000000b','profile','부적절한 소개글') $$,
  'T9 프로필을 신고할 수 있다'
);
select is(
  (select state::text from content_reports
    where reporter_id = '50000000-0000-0000-0000-00000000000a'),
  'pending',
  'T10 신고는 pending 으로 시작한다'
);
select ok(
  is_excluded('50000000-0000-0000-0000-00000000000a','50000000-0000-0000-0000-00000000000b'),
  'T11 신고하면 즉시 차단 효과가 난다'
);

-- ─────────────── 신고자는 드러나지 않는다 ───────────────

select is(
  (select count(*)::int from content_reports),
  1,
  'T12 신고자는 자기 신고를 본다'
);

set local request.jwt.claims = '{"sub":"50000000-0000-0000-0000-00000000000b"}';
select is(
  (select count(*)::int from content_reports),
  0,
  'T13 **피신고자에게는 보이지 않는다** (보복 차단)'
);

set local request.jwt.claims = '{"sub":"50000000-0000-0000-0000-00000000000c"}';
select is(
  (select count(*)::int from content_reports),
  1,
  'T14 운영자는 모든 신고를 본다'
);

-- ─────────────── 운영자 처리 ───────────────

set local request.jwt.claims = '{"sub":"50000000-0000-0000-0000-00000000000b"}';
select throws_ok(
  format($$ select resolve_content_report(%L, true, '처리') $$,
         (select id from content_reports limit 1)),
  '42501', null,
  'T15 일반 회원은 신고를 처리할 수 없다'
);

set local request.jwt.claims = '{"sub":"50000000-0000-0000-0000-00000000000c"}';
select throws_ok(
  format($$ select resolve_content_report(%L, true, '   ') $$,
         (select id from content_reports limit 1)),
  '22023', null,
  'T16 **사유 없이는 처리할 수 없다**'
);
select lives_ok(
  format($$ select resolve_content_report(%L, true, '소개글에 연락처가 적혀 있었음') $$,
         (select id from content_reports limit 1)),
  'T17 운영자는 사유와 함께 처리할 수 있다'
);
select is(
  (select state::text from content_reports limit 1),
  'confirmed',
  'T18 인정하면 confirmed 가 된다'
);
select is(
  (select count(*)::int from admin_actions where kind = 'resolve_report'),
  1,
  'T19 처리는 admin_actions 에 남는다'
);
select throws_ok(
  format($$ select resolve_content_report(%L, false, '재처리 시도') $$,
         (select id from content_reports limit 1)),
  'P0002', null,
  'T20 이미 처리된 신고는 다시 처리할 수 없다'
);

-- ─────────────── 직접 쓰기는 막힌다 ───────────────
--
-- INSERT 정책을 두지 않았으므로 함수를 거치지 않은 삽입은 불가능해야 한다.
-- "정책 없음 = 불가능" 이 실제로 성립하는지 확인한다.

set local request.jwt.claims = '{"sub":"50000000-0000-0000-0000-00000000000b"}';
select throws_ok(
  $$ insert into content_reports (reporter_id, accused_id, kind, detail)
     values ('50000000-0000-0000-0000-00000000000b',
             '50000000-0000-0000-0000-00000000000a','profile','직접삽입') $$,
  null, null,
  'T21 신고를 직접 INSERT 할 수 없다'
);
select throws_ok(
  $$ insert into admin_actions (actor_id, kind, note)
     values ('50000000-0000-0000-0000-00000000000b','ban','직접삽입') $$,
  null, null,
  'T22 감사 로그를 직접 INSERT 할 수 없다'
);

select * from finish();
rollback;
