begin;
-- This suite also runs on an explicitly enabled local manual-test stack.
update app_settings set assistant_chat_enabled=false,assistant_memory_enabled=false,assistant_schedule_enabled=false;
select plan(30);
insert into auth.users(id,instance_id,aud,role,email,encrypted_password,email_confirmed_at,created_at,updated_at)
select ('96000000-0000-0000-0000-'||lpad(n::text,12,'0'))::uuid,'00000000-0000-0000-0000-000000000000','authenticated','authenticated','private96-'||n||'@verify.local','',now(),now(),now() from generate_series(1,2) n;
insert into public.profiles(id,gender,hub_id,company_email,name,onboarding_step)
select id,case when email like '%1@%' then 'male'::gender else 'female'::gender end,'gangnam',email,'가상검증',7 from auth.users where email like 'private96-%@verify.local';
select ok(not has_table_privilege('authenticated','public.assistant_memories','select'),'memory access only through owner RPC');
select ok(not has_table_privilege('authenticated','public.assistant_turns','insert'),'cannot forge AI replies');
select ok(not has_function_privilege('authenticated','public.assistant_finish_turn(uuid,uuid,bigint,text)','execute'),'reply writer service-only');
select ok(not (select assistant_chat_enabled or assistant_memory_enabled or assistant_schedule_enabled from app_settings),'all new write features default off');
select set_config('request.jwt.claim.sub','96000000-0000-0000-0000-000000000001',true);
select throws_ok($$select assistant_manager_consent(true,'manager-continuity-v2')$$,'PT403','feature disabled','no consent activation while disabled');
update app_settings set assistant_chat_enabled=true,assistant_memory_enabled=true;
select is(assistant_manager_consent(true,'manager-continuity-v2')->>'consented','true','explicit consent');
select is(assistant_begin_turn('96000000-0000-0000-0000-000000000010','커피로 짧게 만나는 게 좋아요',2)->>'created','true','start a private turn');
select is(assistant_begin_turn('96000000-0000-0000-0000-000000000010','커피로 짧게 만나는 게 좋아요',2)->>'created','false','same request receipt no rerun');
select throws_ok($$select assistant_begin_turn('96000000-0000-0000-0000-000000000011','다른 질문',2)$$,'PT409','turn in progress','parallel turn blocked');
select is(assistant_turn_context('96000000-0000-0000-0000-000000000010')->>'question','커피로 짧게 만나는 게 좋아요','owner may read context');
select set_config('request.jwt.claim.sub','96000000-0000-0000-0000-000000000002',true);
select is(jsonb_array_length(my_assistant_state()->'turns'),0,'other member sees no chat');
select throws_ok($$select assistant_turn_context('96000000-0000-0000-0000-000000000010')$$,'PT409','context unavailable','cross-user context denied');
select set_config('request.jwt.claim.sub','96000000-0000-0000-0000-000000000001',true);
select ok(assistant_finish_turn('96000000-0000-0000-0000-000000000001','96000000-0000-0000-0000-000000000010',2,'짧은 커피 약속으로 부담 없이 시작해 보세요.'),'matching revision stores reply');
select is(jsonb_array_length(assistant_save_memory(null,'커피로 짧게 만나는 게 좋아요',null,'96000000-0000-0000-0000-000000000010',2)->'memories'),1,'explicit source approval stores memory');
select throws_ok($$select assistant_save_memory(null,'상대가 나를 좋아한다',null,'96000000-0000-0000-0000-000000000010',3)$$,'PT409','source unavailable','cannot fabricate a source quote');
select assistant_begin_turn('96000000-0000-0000-0000-000000000012','어떻게 말을 시작할까요?',3);
select is(jsonb_array_length(assistant_turn_context('96000000-0000-0000-0000-000000000012')->'memories'),1,'approved memory enters own context');
select assistant_forget('memory',(select id from assistant_memories where owner_id=auth.uid()));
select ok(not assistant_finish_turn('96000000-0000-0000-0000-000000000001','96000000-0000-0000-0000-000000000012',3,'삭제된 기억으로 다시 답변할 수 없어요.'),'delete fences in-flight output');
select is(jsonb_array_length(my_assistant_state()->'turns'),0,'memory deletion also removes quoted conversation');
select throws_ok($$select assistant_begin_turn('96000000-0000-0000-0000-000000000012','어떻게 말을 시작할까요?',3)$$,'PT409','context changed','delayed pre-delete HTTP cannot recreate deleted turn');
select is(jsonb_array_length(my_assistant_state()->'turns'),0,'late submission leaves history erased');
select throws_ok($$select assistant_save_memory(null,'커피로 짧게 만나는 게 좋아요',null,null,2)$$,'PT409','context changed','late pre-delete memory approval rejected');
select is(jsonb_array_length(my_assistant_state()->'memories'),0,'late memory approval cannot resurrect deleted preference');
select assistant_save_memory(null,'조용한 카페를 선호해요',null,null,(my_assistant_state()->>'revision')::bigint);
select throws_ok($$select assistant_save_memory((select id from assistant_memories where owner_id=auth.uid()),'다른 선호',99,null,(my_assistant_state()->>'revision')::bigint)$$,'PT409','memory changed','stale edit rejected');
select assistant_begin_turn('96000000-0000-0000-0000-000000000013','내 선호를 알려줘',(my_assistant_state()->>'revision')::bigint);
select assistant_consent(false);
select is(jsonb_array_length(my_assistant_state()->'memories'),0,'withdraw consent erases memory');
select ok(not assistant_finish_turn('96000000-0000-0000-0000-000000000001','96000000-0000-0000-0000-000000000013',6,'철회한 정보를 다시 넣지 않습니다.'),'withdrawal fences late output');
select assistant_manager_consent(true,'manager-continuity-v2');
select assistant_begin_turn('96000000-0000-0000-0000-000000000014','중단된 요청 검사',(my_assistant_state()->>'revision')::bigint);
update assistant_turns set created_at=now()-interval '3 minutes' where id='96000000-0000-0000-0000-000000000014';
select is(assistant_begin_turn('96000000-0000-0000-0000-000000000014','중단된 요청 검사',(my_assistant_state()->>'revision')::bigint)->>'state','failed','expired pending receipt permits an explicit new retry');
do $$begin
  for n in 1..10 loop
    perform reserve_ai_run(auth.uid(),'assistant_chat',repeat('a',64),gen_random_uuid(),'test','test');
  end loop;
end$$;
select is(reserve_ai_run(auth.uid(),'assistant_chat',repeat('a',64),gen_random_uuid(),'test','test')->>'reason','daily_limit','atomic AI budget ceiling');
select assistant_forget('all');
select is(reserve_ai_run(auth.uid(),'assistant_chat',repeat('a',64),gen_random_uuid(),'test','test')->>'reason','daily_limit','clearing text cannot reset cost counter');
update app_settings set assistant_chat_enabled=false,assistant_memory_enabled=false;
select lives_ok($$select assistant_forget('all')$$,'erase remains available with feature disabled');
select ok(exists(select 1 from cron.job where jobname='expire-private-assistant'),'retention cleanup installed');
select * from finish();
rollback;
