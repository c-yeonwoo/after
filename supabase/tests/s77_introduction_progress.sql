begin;
select plan(16);
update app_settings set identity_required = false;
update profiles set paused_at = now() where hub_id = 'yeouido';
insert into auth.users (id, email, encrypted_password, email_confirmed_at, aud, role,
  confirmation_token, recovery_token, email_change, email_change_token_new,
  email_change_token_current, phone_change, phone_change_token, reauthentication_token,
  raw_app_meta_data, raw_user_meta_data)
select ('77000000-0000-0000-0000-00000000000' || n)::uuid, 'intro77-' || n || '@verify.local',
  'x', now(), 'authenticated', 'authenticated', '', '', '', '', '', '', '', '', '{}', '{}'
from generate_series(1, 3) n;
insert into profiles (id, gender, hub_id, company_email, email_verified_at, name, birth,
  onboarding_step, terms_agreed_at, privacy_agreed_at, agreed_policy_version,
  phone_verified_at, photo_paths, photo_state, photo_reviewed_at)
select id, case when email = 'intro77-3@verify.local' then 'male'::gender else 'female'::gender end,
  'yeouido', email, now(), '소개77', '1993-01-01', 7, now(), now(), '2026-10-17.3', now(),
  array[id::text || '/1.png', id::text || '/2.png', id::text || '/3.png'], 'approved', now()
from auth.users where email like 'intro77-%@verify.local';

set local role anon;
select throws_ok($$select home_state_v2()$$, '42501', null, 'anonymous cannot read progress');
reset role;
set local role authenticated;
set local request.jwt.claims = '{"sub":"77000000-0000-0000-0000-000000000001","role":"authenticated"}';
select throws_ok($$select home_state_v2_before_intro_progress()$$, '42501', null, 'private previous wrapper stays private');
select is(home_state_v2() #>> '{intro_progress,has_likes}', 'false', 'no likes is not a waiting match');
select is(home_state_v2()->>'primary_state', 'intro_available', 'existing next action is preserved');
set local request.jwt.claims = '{"sub":"77000000-0000-0000-0000-000000000002","role":"authenticated"}';
insert into affinities (from_id, to_id, verdict) values
  (auth.uid(), '77000000-0000-0000-0000-000000000003', 'like');
select is(home_state_v2() #>> '{intro_progress,has_likes}', 'true', 'own committed like appears');
set local request.jwt.claims = '{"sub":"77000000-0000-0000-0000-000000000001","role":"authenticated"}';
select is(home_state_v2() #>> '{intro_progress,has_likes}', 'false', 'another womans like is not disclosed');
insert into affinities (from_id, to_id, verdict) values
  (auth.uid(), '77000000-0000-0000-0000-000000000003', 'like');
select is(home_state_v2() #>> '{intro_progress,has_likes}', 'true', 'progress survives a fresh read');
select is((select count(*)::integer from jsonb_object_keys(home_state_v2()->'intro_progress')), 1,
  'progress exposes only a boolean, no opposite-party identity or verdict');
set local request.jwt.claims = '{"sub":"77000000-0000-0000-0000-000000000003","role":"authenticated"}';
select is(home_state_v2() #>> '{intro_progress,has_likes}', 'false', 'man cannot see received preference information');
reset role;
update profiles set paused_at = now() where id = '77000000-0000-0000-0000-000000000003';
set local role authenticated;
set local request.jwt.claims = '{"sub":"77000000-0000-0000-0000-000000000001","role":"authenticated"}';
select is(home_state_v2() #>> '{intro_progress,has_likes}', 'false', 'unavailable target does not imply an active introduction');
reset role;
update profiles set paused_at = null, hub_id = 'pangyo' where id = '77000000-0000-0000-0000-000000000003';
set local role authenticated;
select is(home_state_v2() #>> '{intro_progress,has_likes}', 'false', 'another work zone is not a waiting introduction');
reset role;
update profiles set hub_id = 'yeouido' where id = '77000000-0000-0000-0000-000000000003';
insert into intros (male_id, female_id) values
  ('77000000-0000-0000-0000-000000000003', '77000000-0000-0000-0000-000000000001');
set local role authenticated;
select is(home_state_v2() #>> '{intro_progress,has_likes}', 'true', 'opened profile alone is not a completed meeting');
reset role;
update intros set closed_at = now(), outcome = 'passed'
where male_id = '77000000-0000-0000-0000-000000000003';
set local role authenticated;
select is(home_state_v2() #>> '{intro_progress,has_likes}', 'false', 'ended pair is not shown as still waiting');
reset role;
update profiles set phone_verified_at = null where id = '77000000-0000-0000-0000-000000000002';
set local role authenticated;
set local request.jwt.claims = '{"sub":"77000000-0000-0000-0000-000000000002","role":"authenticated"}';
select is(home_state_v2() #>> '{intro_progress,has_likes}', 'false', 'readiness loss suppresses waiting progress');
select is(home_state_v2()->>'primary_state', 'phone_required', 'readiness remains higher priority');
reset role;
select is((select count(*)::integer from tickets where user_id::text like '77000000-%'), 0,
  'reading progress never issues or consumes a ticket');
select * from finish();
rollback;
