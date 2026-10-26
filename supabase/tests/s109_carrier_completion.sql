begin;
select plan(14);
select ok(not has_function_privilege('service_role',
  'public.finish_carrier_identity(uuid,text,date,text,text)', 'execute'), 'legacy genderless completion is private');
select ok(not has_function_privilege('authenticated',
  'public.finish_carrier_identity(uuid,text,date,text,text,public.gender)', 'execute'), 'client cannot submit verified identity');
select ok(has_function_privilege('service_role',
  'public.finish_carrier_identity(uuid,text,date,text,text,public.gender)', 'execute'), 'Edge can complete identity');
insert into auth.users(id,email) values
 ('10900000-0000-0000-0000-000000000001','identity109a@verify.local'),
 ('10900000-0000-0000-0000-000000000002','identity109b@verify.local');
insert into profiles(id,gender,hub_id,company_email,email_verified_at) values
 ('10900000-0000-0000-0000-000000000001','female','gangnam','identity109a@verify.local',now()),
 ('10900000-0000-0000-0000-000000000002','female','gangnam','identity109b@verify.local',now());
insert into identity_verification_attempts(id,user_id) values
 ('av10900000000000000000000000000001','10900000-0000-0000-0000-000000000001'),
 ('av10900000000000000000000000000002','10900000-0000-0000-0000-000000000002');
select throws_ok($$select public.finish_carrier_identity(
 '10900000-0000-0000-0000-000000000001','av10900000000000000000000000000001',
 '1994-02-15','+821010900001','di109-a','male')$$,
 '22023','identity gender mismatch','mismatch does not rewrite gender');
select ok((select identity_verified_at is null from profiles where id='10900000-0000-0000-0000-000000000001'),
 'mismatch leaves identity unverified');
select ok((select consumed_at is null from identity_verification_attempts where id='av10900000000000000000000000000001'),
 'mismatch does not consume attempt');
select throws_ok($$select public.finish_carrier_identity(
 '10900000-0000-0000-0000-000000000002','av10900000000000000000000000000001',
 '1994-02-15','+821010900001','di109-a','female')$$,
 'P0002','verification attempt expired','another user cannot claim attempt');
select throws_ok($$select public.finish_carrier_identity(
 '10900000-0000-0000-0000-000000000001','av10900000000000000000000000000001',
 current_date,'+821010900001','di109-a','female')$$,
 '22023','adult only','minors cannot complete');
select lives_ok($$select public.finish_carrier_identity(
 '10900000-0000-0000-0000-000000000001','av10900000000000000000000000000001',
 '1994-02-15','+821010900001','di109-a','female')$$,'adult completes');
update identity_verification_attempts set created_at=now()-interval '1 day'
 where id='av10900000000000000000000000000001';
select lives_ok($$select public.finish_carrier_identity(
 '10900000-0000-0000-0000-000000000001','av10900000000000000000000000000001',
 '1994-02-15','+821010900001','di109-a','female')$$,'completed receipt survives attempt expiry');
select is((select count(*)::integer from carrier_identity_links where user_id='10900000-0000-0000-0000-000000000001'),1,
 'retry does not duplicate identity');
select throws_ok($$select public.finish_carrier_identity(
 '10900000-0000-0000-0000-000000000002','av10900000000000000000000000000002',
 '1994-02-15','+821010900002','di109-a','female')$$,
 '23505','identity already in use','duplicate DI rejected');
select throws_ok($$select public.finish_carrier_identity(
 '10900000-0000-0000-0000-000000000002','av10900000000000000000000000000002',
 '1994-02-15','+821010900001','di109-b','female')$$,
 '23505','phone in use','duplicate phone rejected');
update profiles set account_state='withdrawn' where id='10900000-0000-0000-0000-000000000001';
select throws_ok($$select public.finish_carrier_identity(
 '10900000-0000-0000-0000-000000000001','av10900000000000000000000000000001',
 '1994-02-15','+821010900001','di109-a','female')$$,
 'P0002','active profile not found','withdrawal invalidates receipt');
select * from finish();
rollback;
