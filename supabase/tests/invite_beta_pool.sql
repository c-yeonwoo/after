begin;
select no_plan();
select set_config('request.jwt.claims','{"role":"service_role","aal":"aal2"}',true);
update app_settings set identity_required=false,admin_mfa_required=false;
update profiles set paused_at=now() where role='member';
create function pg_temp.u(n integer) returns uuid language sql immutable as $$
  select ('93280000-0000-0000-0000-'||lpad(n::text,12,'0'))::uuid
$$;
create function pg_temp.login(n integer) returns text language sql as $$
  select set_config('request.jwt.claims',json_build_object('sub',pg_temp.u(n),'role','authenticated','aal','aal2')::text,true)
$$;
insert into auth.users(id,email,aud,role,email_confirmed_at,encrypted_password)
select pg_temp.u(n),'pool'||n||'@verify.local','authenticated','authenticated',now(),'x' from generate_series(1,7)n;
insert into profiles(id,company_email,gender,hub_id,name,job,birth,role,onboarding_step,
 email_verified_at,terms_agreed_at,privacy_agreed_at,agreed_policy_version,phone_verified_at,photo_state,photo_paths)
select pg_temp.u(n),'pool'||n||'@verify.local',case when n in(2,3,7) then 'female'::gender else 'male'::gender end,
 case when n=5 then 'gangnam' else 'yeouido' end,'테스트'||n,'기획','1993-01-01',case when n=4 then 'admin' else 'member' end,
 7,now(),now(),now(),'2026-10-31.1',now(),'approved',array[n||'/a',n||'/b',n||'/c'] from generate_series(1,7)n;
create function pg_temp.pool() returns jsonb language sql stable as $$
  select beta_pool_snapshot('2026-11-30 10:00+09')
$$;
select is(pg_temp.pool()->>'women','3','women count once with multiple available candidates');
select is(pg_temp.pool()->>'men','0','men without an inbound like are not actionable');
insert into affinities(from_id,to_id,verdict) values(pg_temp.u(3),pg_temp.u(1),'like'),(pg_temp.u(2),pg_temp.u(1),'like'),(pg_temp.u(7),pg_temp.u(1),'pass');
select is(pg_temp.pool()->>'men','1','multiple likes count one unique male recipient');
insert into meet_windows(user_id,weekdays,earliest_local,updated_at)
select pg_temp.u(n),'{2}','20:00','2026-11-29T12:00:00+09' from unnest(array[1,3,6]) n;
select is(pg_temp.pool()->>'women_with_slot','1','counts women with future overlapping registered hours');
select is(pg_temp.pool()->>'men_with_slot','1','a like plus overlapping hours counts for men');
select is(beta_pool_snapshot('2026-12-05 12:00+09')->>'men_with_slot','0','past weekdays do not count in the remaining week');
select is(beta_pool_snapshot('2026-11-29 15:00+00')->>'week_start','2026-11-30','week starts at Korean midnight on Monday');
update meet_windows set updated_at='2026-11-10' where user_id=pg_temp.u(1);
select is(pg_temp.pool()->>'men_with_slot','0','stale schedules do not count');
select is(pg_temp.pool()->>'men','1','schedule is optional');
update profiles set paused_at=now() where id=pg_temp.u(1);
select is(pg_temp.pool()->>'men','0','paused recipient excluded');
update profiles set paused_at=null where id=pg_temp.u(1);
insert into intro_exclusions(user_lo,user_hi,reason) values(pg_temp.u(1),pg_temp.u(2),'qa');
update profiles set photo_state='pending' where id=pg_temp.u(3);
select is(pg_temp.pool()->>'men','0','excluded and unapproved senders cannot supply a card');
update profiles set photo_state='approved' where id=pg_temp.u(3);
update profiles set profile_public_signals='{"first_date":["함께 걷기"]}' where id=pg_temp.u(3);
update profiles set profile_public_signals='{"first_date":["짧게 커피"]}' where id=pg_temp.u(6);
insert into intros(id,male_id,female_id,opened_at,closed_at,outcome)
values(pg_temp.u(21),pg_temp.u(1),pg_temp.u(7),now()-interval '5 days',now()-interval '2 days','ticket_used');
insert into tickets(id,user_id,state,kind,price_krw,intro_id,used_at)
values(pg_temp.u(22),pg_temp.u(1),'used','meeting',0,pg_temp.u(21),now()-interval '4 days');
insert into meetings(id,intro_id,ticket_id,confirmed_at,scheduled_at,completed_at,private_opens_at)
values(pg_temp.u(23),pg_temp.u(21),pg_temp.u(22),now()-interval '4 days',now()-interval '2 days',now()-interval '2 days',now()-interval '4 days');
set local role authenticated;
select pg_temp.login(1);
select submit_feedback_with_preference(pg_temp.u(23),true,'friend','walk');
select throws_ok('select * from beta_second_intros','42501',null,'member cannot see observations');
select throws_ok('select * from beta_male_card_views','42501',null,'members cannot inspect card reading history');
select throws_ok('select beta_pool_snapshot(now())','42501',null,'only guarded dashboard can return counts');
select throws_ok('select admin_invite_beta_before_pool()','42501',null,'internal legacy entry point is private');
select pg_temp.login(7);
select submit_feedback_with_preference(pg_temp.u(23),true,'friend','coffee');
reset role;
-- The production flow uses separate requests. Separate event times in this single rolled-back transaction.
update beta_second_intros set reviewed_at=now()-interval '1 hour' where member_id in(pg_temp.u(1),pg_temp.u(7));
select is((select count(*)::int from beta_second_intros where member_id in(pg_temp.u(1),pg_temp.u(7))),2,'real two-step submissions enroll each participant');
set local role authenticated;
select pg_temp.login(4);
select admin_set_queue(pg_temp.u(1),array[pg_temp.u(3)],'beta QA');
reset role;
select is((select shown_at from beta_second_intros where member_id=pg_temp.u(1)),null::timestamptz,'queuing is not experiencing the second introduction');
update intro_queue set delivered_at=now()-interval '2 hours' where male_id=pg_temp.u(1);

set local role authenticated;
select pg_temp.login(1);
select is(intro_teaser_with_evidence()#>>'{evidence,priority_origin}','feedback','male receives actual feedback explanation');
select pg_temp.login(7);
select is(next_candidate_with_evidence()#>>'{evidence,priority_origin}','feedback','female receives actual feedback explanation');
select next_candidate_with_evidence() is not null;
select pg_temp.login(4);
select cmp_ok((admin_invite_beta_observations()#>>'{followup,reflected}')::int,'>=',2,'administrator sees both completed loops');
reset role;
select is((select count(*)::int from beta_second_intros where reflected and member_id in(pg_temp.u(1),pg_temp.u(7))),2,'refreshing counts each member only once');

-- Restore the pre-view observation within this rolled-back fixture to exercise negative branches.
update beta_second_intros set shown_at=null,reflected=null where member_id=pg_temp.u(7);
update candidate_impressions set first_shown_at=now()-interval '2 hours' where viewer_id=pg_temp.u(7);
set local role authenticated;
select pg_temp.login(7);
select next_candidate_with_evidence() is not null;
reset role;
select is((select shown_at from beta_second_intros where member_id=pg_temp.u(7)),null::timestamptz,'a refreshed card that predates the review does not count');
update candidate_impressions set first_shown_at=now() where viewer_id=pg_temp.u(7);
set local role authenticated;
select pg_temp.login(7);
select save_intro_priority(pg_temp.u(7),'coffee');
select is(next_candidate_with_evidence()#>>'{evidence,priority_origin}','edit','same preference explicitly edited is independent of feedback');
reset role;
select is((select reflected from beta_second_intros where member_id=pg_temp.u(7)),false,'first next card is finalized even when feedback was not its source');
delete from intro_priority_choices where member_id=pg_temp.u(7);
set local role authenticated;
select next_candidate_with_evidence() is not null;
reset role;
select is((select reflected from beta_second_intros where member_id=pg_temp.u(7)),false,'later matching explanation cannot rewrite the first outcome');
select set_config('request.jwt.claims','{"role":"service_role","aal":"aal2"}',true);
update profiles set account_state='withdrawn' where id=pg_temp.u(1);
select is((select count(*)::int from beta_second_intros where member_id=pg_temp.u(1)),0,'withdrawal clears reporting row');
select is((select count(*)::int from beta_male_card_views where reader_id=pg_temp.u(1)),0,'withdrawal clears male first-view markers');
update feedbacks set next_preference=next_preference where author_id=pg_temp.u(1);
select is((select count(*)::int from beta_second_intros where member_id=pg_temp.u(1)),0,'later feedback writes cannot re-enroll a withdrawn member');
select * from finish();
rollback;
