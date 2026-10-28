begin;
select no_plan();
insert into auth.users(id,email,email_confirmed_at,aud,role)
select ('a1130000-0000-0000-0000-'||lpad(n::text,12,'0'))::uuid,'continuity113-'||n||'@verify.local',now(),'authenticated','authenticated' from generate_series(1,2) n;
insert into profiles(id,gender,hub_id,company_email,name,onboarding_step)
select id,case when email like '%1@%' then 'male'::gender else 'female'::gender end,'gangnam',email,'가상연속대화',7 from auth.users where email like 'continuity113-%@verify.local';
update app_settings set assistant_chat_enabled=true,assistant_profile_edit_enabled=true;
select set_config('request.jwt.claim.sub','a1130000-0000-0000-0000-000000000001',true);
select assistant_manager_consent(true,'manager-continuity-v2');
insert into assistant_turns(id,owner_id,privacy_revision,question,answer,state,created_at)
select ('a1130000-0000-0000-0001-'||lpad(n::text,12,'0'))::uuid,auth.uid(),2,'질문 '||n,'답변 '||n,'complete',now()-interval '1 hour'
from generate_series(1,45) n;
select is(jsonb_array_length(assistant_history()->'turns'),20,'latest page bounded at 20');
select is(assistant_history()->'turns'->0->>'question','질문 26','stable ID order for same timestamp');
select is(jsonb_array_length(assistant_history(now()-interval '1 hour','a1130000-0000-0000-0001-000000000026')->'turns'),20,'older page preserves same-time records');
select is(assistant_history(now()-interval '1 hour','a1130000-0000-0000-0001-000000000006')->'turns'->0->>'question','질문 1','oldest page remains available');
select is(my_assistant_state()->'turns',assistant_history()->'turns','home and full conversation share exact records');
select ok(not has_function_privilege('anon','assistant_history(timestamptz,uuid)','execute'),'anonymous history forbidden');
select ok(not has_function_privilege('authenticated','assistant_record_completion()','execute'),'members cannot forge success receipts');
select set_config('request.jwt.claim.sub','a1130000-0000-0000-0000-000000000002',true);
select is(jsonb_array_length(assistant_history()->'turns'),0,'another account cannot see earlier pages');
select set_config('request.jwt.claim.sub','a1130000-0000-0000-0000-000000000001',true);
select begin_profile_revision('a1130000-0000-0000-0002-000000000001','좀 더 편안한 말투로 다듬어주세요',true);
select is((select count(*)::int from assistant_turns where owner_id=auth.uid() and kind='profile_applied'),0,'generating is not a success event');
-- Synthetic service-side transition tests the transactional trigger, not LLM quality.
update profile_revision_drafts set state='approved',approved_at=now() where id='a1130000-0000-0000-0002-000000000001';
select is((select count(*)::int from assistant_turns where owner_id=auth.uid() and kind='profile_applied'),1,'server completion records one event');
update profile_revision_drafts set state='approved' where id='a1130000-0000-0000-0002-000000000001';
select is((select count(*)::int from assistant_turns where owner_id=auth.uid() and kind='profile_applied'),1,'repeated receipt never duplicates');
select ok((select source_id='a1130000-0000-0000-0002-000000000001' from assistant_turns where owner_id=auth.uid() and kind='profile_applied'),'event tied to its real receipt');
select assistant_begin_turn('a1130000-0000-0000-0003-000000000001','이어서 물어볼게요',2);
select is(jsonb_array_length(assistant_turn_context('a1130000-0000-0000-0003-000000000001')->'history'),6,'LLM context remains bounded');
select ok(not (assistant_turn_context('a1130000-0000-0000-0003-000000000001')->'history')::text like '%프로필 반영 결과%','completion event does not become user disclosure');
select assistant_forget('history');
select is(jsonb_array_length(assistant_history()->'turns'),0,'delete also removes completion events and older pages');
select is(assistant_history()->>'revision','3','delete revision fences stale pages');
update profile_revision_drafts set state='approved' where id='a1130000-0000-0000-0002-000000000001';
select is(jsonb_array_length(assistant_history()->'turns'),0,'reading or retrying old success cannot resurrect deleted history');
select assistant_consent(false);
insert into profile_revision_drafts(id,owner_id,instruction,source_document,source_revision,source_fingerprint)
values('a1130000-0000-0000-0002-000000000002',auth.uid(),'가상 요청','{}',now(),'synthetic');
update profile_revision_drafts set state='approved' where id='a1130000-0000-0000-0002-000000000002';
select is((select count(*)::int from assistant_turns where owner_id=auth.uid()),0,'no private timeline without consent');
select assistant_manager_consent(true,'manager-continuity-v2');
update app_settings set assistant_chat_enabled=false;
insert into profile_revision_drafts(id,owner_id,instruction,source_document,source_revision,source_fingerprint)
values('a1130000-0000-0000-0002-000000000003',auth.uid(),'가상 요청','{}',now(),'synthetic');
update profile_revision_drafts set state='approved' where id='a1130000-0000-0000-0002-000000000003';
select is((select count(*)::int from assistant_turns where owner_id=auth.uid()),0,'off flag prevents new event writes');
update app_settings set assistant_chat_enabled=true;
do $$begin
  for n in 1..10 loop
    perform reserve_ai_run(auth.uid(),'assistant_chat',repeat('b',64),gen_random_uuid(),'test','test');
  end loop;
end $$;
select lives_ok($$select assistant_begin_turn('a1130000-0000-0000-0003-000000000002','지금 진행 상태',(my_assistant_state()->>'revision')::bigint)$$,'model quota does not block a deterministic service turn');
select is(reserve_ai_run(auth.uid(),'assistant_chat',repeat('b',64),gen_random_uuid(),'test','test')->>'reason','daily_limit','model reservation still enforces original daily limit');
select assistant_finish_turn(auth.uid(),'a1130000-0000-0000-0003-000000000002',(my_assistant_state()->>'revision')::bigint,'현재 상태를 확인해 주세요.');
insert into assistant_memories(owner_id,content,source_kind,expires_at) values(auth.uid(),'곧 지워질 합성 선호','manual',now()-interval '1 second');
select assistant_begin_turn('a1130000-0000-0000-0003-000000000003','만료 후 질문',(my_assistant_state()->>'revision')::bigint);
select lives_ok($$select assistant_turn_context('a1130000-0000-0000-0003-000000000003')$$,'memory expiry refreshes privacy revision before new turn');
select * from finish();
rollback;
