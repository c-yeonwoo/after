begin;
select no_plan();
insert into auth.users (id, email, encrypted_password, email_confirmed_at, aud, role,
                        confirmation_token, recovery_token, email_change,
                        email_change_token_new, email_change_token_current,
                        phone_change, phone_change_token, reauthentication_token,
                        raw_app_meta_data, raw_user_meta_data)
values
  ('99000000-0000-0000-0000-000000000001','beta991@t.co','x',now(),'authenticated','authenticated','','','','','','','','','{}'::jsonb,'{}'::jsonb),
  ('99000000-0000-0000-0000-000000000002','beta992@t.co','x',now(),'authenticated','authenticated','','','','','','','','','{}'::jsonb,'{}'::jsonb),
  ('99000000-0000-0000-0000-000000000003','beta993@t.co','x',now(),'authenticated','authenticated','','','','','','','','','{}'::jsonb,'{}'::jsonb);
insert into profiles (id, gender, hub_id, company_email, email_verified_at,
                      name, onboarding_step, terms_agreed_at, privacy_agreed_at, role)
values
  ('99000000-0000-0000-0000-000000000001','male','gangnam','beta991@t.co',now(),'남성611',7,now(),now(),'member'),
  ('99000000-0000-0000-0000-000000000002','male','gangnam','beta992@t.co',now(),'남성612',7,now(),now(),'member'),
  ('99000000-0000-0000-0000-000000000003','female','gangnam','beta993@t.co',now(),'여성61',7,now(),now(),'member');
insert into intros (male_id, female_id) values
  ('99000000-0000-0000-0000-000000000001','99000000-0000-0000-0000-000000000003'),
  ('99000000-0000-0000-0000-000000000002','99000000-0000-0000-0000-000000000003');
insert into tickets (user_id, state, kind, price_krw, intro_id, used_at)
select male_id, 'used', 'meeting', 0, id, now() from intros
 where female_id = '99000000-0000-0000-0000-000000000003';
insert into meetings (intro_id, ticket_id)
select i.id, t.id from intros i join tickets t on t.intro_id = i.id
 where i.female_id = '99000000-0000-0000-0000-000000000003';


select ok(not has_function_privilege('authenticated','public.reserve_ai_budget(uuid,text,integer)','EXECUTE'),'member cannot reserve provider budget');
select ok(not has_function_privilege('authenticated','public.settle_ai_budget(uuid,integer)','EXECUTE'),'member cannot settle provider budget');
select ok(public.reserve_ai_budget('99000000-0000-0000-0000-000000000091','claude-sonnet-5-5',1500),'reserve first half');
select ok(public.reserve_ai_budget('99000000-0000-0000-0000-000000000092','claude-sonnet-5-5',1500),'reserve second half');
select ok(not public.reserve_ai_budget('99000000-0000-0000-0000-000000000093','claude-sonnet-5-5',1),'daily cap counts outstanding calls');
select public.settle_ai_budget('99000000-0000-0000-0000-000000000091',100);
select ok(not public.reserve_ai_budget('99000000-0000-0000-0000-000000000091','claude-sonnet-5-5',100),'duplicate receipt cannot authorize another call');
select ok(public.reserve_ai_budget('99000000-0000-0000-0000-000000000093','claude-sonnet-5-5',1400),'known usage releases excess reservation');
select public.settle_ai_budget('99000000-0000-0000-0000-000000000091',0);
select is((select charged_krw from ai_budget_ledger where id='99000000-0000-0000-0000-000000000091'),100,'settlement cannot be replayed');
update ai_budget_settings set monthly_krw=1400;
select public.settle_ai_budget('99000000-0000-0000-0000-000000000092',0);
update ai_budget_ledger set created_at=(date_trunc('month',now() at time zone 'Asia/Seoul') at time zone 'Asia/Seoul') where id='99000000-0000-0000-0000-000000000093';
select ok(not public.reserve_ai_budget('99000000-0000-0000-0000-000000000094','claude-sonnet-5-5',1),'monthly cap includes previous accounting reservations');
update profiles set onboarding_step=2 where id='99000000-0000-0000-0000-000000000001';
set local request.jwt.claim.sub='99000000-0000-0000-0000-000000000001';
select throws_ok($$select my_onboarding_draft('99000000-0000-0000-0000-000000000002')$$,'28000',null,'another account cannot load a draft');
select is(save_onboarding_draft(auth.uid(),'{"step":2,"basics":{"name":"비공개 초안"}}',0),1,'draft is saved privately');
select is(my_onboarding_draft(auth.uid())->'data'->'basics'->>'name','비공개 초안','draft resumes');
select throws_ok($$select save_onboarding_draft(auth.uid(),'{"step":2,"basics":{}}',null)$$,'22023',null,'null revision cannot bypass conflict');
select throws_ok($$select save_onboarding_draft(auth.uid(),'{"step":2,"basics":{}}',0)$$,'PT409',null,'stale revision rejected');
select throws_ok($$select save_onboarding_draft('99000000-0000-0000-0000-000000000002','{"step":2,"basics":{}}',0)$$,'42501',null,'account swap cannot write another owner snapshot');
update profiles set onboarding_step=7 where id=auth.uid();
select is((select count(*)::integer from onboarding_drafts where user_id=auth.uid()),0,'completed draft removed');
update meetings set scheduled_at=now()+interval '3 days',confirmed_at=now(),private_opens_at=now()
 where intro_id in(select id from intros where male_id='99000000-0000-0000-0000-000000000001');
select ok(member_meeting_hold('99000000-0000-0000-0000-000000000001'),'male holds during confirmed appointment');
select ok(member_meeting_hold('99000000-0000-0000-0000-000000000003'),'female holds too');
select throws_ok($$update meetings set scheduled_at=now()+interval '4 days',confirmed_at=now(),private_opens_at=now()
 where intro_id in(select id from intros where male_id='99000000-0000-0000-0000-000000000002')$$,'23505',null,'different day second appointment rejected');
delete from meetings where intro_id in(select id from intros where male_id='99000000-0000-0000-0000-000000000002');
update tickets set state='unused',used_at=null,intro_id=null
 where user_id='99000000-0000-0000-0000-000000000002';
set local request.jwt.claim.sub='99000000-0000-0000-0000-000000000002';
update app_settings set payments_enabled=false;
select throws_ok($$select use_meeting_ticket((select id from intros where male_id=auth.uid()))$$,'PT409',null,'stale card cannot request a member with a confirmed appointment');
select is((select count(*)::integer from tickets where user_id=auth.uid() and state='used'),0,'rejected stale request never consumes a ticket');
select is((select count(*)::integer from meetings m join intros i on i.id=m.intro_id where i.male_id=auth.uid()),0,'rejected stale request creates no appointment');
set local request.jwt.claim.sub='99000000-0000-0000-0000-000000000001';
update meetings set scheduled_at=now()-interval '1 minute'
 where intro_id in(select id from intros where male_id='99000000-0000-0000-0000-000000000001');
select mark_met((select m.id from meetings m join intros i on i.id=m.intro_id where i.male_id=auth.uid()));
select ok(member_meeting_hold(auth.uid()),'early completion does not release same-day hold');
update meetings set scheduled_at=((now() at time zone 'Asia/Seoul')::date::timestamp at time zone 'Asia/Seoul')-interval '1 second',completed_at=null,completed_by='{}'
 where intro_id in(select id from intros where male_id=auth.uid());
select ok(not member_meeting_hold(auth.uid()),'next KST day releases hold without feedback');
select release_past_meeting_introductions();
select ok(home_state_v2()->'meeting'='null'::jsonb,'old unreported meeting no longer owns home');
select is((select completed_at from meetings m join intros i on i.id=m.intro_id where i.male_id=auth.uid()),null::timestamptz,'release never fabricates attendance');
select * from finish();
rollback;
