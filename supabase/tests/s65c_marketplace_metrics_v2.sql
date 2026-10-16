begin;
select plan(11);
insert into auth.users(id,instance_id,aud,role,email,encrypted_password,email_confirmed_at,created_at,updated_at)
values
 ('65100000-0000-0000-0000-000000000001','00000000-0000-0000-0000-000000000000','authenticated','authenticated','admin651@corp.example','',now(),now(),now()),
 ('65100000-0000-0000-0000-000000000002','00000000-0000-0000-0000-000000000000','authenticated','authenticated','woman651@corp.example','',now(),now(),now()),
 ('65100000-0000-0000-0000-000000000003','00000000-0000-0000-0000-000000000000','authenticated','authenticated','man651@corp.example','',now(),now(),now());
insert into public.profiles(id,gender,hub_id,company_email,email_verified_at,name,onboarding_step,role)
values
 ('65100000-0000-0000-0000-000000000001','male','gangnam','admin651@corp.example',now(),'운영651',7,'admin'),
 ('65100000-0000-0000-0000-000000000002','female','gangnam','woman651@corp.example',now(),'여성651',7,'member'),
 ('65100000-0000-0000-0000-000000000003','male','gangnam','man651@corp.example',now(),'남성651',7,'member');

set local role authenticated;
set local request.jwt.claims =
 '{"sub":"65100000-0000-0000-0000-000000000002","role":"authenticated"}';
select throws_ok($$select public.admin_marketplace_health_v2('gangnam',7)$$,'42501',null,
 'member cannot inspect marketplace metrics');
reset role;
set local role authenticated;
set local request.jwt.claims =
 '{"sub":"65100000-0000-0000-0000-000000000001","role":"authenticated"}';
select throws_ok($$select public.admin_marketplace_health_v2('gangnam',3)$$,'22023',null,
 'unsupported period is rejected');
select ok((public.admin_marketplace_health_v2('gangnam',7)->>'as_of') is not null,
 'response carries server snapshot time');
select is((public.admin_marketplace_health_v2('gangnam',7)#>>'{first_intro_7d,rate}')::numeric,
 null::numeric,'no matured readiness cohort is not reported as zero percent');
reset role;

set local request.jwt.claims =
 '{"sub":"65100000-0000-0000-0000-000000000001","role":"authenticated"}';
create temporary table s65c_before as
 select (public.admin_marketplace_health_v2('gangnam',7)#>>'{pending_request,count}')::integer pending,
        (public.admin_marketplace_health_v2('gangnam',7)#>>'{completed_response,sample}')::integer completed;
grant select on s65c_before to authenticated;
reset request.jwt.claims;
insert into public.intros(id,male_id,female_id) values
 ('65100000-0000-0000-0000-000000000004',
  '65100000-0000-0000-0000-000000000003','65100000-0000-0000-0000-000000000002');
insert into public.tickets(id,user_id,state,kind,price_krw,intro_id,used_at)
values ('65100000-0000-0000-0000-000000000005',
 '65100000-0000-0000-0000-000000000003','used','meeting',0,
 '65100000-0000-0000-0000-000000000004',now()-interval '3 hours');
insert into public.meetings(id,intro_id,ticket_id)
values ('65100000-0000-0000-0000-000000000006',
 '65100000-0000-0000-0000-000000000004',
 '65100000-0000-0000-0000-000000000005');
set local role authenticated;
set local request.jwt.claims =
 '{"sub":"65100000-0000-0000-0000-000000000001","role":"authenticated"}';
select is((public.admin_marketplace_health_v2('gangnam',7)#>>'{pending_request,count}')::integer,
 (select pending+1 from s65c_before),'pending request adds to the current waiting population');
select ok((public.admin_marketplace_health_v2('gangnam',7)#>>'{pending_request,oldest_hours}')::numeric>=0,
 'current wait age is shown, not inferred from completed members');
reset role;
update public.meetings set prefs_submitted_at=now()
 where id='65100000-0000-0000-0000-000000000006';
set local role authenticated;
set local request.jwt.claims =
 '{"sub":"65100000-0000-0000-0000-000000000001","role":"authenticated"}';
select is((public.admin_marketplace_health_v2('gangnam',7)#>>'{pending_request,count}')::integer,
 (select pending from s65c_before),'answered request exits current waiting count');
select is((public.admin_marketplace_health_v2('gangnam',7)#>>'{completed_response,sample}')::integer,
 (select completed+1 from s65c_before),'completed response enters a separately labeled sample');
reset role;
update public.meetings set scheduled_at=now()+interval '1 day',
 confirmed_at=now(),private_opens_at=now()
 where id='65100000-0000-0000-0000-000000000006';
set local role authenticated;
set local request.jwt.claims =
 '{"sub":"65100000-0000-0000-0000-000000000003","role":"authenticated"}';
select throws_ok($$select public.mark_met('65100000-0000-0000-0000-000000000006')$$,
 'PT409',null,'future appointment cannot be reported as completed');
select throws_ok($$select public.mark_met_base('65100000-0000-0000-0000-000000000006')$$,
 '42501',null,'old RPC cannot bypass the time guard');
reset role;
select is((select cardinality(completed_by) from public.meetings
 where id='65100000-0000-0000-0000-000000000006'),0,
 'rejected early report leaves outcome untouched');
select * from finish();
rollback;
