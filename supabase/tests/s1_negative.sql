-- S1 — RLS 부정 테스트
--
-- 실행: supabase test db
--
-- 이 파일이 S2~S4 구현의 **스펙**이다. 저렴한 모델에게 넘기는 것은
-- "구현"이 아니라 "이 테스트를 통과시키는 일"이다.
--
-- 진단에서 라이브로 재현된 우회로 2건이 T1·T2·T3 으로 고정돼 있다.
-- 대조군(T6)이 함께 있는 이유: 항상 실패하는 테스트는 아무것도 증명하지 못한다.
-- 실제로 이 진단에서 leaf 전용 순회 때문에 대비 실패를 과소보고한 사고가 있었다.

begin;
select plan(15);

-- ═══════════════════════════ 픽스처 ═══════════════════════════
-- superuser 로 삽입한다 (RLS 우회). 역할 전환은 각 테스트에서만.

insert into auth.users (id, instance_id, aud, role, email, encrypted_password, created_at, updated_at)
values
  ('aaaa0001-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000000',
   'authenticated', 'authenticated', 'f1@corp.example', '', now(), now()),
  ('bbbb0001-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000000',
   'authenticated', 'authenticated', 'm1@corp.example', '', now(), now()),
  ('bbbb0002-0000-0000-0000-000000000002', '00000000-0000-0000-0000-000000000000',
   'authenticated', 'authenticated', 'm2@corp.example', '', now(), now());

-- 동의 컬럼(S6)이 없으면 eligible_profiles 를 통과하지 못한다.
insert into profiles (id, gender, hub_id, company_email, email_verified_at, onboarding_step, name,
                      terms_agreed_at, privacy_agreed_at, agreed_policy_version)
values
  ('aaaa0001-0000-0000-0000-000000000001', 'female', 'gangnam', 'f1@corp.example', now(), 7, '하나', now(), now(), '2026-08-01'),
  ('bbbb0001-0000-0000-0000-000000000001', 'male',   'gangnam', 'm1@corp.example', now(), 7, '연우', now(), now(), '2026-08-01'),
  ('bbbb0002-0000-0000-0000-000000000002', 'male',   'gangnam', 'm2@corp.example', now(), 7, '민호', now(), now(), '2026-08-01');

-- F1 이 두 남성에게 호감 (D2: 여성 선행)
insert into affinities (from_id, to_id, verdict) values
  ('aaaa0001-0000-0000-0000-000000000001', 'bbbb0001-0000-0000-0000-000000000001', 'like'),
  ('aaaa0001-0000-0000-0000-000000000001', 'bbbb0002-0000-0000-0000-000000000002', 'like');

-- M1 에게만 티켓 1장 (결제 웹훅 경로). M2 는 0장.
select issue_ticket('bbbb0001-0000-0000-0000-000000000001', 'pay_test_0001', 30000);

-- M1 의 소개를 연다 (auth.uid() 는 GUC 를 읽으므로 superuser 로도 함수 경로를 그대로 탄다)
set local "request.jwt.claims" to '{"sub":"bbbb0001-0000-0000-0000-000000000001","role":"authenticated"}';
select open_intro();


-- ═════════ T1 — 비소유자가 티켓을 차감할 수 없다 ═════════

-- (a) M2 가 M1 의 소개에 대해 티켓을 쓰려 한다
set local "request.jwt.claims" to '{"sub":"bbbb0002-0000-0000-0000-000000000002","role":"authenticated"}';
set local role authenticated;

select throws_ok(
  $$ select use_meeting_ticket(
       (select id from intros where male_id = 'bbbb0001-0000-0000-0000-000000000001') ) $$,
  '42501',
  null,
  'T1a: 남의 소개에 티켓을 쓸 수 없다'
);

-- (b) 클라이언트가 tickets 를 직접 UPDATE 할 수 없다 (정책이 아예 없다)
select throws_ok(
  $$ update tickets set state = 'unused', used_at = null $$,
  '42501',
  null,
  'T1b: authenticated 는 tickets 를 직접 UPDATE 할 수 없다'
);

reset role;


-- ═════════ T5 — 티켓 0장에서 사용 불가 ═════════
-- (T1 의 소개 소유권 검사와 분리하기 위해 M2 자신의 소개를 만든다)

set local "request.jwt.claims" to '{"sub":"bbbb0002-0000-0000-0000-000000000002","role":"authenticated"}';
select open_intro();

set local role authenticated;
select throws_ok(
  $$ select use_meeting_ticket(
       (select id from intros where male_id = 'bbbb0002-0000-0000-0000-000000000002') ) $$,
  'P0002',
  null,
  'T5: 미사용 티켓이 없으면 차감이 실패한다'
);
reset role;


-- ═════════ 정상 경로로 만남을 하나 만든다 (T2·T3 의 무대) ═════════

set local "request.jwt.claims" to '{"sub":"bbbb0001-0000-0000-0000-000000000001","role":"authenticated"}';
select use_meeting_ticket(
  (select id from intros where male_id = 'bbbb0001-0000-0000-0000-000000000001')
);

-- ═════════ T2 — 게이트가 열리기 전에는 메시지를 넣을 수 없다 ═════════

set local role authenticated;

-- (a) 선호 응답 제출 전에는 조율 채널도 닫혀 있다
select throws_ok(
  format($$ insert into messages (meeting_id, sender_id, channel, body)
            values (%L, 'bbbb0001-0000-0000-0000-000000000001', 'coord', '언제 괜찮으세요?') $$,
         (select id from meetings where intro_id = (select id from intros where male_id = 'bbbb0001-0000-0000-0000-000000000001'))),
  '42501',
  null,
  'T2a: 선호 응답 제출 전에는 조율 채널이 닫혀 있다'
);

-- (b) 사적 채널은 private_opens_at 이전에는 닫혀 있다
select throws_ok(
  format($$ insert into messages (meeting_id, sender_id, channel, body)
            values (%L, 'bbbb0001-0000-0000-0000-000000000001', 'private', '내일 봬요') $$,
         (select id from meetings where intro_id = (select id from intros where male_id = 'bbbb0001-0000-0000-0000-000000000001'))),
  '42501',
  null,
  'T2b: 사적 채널은 오픈 시각 이전에 닫혀 있다'
);

reset role;


-- ═════════ T3 — 타인·타역할이 선호 응답을 제출할 수 없다 ═════════
-- 진단에서 재현된 우회로 ②: 남성이 여성 전용 /prefs 를 제출해 게이트를 켰다.

set local "request.jwt.claims" to '{"sub":"bbbb0001-0000-0000-0000-000000000001","role":"authenticated"}';
set local role authenticated;

select throws_ok(
  format($$ select submit_meeting_prefs(%L, '{"dates":["2026-08-05"],"area":"역삼"}'::jsonb) $$,
         (select id from meetings where intro_id = (select id from intros where male_id = 'bbbb0001-0000-0000-0000-000000000001'))),
  '42501',
  null,
  'T3: 남성 당사자는 선호 응답을 제출할 수 없다 (여성 전용)'
);

-- 제3자도 당연히 안 된다
set local "request.jwt.claims" to '{"sub":"bbbb0002-0000-0000-0000-000000000002","role":"authenticated"}';
select throws_ok(
  format($$ select submit_meeting_prefs(%L, '{"dates":["2026-08-05"]}'::jsonb) $$,
         (select id from meetings where intro_id = (select id from intros where male_id = 'bbbb0001-0000-0000-0000-000000000001'))),
  '42501',
  null,
  'T3b: 제3자는 선호 응답을 제출할 수 없다'
);

reset role;


-- ═════════ T6 — 대조군: 정상 경로는 실제로 통과한다 ═════════
-- 이게 없으면 위의 실패들이 "설정이 틀려서 전부 막힌 것"과 구별되지 않는다.

-- (a) 여성 당사자는 제출할 수 있고, 그 순간 조율 채널이 열린다
set local "request.jwt.claims" to '{"sub":"aaaa0001-0000-0000-0000-000000000001","role":"authenticated"}';
select lives_ok(
  format($$ select submit_meeting_prefs(%L, '{"dates":["2026-08-05"],"area":"역삼"}'::jsonb) $$,
         (select id from meetings where intro_id = (select id from intros where male_id = 'bbbb0001-0000-0000-0000-000000000001'))),
  'T6a: 여성 당사자는 선호 응답을 제출할 수 있다'
);

-- S7: 선호 제출만으로는 대화가 열리지 않는다.
-- 확정 전 조율은 세라가 중개하므로, 채널은 **확정 시점**에 열린다.
set local role authenticated;
select throws_ok(
  format($$ insert into messages (meeting_id, sender_id, channel, body)
            values (%L, 'aaaa0001-0000-0000-0000-000000000001', 'coord', '목요일 좋아요') $$,
         (select id from meetings where intro_id = (select id from intros where male_id = 'bbbb0001-0000-0000-0000-000000000001'))),
  '42501',
  null,
  'T6b: 선호를 제출해도 확정 전에는 조율 채널이 닫혀 있다'
);
reset role;

-- (c) 확정 후 오픈 시각을 지나면 사적 채널이 열린다
set local "request.jwt.claims" to '{"sub":"aaaa0001-0000-0000-0000-000000000001","role":"authenticated"}';
select confirm_meeting(
  (select id from meetings where intro_id = (select id from intros where male_id = 'bbbb0001-0000-0000-0000-000000000001')),
  now() + interval '10 days',
  '어딘가',
  'dinner'
);

-- 대조군: 확정된 뒤에는 조율 채널이 실제로 열려야 한다.
-- (전부 거부하는 설정도 부정 테스트는 통과시키므로 반대편을 반드시 확인한다)
set local role authenticated;
select lives_ok(
  format($$ insert into messages (meeting_id, sender_id, channel, body)
            values (%L, 'aaaa0001-0000-0000-0000-000000000001', 'coord', '그날 뵐게요') $$,
         (select id from meetings where intro_id = (select id from intros where male_id = 'bbbb0001-0000-0000-0000-000000000001'))),
  'T6c: 확정 후에는 조율 채널이 열린다'
);
reset role;

-- ★ 진짜 경계: 확정은 됐지만 오픈 시각 전 → 사적 채널은 아직 닫혀 있어야 한다.
--   T2b 는 미확정 상태(private_opens_at IS NULL)를 검증하므로 이 케이스를 덮지 못한다.
set local role authenticated;
select throws_ok(
  format($$ insert into messages (meeting_id, sender_id, channel, body)
            values (%L, 'aaaa0001-0000-0000-0000-000000000001', 'private', '미리 인사') $$,
         (select id from meetings where intro_id = (select id from intros where male_id = 'bbbb0001-0000-0000-0000-000000000001'))),
  '42501',
  null,
  'T6d: 확정 후에도 오픈 시각 전에는 사적 채널이 닫혀 있다'
);
reset role;

-- 시간을 앞당기는 대신 오픈 시각을 과거로 옮겨 경계의 반대편을 검증한다
update meetings set private_opens_at = now() - interval '1 minute'
 where intro_id = (select id from intros where male_id = 'bbbb0001-0000-0000-0000-000000000001');

set local role authenticated;
select lives_ok(
  format($$ insert into messages (meeting_id, sender_id, channel, body)
            values (%L, 'aaaa0001-0000-0000-0000-000000000001', 'private', '조금 늦을 것 같아요') $$,
         (select id from meetings where intro_id = (select id from intros where male_id = 'bbbb0001-0000-0000-0000-000000000001'))),
  'T6e: 오픈 시각을 지나면 사적 채널이 열린다'
);
reset role;


-- ═════════ T4 — 제외된 쌍은 재큐잉되지 않는다 ═════════

-- M2 가 자기 소개(F1)를 넘긴다 → 영구 배제
set local "request.jwt.claims" to '{"sub":"bbbb0002-0000-0000-0000-000000000002","role":"authenticated"}';
select pass_intro((select id from intros where male_id = 'bbbb0002-0000-0000-0000-000000000002'));

select is(
  (select count(*)::int from intro_exclusions
    where user_lo = least('aaaa0001-0000-0000-0000-000000000001'::uuid,
                          'bbbb0002-0000-0000-0000-000000000002'::uuid)
      and user_hi = greatest('aaaa0001-0000-0000-0000-000000000001'::uuid,
                             'bbbb0002-0000-0000-0000-000000000002'::uuid)),
  1,
  'T4a: 넘기기가 영구 배제를 기록한다 (쌍 단위, 전역 플래그가 아니다)'
);

-- 같은 상대가 다시 큐에 오르지 않는다 → 후보 없음
select throws_ok(
  $$ select open_intro() $$,
  'P0002',
  null,
  'T4b: 배제된 상대는 다시 소개되지 않는다'
);

-- 배제 기록은 지울 수 없다 (append-only)
set local role authenticated;
select throws_ok(
  $$ delete from intro_exclusions $$,
  '42501',
  null,
  'T4c: intro_exclusions 는 삭제할 수 없다 (append-only)'
);
reset role;


select * from finish();
rollback;
