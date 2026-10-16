begin;
select plan(17);

insert into auth.users(id,instance_id,aud,role,email,encrypted_password,email_confirmed_at,created_at,updated_at)
values
 ('67000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-000000000000','authenticated','authenticated','one67@corp.example','',now(),now(),now()),
 ('67000000-0000-0000-0000-000000000002','00000000-0000-0000-0000-000000000000','authenticated','authenticated','two67@corp.example','',now(),now(),now());
insert into public.profiles(id,gender,hub_id,company_email,email_verified_at,name,birth,job,headline,intro,onboarding_step,role)
values
 ('67000000-0000-0000-0000-000000000001','female','gangnam','one67@corp.example',now(),'기존 이름','1993-04-02','기존 직업','기존 제목','기존 소개글',7,'member'),
 ('67000000-0000-0000-0000-000000000002','male','gangnam','two67@corp.example',now(),'다른 회원','1992-04-02','회사원','다른 제목','다른 소개글',7,'member');

select ok(not has_table_privilege('authenticated','public.profile_interview_drafts','insert,update,delete'),
 'member cannot bypass revision RPC with direct writes');
select ok(not has_function_privilege('anon','public.save_profile_interview_draft(jsonb,bigint)','execute'),
 'anonymous cannot save a draft');

set local role authenticated;
set local request.jwt.claims = '{"sub":"67000000-0000-0000-0000-000000000001","role":"authenticated"}';
select is(public.save_profile_interview_draft(
 '{"version":2,"stage":"core0","profile":{},"intro":"","included":[]}'::jsonb,0),
 1::bigint,'first save creates revision one');
select is((select headline from public.profiles where id='67000000-0000-0000-0000-000000000001'),
 '기존 제목','draft does not replace the published profile');
select throws_ok($$select public.save_profile_interview_draft(
 '{"version":2,"stage":"core1","profile":{},"intro":"","included":[]}'::jsonb,0)$$,
 'PT409',null,'duplicate first save is a conflict');
select throws_ok($$select public.publish_profile_interview(1,
 '{"name":"새 이름","birth":"1993-04-02","job":"새 직업","photos":["a","b","c"],"smoking":"none","drinking":"none"}'::jsonb)$$,
 '22023',null,'unfinished interview cannot publish');

set local request.jwt.claims = '{"sub":"67000000-0000-0000-0000-000000000002","role":"authenticated"}';
select is((select count(*)::integer from public.profile_interview_drafts),0,
 'another member cannot read a private draft');
select throws_ok($$select public.publish_profile_interview(1,'{}'::jsonb)$$,
 'PT409',null,'another member cannot publish the draft');

set local request.jwt.claims = '{"sub":"67000000-0000-0000-0000-000000000001","role":"authenticated"}';
select is(public.save_profile_interview_draft(
 '{"version":2,"stage":"preview","profile":{"headline":"새로운 한 줄","eveningNote":"퇴근하고 산책해요","knownAs":"","topicNote":"","matchNote":"","interests":[],"topics":[],"matchTags":[],"details":{}},"intro":"퇴근 후 동네를 산책해요.","included":["eveningNote"]}'::jsonb,1),
 2::bigint,'preview revision saves with CAS');
select throws_ok($$select public.save_profile_interview_draft(
 '{"version":2,"stage":"preview","profile":{},"intro":"","included":[]}'::jsonb,1)$$,
 'PT409',null,'stale revision cannot overwrite a newer draft');
select throws_ok($$select public.publish_profile_interview(1,'{}'::jsonb)$$,
 'PT409',null,'stale preview cannot publish');
select is((public.publish_profile_interview(2,
 '{"name":"새 이름","birth":"1993-04-02","job":"새 직업","photos":["photo/a","photo/b","photo/c"],"smoking":"none","drinking":"rare","mbti":"","religion":""}'::jsonb)).headline,
 '새로운 한 줄','confirmed preview publishes');
select is((select name from public.profiles where id='67000000-0000-0000-0000-000000000001'),
 '새 이름','basic details publish with interview');
select is((select evening_note from public.profiles where id='67000000-0000-0000-0000-000000000001'),
 '퇴근하고 산책해요','only included source fields become public');
select is((select count(*)::integer from public.profile_interview_drafts where user_id='67000000-0000-0000-0000-000000000001'),
 0,'private draft removed after publish');

select is(public.save_profile_interview_draft(
 '{"version":2,"stage":"preview","profile":{"headline":"카톡으로 연락해요","interests":[],"topics":[],"matchTags":[],"details":{}},"intro":"제 번호는 010-1234-5678입니다.","included":[]}'::jsonb,0),
 1::bigint,'a new private draft can be started after publishing');
select throws_ok($$select public.publish_profile_interview(1,
 '{"name":"새 이름","birth":"1993-04-02","job":"새 직업","photos":["photo/a","photo/b","photo/c"],"smoking":"none","drinking":"rare","mbti":"","religion":""}'::jsonb)$$,
 '22023',null,'contact details cannot be published in the profile card');

select * from finish();
rollback;
