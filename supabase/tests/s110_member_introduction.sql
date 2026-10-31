begin;
select plan(32);
update public.app_settings set identity_required=false,assistant_introduction_enabled=false;
insert into auth.users(id,instance_id,aud,role,email,encrypted_password,email_confirmed_at,created_at,updated_at)
select ('11000000-0000-0000-0000-00000000000'||n)::uuid,
 '00000000-0000-0000-0000-000000000000','authenticated','authenticated',
 'manager110-'||n||'@verify.local','',now(),now(),now() from generate_series(1,2) n;
insert into public.profiles(id,gender,hub_id,company_email,name,onboarding_step,updated_at)
select id,case when email='manager110-1@verify.local' then 'male'::public.gender else 'female'::public.gender end,
 'gangnam',email,'합성매니저검증',7,now()-interval '1 minute'
from auth.users where email like 'manager110-%@verify.local';
insert into public.assistant_preferences(owner_id,consented_at,policy_version) values ('11000000-0000-0000-0000-000000000001',now(),'manager-continuity-v2');
create temporary table manager_args as
select '11000000-0000-0000-0000-000000000001'::uuid owner_id,
 '11000000-0000-0000-0000-000000000002'::uuid target_id,
 (select updated_at from public.profiles where id='11000000-0000-0000-0000-000000000001') owner_revision,
 (select updated_at from public.profiles where id='11000000-0000-0000-0000-000000000002') target_revision;
create function pg_temp.manager_store() returns jsonb language sql as $$
 select public.store_member_introduction(owner_id,target_id,owner_revision,target_revision,repeat('a',64),'{"portrait":[]}'::jsonb) from manager_args
$$;
create function pg_temp.manager_read() returns jsonb language sql as $$
 select public.read_member_introduction(owner_id,target_id,owner_revision,target_revision,repeat('a',64)) from manager_args
$$;
select ok(not has_table_privilege('authenticated','public.member_introductions','select'),'members cannot read cached explanation directly');
select ok(not has_table_privilege('anon','public.member_introductions','select'),'anonymous cannot read explanation');
select ok(not has_table_privilege('authenticated','public.member_introductions','insert'),'members cannot poison explanation cache');
select ok(not has_function_privilege('authenticated','public.member_introduction_access(uuid,uuid)','execute'),'visibility identity helper is service-only');
select ok(not has_function_privilege('authenticated','public.read_member_introduction(uuid,uuid,timestamptz,timestamptz,text)','execute'),'cache reader is service-only');
select ok(not has_function_privilege('authenticated','public.store_member_introduction(uuid,uuid,timestamptz,timestamptz,text,jsonb)','execute'),'cache writer is service-only');
select is(pg_temp.manager_store(),null::jsonb,'disabled feature cannot store');
select is(pg_temp.manager_read(),null::jsonb,'disabled feature cannot read');
update public.app_settings set assistant_introduction_enabled=true;
select ok(not public.member_introduction_access(owner_id,owner_id),'self is not a counterpart') from manager_args;
select ok(not public.member_introduction_access(owner_id,target_id),'knowing a female id does not grant male access') from manager_args;
insert into public.intros(male_id,female_id) select owner_id,target_id from manager_args;
set local request.jwt.claim.sub='11000000-0000-0000-0000-000000000002';
set local request.jwt.claims='{"sub":"11000000-0000-0000-0000-000000000002","role":"authenticated"}';
select ok(public.member_introduction_access(owner_id,target_id),'canonical view recognizes an open introduction under owner identity') from manager_args;
select is(current_setting('request.jwt.claim.sub'),'11000000-0000-0000-0000-000000000002','helper restores prior sub claim');
select is(current_setting('request.jwt.claims')::jsonb->>'sub','11000000-0000-0000-0000-000000000002','helper restores prior claims object');
select ok(pg_temp.manager_store() is not null,'current readable pair may store explanation');
select ok(pg_temp.manager_read() is not null,'matching current public revisions may read cache');
update public.assistant_preferences set consented_at=null where owner_id='11000000-0000-0000-0000-000000000001';
select is(pg_temp.manager_read(),null::jsonb,'withdrawn consent cannot read cache');
select is(pg_temp.manager_store(),null::jsonb,'withdrawn consent cannot store an in-flight explanation');
update public.assistant_preferences set consented_at=now() where owner_id='11000000-0000-0000-0000-000000000001';
select ok(pg_temp.manager_store() is not null,'renewed consent permits a fresh explanation');
select ok(not has_function_privilege('authenticated','public.store_member_introduction_for_consent(uuid,uuid,timestamptz,timestamptz,text,jsonb,bigint)','execute'),'consent-bound writer is service-only');
select is(public.store_member_introduction_for_consent(owner_id,target_id,owner_revision,target_revision,repeat('a',64),'{"portrait":[]}'::jsonb,-1),null::jsonb,'old consent revision cannot resurrect a result') from manager_args;
select ok(public.store_member_introduction_for_consent(owner_id,target_id,owner_revision,target_revision,repeat('a',64),'{"portrait":[]}'::jsonb,(select revision from public.assistant_preferences where owner_id=manager_args.owner_id)) is not null,'matching consent revision stores atomically') from manager_args;
select is(public.read_member_introduction(owner_id,target_id,owner_revision,target_revision,repeat('b',64)),null::jsonb,'changed source fingerprint does not reuse cache') from manager_args;
select is(public.read_member_introduction(owner_id,target_id,owner_revision-interval '1 second',target_revision,repeat('a',64)),null::jsonb,'changed owner revision does not reuse cache') from manager_args;
update public.profiles set intro='고친 공개 이야기입니다.' where id='11000000-0000-0000-0000-000000000002';
select is((select count(*)::integer from public.member_introductions where owner_id='11000000-0000-0000-0000-000000000001'),0,'profile edit physically purges stale evidence');
select is(pg_temp.manager_store(),null::jsonb,'in-flight old revision cannot restore edited evidence');
update manager_args set target_revision=(select updated_at from public.profiles where id=target_id);
select ok(pg_temp.manager_store() is not null,'new revision may store after edit');
update public.intros set closed_at=now(),outcome='passed' where male_id='11000000-0000-0000-0000-000000000001';
select is(pg_temp.manager_read(),null::jsonb,'intro closing revokes cached read even without profile edit');
select is(pg_temp.manager_store(),null::jsonb,'intro closing also rejects in-flight write');
update public.intros set closed_at=null,outcome=null where male_id='11000000-0000-0000-0000-000000000001';
update public.member_introductions set expires_at=now()-interval '1 second' where owner_id='11000000-0000-0000-0000-000000000001';
select is(pg_temp.manager_read(),null::jsonb,'expired cache is never returned');
update public.profiles set account_state='withdrawn' where id='11000000-0000-0000-0000-000000000002';
select is((select count(*)::integer from public.member_introductions where owner_id='11000000-0000-0000-0000-000000000001'),0,'withdrawal purges derived private explanation');
select is(pg_temp.manager_store(),null::jsonb,'withdrawn member cannot reappear from in-flight result');
select ok(exists(select 1 from cron.job where jobname='expire-member-introductions'),'physical cache expiry is scheduled');
select * from finish();
rollback;
