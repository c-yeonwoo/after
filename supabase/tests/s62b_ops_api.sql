begin;
select plan(17);
select set_config('test.ops_missing_baseline', (
  select count(*) from ops_current_sources() s
   where not exists (select 1 from ops_cases c
    where c.case_type = s.case_type and c.source_id = s.source_id
      and c.status not in ('resolved','superseded'))
)::text, true);

insert into auth.users (id, email, encrypted_password, email_confirmed_at, aud, role,
                        confirmation_token, recovery_token, email_change,
                        email_change_token_new, email_change_token_current,
                        phone_change, phone_change_token, reauthentication_token,
                        raw_app_meta_data, raw_user_meta_data)
values
  ('62b00000-0000-0000-0000-000000000001','admin62b@t.co','x',now(),'authenticated','authenticated','','','','','','','','','{}'::jsonb,'{}'::jsonb),
  ('62b00000-0000-0000-0000-000000000002','member62b@t.co','x',now(),'authenticated','authenticated','','','','','','','','','{}'::jsonb,'{}'::jsonb);
insert into profiles (id, gender, hub_id, company_email, email_verified_at,
                      name, onboarding_step, terms_agreed_at, privacy_agreed_at, role)
values
  ('62b00000-0000-0000-0000-000000000001','male','gangnam','admin62b@t.co',now(),'운영자62b',7,now(),now(),'admin'),
  ('62b00000-0000-0000-0000-000000000002','male','gangnam','member62b@t.co',now(),'회원62b',7,now(),now(),'member');
insert into support_requests(id, user_id, category, body, created_at)
values ('62b00000-0000-0000-0000-000000000003',
        '62b00000-0000-0000-0000-000000000002', 'account',
        '계정을 확인해 주세요', now()-interval '3 days');
-- Legacy-like currently pending photo: existing rows require explicit dry-run.
update profiles set photo_url = 'ops-test/path.jpg', photo_state = 'pending'
 where id = '62b00000-0000-0000-0000-000000000002';
delete from ops_case_events where case_id in
  (select id from ops_cases where case_type = 'support'
   and source_id = '62b00000-0000-0000-0000-000000000003');
delete from ops_cases where case_type = 'support'
 and source_id = '62b00000-0000-0000-0000-000000000003';
delete from ops_case_events where case_id in
  (select id from ops_cases where case_type = 'photo_review'
   and source_id = '62b00000-0000-0000-0000-000000000002');
delete from ops_cases where case_type = 'photo_review'
 and source_id = '62b00000-0000-0000-0000-000000000002';

set local role authenticated;
set local request.jwt.claims = '{"sub":"62b00000-0000-0000-0000-000000000001","role":"authenticated"}';
select is((admin_preview_ops_backfill()->>'missing_total')::integer,
  current_setting('test.ops_missing_baseline')::integer + 2,
  '기존 살아 있는 누락 작업의 dry-run 건수가 정확하다');
select throws_ok($$
  select admin_apply_ops_backfill(0, '잘못된 미리보기')
$$, 'PT409', null, '작업 수가 달라졌으면 적재를 거부한다');
select is(admin_apply_ops_backfill(
  (admin_preview_ops_backfill()->>'missing_total')::integer,
  '현재 살아 있는 건만 적재'),
  current_setting('test.ops_missing_baseline')::integer + 2,
  '확인한 현재 건만 적재한다');
select set_config('test.ops_support_case_id', (
  select item->>'id' from jsonb_array_elements(
    admin_ops_cases(null,'support',null,null,50,null)->'items') item
   where item->>'source_id' = '62b00000-0000-0000-0000-000000000003'
), true);
select is((admin_preview_ops_backfill()->>'missing_total')::integer,
  0, '중복 적재할 건이 남지 않는다');
select is((admin_ops_overview(null)->>'total')::integer,
  (admin_ops_cases(null,null,null,null,30,null)->>'total')::integer,
  '운영 홈 건수와 살아 있는 목록이 일치한다');
select ok((admin_ops_cases(null,null,null,null,30,null)->>'total')::integer >= 2,
  '작업 목록이 기존 건을 포함한 정확한 전체 건수를 반환한다');
select is(jsonb_array_length(admin_ops_cases(null,null,null,null,1,null)->'items'),
  1, '작업 목록은 요청한 페이지 크기를 지킨다');
select is((admin_ops_case_detail(
  current_setting('test.ops_support_case_id')::uuid)->>'source_open')::boolean,
  true, '작업 상세는 원본 상태를 재확인한다');
select ok((admin_ops_case_detail(
  current_setting('test.ops_support_case_id')::uuid)->'case'->>'due_at')::timestamptz < now(),
  '기존 문의의 기한은 백필 시각이 아니라 원본 발생 시각을 따른다');
select is((select status from admin_transition_case(
  current_setting('test.ops_support_case_id')::uuid,
  'start',1,'문의 확인 시작', '62b00000-0000-0000-0000-000000000010')),
  'in_progress', '작업을 시작하고 버전을 올린다');
select throws_ok($$
  select admin_transition_case(
    current_setting('test.ops_support_case_id')::uuid,
    'wait',1,'응답 대기', '62b00000-0000-0000-0000-000000000011', now()+interval '1 hour')
$$, 'PT409', null, '오래된 버전은 조치하지 않는다');
select throws_ok($$
  select admin_transition_case(
    current_setting('test.ops_support_case_id')::uuid,
    'resolve',2,'완료 처리', '62b00000-0000-0000-0000-000000000012')
$$, 'PT409', null, '원본 문의가 열려 있으면 완료로 숨길 수 없다');
select is((select status from admin_transition_case(
  current_setting('test.ops_support_case_id')::uuid,
  'wait',2,'회원 답변 대기', '62b00000-0000-0000-0000-000000000013', now()+interval '1 hour')),
  'waiting', '보류에는 다음 확인시각이 필요하다');
select is((select version from admin_transition_case(
  current_setting('test.ops_support_case_id')::uuid,
  'wait',2,'회원 답변 대기', '62b00000-0000-0000-0000-000000000013', now()+interval '1 hour')),
  3, '같은 요청 ID 재시도는 버전을 다시 올리지 않는다');
select ok(jsonb_array_length(admin_member_timeline(
  '62b00000-0000-0000-0000-000000000002', null, 30)->'items') >= 2,
  '회원 타임라인은 작업과 원본 사건을 함께 보여준다');
set local request.jwt.claims = '{"sub":"62b00000-0000-0000-0000-000000000002","role":"authenticated"}';
select throws_ok($$
  select admin_ops_overview(null)
$$, '42501', null, '일반 회원은 운영 요약을 읽을 수 없다');
select throws_ok($$
  select admin_transition_case(
    current_setting('test.ops_support_case_id')::uuid,
    'reopen',3,'권한 없는 변경', '62b00000-0000-0000-0000-000000000014')
$$, '42501', null, '일반 회원은 작업 상태를 바꿀 수 없다');

select * from finish();
rollback;
