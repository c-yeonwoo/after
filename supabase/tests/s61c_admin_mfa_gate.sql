begin;
select plan(6);

insert into auth.users (id, email, encrypted_password, email_confirmed_at, aud, role,
                        confirmation_token, recovery_token, email_change,
                        email_change_token_new, email_change_token_current,
                        phone_change, phone_change_token, reauthentication_token,
                        raw_app_meta_data, raw_user_meta_data)
values
  ('61c00000-0000-0000-0000-000000000001','admin61c@t.co','x',now(),'authenticated','authenticated','','','','','','','','','{}'::jsonb,'{}'::jsonb),
  ('61c00000-0000-0000-0000-000000000002','man61c@t.co','x',now(),'authenticated','authenticated','','','','','','','','','{}'::jsonb,'{}'::jsonb);
insert into profiles (id, gender, hub_id, company_email, email_verified_at,
                      name, onboarding_step, terms_agreed_at, privacy_agreed_at, role)
values
  ('61c00000-0000-0000-0000-000000000001','male','gangnam','admin61c@t.co',now(),'운영자61c',7,now(),now(),'admin'),
  ('61c00000-0000-0000-0000-000000000002','male','gangnam','man61c@t.co',now(),'남성61c',7,now(),now(),'member');

select is((select admin_mfa_required from app_settings where id), false,
  '운영자 복구 확인 전 MFA 강제는 기본 OFF다');
update app_settings set payments_enabled = false, admin_mfa_required = true where id;
set local role authenticated;
set local request.jwt.claims = '{"sub":"61c00000-0000-0000-0000-000000000001","role":"authenticated","aal":"aal1"}';
select is(admin_sensitive_auth_ok(), false, 'aal1 은 민감 조치에 충분하지 않다');
select throws_ok($$
  select admin_set_payments(true, 'MFA test')
$$, '42501', null, 'aal1 운영자는 결제를 켤 수 없다');
select throws_ok($$
  select admin_set_account_state(
    '61c00000-0000-0000-0000-000000000002', 'banned', 'MFA test')
$$, '42501', null, 'aal1 운영자는 회원을 제재할 수 없다');
set local request.jwt.claims = '{"sub":"61c00000-0000-0000-0000-000000000001","role":"authenticated","aal":"aal2"}';
select is(admin_sensitive_auth_ok(), true, 'aal2 는 민감 조치에 충분하다');
select lives_ok($$
  select admin_set_payments(true, 'MFA test')
$$, 'aal2 운영자는 결제를 켤 수 있다');

select * from finish();
rollback;
