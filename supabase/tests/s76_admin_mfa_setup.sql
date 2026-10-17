begin;
select no_plan();
insert into auth.users(id,email,aud,role) values
 ('76000000-0000-0000-0000-000000000001','mfa76-admin@verify.local','authenticated','authenticated'),
 ('76000000-0000-0000-0000-000000000002','mfa76-member@verify.local','authenticated','authenticated');
insert into profiles(id,gender,hub_id,company_email,name,role) values
 ('76000000-0000-0000-0000-000000000001','male','gangnam','mfa76-admin@verify.local','QA76','admin'),
 ('76000000-0000-0000-0000-000000000002','female','gangnam','mfa76-member@verify.local','QA76','member');
update app_settings set admin_mfa_required=false;
select ok(not has_function_privilege('anon','admin_set_mfa_requirement(boolean,boolean,boolean,uuid)','execute'),'anonymous cannot change admin security');
set local role authenticated;
set local request.jwt.claims='{"sub":"76000000-0000-0000-0000-000000000002","role":"authenticated","aal":"aal2"}';
select throws_ok($$select admin_set_mfa_requirement(true,false,true,gen_random_uuid())$$,'42501','verified admin MFA session required','ordinary member cannot change global MFA');
set local request.jwt.claims='{"sub":"76000000-0000-0000-0000-000000000001","role":"authenticated","aal":"aal2"}';
select throws_ok($$select admin_set_mfa_requirement(true,false,true,gen_random_uuid())$$,'42501','verified admin MFA session required','a claim without a registered verified factor is insufficient');
reset role;
insert into auth.mfa_factors(id,user_id,friendly_name,factor_type,status,secret,created_at,updated_at)
 values('76000000-0000-0000-0000-000000000003','76000000-0000-0000-0000-000000000001','QA76 synthetic','totp','verified','synthetic-test-only',now(),now());
set local role authenticated;
set local request.jwt.claims='{"sub":"76000000-0000-0000-0000-000000000001","role":"authenticated","aal":"aal1"}';
select throws_ok($$select admin_set_mfa_requirement(true,false,true,gen_random_uuid())$$,'42501','verified admin MFA session required','password-only admin cannot enable enforcement');
select throws_ok($$select admin_set_mfa_requirement(false,false,false,gen_random_uuid())$$,'42501','verified admin MFA session required','password-only admin cannot disable enforcement');
set local request.jwt.claims='{"sub":"76000000-0000-0000-0000-000000000001","role":"authenticated","aal":"aal2"}';
select throws_ok($$select admin_set_mfa_requirement(true,false,false,gen_random_uuid())$$,'22023','confirm recovery before enforcement','recovery must be explicitly acknowledged');
select throws_ok($$select admin_set_mfa_requirement(true,true,true,gen_random_uuid())$$,'PT409','stale_version','stale security setting cannot overwrite a newer value');
select is(admin_set_mfa_requirement(true,false,true,'76000000-0000-0000-0000-000000000004'),true,'verified operator explicitly enables MFA');
select is(admin_set_mfa_requirement(true,false,true,'76000000-0000-0000-0000-000000000004'),true,'retry is idempotent');
select throws_ok($$select admin_set_mfa_requirement(false,true,false,'76000000-0000-0000-0000-000000000004')$$,'PT409','request ID conflict','request ID cannot be reused for the opposite action');
select is(admin_sensitive_auth_ok(),true,'verified session can perform sensitive actions');
set local request.jwt.claims='{"sub":"76000000-0000-0000-0000-000000000001","role":"authenticated","aal":"aal1"}';
select is(admin_sensitive_auth_ok(),false,'fresh password session must challenge its authenticator');
set local request.jwt.claims='{"sub":"76000000-0000-0000-0000-000000000001","role":"authenticated","aal":"aal2"}';
select is(admin_set_mfa_requirement(false,true,false,'76000000-0000-0000-0000-000000000005'),false,'verified operator can explicitly disable enforcement');
reset role;
select is((select count(*)::int from admin_actions where request_id='76000000-0000-0000-0000-000000000004'),1,'MFA change has one audit record with no QR or secret');
select * from finish();
rollback;
