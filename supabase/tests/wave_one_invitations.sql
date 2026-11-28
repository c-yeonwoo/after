begin;
select no_plan();
set local request.headers='{"x-forwarded-for":"wave-one-qa"}';
set local request.jwt.claims='{"role":"service_role","aal":"aal2"}';
update app_settings set identity_required=false,admin_mfa_required=false where id;
update beta_wave_one_invites set opened_at=null,started_at=null,joined_at=null,member_id=null;
create temp table wave_codes as select gender,seat,code from beta_wave_one_invites;
grant select on wave_codes to anon,authenticated;
create function pg_temp.inv(g text,n int) returns uuid language sql stable as $$
  select code from wave_codes where gender::text=g and seat=n
$$;
create function pg_temp.stage(g text,n int) returns text language sql stable as $$
  select r->>'stage' from jsonb_array_elements(wave_one_progress()) r where r->>'gender'=g and (r->>'seat')::int=n
$$;
create function pg_temp.person(n int) returns uuid language sql immutable as $$
  select ('93290000-0000-0000-0000-'||lpad(n::text,12,'0'))::uuid
$$;
create function pg_temp.login(n int) returns text language sql as $$
  select set_config('request.jwt.claims',json_build_object('sub',pg_temp.person(n),'role','authenticated','aal','aal2')::text,true)
$$;
insert into auth.users(id,email,email_confirmed_at,aud,role)
select pg_temp.person(n),'wave-one'||n||'@verify.local',now(),'authenticated','authenticated' from generate_series(1,4)n;
select is(jsonb_array_length(wave_one_progress()),6,'six seats across the two audiences');
select is(pg_temp.stage('female',1),'issued','a generated link has not been visited');
set local role anon;
select throws_ok('select code from beta_wave_one_invites','42501',null,'anonymous cannot obtain codes');
select throws_ok('select wave_one_progress()','42501',null,'anonymous cannot read progress');
select is(open_wave_invite(gen_random_uuid()),'invalid','unknown link has a useful state');
select is(open_wave_invite(pg_temp.inv('female',1)),'open','individual invitation can be opened');
select is(open_wave_invite(pg_temp.inv('female',1)),'open','a preview cannot claim a seat');
reset role;
select is(pg_temp.stage('female',1),'opened','opened but not started');
select begin_wave_signup(pg_temp.inv('female',1),repeat('1',64),(select signup_version from policy_control where id),null);
select is(signup_session_status(repeat('1',64))->>'invited','true','fixed callback restores invited session context');
select is(pg_temp.stage('female',1),'signup','signup consent is associated before authentication');
select throws_ok($$select start_wave_signup(pg_temp.inv('male',1),repeat('1',64))$$,'PT409','different invite session','another invite cannot replace a bound session');
select pg_temp.login(1);
set local role authenticated;
select throws_ok($$select create_signup_profile(repeat('1',64),'yeouido','male')$$,'PT409','invite audience mismatch','wrong audience rolls the profile back');
reset role;
select is((select count(*)::int from profiles where id=pg_temp.person(1)),0,'failed enrollment does not leave a half-created profile');
set local role authenticated;
select lives_ok($$select create_signup_profile(repeat('1',64),'yeouido','female')$$,'normal authenticated signup claims the invited seat');
select lives_ok($$select join_wave_invite(pg_temp.inv('female',1))$$,'same member can safely retry');
select is(open_wave_invite(pg_temp.inv('female',1)),'mine','signed-in recipient can reopen own link');
select throws_ok($$select join_wave_invite(pg_temp.inv('female',2))$$,'PT409','already joined this wave','one member cannot take two slots');
select throws_ok('select admin_invite_beta_observations()','42501',null,'member cannot see even the other five stage labels');
reset role;
select is(pg_temp.stage('female',1),'verification','new profile still waiting for account verification');
select is((select r->>'code' from jsonb_array_elements(wave_one_progress()) r where r->>'seat'='1' and r->>'gender'='female'),null::text,'claimed code is no longer offered for copying');
select pg_temp.login(2);
select begin_signup_with_manager(repeat('2',64),(select signup_version from policy_control where id),null);
select create_signup_profile(repeat('2',64),'yeouido','male');
select ok(not exists(select 1 from beta_wave_one_invites where member_id=pg_temp.person(2)),'ordinary signup stays outside the cohort');
set local role authenticated;
select is(open_wave_invite(pg_temp.inv('female',1)),'used','another member learns no progress or identity');
select throws_ok($$select join_wave_invite(pg_temp.inv('female',1))$$,'PT409','invite unavailable','first claim is permanent');
select lives_ok($$select join_wave_invite(pg_temp.inv('male',1))$$,'existing account can explicitly join');
reset role;
set local request.jwt.claims='{"role":"service_role","aal":"aal2"}';
update profiles set phone_verified_at=now() where id in(pg_temp.person(1),pg_temp.person(2));
select is(pg_temp.stage('female',1),'profile','phone verified, profile still unfinished');
update profiles set onboarding_step=7,name='테스트',birth='1993-01-01',job='기획',photo_paths=array['1','2','3'],photo_state='pending'
where id in(pg_temp.person(1),pg_temp.person(2));
select is(pg_temp.stage('male',1),'review','submitted profile is awaiting photo review');
update profiles set photo_state='rejected' where id=pg_temp.person(1);
select is(pg_temp.stage('female',1),'revision','rejected photos require member action');
update profiles set photo_state='approved' where id in(pg_temp.person(1),pg_temp.person(2));
select is(pg_temp.stage('female',1),'first_wait','approval does not imply delivery');
insert into candidate_impressions(viewer_id,candidate_id) values(pg_temp.person(1),pg_temp.person(2));
select is(pg_temp.stage('female',1),'first_intro','female first impression');
insert into affinities(from_id,to_id,verdict) values(pg_temp.person(1),pg_temp.person(2),'like');
select is(pg_temp.stage('male',1),'first_wait','inbound like alone does not deliver a card');
insert into intro_queue(male_id,female_id,curated_by,position,delivered_at,expires_at)
values(pg_temp.person(2),pg_temp.person(1),pg_temp.person(2),1,now(),now()+interval '3 days');
select is(pg_temp.stage('male',1),'first_intro','male first card delivery');
insert into intros(id,male_id,female_id,closed_at,outcome) values(pg_temp.person(21),pg_temp.person(2),pg_temp.person(1),now()-interval '2 days','ticket_used');
insert into tickets(id,user_id,state,kind,price_krw,intro_id,used_at)
values(pg_temp.person(22),pg_temp.person(2),'used','meeting',0,pg_temp.person(21),now()-interval '3 days');
insert into meetings(id,intro_id,ticket_id,confirmed_at,scheduled_at,completed_at,private_opens_at)
values(pg_temp.person(23),pg_temp.person(21),pg_temp.person(22),now()-interval '4 days',now()-interval '2 days',now()-interval '2 days',now()-interval '4 days');
select is(pg_temp.stage('female',1),'feedback','past scheduled date awaits individual feedback');
select pg_temp.login(1);
select submit_feedback_with_preference(pg_temp.person(23),true,'friend','coffee');
select is(pg_temp.stage('female',1),'second_wait','first attended review with preference awaits the next new card');
select pg_temp.login(2);
select submit_meeting_feedback(pg_temp.person(23),true,'friend',null);
select is(pg_temp.stage('male',1),'no_preference','ordinary optional review is not a preference');
savepoint unmatched;
update beta_second_intros set reflected=false,shown_at=clock_timestamp() where member_id=pg_temp.person(1);
select is(pg_temp.stage('female',1),'not_reflected','receiving a second card does not itself mean the preference was used');
rollback to unmatched;
set local request.jwt.claims='{"role":"service_role","aal":"aal2"}';
insert into profiles(id,company_email,gender,hub_id,name,job,birth,role,onboarding_step,
 email_verified_at,terms_agreed_at,privacy_agreed_at,agreed_policy_version,phone_verified_at,photo_state,photo_paths,profile_public_signals)
values(pg_temp.person(3),'wave-one3@verify.local','male','yeouido','테스트','기획','1993-01-01','member',
 7,now(),now(),now(),'2026-10-31.1',now(),'approved',array['a','b','c'],'{"first_date":["짧게 커피"]}');
-- One transaction represents separate requests. Give the review an earlier server time.
update beta_second_intros set reviewed_at=now()-interval '1 minute' where member_id=pg_temp.person(1);
insert into candidate_impressions(viewer_id,candidate_id) values(pg_temp.person(1),pg_temp.person(3));
select pg_temp.login(1);
select is(next_candidate_with_evidence()#>>'{evidence,priority_origin}','feedback','actual next card returns feedback evidence');
select is(pg_temp.stage('female',1),'reflected','actual existing evidence drives cohort completion');
set local request.jwt.claims='{"role":"service_role","aal":"aal2"}';
update profiles set account_state='withdrawn' where id=pg_temp.person(1);
select is(pg_temp.stage('female',1),'ended','withdrawal unlinks the individual and leaves the seat closed');
select is(open_wave_invite(pg_temp.inv('female',1)),'used','withdrawal does not recycle a shared invitation');
select * from finish();
rollback;
