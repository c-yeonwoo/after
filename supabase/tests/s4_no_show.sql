-- S4 — 노쇼 확인·제명 전이(P4) 부정 테스트
--
-- 실행: supabase test db
--
-- "단일 미검증 신고로 즉시 제명하지 않는다"는 원칙이 실제로 지켜지는지가
-- 이 파일의 핵심이다: 신고 그 자체(report_no_show)는 아무 효과가 없고,
-- 반드시 상대의 인정 또는 확인 기한 만료(무응답)를 거쳐야만 제명·재발급이
-- 일어난다(apply_no_show_confirmed). 그 경로를 아무 롤에도 직접 열어두지
-- 않았다는 것도 함께 검증한다.

begin;
select plan(12);

-- ═══════════════════════════ 픽스처 ═══════════════════════════

insert into auth.users (id, instance_id, aud, role, email, encrypted_password, created_at, updated_at)
values
  ('cccc0001-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000000',
   'authenticated', 'authenticated', 'f4@corp.example', '', now(), now()),
  ('cccc0002-0000-0000-0000-000000000002', '00000000-0000-0000-0000-000000000000',
   'authenticated', 'authenticated', 'm4@corp.example', '', now(), now()),
  ('cccc0003-0000-0000-0000-000000000003', '00000000-0000-0000-0000-000000000000',
   'authenticated', 'authenticated', 'x4@corp.example', '', now(), now());

-- 동의 컬럼(S6)이 없으면 eligible_profiles 를 통과하지 못한다.
insert into profiles (id, gender, hub_id, company_email, email_verified_at, onboarding_step, name,
                      terms_agreed_at, privacy_agreed_at, agreed_policy_version)
values
  ('cccc0001-0000-0000-0000-000000000001', 'female', 'gangnam', 'f4@corp.example', now(), 7, '가희', now(), now(), '2026-08-01'),
  ('cccc0002-0000-0000-0000-000000000002', 'male',   'gangnam', 'm4@corp.example', now(), 7, '도윤', now(), now(), '2026-08-01'),
  ('cccc0003-0000-0000-0000-000000000003', 'male',   'gangnam', 'x4@corp.example', now(), 7, '제3자', now(), now(), '2026-08-01');

insert into affinities (from_id, to_id, verdict) values
  ('cccc0001-0000-0000-0000-000000000001', 'cccc0002-0000-0000-0000-000000000002', 'like');

select issue_ticket('cccc0002-0000-0000-0000-000000000002', 'pay_test_s4_0001', 30000);

set local "request.jwt.claims" to '{"sub":"cccc0002-0000-0000-0000-000000000002","role":"authenticated"}';
/*
  v2(s20): 소개는 운영자 큐에서 나오고 열람에 **소개 티켓 1장**을 쓴다.
  v1 은 호감만 있으면 open_intro() 가 열렸지만 이제 전제가 둘 더 붙는다.
  curated_by 는 이 픽스처에 운영자가 없어 남성 자신으로 둔다(검사 대상이 아니다).
*/
insert into intro_queue (male_id, female_id, position, curated_by, delivered_at, expires_at)
values ('cccc0002-0000-0000-0000-000000000002', 'cccc0001-0000-0000-0000-000000000001', 1, 'cccc0002-0000-0000-0000-000000000002', now(), now() + interval '3 weeks');
select issue_ticket('cccc0002-0000-0000-0000-000000000002', 'intro_s4_a', 5000, 'intro');
select open_intro();
select use_meeting_ticket(
  (select id from intros where male_id = 'cccc0002-0000-0000-0000-000000000002')
);

set local "request.jwt.claims" to '{"sub":"cccc0001-0000-0000-0000-000000000001","role":"authenticated"}';
select submit_meeting_prefs(
  (select id from meetings where intro_id =
    (select id from intros where male_id = 'cccc0002-0000-0000-0000-000000000002')),
  '{"dates":["2026-08-10"],"area":"역삼","food":"상관없어요"}'::jsonb
);

set local "request.jwt.claims" to '{"sub":"cccc0002-0000-0000-0000-000000000002","role":"authenticated"}';
select confirm_meeting(
  (select id from meetings where intro_id =
    (select id from intros where male_id = 'cccc0002-0000-0000-0000-000000000002')),
  now() + interval '3 days', '역삼 어딘가', 'dinner'
);


-- ═════════ T1 — 참가자만 노쇼를 신고할 수 있다 ═════════

set local "request.jwt.claims" to '{"sub":"cccc0003-0000-0000-0000-000000000003","role":"authenticated"}';
set local role authenticated;
select throws_ok(
  $$ select report_no_show(
       (select id from meetings where intro_id =
         (select id from intros where male_id = 'cccc0002-0000-0000-0000-000000000002')) ) $$,
  '42501',
  null,
  'T1: 참가자가 아니면 노쇼를 신고할 수 없다'
);
reset role;


-- ═════════ T2 — 참가자는 신고할 수 있고, 신고 자체는 아무 효과가 없다 ═════════

set local "request.jwt.claims" to '{"sub":"cccc0001-0000-0000-0000-000000000001","role":"authenticated"}';
set local role authenticated;
select lives_ok(
  $$ select report_no_show(
       (select id from meetings where intro_id =
         (select id from intros where male_id = 'cccc0002-0000-0000-0000-000000000002')) ) $$,
  'T2: 참가자는 노쇼를 신고할 수 있다'
);
reset role;

select is(
  (select state from no_show_reports
    where reporter_id = 'cccc0001-0000-0000-0000-000000000001'),
  'pending',
  'T3: 신고 직후 상태는 pending 이다'
);

select is(
  (select account_state from profiles where id = 'cccc0002-0000-0000-0000-000000000002'),
  'active',
  'T4: 신고 그 자체만으로는 제명되지 않는다 (단일 미검증 신고 즉시 제명 금지)'
);


-- ═════════ T5 — apply_no_show_confirmed 는 클라이언트에서 직접 부를 수 없다 ═════════

set local "request.jwt.claims" to '{"sub":"cccc0001-0000-0000-0000-000000000001","role":"authenticated"}';
set local role authenticated;
select throws_ok(
  $$ select apply_no_show_confirmed(
       (select id from no_show_reports where reporter_id = 'cccc0001-0000-0000-0000-000000000001') ) $$,
  '42501',
  null,
  'T5: apply_no_show_confirmed 는 어떤 롤에도 EXECUTE 가 없다'
);
reset role;


-- ═════════ T6 — 신고자 본인은 자기 신고에 응답할 수 없다 (피고발자만) ═════════

set local "request.jwt.claims" to '{"sub":"cccc0001-0000-0000-0000-000000000001","role":"authenticated"}';
set local role authenticated;
select throws_ok(
  $$ select respond_no_show(
       (select id from no_show_reports where reporter_id = 'cccc0001-0000-0000-0000-000000000001'),
       true) $$,
  '42501',
  null,
  'T6: 신고자 본인은 응답할 수 없다'
);
reset role;


-- ═════════ T7 — 피고발자가 부인하면 기각되고, 제명되지 않는다 ═════════

set local "request.jwt.claims" to '{"sub":"cccc0002-0000-0000-0000-000000000002","role":"authenticated"}';
set local role authenticated;
select lives_ok(
  $$ select respond_no_show(
       (select id from no_show_reports where reporter_id = 'cccc0001-0000-0000-0000-000000000001'),
       false) $$,
  'T7: 피고발자는 부인으로 응답할 수 있다'
);
reset role;

select is(
  (select state from no_show_reports
    where reporter_id = 'cccc0001-0000-0000-0000-000000000001'),
  'dismissed',
  'T8: 부인하면 기각(dismissed)된다'
);

select is(
  (select account_state from profiles where id = 'cccc0002-0000-0000-0000-000000000002'),
  'active',
  'T9: 기각된 신고는 제명으로 이어지지 않는다'
);


-- ═════════ T10 — 확인 기한이 지나면 스윕이 자동으로 확정한다 ═════════
-- (같은 신고자는 같은 만남을 두 번 신고할 수 없으므로 — unique(meeting_id,
-- reporter_id) — 이번엔 남성 쪽이 여성을 신고한다. 같은 만남을 재사용한다.)

set local "request.jwt.claims" to '{"sub":"cccc0002-0000-0000-0000-000000000002","role":"authenticated"}';
set local role authenticated;
select report_no_show(
  (select id from meetings where intro_id =
    (select id from intros where male_id = 'cccc0002-0000-0000-0000-000000000002'))
);
reset role;

-- 확인 기한을 이미 지난 것으로 되돌린다 (superuser 로, RLS 우회)
update no_show_reports set confirm_by = now() - interval '1 minute'
 where reporter_id = 'cccc0002-0000-0000-0000-000000000002' and state = 'pending';

select expire_unanswered_no_show_reports();

select is(
  (select state from no_show_reports where reporter_id = 'cccc0002-0000-0000-0000-000000000002'),
  'confirmed',
  'T10: 확인 기한 만료 후 스윕이 자동으로 확정한다'
);

select is(
  (select account_state from profiles where id = 'cccc0001-0000-0000-0000-000000000001'),
  'banned',
  'T11: 확정되면 노쇼자가 영구 제명된다'
);

select is(
  (select count(*)::int from tickets
    where user_id = 'cccc0002-0000-0000-0000-000000000002' and price_krw = 0),
  1,
  'T12: 확정되면 피해자에게 티켓이 재발급된다'
);


select * from finish();
rollback;
