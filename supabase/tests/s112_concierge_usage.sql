begin;
select plan(15);
insert into auth.users(id,instance_id,aud,role,email,encrypted_password,email_confirmed_at,created_at,updated_at)
values ('11200000-0000-0000-0000-000000000001','00000000-0000-0000-0000-000000000000','authenticated','authenticated','usage112@verify.local','',now(),now(),now());
insert into public.profiles(id,gender,hub_id,company_email,name,onboarding_step)
values ('11200000-0000-0000-0000-000000000001','male','gangnam','usage112@verify.local','합성한도검증',7);
select ok(has_column_privilege('service_role','public.app_settings','assistant_introduction_enabled','SELECT'),'Edge may read its feature flag');
select ok(not has_column_privilege('anon','public.app_settings','assistant_introduction_enabled','SELECT'),'anonymous cannot read internal flag columns');
select ok(not has_function_privilege('authenticated','public.reserve_ai_run(uuid,text,text,uuid,text,text)','execute'),'cost reservations service only');
update public.app_settings set assistant_introduction_enabled=false,assistant_profile_edit_enabled=false;
select throws_ok($$select reserve_ai_run('11200000-0000-0000-0000-000000000001','member_introduction',repeat('a',64),gen_random_uuid(),'v1','test')$$,'42501','unavailable','disabled introductions cannot reserve');
select throws_ok($$select reserve_ai_run('11200000-0000-0000-0000-000000000001','profile_revision',repeat('b',64),gen_random_uuid(),'v1','test')$$,'42501','unavailable','disabled editing cannot reserve');
update public.app_settings set assistant_introduction_enabled=true,assistant_profile_edit_enabled=true,assistant_chat_enabled=true;
select is(reserve_ai_run('11200000-0000-0000-0000-000000000001','member_introduction',repeat('a',64),'11200000-0000-0000-0000-000000000002','v1','test')->>'reserved','true','first introduction reserves');
select is(reserve_ai_run('11200000-0000-0000-0000-000000000001','member_introduction',repeat('a',64),'11200000-0000-0000-0000-000000000002','v1','test')->>'reason','duplicate_request','request receipt prevents a second reservation');
select is(reserve_ai_run('11200000-0000-0000-0000-000000000001','member_introduction',repeat('a',64),gen_random_uuid(),'v1','test')->>'reason','in_progress','same in-flight input cannot reserve twice');
do $$ begin for n in 1..4 loop
  perform reserve_ai_run('11200000-0000-0000-0000-000000000001','member_introduction',repeat(n::text,64),gen_random_uuid(),'v1','test');
end loop; end $$;
select is(reserve_ai_run('11200000-0000-0000-0000-000000000001','member_introduction',repeat('b',64),gen_random_uuid(),'v1','test')->>'reason','daily_limit','introduction daily cap counts in-flight work');
select is((select count(*)::int from ai_runs where user_id='11200000-0000-0000-0000-000000000001' and feature='member_introduction'),5,'no hidden sixth introduction run');
select is(reserve_ai_run('11200000-0000-0000-0000-000000000001','profile_revision',repeat('c',64),gen_random_uuid(),'v1','test')->>'reserved','true','editing has its own reserved budget');
do $$ begin for n in 1..10 loop
  perform reserve_ai_run('11200000-0000-0000-0000-000000000001','assistant_chat',repeat('d',64),gen_random_uuid(),'v1','test');
end loop; end $$;
select is((select count(*)::int from ai_runs where user_id='11200000-0000-0000-0000-000000000001' and feature='assistant_chat'),10,'legacy chat reservation semantics preserved');
select is(reserve_ai_run('11200000-0000-0000-0000-000000000001','assistant_chat',repeat('d',64),gen_random_uuid(),'v1','test')->>'reason','daily_limit','legacy chat daily cap preserved');
select throws_ok($$select reserve_ai_run('11200000-0000-0000-0000-000000000001','profile_revision',repeat('b',64),gen_random_uuid(),null,'test')$$,'22023','invalid reservation','missing prompt version cannot bypass validation');
select is((select count(*)::int from ai_runs where user_id='11200000-0000-0000-0000-000000000001' and feature='profile_revision'),1,'invalid requests consume no extra reservation');
select * from finish();
rollback;
