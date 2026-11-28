begin;
select plan(7);
select ok(not has_table_privilege('anon','public.kcp_direct_registrations','select'),'registration keys inaccessible before signup');
select ok(not has_table_privilege('authenticated','public.kcp_direct_registrations','update'),'members cannot mark a KCP callback');
select ok(has_table_privilege('service_role','public.kcp_direct_registrations','insert'),'only trusted Edge records provider registration');
select ok(exists(select 1 from cron.job where jobname='expire_kcp_registration_15m'),'abandoned registrations expire');
insert into auth.users(id,email) values ('13400000-0000-0000-0000-000000000001','kcp134@verify.local');
insert into profiles(id,gender,hub_id,company_email,email_verified_at)
 values ('13400000-0000-0000-0000-000000000001','female','gangnam','kcp134@verify.local',now());
insert into identity_verification_attempts(id,user_id) values('av'||repeat('e',32),'13400000-0000-0000-0000-000000000001');
insert into kcp_direct_registrations(id,flow,app_origin,registration_key) values('av'||repeat('e',32),'member','https://www.aftersunset.kr','fixture');
select is((select returned_at from kcp_direct_registrations where id='av'||repeat('e',32)),null::timestamptz,'registration alone is not a callback');
update identity_verification_attempts set consumed_at=now() where id='av'||repeat('e',32);
select ok(not exists(select 1 from kcp_direct_registrations where id='av'||repeat('e',32)),'consuming identity removes provider key');
insert into identity_verification_attempts(id,user_id)
select 'av' || md5('s134' || n), '13400000-0000-0000-0000-000000000001' from generate_series(1,4) as n;
select throws_ok($$insert into identity_verification_attempts(id,user_id) values
  ('av'||repeat('f',32),'13400000-0000-0000-0000-000000000001')$$,'P0001','daily limit','sixth member attempt refused before external registration');
select * from finish();
rollback;
