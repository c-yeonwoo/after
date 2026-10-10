-- S52 — 소개장 인터뷰 답변은 본인만, 300자까지 쓴다.

begin;
select plan(5);

insert into auth.users (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at, created_at, updated_at)
values
  ('52000000-0000-0000-0000-0000000000a1','00000000-0000-0000-0000-000000000000','authenticated','authenticated','m52@corp.example','',now(),now(),now()),
  ('52000000-0000-0000-0000-0000000000f1','00000000-0000-0000-0000-000000000000','authenticated','authenticated','f52@corp.example','',now(),now(),now());

insert into profiles (id, gender, hub_id, company_email, email_verified_at, onboarding_step, role)
values
  ('52000000-0000-0000-0000-0000000000a1','male','gangnam','m52@corp.example',now(),4,'member'),
  ('52000000-0000-0000-0000-0000000000f1','female','gangnam','f52@corp.example',now(),4,'member');

set local role authenticated;
set local request.jwt.claims = '{"sub":"52000000-0000-0000-0000-0000000000f1","role":"authenticated"}';

select lives_ok(
  $$ update profiles set evening_note = '수요일 저녁엔 한강까지 뛰어요.', known_as = '약속 장소를 잘 고른대요.'
      where id = '52000000-0000-0000-0000-0000000000f1' $$,
  'T1 본인은 인터뷰 답변을 쓸 수 있다');
select is(
  (select evening_note from profiles where id = '52000000-0000-0000-0000-0000000000f1'),
  '수요일 저녁엔 한강까지 뛰어요.', 'T2 쓴 답변이 그대로 남는다');

select throws_ok(
  format($$ update profiles set known_as = %L where id = '52000000-0000-0000-0000-0000000000f1' $$,
         repeat('가', 301)),
  '23514', null, 'T3 300자를 넘으면 받지 않는다');

-- 남의 행은 RLS 로 0행 갱신이다. 오류가 아니라 아무 일도 일어나지 않는다.
update profiles set evening_note = '남이 쓴 글' where id = '52000000-0000-0000-0000-0000000000a1';
reset role;
select is(
  (select evening_note from profiles where id = '52000000-0000-0000-0000-0000000000a1'),
  null, 'T4 남의 인터뷰 답변은 고칠 수 없다');

select ok(not has_column_privilege('anon', 'profiles', 'evening_note', 'UPDATE'),
  'T5 비로그인 사용자는 쓸 수 없다');

select * from finish();
rollback;
