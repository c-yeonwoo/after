begin;
select plan(27);

insert into auth.users(id,instance_id,aud,role,email,encrypted_password,email_confirmed_at,created_at,updated_at)
values
 ('64000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-000000000000','authenticated','authenticated','admin64@corp.example','',now(),now(),now()),
 ('64000000-0000-0000-0000-000000000002','00000000-0000-0000-0000-000000000000','authenticated','authenticated','woman64@corp.example','',now(),now(),now()),
 ('64000000-0000-0000-0000-000000000003','00000000-0000-0000-0000-000000000000','authenticated','authenticated','man64@corp.example','',now(),now(),now());
insert into public.profiles(id,gender,hub_id,company_email,email_verified_at,name,onboarding_step,role)
values
 ('64000000-0000-0000-0000-000000000001','male','gangnam','admin64@corp.example',now(),'운영64',7,'admin'),
 ('64000000-0000-0000-0000-000000000002','female','gangnam','woman64@corp.example',now(),'여성64',7,'member'),
 ('64000000-0000-0000-0000-000000000003','male','gangnam','man64@corp.example',now(),'남성64',7,'member');
insert into public.intros(id,male_id,female_id)
values ('64000000-0000-0000-0000-000000000004',
 '64000000-0000-0000-0000-000000000003','64000000-0000-0000-0000-000000000002');
insert into public.tickets(id,user_id,state,kind,price_krw,intro_id,used_at)
values ('64000000-0000-0000-0000-000000000005',
 '64000000-0000-0000-0000-000000000003','used','meeting',0,
 '64000000-0000-0000-0000-000000000004',now()-interval '13 hours');
insert into public.meetings(id,intro_id,ticket_id)
values ('64000000-0000-0000-0000-000000000006',
 '64000000-0000-0000-0000-000000000004',
 '64000000-0000-0000-0000-000000000005');

select is(public.automation_tick(),0,'new rule is off by default');
set local role authenticated;
set local request.jwt.claims =
  '{"sub":"64000000-0000-0000-0000-000000000002","role":"authenticated"}';
select throws_ok($$select public.admin_automation_overview()$$,'42501',null,
 'member cannot see automation runs');
select throws_ok($$select * from public.automation_runs$$,'42501',null,
 'member cannot read automation ledger');
select is(public.my_notification_preferences()->>'request_reminders','true',
 'optional reminder defaults on');
select is(public.set_my_request_reminders(false)->>'request_reminders','false',
 'member can opt out');
reset role;

set local role authenticated;
set local request.jwt.claims =
  '{"sub":"64000000-0000-0000-0000-000000000001","role":"authenticated"}';
select is((select x->>'rule_mode' from jsonb_array_elements(
  public.admin_system_overview()->'jobs') x where x->>'jobname'='automation_reminder_tick'),
  'off','system health distinguishes intentionally off rule');
select is((public.admin_update_automation_rule(1,'observe',20,24,null,
 '48시간 관찰 시작',gen_random_uuid())).mode,'observe','admin starts observe mode');
select throws_ok($$select public.admin_update_automation_rule(1,'auto',20,24,null,
 '바로 자동화',gen_random_uuid())$$,'PT409',null,'stale version rejected');
reset role;
select is(public.automation_tick(),0,'opted-out recipient is not even observed');
set local role authenticated;
set local request.jwt.claims =
  '{"sub":"64000000-0000-0000-0000-000000000002","role":"authenticated"}';
select is(public.set_my_request_reminders(true)->>'request_reminders','true',
 'member may re-enable reminder');
reset role;
select is(public.automation_tick(),1,'observe records one eligible candidate');
select is(public.automation_tick(),0,'repeated tick is idempotent');
select is((select count(*)::integer from public.notifications
  where kind='meeting_request_reminder'),0,'observe sends nothing');
set local role authenticated;
set local request.jwt.claims =
  '{"sub":"64000000-0000-0000-0000-000000000002","role":"authenticated"}';
select throws_ok($$select public.automation_tick()$$,'42501',null,
 'member cannot trigger automation worker');
reset role;

set local role authenticated;
set local request.jwt.claims =
  '{"sub":"64000000-0000-0000-0000-000000000001","role":"authenticated"}';
select throws_ok($$select public.admin_update_automation_rule(2,'auto',20,24,null,
 '관찰 없이 자동화',gen_random_uuid())$$,'PT409',null,'auto requires observation window');
select is((public.admin_update_automation_rule(2,'approval',20,24,null,
 '건별 승인 전환',gen_random_uuid())).mode,'approval','admin enables approval mode');
reset role;
select is(public.automation_tick(),1,'approval creates a versioned preview');
update public.meetings set cancelled_at=now() where id='64000000-0000-0000-0000-000000000006';
set local role authenticated;
set local request.jwt.claims =
  '{"sub":"64000000-0000-0000-0000-000000000001","role":"authenticated"}';
select is(public.admin_approve_automation(
  (select (x->>'id')::uuid from jsonb_array_elements(public.admin_automation_overview()->'runs') x
    where x->>'status'='approval_required' limit 1),
  (select x->>'preview_hash' from jsonb_array_elements(public.admin_automation_overview()->'runs') x
    where x->>'status'='approval_required' limit 1),
  '원본 재확인',gen_random_uuid()),'skipped','cancelled meeting cannot be reminded');
reset role;
select is((select count(*)::integer from public.notifications
  where kind='meeting_request_reminder'),0,'stale approval made no notification');

-- A fresh preview can be approved once. Preference revocation between enqueue and
-- provider call must still suppress the external push.
update public.meetings set cancelled_at=null where id='64000000-0000-0000-0000-000000000006';
set local role authenticated;
set local request.jwt.claims =
  '{"sub":"64000000-0000-0000-0000-000000000001","role":"authenticated"}';
select is((public.admin_update_automation_rule(3,'off',20,24,'',
 '이전 미리보기 폐기',gen_random_uuid())).version,4,'rule version invalidates old previews');
select is((public.admin_update_automation_rule(4,'approval',20,24,'',
 '새 승인 요청',gen_random_uuid())).version,5,'rule can return to approval');
reset role;
select is(public.automation_tick(),1,'new version records a fresh preview');
set local role authenticated;
set local request.jwt.claims =
  '{"sub":"64000000-0000-0000-0000-000000000001","role":"authenticated"}';
select is(public.admin_approve_automation(
  (select (x->>'id')::uuid from jsonb_array_elements(public.admin_automation_overview()->'runs') x
    where x->>'status'='approval_required' limit 1),
  (select x->>'preview_hash' from jsonb_array_elements(public.admin_automation_overview()->'runs') x
    where x->>'status'='approval_required' limit 1),
  '실제 요청 확인',gen_random_uuid()),'succeeded','valid approval queues reminder');
select is(public.admin_approve_automation(
  (select (x->>'id')::uuid from jsonb_array_elements(public.admin_automation_overview()->'runs') x
    where x->>'status'='succeeded' limit 1),
  (select x->>'preview_hash' from jsonb_array_elements(public.admin_automation_overview()->'runs') x
    where x->>'status'='succeeded' limit 1),
  '중복 승인 확인',gen_random_uuid()),'succeeded','approval repeat is idempotent');
reset role;
select is((select count(*)::integer from public.notifications
  where kind='meeting_request_reminder'),1,'only one reminder is queued');
set local role service_role;
set local request.jwt.claims = '{"role":"service_role"}';
create temporary table s64_claim as select * from public.claim_notification_dispatches(50);
reset role;
set local role authenticated;
set local request.jwt.claims =
  '{"sub":"64000000-0000-0000-0000-000000000002","role":"authenticated"}';
select is(public.set_my_request_reminders(false)->>'request_reminders','false',
 'member can revoke consent after enqueue');
reset role;
set local role service_role;
set local request.jwt.claims = '{"role":"service_role"}';
select is(public.notification_push_still_relevant(
  (select id from s64_claim where kind='meeting_request_reminder'),
  (select lease_token from s64_claim where kind='meeting_request_reminder')),false,
 'revoked reminder is blocked immediately before push');
reset role;

select * from finish();
rollback;
