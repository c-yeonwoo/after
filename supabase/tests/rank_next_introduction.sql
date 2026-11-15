begin;
select no_plan();
select set_config('request.jwt.claims','{"role":"service_role","aal":"aal2"}',true);
update app_settings set identity_required=false,admin_mfa_required=false;
update profiles set paused_at=now() where role='member';
create function pg_temp.member(n integer) returns uuid language sql immutable as $$
  select ('81000000-0000-0000-0000-'||lpad(n::text,12,'0'))::uuid
$$;
insert into auth.users(id,email,aud,role,email_confirmed_at,encrypted_password)
select pg_temp.member(n),'rank'||n||'@verify.local','authenticated','authenticated',now(),'x' from generate_series(1,7)n;
insert into profiles(id,company_email,gender,hub_id,name,job,birth,role,onboarding_step,
 email_verified_at,terms_agreed_at,privacy_agreed_at,agreed_policy_version,phone_verified_at,
 photo_state,photo_paths,created_at)
select pg_temp.member(n),'rank'||n||'@verify.local',case when n in(2,3,7) then 'female'::gender else 'male'::gender end,
 'yeouido','회원'||n,'기획','1993-01-01',case when n=4 then 'admin' else 'member' end,
 7,now(),now(),now(),'2026-10-31.1',now(),'approved',array[n||'/1',n||'/2',n||'/3'],now()-(8-n)*interval '1 day'
from generate_series(1,7)n;
update profiles set profile_public_signals='{"first_date":["함께 걷기"]}' where id=pg_temp.member(3);
update profiles set profile_public_signals='{"first_date":["짧게 커피"]}' where id=pg_temp.member(6);
insert into affinities(from_id,to_id,verdict,created_at) values
(pg_temp.member(7),pg_temp.member(1),'pass',now()),
(pg_temp.member(2),pg_temp.member(1),'like',now()-interval '12 hours'),
(pg_temp.member(3),pg_temp.member(1),'like',now());
insert into intros(id,male_id,female_id,closed_at,outcome) values
(pg_temp.member(21),pg_temp.member(1),pg_temp.member(7),now()-interval '2 days','ticket_used');
insert into tickets(id,user_id,state,kind,price_krw,intro_id,used_at) values
(pg_temp.member(22),pg_temp.member(1),'used','meeting',0,pg_temp.member(21),now()-interval '3 days');
insert into meetings(id,intro_id,ticket_id,confirmed_at,scheduled_at,completed_at,private_opens_at) values
(pg_temp.member(23),pg_temp.member(21),pg_temp.member(22),now()-interval '4 days',now()-interval '2 days',now()-interval '2 days',now()-interval '4 days');
create function pg_temp.as_member(n integer) returns text language sql as $$
 select set_config('request.jwt.claims',json_build_object('sub',pg_temp.member(n),'role','authenticated','aal','aal2')::text,true)
$$;
set local role authenticated;
select pg_temp.as_member(4);
select is(admin_curation_recommendations(pg_temp.member(1))#>>'{items,0,female_id}',pg_temp.member(2)::text,'no feedback: original ordering');
select pg_temp.as_member(7);
select submit_feedback_with_preference(pg_temp.member(23),true,'friend','coffee');
select is((select id from next_candidate()),pg_temp.member(6),'female: newer coffee profile ahead of older nonmatch');
select is((select id from next_candidate()),pg_temp.member(6),'refresh pins displayed candidate');
reset role;
update profiles set profile_public_signals='{}' where id=pg_temp.member(6);
set local role authenticated;
select is((select id from next_candidate()),pg_temp.member(6),'already presented candidate survives loss of ranking boost');
reset role;
insert into affinities(from_id,to_id,verdict) values(pg_temp.member(7),pg_temp.member(6),'pass');
set local role authenticated;
select is((select id from next_candidate()),pg_temp.member(5),'nonmatching candidate remains next');
select pg_temp.as_member(1);
select submit_feedback_with_preference(pg_temp.member(23),true,'friend','walk');
select pg_temp.as_member(4);
select is(admin_curation_recommendations(pg_temp.member(1))#>>'{items,0,female_id}',pg_temp.member(3)::text,'male: walk profile moves ahead');
select is(admin_curation_recommendations(pg_temp.member(1))#>>'{items,1,female_id}',pg_temp.member(2)::text,'male: other candidate retained');
reset role;
update affinities set created_at=now()-interval '4 days' where from_id=pg_temp.member(2);
set local role authenticated;
select is(admin_curation_recommendations(pg_temp.member(1))#>>'{items,0,female_id}',pg_temp.member(2)::text,'overdue reviews still first');
reset role;
update affinities set created_at=now()-interval '12 hours' where from_id=pg_temp.member(2);
set local role authenticated;
select admin_set_queue(pg_temp.member(1),array(select (item->>'female_id')::uuid from jsonb_array_elements(admin_curation_recommendations(pg_temp.member(1))->'items') with ordinality it(item,n) order by n),'QA');
select pg_temp.as_member(1);
select alike((select reason from intro_teaser()),'지난 후기에서 산책%', 'first delivered teaser reflects the approved ranking');
select ok(not has_function_privilege('authenticated','latest_date_preference(uuid)','execute'),'private preference cannot be queried by members');
select * from finish();
rollback;
