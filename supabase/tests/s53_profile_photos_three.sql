-- S53 — 프로필 사진 3장 이상, 묶음 검수

begin;
select plan(9);

insert into auth.users (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at, created_at, updated_at)
values
  ('53000000-0000-0000-0000-0000000000a1','00000000-0000-0000-0000-000000000000','authenticated','authenticated','m53@corp.example','',now(),now(),now()),
  ('53000000-0000-0000-0000-0000000000f1','00000000-0000-0000-0000-000000000000','authenticated','authenticated','f53@corp.example','',now(),now(),now()),
  ('53000000-0000-0000-0000-0000000000ad','00000000-0000-0000-0000-000000000000','authenticated','authenticated','admin53@corp.example','',now(),now(),now());

insert into profiles (id, gender, hub_id, company_email, email_verified_at, name, birth, job,
                      onboarding_step, terms_agreed_at, privacy_agreed_at, role)
values
  ('53000000-0000-0000-0000-0000000000a1','male','gangnam','m53@corp.example',now(),'남오삼','1992-01-01','기획',7,now(),now(),'member'),
  ('53000000-0000-0000-0000-0000000000f1','female','gangnam','f53@corp.example',now(),'여오삼','1994-01-01','회계',7,now(),now(),'member'),
  ('53000000-0000-0000-0000-0000000000ad','male','gangnam','admin53@corp.example',now(),'운영','1990-01-01','운영',7,now(),now(),'admin');

-- 두 장만 올리고 승인된 남성
update profiles set photo_paths = array['53000000-0000-0000-0000-0000000000a1/1.webp',
                                        '53000000-0000-0000-0000-0000000000a1/2.webp']
 where id = '53000000-0000-0000-0000-0000000000a1';

select is((select photo_url from profiles where id = '53000000-0000-0000-0000-0000000000a1'),
  '53000000-0000-0000-0000-0000000000a1/1.webp', 'T1 첫 장이 photo_url 로 맞춰진다');
select is((select photo_state::text from profiles where id = '53000000-0000-0000-0000-0000000000a1'),
  'pending', 'T2 사진 묶음이 바뀌면 검수 대기로 간다');

update profiles set photo_state = 'approved' where id = '53000000-0000-0000-0000-0000000000a1';
select ok(not exists (select 1 from eligible_profiles where id = '53000000-0000-0000-0000-0000000000a1'),
  'T3 승인됐어도 두 장이면 소개 대상이 아니다');

update profiles set photo_paths = array_append(photo_paths, '53000000-0000-0000-0000-0000000000a1/3.webp')
 where id = '53000000-0000-0000-0000-0000000000a1';
select is((select photo_state::text from profiles where id = '53000000-0000-0000-0000-0000000000a1'),
  'pending', 'T4 한 장을 더해도 묶음 전체가 다시 검수된다');
update profiles set photo_state = 'approved' where id = '53000000-0000-0000-0000-0000000000a1';
select ok(exists (select 1 from eligible_profiles where id = '53000000-0000-0000-0000-0000000000a1'),
  'T5 승인된 세 장이면 소개 대상이다');

select throws_ok(
  $$ update profiles set photo_paths = array['a','b','c','d','e','f','g']
      where id = '53000000-0000-0000-0000-0000000000f1' $$,
  '23514', null, 'T6 일곱 장은 받지 않는다');

-- 여성 평가 화면은 상대 사진 묶음을 받는다
set local role authenticated;
set local request.jwt.claims = '{"sub":"53000000-0000-0000-0000-0000000000f1","role":"authenticated"}';
select is(
  (select cardinality(photo_paths) from get_public_profile('53000000-0000-0000-0000-0000000000a1')),
  3, 'T7 상대에게 사진 세 장이 보인다');

set local request.jwt.claims = '{"sub":"53000000-0000-0000-0000-0000000000ad","role":"authenticated"}';
reset role;
update profiles set photo_paths = array['53000000-0000-0000-0000-0000000000f1/1.webp',
                                        '53000000-0000-0000-0000-0000000000f1/2.webp',
                                        '53000000-0000-0000-0000-0000000000f1/3.webp']
 where id = '53000000-0000-0000-0000-0000000000f1';
set local role authenticated;
set local request.jwt.claims = '{"sub":"53000000-0000-0000-0000-0000000000ad","role":"authenticated"}';
select is(
  (select cardinality(photo_paths) from admin_photo_queue('pending')
    where id = '53000000-0000-0000-0000-0000000000f1'),
  3, 'T8 운영자 검수 목록에 묶음 전체가 실린다');
reset role;

-- 탈퇴 파기처럼 photo_url 만 비우면 묶음도 비워진다
update profiles set photo_url = null where id = '53000000-0000-0000-0000-0000000000f1';
select is((select photo_paths from profiles where id = '53000000-0000-0000-0000-0000000000f1'),
  null::text[], 'T9 photo_url 을 비우면 사진 묶음도 함께 비워진다');

select * from finish();
rollback;
