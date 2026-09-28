-- S39 — 시스템 운영 콘솔 권한·재시도·감사 기록

begin;
select plan(8);

insert into auth.users (id, email, encrypted_password, email_confirmed_at, aud, role,
                        confirmation_token, recovery_token, email_change,
                        email_change_token_new, email_change_token_current,
                        phone_change, phone_change_token, reauthentication_token,
                        raw_app_meta_data, raw_user_meta_data)
values
  ('39000000-0000-0000-0000-000000000001','admin39@t.co','x',now(),'authenticated','authenticated','','','','','','','','','{}'::jsonb,'{}'::jsonb),
  ('39000000-0000-0000-0000-000000000002','member39@t.co','x',now(),'authenticated','authenticated','','','','','','','','','{}'::jsonb,'{}'::jsonb);

insert into profiles
  (id, gender, hub_id, company_email, notification_email, email_verified_at, name,
   onboarding_step, terms_agreed_at, privacy_agreed_at, role)
values
  ('39000000-0000-0000-0000-000000000001','male','gangnam','admin39@t.co','admin39@t.co',now(),'운영39',7,now(),now(),'admin'),
  ('39000000-0000-0000-0000-000000000002','female','gangnam','member39@t.co','member39@t.co',now(),'회원39',7,now(),now(),'member');

insert into notifications (id, user_id, kind, attempts, last_error)
values ('39000000-0000-0000-0000-000000000003',
        '39000000-0000-0000-0000-000000000002', 'notification_email_verify', 5, 'test failure');

insert into ai_runs
  (user_id, feature, prompt_version, model, status, latency_ms, input_tokens, output_tokens)
values ('39000000-0000-0000-0000-000000000002', 'profile_copy', 'profile-copy-v2',
        'model-test', 'success', 850, 100, 40);

set local role authenticated;
set local request.jwt.claims =
  '{"sub":"39000000-0000-0000-0000-000000000002","role":"authenticated"}';
select throws_ok(
  $$ select admin_system_overview() $$,
  '42501', null, 'T1 일반 회원은 시스템 운영 현황을 읽을 수 없다'
);
select throws_ok(
  $$ select admin_retry_notifications(array['39000000-0000-0000-0000-000000000003'::uuid], '재시도') $$,
  '42501', null, 'T2 일반 회원은 실패 알림을 재시도할 수 없다'
);
reset role;

set local role authenticated;
set local request.jwt.claims =
  '{"sub":"39000000-0000-0000-0000-000000000001","role":"authenticated"}';
select lives_ok(
  $$ select admin_system_overview() $$,
  'T3 운영자는 시스템 운영 현황을 읽을 수 있다'
);
select is(
  (admin_system_overview() #>> '{notifications,failed}')::integer,
  1, 'T4 최종 실패 알림 집계가 원장과 일치한다'
);
select is(
  jsonb_array_length(admin_system_overview() #> '{ai}'),
  1, 'T5 최근 AI 실행 목록을 원문 없이 조회한다'
);
select throws_ok(
  $$ select admin_retry_notifications(array['39000000-0000-0000-0000-000000000003'::uuid], ' ') $$,
  '22023', null, 'T6 재시도 사유는 필수다'
);
select is(
  admin_retry_notifications(array['39000000-0000-0000-0000-000000000003'::uuid], '메일 설정 복구 후 재시도'),
  1, 'T7 운영자는 실패 알림을 재시도 대상으로 되돌릴 수 있다'
);
select is(
  (select count(*)::integer from admin_actions
    where kind = 'retry_notification'
      and target_ref = '39000000-0000-0000-0000-000000000003'::uuid),
  1, 'T8 재시도 조작은 알림 건별로 감사 기록에 남는다'
);
reset role;

select * from finish();
rollback;
