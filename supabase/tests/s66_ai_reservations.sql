begin;
select plan(19);

insert into auth.users(id,instance_id,aud,role,email,encrypted_password,email_confirmed_at,created_at,updated_at)
values ('66000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-000000000000',
 'authenticated','authenticated','member66@corp.example','',now(),now(),now());
insert into public.profiles(id,gender,hub_id,company_email,email_verified_at,name,onboarding_step,
 role,terms_agreed_at,privacy_agreed_at)
values ('66000000-0000-0000-0000-000000000001','female','gangnam','member66@corp.example',
 now(),'회원66',7,'member',now(),now());

select ok(not has_function_privilege('authenticated',
 'public.reserve_ai_run(uuid,text,text,uuid,text,text)','execute'),
 'client cannot reserve quota for another user');
select ok(not has_function_privilege('authenticated',
 'public.finish_ai_run(uuid,text,integer,integer,integer)','execute'),
 'client cannot forge a provider result');
select ok(not has_table_privilege('authenticated','public.ai_decisions','select,insert'),
 'client cannot read or write the decision ledger directly');

select is((public.reserve_ai_run('66000000-0000-0000-0000-000000000001','profile_copy',
 repeat('a',64),'66000000-0000-0000-0000-000000000011','v1','test')->>'reserved'),
 'true','first request reserves a slot');
select is((public.reserve_ai_run('66000000-0000-0000-0000-000000000001','profile_copy',
 repeat('a',64),'66000000-0000-0000-0000-000000000012','v1','test')->>'reason'),
 'in_progress','same source is not executed twice while pending');
select is((public.reserve_ai_run('66000000-0000-0000-0000-000000000001','profile_copy',
 repeat('a',64),'66000000-0000-0000-0000-000000000011','v1','test')->>'reason'),
 'duplicate_request','request id is idempotent');
select is(public.finish_ai_run('66000000-0000-0000-0000-000000000011',
 'success',123,100,30),
 (select id from public.ai_runs where request_id='66000000-0000-0000-0000-000000000011'),
 'completion updates the reserved row');
select throws_ok($$select public.finish_ai_run('66000000-0000-0000-0000-000000000011',
 'success',123,100,30)$$,'PT409',null,'completion cannot overwrite a previous result');
select is((public.reserve_ai_run('66000000-0000-0000-0000-000000000001','profile_copy',
 repeat('a',64),'66000000-0000-0000-0000-000000000013','v1','test')->>'reserved'),
 'true','same source can be regenerated after completion');
select throws_ok($$select public.reserve_ai_run('66000000-0000-0000-0000-000000000001',
 'profile_copy','bad','66000000-0000-0000-0000-000000000014','v1','test')$$,
 '22023',null,'invalid source hash is rejected');

select is((public.reserve_ai_run('66000000-0000-0000-0000-000000000001','profile_copy',
 repeat('b',64),'66000000-0000-0000-0000-000000000015','v1','test')->>'reserved'),
 'true','changed source is a separate reservation');
select is((public.reserve_ai_run('66000000-0000-0000-0000-000000000001','profile_copy',
 repeat('c',64),'66000000-0000-0000-0000-000000000016','v1','test')->>'reserved'),
 'true','fourth call is permitted');
select is((public.reserve_ai_run('66000000-0000-0000-0000-000000000001','profile_copy',
 repeat('d',64),'66000000-0000-0000-0000-000000000017','v1','test')->>'reserved'),
 'true','fifth call is permitted');
select is((public.reserve_ai_run('66000000-0000-0000-0000-000000000001','profile_copy',
 repeat('e',64),'66000000-0000-0000-0000-000000000018','v1','test')->>'reason'),
 'daily_limit','sixth call is rejected including in-flight reservations');

do $$ begin
  perform set_config('test.ai_run_id',id::text,true) from public.ai_runs
   where request_id='66000000-0000-0000-0000-000000000011';
  perform set_config('test.ai_unfinished_id',id::text,true) from public.ai_runs
   where request_id='66000000-0000-0000-0000-000000000013';
end $$;
set local role authenticated;
set local request.jwt.claims =
 '{"sub":"66000000-0000-0000-0000-000000000001","role":"authenticated"}';
select is(public.record_my_ai_decision(
 current_setting('test.ai_run_id')::bigint,
 'accepted'),true,'owner can record a successful draft choice');
select throws_ok($$select public.record_my_ai_decision(
 current_setting('test.ai_unfinished_id')::bigint,
 'accepted')$$,'42501',null,'unfinished run cannot receive a choice');
select is(public.record_my_ai_decision(current_setting('test.ai_run_id')::bigint,
 'accepted'),true,'recording the same decision is idempotent');
select throws_ok($$select public.admin_ai_quality_v2()$$,'42501',null,
 'member cannot read AI operating metrics');
reset role;
select is((select count(*)::integer from public.ai_decisions),1,
 'one decision is stored without generated text');

select * from finish();
rollback;
