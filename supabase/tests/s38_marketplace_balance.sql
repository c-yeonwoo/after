-- S38 — 후보 노출 균형과 성별 대기 지표

begin;
select plan(10);

-- seed 데이터와 분리된 권역으로 만들고, 혹시 같은 권역 fixture가 있으면 잠시 쉰다.
update profiles set paused_at = now() where hub_id = 'yeouido';

insert into auth.users (id, email, encrypted_password, email_confirmed_at, aud, role,
                        confirmation_token, recovery_token, email_change,
                        email_change_token_new, email_change_token_current,
                        phone_change, phone_change_token, reauthentication_token,
                        raw_app_meta_data, raw_user_meta_data)
values
  ('38000000-0000-0000-0000-000000000001','woman381@t.co','x',now(),'authenticated','authenticated','','','','','','','','','{}'::jsonb,'{}'::jsonb),
  ('38000000-0000-0000-0000-000000000002','woman382@t.co','x',now(),'authenticated','authenticated','','','','','','','','','{}'::jsonb,'{}'::jsonb),
  ('38000000-0000-0000-0000-000000000003','man381@t.co','x',now(),'authenticated','authenticated','','','','','','','','','{}'::jsonb,'{}'::jsonb),
  ('38000000-0000-0000-0000-000000000004','man382@t.co','x',now(),'authenticated','authenticated','','','','','','','','','{}'::jsonb,'{}'::jsonb),
  ('38000000-0000-0000-0000-000000000005','man383@t.co','x',now(),'authenticated','authenticated','','','','','','','','','{}'::jsonb,'{}'::jsonb),
  ('38000000-0000-0000-0000-000000000006','admin38@t.co','x',now(),'authenticated','authenticated','','','','','','','','','{}'::jsonb,'{}'::jsonb);

insert into profiles
  (id, gender, hub_id, company_email, email_verified_at, name, onboarding_step,
   terms_agreed_at, privacy_agreed_at, role, created_at)
values
  ('38000000-0000-0000-0000-000000000001','female','yeouido','woman381@t.co',now(),'여성381',7,now(),now(),'member',now() - interval '6 days'),
  ('38000000-0000-0000-0000-000000000002','female','yeouido','woman382@t.co',now(),'여성382',7,now(),now(),'member',now() - interval '5 days'),
  ('38000000-0000-0000-0000-000000000003','male','yeouido','man381@t.co',now(),'남성381',7,now(),now(),'member',now() - interval '4 days'),
  ('38000000-0000-0000-0000-000000000004','male','yeouido','man382@t.co',now(),'남성382',7,now(),now(),'member',now() - interval '3 days'),
  ('38000000-0000-0000-0000-000000000005','male','yeouido','man383@t.co',now(),'남성383',7,now(),now(),'member',now() - interval '2 days'),
  ('38000000-0000-0000-0000-000000000006','male','yeouido','admin38@t.co',now(),'운영38',7,now(),now(),'admin',now() - interval '1 day');

select ok(
  not has_table_privilege('authenticated', 'candidate_impressions', 'SELECT'),
  'T1 후보 노출 원장은 클라이언트에서 읽을 수 없다'
);

select is(
  (select provolatile::text from pg_proc where oid = 'home_state()'::regprocedure),
  'v',
  'T2 후보를 배정하는 홈 집계는 VOLATILE로 표시된다'
);

set local role authenticated;
set local request.jwt.claims =
  '{"sub":"38000000-0000-0000-0000-000000000001","role":"authenticated"}';

select is(
  (select name from next_candidate()),
  '남성381',
  'T3 첫 여성은 동률 중 오래 기다린 남성을 본다'
);

select is(
  (select name from next_candidate()),
  '남성381',
  'T4 평가 전 새로고침은 같은 후보를 유지한다'
);

set local request.jwt.claims =
  '{"sub":"38000000-0000-0000-0000-000000000002","role":"authenticated"}';

select is(
  (select name from next_candidate()),
  '남성382',
  'T5 다음 여성은 아직 노출되지 않은 남성을 본다'
);
reset role;

insert into affinities (from_id, to_id, verdict)
values ('38000000-0000-0000-0000-000000000001',
        '38000000-0000-0000-0000-000000000003', 'like');

set local role authenticated;
set local request.jwt.claims =
  '{"sub":"38000000-0000-0000-0000-000000000001","role":"authenticated"}';

select is(
  (select name from next_candidate()),
  '남성383',
  'T6 평가를 마치면 남은 사람 중 노출이 가장 적은 후보로 넘어간다'
);
reset role;

select is(
  (select count(distinct candidate_id)::integer
     from candidate_impressions
    where viewer_id in ('38000000-0000-0000-0000-000000000001',
                        '38000000-0000-0000-0000-000000000002')),
  3,
  'T7 세 번의 신규 배정이 세 남성에게 고르게 퍼진다'
);

set local role authenticated;
set local request.jwt.claims =
  '{"sub":"38000000-0000-0000-0000-000000000001","role":"authenticated"}';
select throws_ok(
  $$ select admin_marketplace_health() $$,
  '42501',
  null,
  'T8 일반 회원은 마켓플레이스 운영 지표를 읽을 수 없다'
);

set local request.jwt.claims =
  '{"sub":"38000000-0000-0000-0000-000000000006","role":"authenticated"}';
select lives_ok(
  $$ select admin_marketplace_health() $$,
  'T9 운영자는 마켓플레이스 운영 지표를 읽을 수 있다'
);

select ok(
  (admin_marketplace_health() #>> '{male_first_exposure,sample}')::integer >= 3,
  'T10 실제로 노출된 남성 수를 대기시간 표본으로 계측한다'
);
reset role;

select * from finish();
rollback;
