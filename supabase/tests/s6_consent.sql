-- S6 — 가입 동의 게이트 (PRD 266)
--
-- 핵심: 동의하지 않은 계정은 매칭 대상이 되지 않는다. 그리고 그 조건이
-- eligible_profiles 뷰와 RLS 정책 **양쪽**에 들어 있어야 한다 — 버그 3 이
-- 정확히 한쪽에만 조건을 넣어서 생긴 사고였다.

begin;
select plan(6);

insert into auth.users (id, instance_id, aud, role, email, encrypted_password, created_at, updated_at)
values
  ('eeee0001-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000000',
   'authenticated', 'authenticated', 'f6@corp.example', '', now(), now()),
  ('eeee0002-0000-0000-0000-000000000002', '00000000-0000-0000-0000-000000000000',
   'authenticated', 'authenticated', 'm6@corp.example', '', now(), now());

-- 여성은 동의 완료, 남성은 동의 안 함
insert into profiles (id, gender, hub_id, company_email, email_verified_at, onboarding_step, name,
                      terms_agreed_at, privacy_agreed_at, agreed_policy_version)
values ('eeee0001-0000-0000-0000-000000000001', 'female', 'gangnam', 'f6@corp.example', now(), 7, '동의여',
        now(), now(), '2026-08-01');

insert into profiles (id, gender, hub_id, company_email, email_verified_at, onboarding_step, name)
values ('eeee0002-0000-0000-0000-000000000002', 'male', 'gangnam', 'm6@corp.example', now(), 7, '미동의남');

-- ═════════ T1 — 미동의 계정은 eligible_profiles 에 없다 ═════════
select is(
  (select count(*)::int from eligible_profiles where id = 'eeee0002-0000-0000-0000-000000000002'),
  0,
  'T1: 동의하지 않은 계정은 eligible_profiles 에 포함되지 않는다'
);

-- ═════════ T2 — RLS: 여성에게 미동의 남성이 보이지 않는다 (버그 3 재발 방지) ═════════
set local "request.jwt.claims" to '{"sub":"eeee0001-0000-0000-0000-000000000001","role":"authenticated"}';
set local role authenticated;
select is(
  (select count(*)::int from profiles where id = 'eeee0002-0000-0000-0000-000000000002'),
  0,
  'T2: RLS 정책도 동의 여부를 확인한다 (뷰에만 넣으면 버그 3 재발)'
);

-- ═════════ T3 — 미동의 상대에게 호감을 줄 수 없다 ═════════
select throws_ok(
  $$ insert into affinities (from_id, to_id, verdict)
     values ('eeee0001-0000-0000-0000-000000000001','eeee0002-0000-0000-0000-000000000002','like') $$,
  '42501',
  null,
  'T3: 동의하지 않은 상대에게는 호감을 제출할 수 없다'
);
reset role;

-- ═════════ T4 — record_consent 로 동의하면 자격이 생긴다 (대조군) ═════════
set local "request.jwt.claims" to '{"sub":"eeee0002-0000-0000-0000-000000000002","role":"authenticated"}';
select lives_ok(
  $$ select record_consent('2026-08-01') $$,
  'T4: 본인은 동의를 기록할 수 있다'
);

select is(
  (select count(*)::int from eligible_profiles where id = 'eeee0002-0000-0000-0000-000000000002'),
  1,
  'T5: 동의 후에는 eligible_profiles 에 포함된다 (대조군)'
);

-- ═════════ T6 — 동의 후에는 호감 제출이 통과한다 (대조군) ═════════
set local "request.jwt.claims" to '{"sub":"eeee0001-0000-0000-0000-000000000001","role":"authenticated"}';
set local role authenticated;
select lives_ok(
  $$ insert into affinities (from_id, to_id, verdict)
     values ('eeee0001-0000-0000-0000-000000000001','eeee0002-0000-0000-0000-000000000002','like') $$,
  'T6: 동의 후에는 호감 제출이 통과한다 (대조군)'
);
reset role;

select * from finish();
rollback;
