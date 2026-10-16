begin;
select plan(6);

insert into auth.users (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at, created_at, updated_at)
values
  ('67000000-0000-0000-0000-0000000000a1','00000000-0000-0000-0000-000000000000','authenticated','authenticated','m671@corp.example','',now(),now(),now()),
  ('67000000-0000-0000-0000-0000000000a2','00000000-0000-0000-0000-000000000000','authenticated','authenticated','m672@corp.example','',now(),now(),now()),
  ('67000000-0000-0000-0000-0000000000f1','00000000-0000-0000-0000-000000000000','authenticated','authenticated','f671@corp.example','',now(),now(),now()),
  ('67000000-0000-0000-0000-0000000000f2','00000000-0000-0000-0000-000000000000','authenticated','authenticated','f672@corp.example','',now(),now(),now()),
  ('67000000-0000-0000-0000-0000000000ad','00000000-0000-0000-0000-000000000000','authenticated','authenticated','admin67@corp.example','',now(),now(),now());
insert into profiles (id, gender, hub_id, company_email, email_verified_at, name,
                      onboarding_step, terms_agreed_at, privacy_agreed_at, role)
values
  ('67000000-0000-0000-0000-0000000000a1','male','gangnam','m671@corp.example',now(),'남67가',7,now(),now(),'member'),
  ('67000000-0000-0000-0000-0000000000a2','male','gangnam','m672@corp.example',now(),'남67나',7,now(),now(),'member'),
  ('67000000-0000-0000-0000-0000000000f1','female','gangnam','f671@corp.example',now(),'여67가',7,now(),now(),'member'),
  ('67000000-0000-0000-0000-0000000000f2','female','gangnam','f672@corp.example',now(),'여67나',7,now(),now(),'member'),
  ('67000000-0000-0000-0000-0000000000ad','male','gangnam','admin67@corp.example',now(),'운영67',7,now(),now(),'admin');
update profiles set phone_verified_at = now(),
  photo_paths = array[id::text || '/portrait.png', id::text || '/2.png', id::text || '/3.png']
 where id::text like '67000000-%';
update profiles set photo_state = 'approved', photo_reviewed_at = now()
 where photo_url = id::text || '/portrait.png' and id::text like '67000000-%';

insert into affinities(from_id, to_id, verdict) values
  ('67000000-0000-0000-0000-0000000000f1','67000000-0000-0000-0000-0000000000a1','like'),
  ('67000000-0000-0000-0000-0000000000f2','67000000-0000-0000-0000-0000000000a1','like'),
  ('67000000-0000-0000-0000-0000000000f1','67000000-0000-0000-0000-0000000000a2','like');
insert into intro_queue(male_id, female_id, position, curated_by) values
  ('67000000-0000-0000-0000-0000000000a1','67000000-0000-0000-0000-0000000000f1',0,'67000000-0000-0000-0000-0000000000ad'),
  ('67000000-0000-0000-0000-0000000000a1','67000000-0000-0000-0000-0000000000f2',1,'67000000-0000-0000-0000-0000000000ad'),
  ('67000000-0000-0000-0000-0000000000a2','67000000-0000-0000-0000-0000000000f1',0,'67000000-0000-0000-0000-0000000000ad');
select promote_intro_queue('67000000-0000-0000-0000-0000000000a1');
select promote_intro_queue('67000000-0000-0000-0000-0000000000a2');
update app_settings set payments_enabled = false where id;
insert into tickets(user_id, kind, price_krw)
values ('67000000-0000-0000-0000-0000000000a1','intro',5000);

set local role authenticated;
set local request.jwt.claims = '{"sub":"67000000-0000-0000-0000-0000000000a1","role":"authenticated"}';
select is((select female_id from open_intro()),
  '67000000-0000-0000-0000-0000000000f1'::uuid, '베타에서 티켓 신청 없이 소개를 연다');
reset role;
select is((select count(*)::int from tickets where user_id = '67000000-0000-0000-0000-0000000000a1'
  and kind = 'intro' and price_krw = 5000 and state = 'unused'), 1,
  '베타에서 기존 유료 티켓은 보존한다');
select is((select count(*)::int from tickets where user_id = '67000000-0000-0000-0000-0000000000a1'
  and kind = 'intro' and price_krw = 0 and state = 'used'), 1,
  '열람 카드에만 무료 티켓 한 장을 발급·사용한다');

update intros set closed_at = now(), outcome = 'passed'
 where male_id = '67000000-0000-0000-0000-0000000000a1';
set local role authenticated;
set local request.jwt.claims = '{"sub":"67000000-0000-0000-0000-0000000000a1","role":"authenticated"}';
select is((select female_id from open_intro()),
  '67000000-0000-0000-0000-0000000000f2'::uuid,
  '다음 카드도 운영자 발급 없이 열 수 있다');
reset role;
select is((select count(*)::int from tickets where user_id = '67000000-0000-0000-0000-0000000000a1'
  and kind = 'intro' and price_krw = 0 and state = 'used'), 2,
  '카드마다 무료 열람을 한 번씩 기록한다');

update app_settings set payments_enabled = true where id;
set local role authenticated;
set local request.jwt.claims = '{"sub":"67000000-0000-0000-0000-0000000000a2","role":"authenticated"}';
select throws_ok($$ select open_intro() $$, 'P0003', null,
  '결제가 켜진 뒤에는 기존 유료 티켓 게이트를 유지한다');

select * from finish();
rollback;
