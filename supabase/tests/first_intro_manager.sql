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
create function pg_temp.as_member(n integer) returns text language sql as $$
 select set_config('request.jwt.claims',json_build_object('sub',pg_temp.member(n),'role','authenticated','aal','aal2')::text,true)
$$;

-- The existing suite covers an attended date. This fixture starts before any introduction.
update profiles set interests=array['공연','음악'] where id in(pg_temp.member(1),pg_temp.member(7));
update profiles set interests=array['공연'] where id in(pg_temp.member(2),pg_temp.member(5));
update profiles set interests=array['음악'] where id in(pg_temp.member(3),pg_temp.member(6));
set local role authenticated;
select pg_temp.as_member(4);
select is((select value#>>'{wait,stage}' from jsonb_array_elements(admin_first_intro_waits()->'items') where value->>'id'=pg_temp.member(1)::text),'curation','operator can act on pending curation without member visit');
select admin_set_first_intro_check(pg_temp.member(1),'curation',now()+interval '1 hour',null);
select throws_ok(format('select admin_set_first_intro_check(%L,%L,now()+interval ''2 hours'',null)',pg_temp.member(1),'curation'),'PT409',null,'stale operator does not overwrite');
select pg_temp.as_member(1);
select is(home_state_v2()#>>'{first_intro_wait,stage}','supply','home does not reveal inbound likes');
select is((home_state_v2()#>>'{first_intro_wait,next_check_at}')::timestamptz,now()+interval '1 hour','member and operator see same follow-up');
select throws_ok('select admin_first_intro_waits()','42501',null,'worklist admin only');
select throws_ok(format('select save_intro_priority(%L,%L)',pg_temp.member(2),'coffee'),'42501',null,'edits are private to owner');
select pg_temp.as_member(4);
select is(admin_curation_recommendations(pg_temp.member(1))#>>'{items,0,female_id}',pg_temp.member(2)::text,'male starts with oldest like');
select pg_temp.as_member(1);
select save_intro_signal_weight(pg_temp.member(1),'공연',true);
select pg_temp.as_member(4);
select is(admin_curation_recommendations(pg_temp.member(1))#>>'{items,0,female_id}',pg_temp.member(3)::text,'less interest in exhibitions puts another shared interest first for male');
select pg_temp.as_member(1);
select save_intro_signal_weight(pg_temp.member(1),'공연',false);
select save_intro_priority(pg_temp.member(1),'walk');
select pg_temp.as_member(4);
select is(admin_curation_recommendations(pg_temp.member(1))#>>'{items,0,female_id}',pg_temp.member(3)::text,'explicit male preference changes next operator ordering');
select is(jsonb_array_length(admin_curation_recommendations(pg_temp.member(1))->'items'),2,'matched and unmatched candidates remain');
select admin_set_queue(pg_temp.member(1),array[pg_temp.member(3),pg_temp.member(2)],'QA');
select pg_temp.as_member(1);
select is(intro_teaser_with_evidence()#>>'{evidence,source}','priority','teaser explains current preference');
select ok(not(intro_teaser_with_evidence() ?| array['id','name','photo_paths','female_id']),'teaser stays anonymous');
reset role;
update profiles set profile_public_signals='{}',interests=array['산책'] where id=pg_temp.member(3);
set local role authenticated;
select alike(intro_teaser_with_evidence()#>>'{evidence,reason}','%공개 관심사에 산책%', 'legacy interest is not called a chosen first date');
select save_intro_priority(pg_temp.member(1),'any');
select is((select count(*)::integer from intros where male_id=auth.uid()),0,'correction does not open card');
select pg_temp.as_member(4);
select ok(not exists(select 1 from jsonb_array_elements(admin_first_intro_waits()->'items') where value->>'id'=pg_temp.member(1)::text),'delivered member leaves worklist');
select pg_temp.as_member(7);
select save_intro_signal_weight(pg_temp.member(7),'공연',true);
select is((select id from next_candidate()),pg_temp.member(6),'female sees someone sharing another interest first');
reset role;
update profiles set interests=array['음악','공연'] where id=pg_temp.member(6);
set local role authenticated;
select is(home_state_v2()#>>'{intro_evidence,quote}','음악','explanation chooses the still-valued common signal on a card with both');
select save_intro_priority(pg_temp.member(7),'meal');
select is((select id from next_candidate()),pg_temp.member(6),'editing does not replace the displayed female card');
select is(home_state_v2()#>>'{intro_evidence,quote}','음악','evidence points to actual public signal');
reset role;
insert into affinities(from_id,to_id,verdict) values(pg_temp.member(7),pg_temp.member(6),'like');
set local role authenticated;
select is((select id from next_candidate()),pg_temp.member(5),'other eligible person is still reachable');
reset role;
insert into affinities(from_id,to_id,verdict) values(pg_temp.member(7),pg_temp.member(5),'pass');
set local role authenticated;
select is(home_state_v2()#>>'{first_intro_wait,stage}','reply','after last card a female member waits for reply');
reset role;
insert into intros(id,male_id,female_id) values(pg_temp.member(31),pg_temp.member(6),pg_temp.member(7));
set local role authenticated;
select is(home_state_v2()#>>'{first_intro_wait,stage}','reply','reading a card does not tell the woman that a request arrived');
reset role;
update profiles set paused_at=now() where id=pg_temp.member(6);
set local role authenticated;
select ok(home_state_v2()#>>'{first_intro_wait,stage}' is distinct from 'reply','an ineligible prior like is not an actionable reply');
reset role;
delete from intro_queue where male_id=pg_temp.member(1);
set local role authenticated;
select pg_temp.as_member(1);
select ok(home_state_v2()#>>'{first_intro_wait,stage}' is null,'delivered history survives removed queue rows');
select * from finish();
rollback;
