-- S48 — 프로필은 서버가 만든다
--
-- 지금까지의 권한 검사는 전부 "못 한다" 쪽이었다(s28 · s32). 그래서 s28b 가
-- 가입 RPC 의 실행 권한까지 거둬 갔을 때 아무 검사도 울리지 않았다. 마지막
-- 검사(T14)는 반대 방향이다 — 화면이 부르는 RPC 는 로그인 사용자가 **반드시**
-- 실행할 수 있어야 한다. 목록은 `grep -rhoE 'rpc\("[a-z_0-9]+"' src` 의 결과다.
-- 화면에 RPC 를 새로 붙이면 여기에도 한 줄 더한다.

begin;
select plan(14);

insert into auth.users (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at, created_at, updated_at)
values
  ('48000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000000',
   'authenticated', 'authenticated', 'Member48@Corp.Example', '', now(), now(), now()),
  ('48000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-000000000000',
   'authenticated', 'authenticated', 'someone48@gmail.com', '', now(), now(), now()),
  ('48000000-0000-0000-0000-000000000003', '00000000-0000-0000-0000-000000000000',
   'authenticated', 'authenticated', 'unconfirmed48@corp.example', '', null, now(), now()),
  ('48000000-0000-0000-0000-000000000004', '00000000-0000-0000-0000-000000000000',
   'authenticated', 'authenticated', 'stuck48@corp.example', '', now(), now(), now());

-- 막혀 있던 기간에 생긴 계정: 프로필은 있는데 인증 시각이 비었다.
insert into profiles (id, gender, hub_id, company_email, email_verified_at)
values ('48000000-0000-0000-0000-000000000004', 'female', 'gangnam', 'stuck48@corp.example', null);

-- ─────────── ① 직접 INSERT 는 닫혀 있다 ───────────

set local role authenticated;
set local request.jwt.claims = '{"sub":"48000000-0000-0000-0000-000000000001","role":"authenticated"}';

select throws_ok(
  $$ insert into profiles (id, gender, hub_id, company_email, role, email_verified_at)
     values ('48000000-0000-0000-0000-000000000001', 'male', 'gangnam',
             'member48@corp.example', 'admin', now()) $$,
  '42501', null,
  'T1 로그인 사용자는 profiles 에 직접 INSERT 할 수 없다 (role=admin 자기 선언 차단)'
);

-- ─────────── 프로필 생성 ───────────

select lives_ok(
  $$ select create_my_profile('male', 'gangnam') $$,
  'T2 회사 메일로 확인된 사용자는 프로필을 만든다'
);
reset role;

select results_eq(
  $$ select role, company_email, email_verified_at is not null, account_state::text
       from profiles where id = '48000000-0000-0000-0000-000000000001' $$,
  $$ values ('member'::text, 'member48@corp.example'::text, true, 'active'::text) $$,
  'T3 role 은 member, 회사 메일은 auth 주소(소문자), 인증 시각은 auth 에서 온다'
);

set local role authenticated;
set local request.jwt.claims = '{"sub":"48000000-0000-0000-0000-000000000001","role":"authenticated"}';
select is(is_admin(), false, 'T4 새 프로필은 운영자가 아니다');

select is(
  (select gender::text from create_my_profile('female', 'pangyo')),
  'male',
  'T5 다시 불러도 기존 프로필을 돌려준다 — 성별·권역은 바뀌지 않는다'
);
reset role;
select is(
  (select count(*)::int from profiles where id = '48000000-0000-0000-0000-000000000001'),
  1, 'T6 두 번 불러도 프로필은 하나다'
);

set local role authenticated;
set local request.jwt.claims = '{"sub":"48000000-0000-0000-0000-000000000002","role":"authenticated"}';
select throws_ok(
  $$ select create_my_profile('male', 'gangnam') $$,
  '22023', 'personal email not allowed',
  'T7 개인 메일 OTP 로 얻은 세션은 프로필을 만들 수 없다'
);

set local request.jwt.claims = '{"sub":"48000000-0000-0000-0000-000000000003","role":"authenticated"}';
select throws_ok(
  $$ select create_my_profile('male', 'gangnam') $$,
  '42501', 'email not confirmed',
  'T8 메일 확인 전에는 프로필을 만들 수 없다'
);

-- ─────────── ② 인증 동기화 ───────────

set local request.jwt.claims = '{"sub":"48000000-0000-0000-0000-000000000004","role":"authenticated"}';
select is(
  (select email_verified_at is not null from create_my_profile('female', 'gangnam')),
  true,
  'T9 막혔던 계정이 다시 인증하면 비어 있던 인증 시각이 채워진다'
);

set local request.jwt.claims = '{"sub":"48000000-0000-0000-0000-000000000001","role":"authenticated"}';
select lives_ok(
  $$ select sync_email_verified() $$,
  'T10 로그인 사용자는 sync_email_verified 를 실행할 수 있다'
);

set local request.jwt.claims = '{"sub":"48000000-0000-0000-0000-000000000002","role":"authenticated"}';
select throws_ok(
  $$ select sync_email_verified() $$,
  '22023', 'personal email not allowed',
  'T11 개인 메일 세션은 회사 인증 시각을 얻지 못한다'
);
reset role;

-- ─────────── ③ 도메인 판정 ───────────

select results_eq(
  $$ select is_company_email(e) from unnest(array[
       'a@corp.example', 'A@GMAIL.COM', ' b@naver.com ', 'c@localhost', 'no-at-sign', null
     ]) as e $$,
  $$ values (true), (false), (false), (false), (false), (false) $$,
  'T12 회사 도메인만 통과한다 (대소문자·공백·점 없는 도메인·빈 값)'
);

-- ─────────── ④ 큐는 함수로만 읽는다 ───────────

select ok(
  not has_table_privilege('authenticated', 'intro_queue', 'SELECT'),
  'T13 로그인 사용자는 intro_queue 를 직접 읽을 수 없다 (운영자 메모·상대 id 비노출)'
);

-- ─────────── 양성 표면: 화면이 부르는 RPC 는 실행할 수 있어야 한다 ───────────

select is_empty(
  $$ select fe.n
       from unnest(array[
         'admin_cancel_meeting','admin_curation_targets','admin_curator_stats','admin_dashboard',
         'admin_fulfill_order','admin_like_pool','admin_marketplace_health','admin_meetings',
         'admin_member_detail','admin_members','admin_no_show_reports','admin_operational_health',
         'admin_photo_queue','admin_queue','admin_reports','admin_set_queue_reason',
         'admin_reset_photo','admin_resolve_no_show','admin_retry_notifications','admin_review_photo',
         'admin_set_account_state','admin_set_payments','admin_set_queue','admin_system_overview',
         'admin_ticket_orders','block_user','confirm_meeting','create_my_profile','create_ticket_order',
         'decline_meeting','get_public_profile','get_public_profiles','home_state','intro_teaser','is_admin',
         'mark_met','next_candidate','open_intro','pass_intro','record_consent','remaining_candidates',
         'report_content','report_no_show','request_notification_email','resolve_content_report',
         'respond_no_show','set_paused','submit_meeting_prefs','sync_email_verified','ticket_bundles',
         'unlink_my_kakao_identity','use_meeting_ticket','verify_notification_email','withdraw_account'
       ]) as fe(n)
      where not exists (
        select 1 from pg_proc p
         where p.pronamespace = 'public'::regnamespace
           and p.proname = fe.n
           and has_function_privilege('authenticated', p.oid, 'EXECUTE')
      ) $$,
  'T14 화면이 부르는 RPC 54개는 모두 로그인 사용자가 실행할 수 있다'
);

select * from finish();
rollback;
