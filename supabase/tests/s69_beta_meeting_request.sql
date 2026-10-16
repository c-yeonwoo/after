begin;
select plan(5);

insert into auth.users (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at, created_at, updated_at)
values
  ('69000000-0000-0000-0000-0000000000a1','00000000-0000-0000-0000-000000000000','authenticated','authenticated','m691@corp.example','',now(),now(),now()),
  ('69000000-0000-0000-0000-0000000000a2','00000000-0000-0000-0000-000000000000','authenticated','authenticated','m692@corp.example','',now(),now(),now()),
  ('69000000-0000-0000-0000-0000000000f1','00000000-0000-0000-0000-000000000000','authenticated','authenticated','f69@corp.example','',now(),now(),now());
insert into profiles (id, gender, hub_id, company_email, email_verified_at, name,
                      onboarding_step, terms_agreed_at, privacy_agreed_at, role)
values
  ('69000000-0000-0000-0000-0000000000a1','male','gangnam','m691@corp.example',now(),'남69가',7,now(),now(),'member'),
  ('69000000-0000-0000-0000-0000000000a2','male','gangnam','m692@corp.example',now(),'남69나',7,now(),now(),'member'),
  ('69000000-0000-0000-0000-0000000000f1','female','gangnam','f69@corp.example',now(),'여69',7,now(),now(),'member');
insert into intros(id, male_id, female_id) values
  ('69000000-0000-0000-0000-0000000000e1','69000000-0000-0000-0000-0000000000a1','69000000-0000-0000-0000-0000000000f1'),
  ('69000000-0000-0000-0000-0000000000e2','69000000-0000-0000-0000-0000000000a2','69000000-0000-0000-0000-0000000000f1');
insert into tickets(user_id, kind, price_krw) values
  ('69000000-0000-0000-0000-0000000000a1','meeting',30000);
update app_settings set payments_enabled = false where id;

set local role authenticated;
set local request.jwt.claims = '{"sub":"69000000-0000-0000-0000-0000000000a1","role":"authenticated"}';
select is((select intro_id from use_meeting_ticket('69000000-0000-0000-0000-0000000000e1')),
  '69000000-0000-0000-0000-0000000000e1'::uuid,
  '베타에서 요청하면 무료 만남 티켓으로 약속을 만든다');
reset role;
select is((select count(*)::int from tickets where user_id = '69000000-0000-0000-0000-0000000000a1'
  and kind = 'meeting' and price_krw = 30000 and state = 'unused'), 1,
  '기존 유료 만남 티켓은 베타 요청에 쓰지 않는다');
select is((select count(*)::int from tickets where user_id = '69000000-0000-0000-0000-0000000000a1'
  and kind = 'meeting' and price_krw = 0 and state = 'used'), 1,
  '무료 발급과 요청 사용은 한 트랜잭션에 남는다');

update app_settings set payments_enabled = true where id;
set local role authenticated;
set local request.jwt.claims = '{"sub":"69000000-0000-0000-0000-0000000000a2","role":"authenticated"}';
select throws_ok($$ select use_meeting_ticket('69000000-0000-0000-0000-0000000000e2') $$,
  'P0002', null, '결제가 켜지면 유료 티켓이 있어야 한다');
select ok((select count(*) = 0 from meetings
  where intro_id = '69000000-0000-0000-0000-0000000000e2'),
  '티켓이 없으면 만남을 만들지 않는다');

select * from finish();
rollback;
