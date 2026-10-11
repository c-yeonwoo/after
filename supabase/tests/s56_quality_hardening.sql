-- S56 — 실패 횟수는 커밋되고, 중복 사진·탈퇴 토큰 잔존은 막힌다.

begin;
select plan(9);

insert into auth.users (id, instance_id, aud, role, email, encrypted_password,
                        email_confirmed_at, created_at, updated_at)
values ('56000000-0000-0000-0000-0000000000a1',
        '00000000-0000-0000-0000-000000000000',
        'authenticated', 'authenticated', 'member56@corp.example', '', now(), now(), now());

insert into profiles (id, gender, hub_id, company_email, email_verified_at,
                      name, birth, job, onboarding_step, terms_agreed_at, privacy_agreed_at)
values ('56000000-0000-0000-0000-0000000000a1', 'male', 'gangnam',
        'member56@corp.example', now(), '테스트', '1992-01-01', '기획', 7, now(), now());

create temp table issued as
  select issue_phone_code('56000000-0000-0000-0000-0000000000a1', '+821055555555') as code;
grant select on issued to authenticated;

set local role authenticated;
set local request.jwt.claims = '{"sub":"56000000-0000-0000-0000-0000000000a1","role":"authenticated"}';

select ok(verify_phone_code('+821055555555', 'not-code') is null,
  'T1 틀린 코드는 NULL을 돌려준다');
reset role;
select is((select attempts::int from phone_codes
            where user_id = '56000000-0000-0000-0000-0000000000a1'), 1,
  'T2 실패 횟수가 예외 없이 저장된다');

set local role authenticated;
do $$ begin
  for i in 1..4 loop
    perform verify_phone_code('+821055555555', 'not-code');
  end loop;
end $$;

reset role;
select is((select attempts::int from phone_codes
            where user_id = '56000000-0000-0000-0000-0000000000a1'), 5,
  'T3 다섯 번 실패가 모두 누적된다');
set local role authenticated;
select throws_ok(
  $$ select verify_phone_code('+821055555555', (select code from issued)) $$,
  'P0002', 'code expired', 'T4 다섯 번 실패하면 맞는 코드도 거절한다');

select throws_ok(
  $$ update profiles
        set photo_paths = array[id::text || '/same.webp', id::text || '/same.webp', id::text || '/same.webp']
      where id = '56000000-0000-0000-0000-0000000000a1' $$,
  '23514', null, 'T5 같은 사진 세 번은 저장할 수 없다');

update profiles
   set photo_paths = array[id::text || '/one.webp', id::text || '/two.webp', id::text || '/three.webp']
 where id = '56000000-0000-0000-0000-0000000000a1';
select is((select cardinality(photo_paths) from profiles
            where id = '56000000-0000-0000-0000-0000000000a1'), 3,
  'T6 서로 다른 사진 세 장은 저장된다');

select register_device_token(repeat('a', 64));
reset role;
select is((select count(*)::int from device_tokens
            where user_id = '56000000-0000-0000-0000-0000000000a1'), 1,
  'T7 기기 토큰이 등록된다');

update profiles set phone = '+821055555555', phone_verified_at = now(), account_state = 'withdrawn'
 where id = '56000000-0000-0000-0000-0000000000a1';
select is((select count(*)::int from device_tokens
            where user_id = '56000000-0000-0000-0000-0000000000a1'), 0,
  'T8 탈퇴 시 프로필 행이 남아도 기기 토큰은 지운다');
select ok((select phone is null and phone_verified_at is null from profiles
            where id = '56000000-0000-0000-0000-0000000000a1'),
  'T9 탈퇴 시 휴대폰 번호도 파기한다');

select * from finish();
rollback;
