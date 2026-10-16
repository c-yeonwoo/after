-- 통신사 본인확인: 서버 전용 완료 처리, 연령/중복/주문 게이트.
begin;
select plan(12);

insert into auth.users (id, instance_id, aud, role, email, encrypted_password,
                        email_confirmed_at, created_at, updated_at)
values
  ('58000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-000000000000',
   'authenticated', 'authenticated', 'carrier58a@corp.example', '', now(), now(), now()),
  ('58000000-0000-0000-0000-0000000000a2', '00000000-0000-0000-0000-000000000000',
   'authenticated', 'authenticated', 'carrier58b@corp.example', '', now(), now(), now());
insert into profiles(id, gender, hub_id, company_email, email_verified_at, name, birth, job)
values
  ('58000000-0000-0000-0000-0000000000a1', 'male', 'gangnam', 'carrier58a@corp.example', now(), '테스트', '1990-01-01', '기획'),
  ('58000000-0000-0000-0000-0000000000a2', 'male', 'gangnam', 'carrier58b@corp.example', now(), '테스트', '1990-01-01', '개발');

select ok(not has_function_privilege('authenticated',
  'finish_carrier_identity(uuid, text, date, text, text)', 'EXECUTE'),
  '회원은 공급자 검증 완료를 직접 선언할 수 없다');

insert into identity_verification_attempts(id, user_id) values
  ('av11111111111111111111111111111111', '58000000-0000-0000-0000-0000000000a1'),
  ('av22222222222222222222222222222222', '58000000-0000-0000-0000-0000000000a2'),
  ('av33333333333333333333333333333333', '58000000-0000-0000-0000-0000000000a2');

select throws_ok($$ select finish_carrier_identity(
  '58000000-0000-0000-0000-0000000000a2', 'av22222222222222222222222222222222',
  (current_date - interval '18 years')::date, '+821022222222', 'DI-B') $$,
  '22023', 'adult only', '미성년 인증 결과는 거절한다');
select ok((select consumed_at is null from identity_verification_attempts
  where id = 'av22222222222222222222222222222222'), '거절된 시도는 소모되지 않는다');

select is((select phone from finish_carrier_identity(
  '58000000-0000-0000-0000-0000000000a1', 'av11111111111111111111111111111111',
  '1990-01-01', '+821011111111', 'DI-A')),
  '+821011111111', '공급자 결과로만 번호를 기록한다');
select ok((select identity_verified_at is not null and birth = '1990-01-01'
  from profiles where id = '58000000-0000-0000-0000-0000000000a1'),
  '검증 시각과 생년월일을 기록한다');
set local role authenticated;
set local request.jwt.claims = '{"sub":"58000000-0000-0000-0000-0000000000a1","role":"authenticated"}';
select throws_ok($$ update profiles set birth = '1980-01-01'
  where id = '58000000-0000-0000-0000-0000000000a1' $$,
  '42501', 'verified identity is immutable', '회원은 검증된 생년월일을 바꿀 수 없다');
reset role;
select throws_ok($$ select finish_carrier_identity(
  '58000000-0000-0000-0000-0000000000a1', 'av11111111111111111111111111111111',
  '1990-01-01', '+821011111111', 'DI-A') $$,
  'P0002', 'verification attempt expired', '인증 ID는 재사용할 수 없다');

select throws_ok($$ select finish_carrier_identity(
  '58000000-0000-0000-0000-0000000000a2', 'av22222222222222222222222222222222',
  '1990-01-01', '+821022222222', 'DI-A') $$,
  '23505', 'identity already in use', '동일 DI로 다른 계정 인증을 막는다');
select throws_ok($$ select finish_carrier_identity(
  '58000000-0000-0000-0000-0000000000a2', 'av33333333333333333333333333333333',
  '1990-01-01', '+821011111111', 'DI-B') $$,
  '23505', 'phone in use', '동일 번호로 다른 계정 인증을 막는다');

update app_settings set identity_required = true where id;
select throws_ok($$ insert into ticket_orders(order_id, user_id, amount, quantity, kind)
  values ('s58-unverified', '58000000-0000-0000-0000-0000000000a2', 30000, 1, 'meeting') $$,
  '42501', 'carrier adult verification required', '게이트를 켜면 미인증 주문은 DB가 거절한다');
select lives_ok($$ insert into ticket_orders(order_id, user_id, amount, quantity, kind)
  values ('s58-verified', '58000000-0000-0000-0000-0000000000a1', 30000, 1, 'meeting') $$,
  '인증된 성인의 주문은 통과한다');

update profiles set account_state = 'withdrawn'
 where id = '58000000-0000-0000-0000-0000000000a1';
select ok((select identity_verified_at is null and identity_verification_id is null
  from profiles where id = '58000000-0000-0000-0000-0000000000a1')
  and not exists(select 1 from carrier_identity_links
    where user_id = '58000000-0000-0000-0000-0000000000a1'),
  '탈퇴하면 본인확인 메타데이터와 DI 해시를 파기한다');

select * from finish();
rollback;
