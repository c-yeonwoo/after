begin;
select plan(39);
select set_config('request.jwt.claims','{"role":"service_role","aal":"aal2"}',true);
update public.app_settings set identity_required=false,admin_mfa_required=false;
update public.profiles set paused_at=now() where hub_id='yeouido';
insert into auth.users(id,email,aud,role,email_confirmed_at,encrypted_password)
select ('78000000-0000-0000-0000-00000000000'||n)::uuid,'curation78-'||n||'@verify.local',
 'authenticated','authenticated',now(),'x' from generate_series(1,4) n;
insert into public.profiles(id,company_email,gender,hub_id,name,job,birth,role,onboarding_step,
 email_verified_at,terms_agreed_at,privacy_agreed_at,agreed_policy_version,phone_verified_at,
 photo_state,photo_paths,headline,intro,interests,profile_public_signals,profile_preferences)
select id,email,case when email in ('curation78-1@verify.local','curation78-4@verify.local') then 'male'::gender else 'female'::gender end,
 'yeouido','개인식별이름','직업','1993-01-01',case when email='curation78-4@verify.local' then 'admin' else 'member' end,
 7,now(),now(),now(),'2026-10-17.3',now(),'approved',array[id||'/1.png',id||'/2.png',id||'/3.png'],
 '첫 만남은 커피가 좋아요','처음에는 커피를 마시며 이야기하고 싶어요.',array['커피'],
 '{"first_date":["짧게 커피"]}'::jsonb,
 '{"choices":{"first_date":["짧게 커피"],"contact":["PRIVATE-CONTACT-SENTINEL"]}}'::jsonb
from auth.users where email like 'curation78-%@verify.local';
insert into public.affinities(from_id,to_id,verdict,created_at) values
 ('78000000-0000-0000-0000-000000000002','78000000-0000-0000-0000-000000000001','like',now()),
 ('78000000-0000-0000-0000-000000000003','78000000-0000-0000-0000-000000000001','like',now()-interval '4 days');
insert into public.meet_windows(user_id,weekdays,earliest_local) values
 ('78000000-0000-0000-0000-000000000001','{1,2}','19:00'),
 ('78000000-0000-0000-0000-000000000002','{2,3}','19:30');
select ok(not has_table_privilege('authenticated','public.pair_brief_drafts','select,insert'), 'members cannot read or forge drafts');
select ok(not has_table_privilege('authenticated','public.curation_recommendations','select'), 'internal scores are not member-visible');
select ok(not has_function_privilege('authenticated','public.pair_brief_context(uuid,uuid)','execute'), 'private context is service-only');
select ok(not has_function_privilege('authenticated','public.curation_recommendation_tick(uuid)','execute'), 'batch runner is private');
select ok(not has_table_privilege('service_role','public.pair_brief_drafts','insert'), 'even service must use atomic store');
set local role authenticated;
set local request.jwt.claims='{"sub":"78000000-0000-0000-0000-000000000002","role":"authenticated"}';
select throws_ok($$select public.admin_curation_recommendations('78000000-0000-0000-0000-000000000001')$$,'42501',null,'members cannot get pool scores');
select throws_ok($$select public.admin_apply_pair_reason('78000000-0000-0000-0000-000000000001','78000000-0000-0000-0000-000000000002',repeat('a',64),1)$$,'42501',null,'members cannot approve a recommendation');
reset role;
select is(public.curation_recommendation_tick('78000000-0000-0000-0000-000000000001'),2,'two eligible like pairs are scored');
select is((select preference_dimensions from public.curation_recommendations where female_id='78000000-0000-0000-0000-000000000002'),1,'first-date preference is a declared shared dimension');
update profiles set profile_public_signals='{}' where id='78000000-0000-0000-0000-000000000002';
select public.curation_recommendation_tick('78000000-0000-0000-0000-000000000001');
select is((select preference_dimensions from public.curation_recommendations where female_id='78000000-0000-0000-0000-000000000002'),0,'private unapproved choices cannot inflate visible support counts');
update profiles set profile_public_signals='{"first_date":["짧게 커피"]}' where id='78000000-0000-0000-0000-000000000002';
select public.curation_recommendation_tick('78000000-0000-0000-0000-000000000001');

select is((select schedule_overlap from public.curation_recommendations where female_id='78000000-0000-0000-0000-000000000002'),1,'fresh availability overlap is counted');
select ok((select schedule_overlap is null from public.curation_recommendations where female_id='78000000-0000-0000-0000-000000000003'),'missing availability stays unknown, not incompatible');
select is((select count(*)::integer from public.intro_queue where male_id='78000000-0000-0000-0000-000000000001'),0,'batch never sends introductions');
select is((select count(*)::integer from public.tickets where user_id::text like '78000000-%'),0,'batch never charges or issues tickets');
set local role authenticated;
set local request.jwt.claims='{"sub":"78000000-0000-0000-0000-000000000004","role":"authenticated","aal":"aal2"}';
select is(public.admin_curation_recommendations('78000000-0000-0000-0000-000000000001')#>>'{items,0,female_id}',
 '78000000-0000-0000-0000-000000000003','overdue members get review priority, not automatic delivery');
reset role;
select ok(public.pair_brief_context('78000000-0000-0000-0000-000000000001','78000000-0000-0000-0000-000000000002')::text not like '%PRIVATE-CONTACT-SENTINEL%','private preferences never enter LLM context');
select ok(public.pair_brief_context('78000000-0000-0000-0000-000000000001','78000000-0000-0000-0000-000000000002')::text not like '%개인식별이름%','names are not explicitly sent to the model');
select is(length(public.pair_brief_context('78000000-0000-0000-0000-000000000001','78000000-0000-0000-0000-000000000002')->>'source_hash'),64,'source fingerprint is SHA-256');
update public.meet_windows set updated_at=now()-interval '15 days' where user_id='78000000-0000-0000-0000-000000000002';
select public.curation_recommendation_tick('78000000-0000-0000-0000-000000000001');
select ok((select schedule_overlap is null from public.curation_recommendations where female_id='78000000-0000-0000-0000-000000000002'),'stale availability is not a current match signal');
insert into public.ai_runs(user_id,feature,prompt_version,model,status) values
 ('78000000-0000-0000-0000-000000000004','pair_brief','fixture','fixture','success');
select set_config('test.pair_run',(select id::text from public.ai_runs where user_id='78000000-0000-0000-0000-000000000004'),true);
select set_config('test.pair_hash',public.pair_brief_context('78000000-0000-0000-0000-000000000001','78000000-0000-0000-0000-000000000002')->>'source_hash',true);
select is(public.store_pair_brief_draft('78000000-0000-0000-0000-000000000001','78000000-0000-0000-0000-000000000002',current_setting('test.pair_hash'),
 '{"verified":true,"recommendation":{"text":"두 분 모두 첫 만남에는 커피를 마시며 이야기하고 싶다고 하셨어요. 편안하게 대화를 시작해 보시면 좋겠어요."}}',current_setting('test.pair_run')::bigint,'fixture','fixture','78000000-0000-0000-0000-000000000004'),true,'verified run stores a private draft atomically');
set local role authenticated;
set local request.jwt.claims='{"sub":"78000000-0000-0000-0000-000000000004","role":"authenticated","aal":"aal2"}';
select throws_ok($$select public.admin_apply_pair_reason('78000000-0000-0000-0000-000000000001','78000000-0000-0000-0000-000000000002',current_setting('test.pair_hash'),current_setting('test.pair_run')::bigint)$$,'PT409',null,'draft cannot publish before queue approval');
select public.admin_set_queue('78000000-0000-0000-0000-000000000001',array['78000000-0000-0000-0000-000000000002']::uuid[],'fixture operator approval');
select throws_ok($$select public.admin_apply_pair_reason('78000000-0000-0000-0000-000000000001','78000000-0000-0000-0000-000000000002',current_setting('test.pair_hash'),current_setting('test.pair_run')::bigint+999)$$,'22023',null,'approval binds the exact reviewed run, not just the source');
select lives_ok($$select public.admin_apply_pair_reason('78000000-0000-0000-0000-000000000001','78000000-0000-0000-0000-000000000002',current_setting('test.pair_hash'),current_setting('test.pair_run')::bigint)$$,'operator can publish the verified exact draft');
reset role;
select is((select reason from public.intro_queue where male_id='78000000-0000-0000-0000-000000000001'),
 '두 분 모두 첫 만남에는 커피를 마시며 이야기하고 싶다고 하셨어요. 편안하게 대화를 시작해 보시면 좋겠어요.','published reason is exactly the reviewed text');
update public.profiles set intro='새로 바꾼 공개 소개글이에요.' where id='78000000-0000-0000-0000-000000000002';
select ok((select reason is null from public.intro_queue where male_id='78000000-0000-0000-0000-000000000001'),'unopened AI reason is cleared when its public source changes');
set local role authenticated;
select throws_ok($$select public.admin_apply_pair_reason('78000000-0000-0000-0000-000000000001','78000000-0000-0000-0000-000000000002',current_setting('test.pair_hash'),current_setting('test.pair_run')::bigint)$$,'PT409',null,'stale profile cannot approve old wording');
reset role;
select is(public.store_pair_brief_draft('78000000-0000-0000-0000-000000000001','78000000-0000-0000-0000-000000000002',current_setting('test.pair_hash'),'{"verified":true}',current_setting('test.pair_run')::bigint,'fixture','fixture','78000000-0000-0000-0000-000000000004'),false,'stale generation cannot race into the cache');
update public.profiles set paused_at=now() where id='78000000-0000-0000-0000-000000000002';
select ok(public.pair_brief_context('78000000-0000-0000-0000-000000000001','78000000-0000-0000-0000-000000000002') is null,'paused member makes pair unavailable');
update public.profiles set paused_at=null where id='78000000-0000-0000-0000-000000000002';
update public.profiles set hub_id='pangyo' where id='78000000-0000-0000-0000-000000000003';
select public.curation_recommendation_tick('78000000-0000-0000-0000-000000000001');
select is((select count(*)::integer from public.curation_recommendations where male_id='78000000-0000-0000-0000-000000000001'),0,'changed zones and already queued pairs leave the pool');
update public.profiles set account_state='withdrawn' where id='78000000-0000-0000-0000-000000000002';
select is((select count(*)::integer from public.pair_brief_drafts where female_id='78000000-0000-0000-0000-000000000002'),0,'withdrawal erases cached prose');
select ok(public.pair_brief_context('78000000-0000-0000-0000-000000000001','78000000-0000-0000-0000-000000000002') is null,'withdrawn member cannot be sent to the provider');
select is((select count(*)::integer from cron.job where jobname='curation_recommendations_15m'),1,'one bounded-frequency batch is scheduled');
select ok(not has_function_privilege('anon','public.admin_apply_pair_reason(uuid,uuid,text,bigint)','execute'),'anonymous cannot publish');
select ok(not has_function_privilege('authenticated','public.store_pair_brief_draft(uuid,uuid,text,jsonb,bigint,text,text,uuid)','execute'),'member cannot forge a verified cache');
select is((select count(*)::integer from public.tickets where user_id::text like '78000000-%'),0,'draft publication does not charge tickets');
select is((select count(*)::integer from public.intros where male_id='78000000-0000-0000-0000-000000000001'),0,'explanation approval does not open an introduction');
update public.profiles set hub_id='yeouido' where id='78000000-0000-0000-0000-000000000003';
insert into public.profile_interview_drafts(user_id,revision,data) values
 ('78000000-0000-0000-0000-000000000003',1,'{"version":3,"stage":"preview","publicIds":[],"choices":{"contact":["PRIVATE-CONTACT-SENTINEL"]}}');
update public.profiles set profile_story='{"version":3,"headline":"퇴근하면 동네를 걸어요","summary":"퇴근하고 동네를 걸으며 시간을 보내요.","sections":[{"id":"daily_life","questionId":"daily_life_v1","questionVersion":1,"question":"퇴근 후에는 어떻게 보내세요?","answer":"퇴근하고 동네를 걸으며 시간을 보내요."}],"conversationHooks":[],"publishedRevision":1}'
 where id='78000000-0000-0000-0000-000000000003';
select is(public.pair_brief_context('78000000-0000-0000-0000-000000000001','78000000-0000-0000-0000-000000000003')#>>'{sources,b,profile_story,sections,0,answer}',
 '퇴근하고 동네를 걸으며 시간을 보내요.','latest approved interview reaches the pair brief');
select ok(public.pair_brief_context('78000000-0000-0000-0000-000000000001','78000000-0000-0000-0000-000000000003')::text not like '%PRIVATE-CONTACT-SENTINEL%','V3 private choices stay out of the public prose context');
select ok((select profile_preferences::text like '%PRIVATE-CONTACT-SENTINEL%' from public.profiles where id='78000000-0000-0000-0000-000000000003'),'private preferences remain separately available for concierge coordination');
select * from finish();
rollback;
