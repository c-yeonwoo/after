begin;
select no_plan();

insert into auth.users (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at, created_at, updated_at)
values
  ('51000000-0000-0000-0000-0000000000a1','00000000-0000-0000-0000-000000000000','authenticated','authenticated','m50@corp.example','',now(),now(),now()),
  ('51000000-0000-0000-0000-0000000000f1','00000000-0000-0000-0000-000000000000','authenticated','authenticated','f50a@corp.example','',now(),now(),now()),
  ('51000000-0000-0000-0000-0000000000f2','00000000-0000-0000-0000-000000000000','authenticated','authenticated','f50b@corp.example','',now(),now(),now()),
  ('51000000-0000-0000-0000-0000000000ad','00000000-0000-0000-0000-000000000000','authenticated','authenticated','admin50@corp.example','',now(),now(),now());

insert into profiles (id, gender, hub_id, company_email, email_verified_at, name, birth, job, headline,
                      topics, interests, onboarding_step, terms_agreed_at, privacy_agreed_at, role)
values
  ('51000000-0000-0000-0000-0000000000a1','male','gangnam','m50@corp.example',now(),'남오공','1992-01-01','기획',
   '저녁엔 달립니다', '{좋아하는 음악,여행 다녀온 이야기}', '{러닝,재즈}', 7,now(),now(),'member'),
  ('51000000-0000-0000-0000-0000000000f1','female','gangnam','f50a@corp.example',now(),'여오공가',
   (current_date - interval '30 years')::date,'회계','요즘은 클라이밍',
   '{좋아하는 음악,일 이야기}', '{재즈,클라이밍}', 7,now(),now(),'member'),
  ('51000000-0000-0000-0000-0000000000f2','female','gangnam','f50b@corp.example',now(),'여오공나',
   (current_date - interval '28 years')::date,'디자인','산책을 좋아해요',
   '{반려동물}', '{산책}', 7,now(),now(),'member'),
  ('51000000-0000-0000-0000-0000000000ad','male','gangnam','admin50@corp.example',now(),'운영','1990-01-01','운영',
   null, '{}', '{}', 7,now(),now(),'admin');

update profiles set phone_verified_at = now(), photo_paths = array[id::text || '/portrait.png', id::text || '/2.png', id::text || '/3.png'] where id::text like '51000000-%';
update profiles set photo_state = 'approved', photo_reviewed_at = now()
 where photo_url = id::text || '/portrait.png' and id::text like '51000000-%';

insert into affinities (from_id, to_id, verdict)
values ('51000000-0000-0000-0000-0000000000f1','51000000-0000-0000-0000-0000000000a1','like'),
       ('51000000-0000-0000-0000-0000000000f2','51000000-0000-0000-0000-0000000000a1','like');

insert into intro_queue (male_id, female_id, position, curated_by, reason)
values ('51000000-0000-0000-0000-0000000000a1','51000000-0000-0000-0000-0000000000f1',0,'51000000-0000-0000-0000-0000000000ad','운영자가 승인한 소개 문장'),
       ('51000000-0000-0000-0000-0000000000a1','51000000-0000-0000-0000-0000000000f2',1,'51000000-0000-0000-0000-0000000000ad',null);
select promote_intro_queue('51000000-0000-0000-0000-0000000000a1');

insert into intros(id,male_id,female_id,closed_at,outcome)
values ('51000000-0000-0000-0000-000000000011','51000000-0000-0000-0000-0000000000a1','51000000-0000-0000-0000-0000000000f2',now()-interval '2 days','ticket_used');
insert into tickets(id,user_id,kind,state,intro_id,price_krw,used_at)
values ('51000000-0000-0000-0000-000000000012','51000000-0000-0000-0000-0000000000a1','meeting','used','51000000-0000-0000-0000-000000000011',0,now());
insert into meetings(id,intro_id,ticket_id,scheduled_at,confirmed_at,private_opens_at)
values ('51000000-0000-0000-0000-000000000013','51000000-0000-0000-0000-000000000011','51000000-0000-0000-0000-000000000012',now()-interval '2 days',now()-interval '3 days',now()-interval '3 days');

set local role authenticated;
set local request.jwt.claims='{"sub":"51000000-0000-0000-0000-0000000000a1","role":"authenticated"}';
select throws_ok($$select submit_feedback_with_preference('51000000-0000-0000-0000-000000000013',false,'noshow','walk')$$,'22023',null,'no-show cannot set a date preference');
select throws_ok($$select submit_feedback_with_preference('51000000-0000-0000-0000-000000000013',true,'again','arbitrary')$$,'22023',null,'unsupported preference rejected');
select lives_ok($$select submit_feedback_with_preference('51000000-0000-0000-0000-000000000013',true,'friend','coffee','후기만의 비공개 문장')$$,'explicit preference saves atomically with feedback');
select lives_ok($$select submit_feedback_with_preference('51000000-0000-0000-0000-000000000013',true,'friend','coffee','후기만의 비공개 문장')$$,'identical retry is idempotent');
select throws_ok($$select submit_feedback_with_preference('51000000-0000-0000-0000-000000000013',true,'friend','meal','후기만의 비공개 문장')$$,'PT409',null,'conflicting retry cannot replace preference');
select is((select reason from intro_teaser()),'운영자가 승인한 소개 문장','unmatched preference keeps the curated reason');
reset role;
update profiles set profile_public_signals='{"first_date":["짧게 커피"]}' where id='51000000-0000-0000-0000-0000000000f1';
set local role authenticated;
select alike((select reason from intro_teaser()),'지난 후기에서 커피 한 잔%','own preference and candidate public choice agree');
select is(intro_teaser_with_evidence()#>>'{evidence,priority_origin}','feedback','only the author sees their own feedback as the reason');
select ok(not (intro_teaser_with_evidence()->'evidence' ? 'peer_excerpt'),'a chip alone cannot become a verbatim interview answer');
select unalike((select reason from intro_teaser()),'%비공개%','raw feedback never enters the introduction');
select ok(not has_function_privilege('authenticated','public.feedback_intro_reason(uuid)','execute'),'cannot probe an arbitrary profile using helper');
set local request.jwt.claims='{"sub":"51000000-0000-0000-0000-0000000000f2","role":"authenticated"}';
select is((select count(*)::int from feedbacks where next_preference='coffee' and meeting_id='51000000-0000-0000-0000-000000000013'),0,'past partner cannot read private choice');
reset role;
update intro_queue set reason=null where female_id='51000000-0000-0000-0000-0000000000f1';
update profiles set profile_public_signals='{}' where id='51000000-0000-0000-0000-0000000000f1';
set local role authenticated;
set local request.jwt.claims='{"sub":"51000000-0000-0000-0000-0000000000a1","role":"authenticated"}';
select alike((select reason from intro_teaser()),'%공통점%','fallback uses shared visible profile data');
select is((select count(*)::int from intros where female_id='51000000-0000-0000-0000-0000000000f1'),0,'preview never opens the next card');
reset role;
-- Once a story is published, stale legacy interests must not enter a new explanation.
insert into profile_interview_drafts(user_id,data) values
 ('51000000-0000-0000-0000-0000000000f1','{"version":3,"stage":"preview","choices":{"first_date":["함께 걷기"]},"publicIds":["choice:first_date:1"]}');
update profiles set profile_story='{"version":3,"sections":[{"question":"주말에는?","answer":"산책해요."}]}'
 where id='51000000-0000-0000-0000-0000000000f1';
set local role authenticated;
select is((select shared from intro_teaser()),'{}'::text[],'superseded profile interests are excluded');
select alike((select reason from intro_teaser()),'%나란히 걷는%','unmatched preference can only describe the public answer');
select ok(not (intro_teaser_with_evidence()->'evidence' ? 'priority_origin'),'an unmatched preference is never cited');
select * from finish();
rollback;
