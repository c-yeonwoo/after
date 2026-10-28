begin;
select no_plan();
insert into auth.users(id,email,email_confirmed_at,aud,role)
select ('a1150000-0000-0000-0000-'||lpad(n::text,12,'0'))::uuid,'manager115-'||n||'@verify.local',now(),'authenticated','authenticated' from generate_series(1,2) n;
insert into profiles(id,gender,hub_id,company_email,name,birth,job,mbti,intro,onboarding_step)
select id,'female','gangnam',email,'비공개이름','1997-01-01','디자이너','INFJ','주말에는 전시를 봐요.',7 from auth.users where email like 'manager115-%@verify.local';
update app_settings set assistant_chat_enabled=true,assistant_memory_enabled=true;
select set_config('request.jwt.claim.sub','a1150000-0000-0000-0000-000000000001',true);
insert into assistant_preferences(owner_id,consented_at,policy_version,revision) values(auth.uid(),now(),'assistant-private-v1',1);
insert into assistant_turns(id,owner_id,privacy_revision,question,answer,state,created_at)
values('a1150000-0000-0000-0001-000000000001',auth.uid(),1,'전시 이야기를 좋아해요','함께 전시 이야기도 나눠보세요','complete',now()-interval '40 days');
select ok((select expires_at < 'infinity'::timestamptz from assistant_turns where owner_id=auth.uid()),'legacy retention not silently extended');
select is(my_assistant_state()->>'consented','false','new personal context requires renewed notice');
select is(assistant_consent(true)->>'consented','false','old browser payload cannot acknowledge the new notice');
select ok((select expires_at < 'infinity'::timestamptz from assistant_turns where owner_id=auth.uid()),'old browser request does not extend retention');
select throws_ok($$select assistant_manager_consent(true,'wrong-policy')$$,'PT409','policy changed','new endpoint validates exact notice version');
select throws_ok($$select assistant_begin_turn('a1150000-0000-0000-0001-000000000002','전시 추천',1)$$,'PT403','consent required or disabled','old consent cannot send profile to model');
select assistant_manager_consent(true,'manager-continuity-v2');
select is((select expires_at::text from assistant_turns where owner_id=auth.uid()),'infinity','explicit renewal extends live archive');
select is(jsonb_array_length(assistant_history()->'turns'),1,'archive includes older than 30 days');
insert into assistant_turns(id,owner_id,privacy_revision,question,answer,state,created_at)
select gen_random_uuid(),auth.uid(),(my_assistant_state()->>'revision')::bigint,'최근 질문 '||n,'최근 답변 '||n,'complete',now()-make_interval(mins=>10-n) from generate_series(1,7) n;
select assistant_begin_turn('a1150000-0000-0000-0001-000000000002','전시 이야기는 어떻게 꺼낼까요?',(my_assistant_state()->>'revision')::bigint);
select is(jsonb_array_length(assistant_turn_context('a1150000-0000-0000-0001-000000000002')->'history'),6,'recent context bounded at six turns');
select is(assistant_turn_context('a1150000-0000-0000-0001-000000000002')->'related_history'->0->>'question','전시 이야기를 좋아해요','relevant older user words recovered without AI inferences');
select is(assistant_turn_context('a1150000-0000-0000-0001-000000000002')->'owner_profile'->>'job','디자이너','general advice receives owner profile');
select ok(not (assistant_turn_context('a1150000-0000-0000-0001-000000000002')->'owner_profile' ?| array['phone','name','birth','company_email','photo_paths']),'identity and contacts excluded from model profile');
select ok(not (assistant_turn_context('a1150000-0000-0000-0001-000000000002')->'related_history'->0 ? 'answer'),'retrieval excludes earlier model suggestions');
select set_config('request.jwt.claim.sub','a1150000-0000-0000-0000-000000000002',true);
select assistant_manager_consent(true,'manager-continuity-v2');
select throws_ok($$select assistant_turn_context('a1150000-0000-0000-0001-000000000002')$$,'PT409','context unavailable','other member cannot retrieve conversation or profile');
select set_config('request.jwt.claim.sub','a1150000-0000-0000-0000-000000000001',true);
select assistant_forget('history');
select is((select count(*)::int from assistant_turns where owner_id=auth.uid()),0,'reset erases entire archive');
select ok(not assistant_finish_turn(auth.uid(),'a1150000-0000-0000-0001-000000000002',3,'늦은 응답'),'reset fences late generation');
select * from finish();
rollback;
