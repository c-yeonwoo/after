begin;
select plan(4);

insert into auth.users (id, email, encrypted_password, email_confirmed_at, aud, role)
values
  ('40000000-0000-0000-0000-000000000001', 'adult40@test.local', 'x', now(), 'authenticated', 'authenticated'),
  ('40000000-0000-0000-0000-000000000002', 'minor40@test.local', 'x', now(), 'authenticated', 'authenticated'),
  ('40000000-0000-0000-0000-000000000003', 'empty40@test.local', 'x', now(), 'authenticated', 'authenticated');

select lives_ok($$
  insert into profiles (id, gender, hub_id, company_email, birth, onboarding_step)
  values ('40000000-0000-0000-0000-000000000001', 'male', 'gangnam', 'adult40@test.local',
          (current_date - interval '19 years')::date, 0)
$$, 'T1 정확히 만 19세는 저장된다');

select throws_ok($$
  insert into profiles (id, gender, hub_id, company_email, birth, onboarding_step)
  values ('40000000-0000-0000-0000-000000000002', 'female', 'gangnam', 'minor40@test.local',
          (current_date - interval '19 years' + interval '1 day')::date, 0)
$$, '23514', 'must be at least 19 years old', 'T2 만 19세 미만 신규 프로필은 거절된다');

select throws_ok($$
  update profiles
     set birth = (current_date - interval '18 years')::date
   where id = '40000000-0000-0000-0000-000000000001'
$$, '23514', 'must be at least 19 years old', 'T3 기존 프로필도 미성년 생년월일로 바꿀 수 없다');

select lives_ok($$
  insert into profiles (id, gender, hub_id, company_email, onboarding_step)
  values ('40000000-0000-0000-0000-000000000003', 'male', 'gangnam', 'empty40@test.local', 7)
$$, 'T4 탈퇴·레거시 계정을 위해 빈 생년월일 자체는 허용한다');

select * from finish();
rollback;
