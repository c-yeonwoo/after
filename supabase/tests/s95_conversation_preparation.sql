begin;
select plan(23);
update public.app_settings set identity_required=false,assistant_introduction_enabled=true;
insert into auth.users(id,instance_id,aud,role,email,encrypted_password,email_confirmed_at,created_at,updated_at)
values ('95000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-000000000000','authenticated','authenticated','prep95@verify.local','',now(),now(),now());
insert into public.profiles(id,gender,hub_id,company_email,name,onboarding_step)
values ('95000000-0000-0000-0000-000000000001','female','gangnam','prep95@verify.local','가상검증',7);
select ok(not has_table_privilege('authenticated','public.conversation_preparations','select'),'members cannot bypass access recheck by reading cache');
select ok(not has_table_privilege('anon','public.conversation_preparations','select'),'anonymous cannot read cache');
select ok(not has_table_privilege('authenticated','public.conversation_preparations','insert'),'members cannot poison cache');
select is(public.reserve_ai_run('95000000-0000-0000-0000-000000000001','conversation_prep',repeat('a',64),'95000000-0000-0000-0000-000000000002','v1','test')->>'reserved','true','first preparation reserves atomically');
select is(public.reserve_ai_run('95000000-0000-0000-0000-000000000001','conversation_prep',repeat('a',64),'95000000-0000-0000-0000-000000000003','v1','test')->>'reason','in_progress','parallel identical preparation does not generate twice');
do $$ begin
  for n in 1..4 loop
    perform public.reserve_ai_run('95000000-0000-0000-0000-000000000001','conversation_prep',repeat(n::text,64),gen_random_uuid(),'v1','test');
  end loop;
end $$;
select is(public.reserve_ai_run('95000000-0000-0000-0000-000000000001','conversation_prep',repeat('b',64),gen_random_uuid(),'v1','test')->>'reason','daily_limit','sixth preparation is denied including in-flight calls');
insert into public.conversation_preparations(owner_id,target_id,source_hash,result) values('95000000-0000-0000-0000-000000000001','95000000-0000-0000-0000-000000000001',repeat('a',64),'{}');
update public.profiles set intro='새로운 공개 이야기' where id='95000000-0000-0000-0000-000000000001';
select is((select count(*)::int from public.conversation_preparations where owner_id='95000000-0000-0000-0000-000000000001'),0,'profile changes purge stale preparations');
select ok(exists(select 1 from cron.job where jobname='expire-conversation-preparations'),'expired cache has a physical cleanup job');
insert into public.conversation_preparations(owner_id,target_id,source_hash,result) values('95000000-0000-0000-0000-000000000001','95000000-0000-0000-0000-000000000001',repeat('a',64),'{}');
update public.profiles set evening_note='수정한 저녁 이야기',known_as='수정한 나의 모습',topic_note='수정한 관심사',match_note='수정한 만남 이야기' where id='95000000-0000-0000-0000-000000000001';
select is((select count(*)::int from public.conversation_preparations where owner_id='95000000-0000-0000-0000-000000000001'),0,'legacy public story fields also purge quotations');
insert into auth.users(id,instance_id,aud,role,email,encrypted_password,email_confirmed_at,created_at,updated_at)
values ('95000000-0000-0000-0000-000000000010','00000000-0000-0000-0000-000000000000','authenticated','authenticated','prep95-target@verify.local','',now(),now(),now());
insert into public.profiles(id,gender,hub_id,company_email,name,onboarding_step,updated_at)
values ('95000000-0000-0000-0000-000000000010','male','gangnam','prep95-target@verify.local','가상상대',7,now()-interval '1 second');
create temporary table prep_revisions as select id,updated_at from public.profiles where id in
  ('95000000-0000-0000-0000-000000000001','95000000-0000-0000-0000-000000000010');
select ok(not has_function_privilege('authenticated','public.store_conversation_preparation(uuid,uuid,timestamptz,timestamptz,text,jsonb)','execute'),'guarded writer is service-only');
set local request.jwt.claim.sub='95000000-0000-0000-0000-000000000001';
set local request.jwt.claims='{"sub":"95000000-0000-0000-0000-000000000001","role":"authenticated"}';
select ok(not public.conversation_preparation_allowed('95000000-0000-0000-0000-000000000010'),'no relationship does not permit preparation');
insert into public.intros(id,male_id,female_id) values('95000000-0000-0000-0000-000000000020','95000000-0000-0000-0000-000000000010','95000000-0000-0000-0000-000000000001');
select ok(not public.conversation_preparation_allowed('95000000-0000-0000-0000-000000000010'),'open introduction alone does not permit preparation');
insert into public.tickets(id,user_id,kind,price_krw) values('95000000-0000-0000-0000-000000000021','95000000-0000-0000-0000-000000000010','meeting',0);
insert into public.meetings(id,intro_id,ticket_id) values('95000000-0000-0000-0000-000000000022','95000000-0000-0000-0000-000000000020','95000000-0000-0000-0000-000000000021');
select ok(not public.conversation_preparation_allowed('95000000-0000-0000-0000-000000000010'),'pending request does not permit preparation');
update public.meetings set confirmed_at=now(),scheduled_at=now()+interval '1 day',private_opens_at=now() where id='95000000-0000-0000-0000-000000000022';
select ok(public.conversation_preparation_allowed('95000000-0000-0000-0000-000000000010'),'confirmed meeting permits preparation');
select ok(public.store_conversation_preparation(
  '95000000-0000-0000-0000-000000000001','95000000-0000-0000-0000-000000000010',
  (select updated_at from prep_revisions where id='95000000-0000-0000-0000-000000000001'),
  (select updated_at from prep_revisions where id='95000000-0000-0000-0000-000000000010'),repeat('c',64),'{}'),'current revisions may store');
update public.meetings set cancelled_at=now() where id='95000000-0000-0000-0000-000000000022';
select ok(not public.conversation_preparation_allowed('95000000-0000-0000-0000-000000000010'),'cancellation revokes preparation access');
select ok(not public.store_conversation_preparation('95000000-0000-0000-0000-000000000001','95000000-0000-0000-0000-000000000010',(select updated_at from prep_revisions where id='95000000-0000-0000-0000-000000000001'),(select updated_at from prep_revisions where id='95000000-0000-0000-0000-000000000010'),repeat('e',64),'{}'),'in-flight result cannot store after cancellation');
update public.meetings set cancelled_at=null where id='95000000-0000-0000-0000-000000000022';
update public.profiles set intro='고친 공개 이야기' where id='95000000-0000-0000-0000-000000000010';
select ok(not public.store_conversation_preparation(
  '95000000-0000-0000-0000-000000000001','95000000-0000-0000-0000-000000000010',
  (select updated_at from prep_revisions where id='95000000-0000-0000-0000-000000000001'),
  (select updated_at from prep_revisions where id='95000000-0000-0000-0000-000000000010'),repeat('c',64),'{}'),'in-flight result cannot resurrect pre-edit material');
select is((select count(*)::int from public.conversation_preparations where target_id='95000000-0000-0000-0000-000000000010'),0,'stale result stays physically deleted');
select ok(public.store_conversation_preparation(
  '95000000-0000-0000-0000-000000000001','95000000-0000-0000-0000-000000000010',
  (select updated_at from public.profiles where id='95000000-0000-0000-0000-000000000001'),
  (select updated_at from public.profiles where id='95000000-0000-0000-0000-000000000010'),repeat('d',64),'{}'),'new revision may store after edit');
select ok(not public.store_conversation_preparation(
  '95000000-0000-0000-0000-000000000001','95000000-0000-0000-0000-000000000010',
  now()-interval '1 second',now(),repeat('d',64),'{}'),'changed owner revision is rejected while target is active');
update public.profiles set account_state='withdrawn' where id='95000000-0000-0000-0000-000000000010';
select ok(not public.store_conversation_preparation(
  '95000000-0000-0000-0000-000000000001','95000000-0000-0000-0000-000000000010',
  (select updated_at from public.profiles where id='95000000-0000-0000-0000-000000000001'),
  (select updated_at from public.profiles where id='95000000-0000-0000-0000-000000000010'),repeat('d',64),'{}'),'withdrawn profile cannot be cached even with current revision');
select is((select count(*)::int from public.conversation_preparations where target_id='95000000-0000-0000-0000-000000000010'),0,'withdrawal purge cannot be undone');
select * from finish();
rollback;
