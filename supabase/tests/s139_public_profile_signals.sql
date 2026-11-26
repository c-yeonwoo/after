begin;
select no_plan();
insert into auth.users(id,instance_id,aud,role,email,encrypted_password,email_confirmed_at,created_at,updated_at) values
 ('13900000-0000-4000-8000-000000000001','00000000-0000-0000-0000-000000000000','authenticated','authenticated','signals@verify.local','',now(),now(),now());
insert into profiles(id,gender,hub_id,company_email,email_verified_at,name,birth,job,onboarding_step,role,profile_preferences)
 values ('13900000-0000-4000-8000-000000000001','female','gangnam','signals@verify.local',now(),'검증 회원','1997-04-12','기획자',4,'member','{"choices":{"first_date":["짧게 커피"],"contact":["퇴근 후 편하게"]}}');
select is((select profile_public_signals from profiles where id='13900000-0000-4000-8000-000000000001'),'{}'::jsonb,'private historic selections are not backfilled into public data');
select is(public.normalize_profile_signals('{"contact":["퇴근 후 편하게"],"planning":["상대와 함께 맞추기"],"secret":["private"],"first_date":["없는 선택"]}'),'{}'::jsonb,'private, unknown and invalid fields are rejected');
create temp table signal_test_data(draft jsonb,conditions jsonb);
insert into signal_test_data values ('{"version":3,"stage":"preview","sourceRevision":1,"storySourceRevision":1,
 "answers":{"daily_life":"퇴근 후에는 가볍게 산책해요."},
 "choices":{"first_date":["짧게 커피","함께 걷기"],"relationship_goal":["결혼도 생각하는 연애"],"care":["혼자 쉴 시간 존중하기"],"contact":["퇴근 후 편하게"]},
 "publicIds":["answer:daily_life","choice:first_date:0","choice:relationship_goal:2","choice:care:2","choice:contact:2"],
 "story":{"version":3,"headline":"함께 나누고 싶은 편안한 일상","summary":"퇴근 후에는 동네를 천천히 걸으며 하루를 정리해요.","sections":[{"id":"daily_life","questionId":"daily_life_v1","questionVersion":1,"question":"퇴근 후에는 어떻게 보내세요?","answer":"퇴근 후에는 동네를 천천히 걸으며 하루를 정리해요."}],"conversationHooks":[],"publishedRevision":0}}',
 '{"name":"검증 회원","birth":"1997-04-12","job":"기획자","photos":["p/a","p/b","p/c"],"smoking":"none","drinking":"rare","mbti":"","religion":""}');
grant select,update on signal_test_data to authenticated;
set local role authenticated;
set local request.jwt.claims='{"sub":"13900000-0000-4000-8000-000000000001","role":"authenticated"}';
select is(save_profile_interview_draft((select draft from signal_test_data),0),1::bigint,'draft saves without publishing signals');
select is((select profile_public_signals from profiles where id=auth.uid()),'{}'::jsonb,'unapproved draft stays private');
select lives_ok($$select publish_profile_interview_v3(1,(select conditions from signal_test_data))$$,'explicit publication succeeds');
select is((select profile_public_signals->'first_date' from profiles where id=auth.uid()),'["짧게 커피"]'::jsonb,'only checked option is public');
select is((select profile_public_signals->'relationship_goal' from profiles where id=auth.uid()),'["결혼도 생각하는 연애"]'::jsonb,'relationship intent is a literal self-reported preference');
select is((select profile_public_signals ? 'contact' from profiles where id=auth.uid()),false,'private contact preference never becomes public even with forged public ID');
select is((select profile_preferences->'choices'->'contact' from profiles where id=auth.uid()),'["퇴근 후 편하게"]'::jsonb,'private coordination answer is preserved');
select is((select profile_public_signals->'care' from get_public_profile(auth.uid())),'["혼자 쉴 시간 존중하기"]'::jsonb,'authorized public profile includes approved care preference');
select throws_ok($$update profiles set profile_public_signals='{}' where id=auth.uid()$$,'42501',null,'direct projection assignment cannot bypass publication');
update signal_test_data set draft=jsonb_set(draft,'{publicIds}','["answer:daily_life","choice:first_date:1"]');
select is(save_profile_interview_draft((select draft from signal_test_data),0),1::bigint,'new private draft starts at revision one');
select lives_ok($$select publish_profile_interview_v3(1,(select conditions from signal_test_data))$$,'same prose can publish new choice approvals');
select is((select profile_story->>'publishedRevision' from profiles where id=auth.uid()),'2','public revision advances even when prose is identical');
select is((select profile_public_signals from profiles where id=auth.uid()),'{"first_date":["함께 걷기"]}'::jsonb,'removed approval disappears and changed choice is refreshed');
select is((select verified_intro_answer_ids from profiles where id=auth.uid()),array['daily_life:1'],'typing an original in a published interview establishes its source');
-- Simulate a cached profile editor putting untouched AI prose back in answers on a job-only edit.
update signal_test_data set draft=jsonb_set(draft,'{answers,daily_life}',draft#>'{story,sections,0,answer}'),
  conditions=jsonb_set(conditions,'{job}','"새 직업"');
select save_profile_interview_draft((select draft from signal_test_data),0);
select lives_ok($$select publish_profile_interview_v3(1,(select conditions from signal_test_data))$$,'old basic-only editor can still publish');
select is((select verified_intro_answer_ids from profiles where id=auth.uid()),'{}'::text[],'copying a generated public answer back never certifies authorship');
-- Retain a previous AI sentence and edit only its neighbor.
update signal_test_data set draft=jsonb_set(jsonb_set(draft,'{answers,daily_life}',to_jsonb((draft#>>'{story,sections,0,answer}')||' 집 앞 카페가 편해요.')),
  '{story,sections,0,answer}',to_jsonb((draft#>>'{story,sections,0,answer}')||' 집 앞 카페가 편해요.'));
select save_profile_interview_draft((select draft from signal_test_data),0);
select lives_ok($$select publish_profile_interview_v3(1,(select conditions from signal_test_data))$$,'mixed authorship in one section can be published');
select is((select verified_intro_answer_ids from profiles where id=auth.uid()),array['daily_life:2'],'only the new second sentence belongs to the member');
update signal_test_data set draft=jsonb_set(jsonb_set(draft,'{answers,daily_life}','"동네 카페에서 커피를 즐겨요."'),'{story,sections,0,answer}','"동네 카페에서 커피를 즐겨요."');
select save_profile_interview_draft((select draft from signal_test_data),0);
select lives_ok($$select publish_profile_interview_v3(1,(select conditions from signal_test_data))$$,'the member can still write a new answer themselves');
select is((select verified_intro_answer_ids from profiles where id=auth.uid()),array['daily_life:1'],'newly authored and published answer is identifiable');
reset role;
update profiles set account_state='withdrawn' where id='13900000-0000-4000-8000-000000000001';
select is((select profile_public_signals from profiles where id='13900000-0000-4000-8000-000000000001'),'{}'::jsonb,'withdrawal clears public signals');
select is((select verified_intro_answer_ids from profiles where id='13900000-0000-4000-8000-000000000001'),'{}'::text[],'withdrawal clears source markers');
select * from finish();
rollback;
