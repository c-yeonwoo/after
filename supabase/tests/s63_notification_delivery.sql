begin;
select plan(31);

insert into auth.users (id,instance_id,aud,role,email,encrypted_password,email_confirmed_at,created_at,updated_at)
values
  ('63000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-000000000000','authenticated','authenticated','admin63@corp.example','',now(),now(),now()),
  ('63000000-0000-0000-0000-000000000002','00000000-0000-0000-0000-000000000000','authenticated','authenticated','member63@corp.example','',now(),now(),now());
insert into profiles (id,gender,hub_id,company_email,email_verified_at,name,onboarding_step,role)
values
  ('63000000-0000-0000-0000-000000000001','male','gangnam','admin63@corp.example',now(),'운영63',7,'admin'),
  ('63000000-0000-0000-0000-000000000002','female','gangnam','member63@corp.example',now(),'회원63',7,'member');
insert into notifications (id,user_id,kind)
values ('63000000-0000-0000-0000-000000000003',
        '63000000-0000-0000-0000-000000000002','candidates_refilled');

select is((select count(*)::integer from notification_deliveries
            where notification_id = '63000000-0000-0000-0000-000000000003'
              and channel = 'in_app' and status = 'available'), 1,
          'new notification is available in-app before push');
select ok((select sent_at is null from notifications
            where id = '63000000-0000-0000-0000-000000000003'),
          'in-app availability is not provider submission');

set local role authenticated;
set local request.jwt.claims =
  '{"sub":"63000000-0000-0000-0000-000000000002","role":"authenticated"}';
select throws_ok($$ select * from notification_deliveries $$, '42501', null,
                 'member cannot read delivery ledger');
select throws_ok($$ select * from claim_notification_dispatches(1) $$, '42501', null,
                 'member cannot claim worker jobs');
select throws_ok($$ select admin_notification_health() $$, '42501', null,
                 'member cannot read notification health');
select throws_ok($$ select record_notification_worker_run(100,1,0,1,0,0,0) $$,
                 '42501', null, 'member cannot forge a worker heartbeat');
reset role;

set local role service_role;
set local request.jwt.claims = '{"role":"service_role"}';
create temporary table s63_claim as select * from claim_notification_dispatches(50);
select ok(exists (select 1 from s63_claim
                   where id = '63000000-0000-0000-0000-000000000003'),
          'worker claimed the test notification');
select is((select count(*)::integer from claim_notification_dispatches(50)
            where id = '63000000-0000-0000-0000-000000000003'), 0,
          'second worker cannot claim the same running notification');
select is((select dispatch_state from notifications
            where id = '63000000-0000-0000-0000-000000000003'), 'running',
          'claim creates a running lease');
select is(notification_push_still_relevant(
            '63000000-0000-0000-0000-000000000003',
            (select lease_token from s63_claim
              where id = '63000000-0000-0000-0000-000000000003')), true,
          'current active recipient is relevant before provider call');
select is(finish_notification_dispatch(
            '63000000-0000-0000-0000-000000000003', gen_random_uuid(),
            'submitted', null, '[]'::jsonb), false,
          'wrong lease cannot finish a delivery');
select is(finish_notification_dispatch(
            '63000000-0000-0000-0000-000000000003',
            (select lease_token from s63_claim
              where id = '63000000-0000-0000-0000-000000000003'),
            'submitted', null,
            jsonb_build_array(jsonb_build_object(
              'channel','push','recipient_ref',repeat('a',64),
              'status','submitted','error_code',null))), true,
          'current lease commits provider submission');
select is((select dispatch_state from notifications
            where id = '63000000-0000-0000-0000-000000000003'), 'submitted',
          'provider state is distinct from in-app state');
select is((select count(*)::integer from notification_deliveries
            where notification_id = '63000000-0000-0000-0000-000000000003'
              and channel = 'push' and status = 'submitted'), 1,
          'push ledger records accepted attempt');
select ok((select sent_at is not null from notifications
            where id = '63000000-0000-0000-0000-000000000003'),
          'legacy sent_at is completed only after finalization');
reset role;

insert into notifications (id,user_id,kind)
values ('63000000-0000-0000-0000-000000000004',
        '63000000-0000-0000-0000-000000000002','candidates_refilled')
on conflict do nothing;
-- Same kind and null meeting_id are allowed by the historical unique constraint.
set local role service_role;
set local request.jwt.claims = '{"role":"service_role"}';
create temporary table s63_claim2 as select * from claim_notification_dispatches(50);
select ok(exists (select 1 from s63_claim2
                   where id = '63000000-0000-0000-0000-000000000004'),
          'second occurrence can be claimed');
select throws_ok(
  $$ select finish_notification_dispatch(
      '63000000-0000-0000-0000-000000000004',
      (select lease_token from s63_claim2
        where id = '63000000-0000-0000-0000-000000000004'),
      'submitted', null,
      '[{"channel":"push","recipient_ref":"raw-token","status":"submitted"}]'::jsonb) $$,
  '22023', null, 'raw device token cannot enter the delivery ledger');
select is(finish_notification_dispatch(
            '63000000-0000-0000-0000-000000000004',
            (select lease_token from s63_claim2
              where id = '63000000-0000-0000-0000-000000000004'),
            'unknown', 'provider_result_unknown', '[]'::jsonb), true,
          'unknown provider result is recorded');
select is((select count(*)::integer from claim_notification_dispatches(50)
            where id = '63000000-0000-0000-0000-000000000004'), 0,
          'unknown result is not automatically resent');
select is((select count(*)::integer from ops_cases
            where case_type = 'notification_failure'
              and source_id = '63000000-0000-0000-0000-000000000004'
              and status = 'open'), 1,
          'unknown result creates one operator case');
reset role;

set local role authenticated;
set local request.jwt.claims =
  '{"sub":"63000000-0000-0000-0000-000000000001","role":"authenticated"}';
select is((admin_notification_health()->>'unknown')::integer >= 1, true,
          'admin sees unknown count');
select is(admin_retry_notifications(
            array['63000000-0000-0000-0000-000000000004'::uuid],
            '결과 미상은 재전송하지 않음'), 0,
          'unknown result is excluded from retry action');
reset role;

insert into notifications (id,user_id,kind)
values ('63000000-0000-0000-0000-000000000005',
        '63000000-0000-0000-0000-000000000002','candidates_refilled');
set local role service_role;
set local request.jwt.claims = '{"role":"service_role"}';
create temporary table s63_claim3 as select * from claim_notification_dispatches(50);
select ok(exists (select 1 from s63_claim3
                   where id = '63000000-0000-0000-0000-000000000005'),
          'third notification is claimed');
update notifications set lease_until = now() - interval '1 minute'
 where id = '63000000-0000-0000-0000-000000000005';
select is((select count(*)::integer from claim_notification_dispatches(50)
            where id = '63000000-0000-0000-0000-000000000005'), 0,
          'expired lease is not reclaimed for another send');
select is((select dispatch_state from notifications
            where id = '63000000-0000-0000-0000-000000000005'), 'unknown',
          'expired lease becomes provider-unknown');
select is((select count(*)::integer from ops_cases
            where case_type = 'notification_failure'
              and source_id = '63000000-0000-0000-0000-000000000005'
              and status = 'open'), 1,
          'expired lease creates an operator case');
select ok(record_notification_worker_run(100,1,0,1,0,0,0) > 0,
          'worker records its own completed run');
reset role;

set local role authenticated;
set local request.jwt.claims =
  '{"sub":"63000000-0000-0000-0000-000000000001","role":"authenticated"}';
select is((admin_notification_health()->>'worker_stale')::boolean, false,
          'recent completed run clears stale-worker warning');
reset role;

insert into notifications (id,user_id,kind)
values ('63000000-0000-0000-0000-000000000006',
        '63000000-0000-0000-0000-000000000002','candidates_refilled');
set local role service_role;
set local request.jwt.claims = '{"role":"service_role"}';
create temporary table s63_claim4 as select * from claim_notification_dispatches(50);
select ok(exists (select 1 from s63_claim4
                   where id = '63000000-0000-0000-0000-000000000006'),
          'no-device notification is claimed');
select is(finish_notification_dispatch(
            '63000000-0000-0000-0000-000000000006',
            (select lease_token from s63_claim4
              where id = '63000000-0000-0000-0000-000000000006'),
            'unavailable','no_device',
            jsonb_build_array(jsonb_build_object(
              'channel','push','recipient_ref',repeat('b',64),
              'status','unavailable','error_code','no_device'))), true,
          'channel absence is finalized separately from in-app availability');
select is((select count(*)::integer from notification_deliveries
            where notification_id = '63000000-0000-0000-0000-000000000006'
              and channel = 'push' and status = 'unavailable'), 1,
          'unavailable push is visible in delivery ledger');
reset role;

select * from finish();
rollback;
