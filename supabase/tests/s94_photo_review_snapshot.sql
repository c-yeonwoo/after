begin;
select plan(13);

insert into auth.users (id,email,raw_app_meta_data,raw_user_meta_data) values
 ('94000000-0000-0000-0000-000000000001','review94@t.co','{}','{}'),
 ('94000000-0000-0000-0000-000000000002','member94@t.co','{}','{}');
insert into public.profiles (id,gender,hub_id,company_email,name,role,photo_url,photo_paths) values
 ('94000000-0000-0000-0000-000000000001','male','gangnam','review94@t.co','검수자94','admin',null,'{}'),
 ('94000000-0000-0000-0000-000000000002','female','gangnam','member94@t.co','회원94','member','94000000-0000-0000-0000-000000000002/a.jpg',array['94000000-0000-0000-0000-000000000002/a.jpg','94000000-0000-0000-0000-000000000002/b.jpg','94000000-0000-0000-0000-000000000002/c.jpg']);

select ok(not has_function_privilege('anon','public.admin_review_photo_set(uuid,text[],public.photo_state,boolean,text)','EXECUTE'),'anonymous cannot review');
set local role authenticated;
set local request.jwt.claims = '{"sub":"94000000-0000-0000-0000-000000000002","role":"authenticated"}';
select throws_ok($$select public.admin_review_photo_set('94000000-0000-0000-0000-000000000002',array['old.jpg'],'pending',true,'검수')$$,'42501',null,'member cannot review');
set local request.jwt.claims = '{"sub":"94000000-0000-0000-0000-000000000001","role":"authenticated","aal":"aal2"}';
select throws_ok($$select public.admin_review_photo_set('94000000-0000-0000-0000-000000000002',array['old.jpg'],'pending',true,'검수')$$,'PT409',null,'changed set is rejected');
reset role;
select is((select photo_state::text from public.profiles where id='94000000-0000-0000-0000-000000000002'),'pending','stale review does not approve');
set local role authenticated;
select throws_ok($$select public.admin_review_photo_set('94000000-0000-0000-0000-000000000002',array[]::text[],'pending',true,'검수')$$,'22023',null,'empty expected set is invalid');
select throws_ok($$select public.admin_review_photo_set('94000000-0000-0000-0000-000000000002',array['94000000-0000-0000-0000-000000000002/a.jpg','94000000-0000-0000-0000-000000000002/b.jpg','94000000-0000-0000-0000-000000000002/c.jpg'],'pending',false,'   ')$$,'22023',null,'blank rejection reason is rejected');
select lives_ok($$select public.admin_review_photo_set('94000000-0000-0000-0000-000000000002',array['94000000-0000-0000-0000-000000000002/a.jpg','94000000-0000-0000-0000-000000000002/b.jpg','94000000-0000-0000-0000-000000000002/c.jpg'],'pending',true,'기준 충족')$$,'visible set approves');
reset role;
select is((select photo_state::text from public.profiles where id='94000000-0000-0000-0000-000000000002'),'approved','approved state persists');
set local role authenticated;
select throws_ok($$select public.admin_review_photo_set('94000000-0000-0000-0000-000000000002',array['94000000-0000-0000-0000-000000000002/a.jpg','94000000-0000-0000-0000-000000000002/b.jpg','94000000-0000-0000-0000-000000000002/c.jpg'],'pending',true,'중복')$$,'PT409',null,'duplicate approval rejected');
select throws_ok($$select public.admin_review_photo_set('94000000-0000-0000-0000-000000000002',array['old.jpg'],'approved',false,'취소')$$,'PT409',null,'stale reset rejected');
select lives_ok($$select public.admin_review_photo_set('94000000-0000-0000-0000-000000000002',array['94000000-0000-0000-0000-000000000002/a.jpg','94000000-0000-0000-0000-000000000002/b.jpg','94000000-0000-0000-0000-000000000002/c.jpg'],'approved',false,'3번 사진을 바꿔 주세요')$$,'visible approved set resets');
reset role;
select is((select photo_reject_reason from public.profiles where id='94000000-0000-0000-0000-000000000002'),'3번 사진을 바꿔 주세요','user-visible reason preserved');
select is((select count(*)::integer from public.admin_actions where target_user='94000000-0000-0000-0000-000000000002'),2,'only successful operations are audited');
select * from finish();
rollback;
