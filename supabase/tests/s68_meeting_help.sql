begin;
select plan(6);

insert into auth.users (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at, created_at, updated_at)
values
  ('68000000-0000-0000-0000-0000000000a1','00000000-0000-0000-0000-000000000000','authenticated','authenticated','m68@corp.example','',now(),now(),now()),
  ('68000000-0000-0000-0000-0000000000f1','00000000-0000-0000-0000-000000000000','authenticated','authenticated','f68@corp.example','',now(),now(),now()),
  ('68000000-0000-0000-0000-0000000000a2','00000000-0000-0000-0000-000000000000','authenticated','authenticated','other68@corp.example','',now(),now(),now()),
  ('68000000-0000-0000-0000-0000000000ad','00000000-0000-0000-0000-000000000000','authenticated','authenticated','admin68@corp.example','',now(),now(),now());
insert into profiles (id, gender, hub_id, company_email, email_verified_at, name,
                      onboarding_step, terms_agreed_at, privacy_agreed_at, role)
values
  ('68000000-0000-0000-0000-0000000000a1','male','gangnam','m68@corp.example',now(),'남68',7,now(),now(),'member'),
  ('68000000-0000-0000-0000-0000000000f1','female','gangnam','f68@corp.example',now(),'여68',7,now(),now(),'member'),
  ('68000000-0000-0000-0000-0000000000a2','male','gangnam','other68@corp.example',now(),'타인68',7,now(),now(),'member'),
  ('68000000-0000-0000-0000-0000000000ad','male','gangnam','admin68@corp.example',now(),'운영68',7,now(),now(),'admin');
insert into intros(id, male_id, female_id) values
  ('68000000-0000-0000-0000-0000000000e1','68000000-0000-0000-0000-0000000000a1','68000000-0000-0000-0000-0000000000f1');
insert into tickets(id, user_id, kind, price_krw, state, intro_id, used_at) values
  ('68000000-0000-0000-0000-0000000000b1','68000000-0000-0000-0000-0000000000a1',
   'meeting',0,'used','68000000-0000-0000-0000-0000000000e1',now());
insert into meetings(id, intro_id, ticket_id) values
  ('68000000-0000-0000-0000-0000000000c1','68000000-0000-0000-0000-0000000000e1',
   '68000000-0000-0000-0000-0000000000b1');

select ok(not has_table_privilege('authenticated', 'support_requests', 'INSERT'),
  '문의 행은 회원이 직접 작성할 수 없다');
set local role authenticated;
set local request.jwt.claims = '{"sub":"68000000-0000-0000-0000-0000000000a2","role":"authenticated"}';
select throws_ok($$ select create_meeting_help_request('68000000-0000-0000-0000-0000000000c1',
  '시간을 바꾸고 싶습니다') $$, '42501', null, '제3자는 관련 만남으로 문의하지 못한다');
set local request.jwt.claims = '{"sub":"68000000-0000-0000-0000-0000000000a1","role":"authenticated"}';
select lives_ok($$ select create_meeting_help_request('68000000-0000-0000-0000-0000000000c1',
  '금요일 저녁으로 바꾸고 싶습니다') $$, '당사자는 약속 조율 문의를 남긴다');
select throws_ok($$ select create_meeting_help_request('68000000-0000-0000-0000-0000000000c1',
  '이번 주에 다시 연락 주세요') $$, '23505', null, '같은 만남에 미답변 문의를 중복 접수하지 않는다');

set local request.jwt.claims = '{"sub":"68000000-0000-0000-0000-0000000000ad","role":"authenticated"}';
select is((admin_support_page()->'items'->0->>'meeting_id'),
  '68000000-0000-0000-0000-0000000000c1', '운영자 문의 목록에서 관련 만남으로 이동할 수 있다');
select lives_ok($$ select respond_support_request(
  (admin_support_page()->'items'->0->>'id')::uuid,
  '두 분께 가능한 시간을 다시 확인하겠습니다') $$,
  '기존 문의 응답 흐름에서 조율 요청을 처리한다');

select * from finish();
rollback;
