-- S54 — 휴대폰 인증: 번호 하나에 계정 하나

begin;
select plan(12);

insert into auth.users (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at, created_at, updated_at)
values
  ('54000000-0000-0000-0000-0000000000a1','00000000-0000-0000-0000-000000000000','authenticated','authenticated','m54@corp.example','',now(),now(),now()),
  ('54000000-0000-0000-0000-0000000000a2','00000000-0000-0000-0000-000000000000','authenticated','authenticated','m54b@corp.example','',now(),now(),now());

insert into profiles (id, gender, hub_id, company_email, email_verified_at, name, birth, job,
                      onboarding_step, terms_agreed_at, privacy_agreed_at, role, evening_note)
values
  ('54000000-0000-0000-0000-0000000000a1','male','gangnam','m54@corp.example',now(),'남오사','1992-01-01','기획',7,now(),now(),'member','목요일엔 클라이밍'),
  ('54000000-0000-0000-0000-0000000000a2','male','gangnam','m54b@corp.example',now(),'남오사비','1991-01-01','개발',7,now(),now(),'member',null);

update profiles set photo_paths = array[id::text || '/1.webp', id::text || '/2.webp', id::text || '/3.webp']
 where id::text like '54000000-%';
update profiles set photo_state = 'approved' where id::text like '54000000-%';

select ok(not exists (select 1 from eligible_profiles where id = '54000000-0000-0000-0000-0000000000a1'),
  'T1 휴대폰 인증 전에는 소개 대상이 아니다');

select ok(not has_function_privilege('authenticated', 'issue_phone_code(uuid, text)', 'EXECUTE'),
  'T2 코드 발급은 회원이 직접 부를 수 없다 (코드 원문을 돌려준다)');
select ok(has_function_privilege('service_role', 'issue_phone_code(uuid, text)', 'EXECUTE'),
  'T2b Edge Function(service_role)은 코드를 발급할 수 있다');

-- 서버(service_role 자리)가 코드를 발급한다
create temp table issued as
  select issue_phone_code('54000000-0000-0000-0000-0000000000a1', '+821012345678') as code;
grant select on issued to authenticated;
select matches((select code from issued), '^[0-9]{6}$', 'T3 여섯 자리 코드를 만든다');
select is((select count(*)::int from phone_codes
            where user_id = '54000000-0000-0000-0000-0000000000a1' and code_hash = (select code from issued)),
  0, 'T4 코드 원문은 저장하지 않는다 (해시만)');

select throws_ok(
  $$ select issue_phone_code('54000000-0000-0000-0000-0000000000a1', '+821012345678') $$,
  'P0001', 'too soon', 'T5 60초 안에 다시 보내지 않는다');

set local role authenticated;
set local request.jwt.claims = '{"sub":"54000000-0000-0000-0000-0000000000a1","role":"authenticated"}';

select throws_ok(
  $$ select verify_phone_code('+821012345678', '000000') $$,
  '22023', 'wrong code', 'T6 틀린 코드는 받지 않는다');
select throws_ok(
  $$ update profiles set phone = '+821099999999' where id = '54000000-0000-0000-0000-0000000000a1' $$,
  '42501', null, 'T7 번호는 직접 고칠 수 없다');
select is(
  (select phone from verify_phone_code('+821012345678', (select code from issued))),
  '+821012345678', 'T8 맞는 코드면 번호가 인증된다');
reset role;

select ok(exists (select 1 from eligible_profiles where id = '54000000-0000-0000-0000-0000000000a1'),
  'T9 인증하면 소개 대상이 된다');

select throws_ok(
  $$ select issue_phone_code('54000000-0000-0000-0000-0000000000a2', '+821012345678') $$,
  '23505', 'phone in use', 'T10 다른 계정이 인증한 번호로는 받을 수 없다');

update profiles set account_state = 'withdrawn' where id = '54000000-0000-0000-0000-0000000000a1';
select is(
  (select row(phone, phone_verified_at, evening_note)::text from profiles
    where id = '54000000-0000-0000-0000-0000000000a1'),
  row(null::text, null::timestamptz, null::text)::text,
  'T11 탈퇴하면 번호와 인터뷰 답이 지워진다');

select * from finish();
rollback;
