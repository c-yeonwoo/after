begin;
select plan(12);

insert into auth.users (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at, created_at, updated_at)
values
  ('66000000-0000-0000-0000-0000000000a1','00000000-0000-0000-0000-000000000000','authenticated','authenticated','m66@corp.example','',now(),now(),now()),
  ('66000000-0000-0000-0000-0000000000f1','00000000-0000-0000-0000-000000000000','authenticated','authenticated','f66@corp.example','',now(),now(),now()),
  ('66000000-0000-0000-0000-0000000000a2','00000000-0000-0000-0000-000000000000','authenticated','authenticated','other66@corp.example','',now(),now(),now()),
  ('66000000-0000-0000-0000-0000000000ad','00000000-0000-0000-0000-000000000000','authenticated','authenticated','admin66@corp.example','',now(),now(),now());
insert into profiles (id, gender, hub_id, company_email, email_verified_at, name,
                      onboarding_step, terms_agreed_at, privacy_agreed_at, role)
values
  ('66000000-0000-0000-0000-0000000000a1','male','gangnam','m66@corp.example',now(),'남66',7,now(),now(),'member'),
  ('66000000-0000-0000-0000-0000000000f1','female','gangnam','f66@corp.example',now(),'여66',7,now(),now(),'member'),
  ('66000000-0000-0000-0000-0000000000a2','male','gangnam','other66@corp.example',now(),'타인66',7,now(),now(),'member'),
  ('66000000-0000-0000-0000-0000000000ad','male','gangnam','admin66@corp.example',now(),'운영66',7,now(),now(),'admin');
insert into intros (id, male_id, female_id) values
  ('66000000-0000-0000-0000-0000000000e1','66000000-0000-0000-0000-0000000000a1','66000000-0000-0000-0000-0000000000f1');

select ok(not has_table_privilege('authenticated', 'meet_windows', 'SELECT'),
  '회원은 상대의 가능 시간 원본을 직접 읽을 수 없다');
select ok(not has_function_privilege('anon', 'suggested_meeting_slots(uuid)', 'EXECUTE'),
  '익명 사용자는 추천 후보를 조회할 수 없다');

set local role authenticated;
set local request.jwt.claims = '{"sub":"66000000-0000-0000-0000-0000000000a1","role":"authenticated"}';
select is((save_my_meet_window(array[2,4]::smallint[], '19:00')->>'earliest_local'),
  '19:00', '내 평소 가능 시간을 저장한다');
select throws_ok($$ select save_my_meet_window(array[2,2]::smallint[], '19:00') $$,
  '22023', null, '중복 요일은 받지 않는다');
select throws_ok($$ select save_my_meet_window(array[6]::smallint[], '19:00') $$,
  '22023', null, '주말 등 지원하지 않는 요일은 받지 않는다');
select is((select count(*)::int from suggested_meeting_slots('66000000-0000-0000-0000-0000000000e1')),
  0, '상대의 정보가 없으면 겹침을 추측하지 않는다');

set local request.jwt.claims = '{"sub":"66000000-0000-0000-0000-0000000000f1","role":"authenticated"}';
select is((save_my_meet_window(array[4]::smallint[], '19:30')->>'fresh'),
  'true', '상대도 자신의 가능 시간을 저장한다');
select is((select count(*)::int from suggested_meeting_slots('66000000-0000-0000-0000-0000000000e1')),
  0, '상대에게는 소개의 교집합 후보가 공개되지 않는다');

set local request.jwt.claims = '{"sub":"66000000-0000-0000-0000-0000000000a1","role":"authenticated"}';
select ok((select count(*) > 0 from suggested_meeting_slots('66000000-0000-0000-0000-0000000000e1')),
  '소개 당사자에게만 겹치는 후보를 제안한다');
select ok((select bool_and(extract(isodow from slot at time zone 'Asia/Seoul') = 4
                            and (slot at time zone 'Asia/Seoul')::time >= time '19:30')
             from suggested_meeting_slots('66000000-0000-0000-0000-0000000000e1')),
  '추천은 요일과 가장 늦은 시작 시간을 모두 만족한다');

reset role;
update meet_windows set updated_at = now() - interval '15 days'
 where user_id = '66000000-0000-0000-0000-0000000000f1';
set local role authenticated;
set local request.jwt.claims = '{"sub":"66000000-0000-0000-0000-0000000000a1","role":"authenticated"}';
select is((select count(*)::int from suggested_meeting_slots('66000000-0000-0000-0000-0000000000e1')),
  0, '오래된 가능 시간은 추천에 쓰지 않는다');

reset role;
update profiles set account_state = 'withdrawn'
 where id = '66000000-0000-0000-0000-0000000000f1';
select is((select count(*)::int from meet_windows
            where user_id = '66000000-0000-0000-0000-0000000000f1'),
  0, '탈퇴하면 가능 시간도 지운다');

select * from finish();
rollback;
