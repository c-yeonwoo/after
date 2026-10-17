begin;
select plan(15);

insert into auth.users(id,instance_id,aud,role,email,encrypted_password,email_confirmed_at,created_at,updated_at)
values
 ('71000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-000000000000','authenticated','authenticated','one71@corp.example','',now(),now(),now()),
 ('71000000-0000-0000-0000-000000000002','00000000-0000-0000-0000-000000000000','authenticated','authenticated','two71@corp.example','',now(),now(),now());
insert into public.profiles(id,gender,hub_id,company_email,email_verified_at,name,birth,job,onboarding_step,role)
values
 ('71000000-0000-0000-0000-000000000001','female','gangnam','one71@corp.example',now(),'테스트 회원','1993-04-02','개발자',4,'member'),
 ('71000000-0000-0000-0000-000000000002','male','gangnam','two71@corp.example',now(),'다른 회원','1992-04-02','회사원',4,'member');

select ok(not has_function_privilege('anon','public.publish_profile_interview_v3(bigint,jsonb)','execute'),
 'anonymous cannot publish a story');
select ok(not has_table_privilege('authenticated','public.profile_generation_versions','insert,update,delete'),
 'member cannot write evaluation history');

set local role authenticated;
set local request.jwt.claims = '{"sub":"71000000-0000-0000-0000-000000000001","role":"authenticated"}';
select is(public.save_profile_interview_draft(
 '{"version":3,"stage":"preview","sourceRevision":2,"storySourceRevision":2,
   "answers":{"daily_life":"퇴근 후에는 운동해요"},
   "choices":{"contact":["퇴근 후 편하게"]},"publicIds":["answer:daily_life"],
   "story":{"version":3,"headline":"퇴근 후 운동하는 시간","summary":"퇴근 후에는 운동하며 시간을 보내요.",
     "sections":[{"id":"daily_life","questionId":"daily_life_v1","questionVersion":1,
       "question":"퇴근 후에는 어떻게 보내세요?","answer":"퇴근 후에는 운동하며 시간을 보내요."}],
     "conversationHooks":[],"publishedRevision":0}}'::jsonb,0),1::bigint,
 'v3 draft saved');
select is((select profile_story from public.profiles where id='71000000-0000-0000-0000-000000000001'),
 null::jsonb,'draft is private until approval');
select throws_ok($$select public.publish_profile_interview_v3(0,'{}'::jsonb)$$,
 'PT409',null,'stale revision cannot publish');

set local request.jwt.claims = '{"sub":"71000000-0000-0000-0000-000000000002","role":"authenticated"}';
select is((select count(*)::int from public.profile_interview_drafts),0,'other member cannot see draft');
select throws_ok($$select public.publish_profile_interview_v3(1,'{}'::jsonb)$$,
 'PT409',null,'other member cannot publish');

set local request.jwt.claims = '{"sub":"71000000-0000-0000-0000-000000000001","role":"authenticated"}';
select throws_ok($$select public.publish_profile_interview_v3(1,
 '{"name":"새 이름","birth":"1993-04-02","job":"개발자","photos":["photo/a","photo/a","photo/c"],
   "smoking":"none","drinking":"rare","mbti":"","religion":""}'::jsonb)$$,
 '22023',null,'duplicate photo paths rejected');
select is((public.publish_profile_interview_v3(1,
 '{"name":"새 이름","birth":"1993-04-02","job":"개발자",
   "photos":["photo/a","photo/b","photo/c"],"smoking":"none","drinking":"rare",
   "mbti":"","religion":""}'::jsonb)).headline,
 '퇴근 후 운동하는 시간','approved story publishes');
select is((select profile_story->>'publishedRevision' from public.profiles
 where id='71000000-0000-0000-0000-000000000001'), '1','revision captured in public story');
select is((select profile_preferences->'choices'->'contact'->>0 from public.profiles
 where id='71000000-0000-0000-0000-000000000001'), '퇴근 후 편하게',
 'private coordination choice retained outside public story');
select throws_ok($$select public.admin_profile_preferences('71000000-0000-0000-0000-000000000001')$$,
 '42501',null,'member cannot read operator-only preferences RPC');
select is((select count(*)::int from public.profile_interview_drafts
 where user_id='71000000-0000-0000-0000-000000000001'),0,'private draft removed');

reset role;
insert into public.profile_generation_versions(user_id,source_hash,prompt_version,model,analysis,candidate,verification)
values ('71000000-0000-0000-0000-000000000001',repeat('a',64),'v3','test','{}','{}','{}');
update public.profiles set account_state='withdrawn'
 where id='71000000-0000-0000-0000-000000000001';
select is((select profile_story from public.profiles where id='71000000-0000-0000-0000-000000000001'),
 null::jsonb,'withdrawal erases approved story');
select is((select count(*)::int from public.profile_generation_versions
 where user_id='71000000-0000-0000-0000-000000000001'),0,'withdrawal erases candidates');

select * from finish();
rollback;
