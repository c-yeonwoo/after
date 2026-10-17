begin;
select no_plan();

insert into auth.users(id,email,email_confirmed_at,aud,role)
select ('74000000-0000-0000-0000-'||lpad(n::text,12,'0'))::uuid,
  'cycle74-'||n||'@verify.local',now(),'authenticated','authenticated' from generate_series(1,6) n;
insert into profiles(id,gender,hub_id,company_email,name,role)
select id,case when email in ('cycle74-3@verify.local','cycle74-4@verify.local','cycle74-5@verify.local')
  then 'female'::gender else 'male'::gender end,'gangnam',email,'QA74',
  case when email='cycle74-6@verify.local' then 'admin' else 'member' end
  from auth.users where id::text like '74000000-%';
create temp table specs(code text,male_id uuid,female_id uuid,intro_id uuid,meeting_id uuid,ticket_id uuid);
insert into specs values
 ('A','74000000-0000-0000-0000-000000000001','74000000-0000-0000-0000-000000000003',gen_random_uuid(),gen_random_uuid(),gen_random_uuid()),
 ('B','74000000-0000-0000-0000-000000000002','74000000-0000-0000-0000-000000000004',gen_random_uuid(),gen_random_uuid(),gen_random_uuid()),
 ('C','74000000-0000-0000-0000-000000000002','74000000-0000-0000-0000-000000000005',gen_random_uuid(),gen_random_uuid(),gen_random_uuid()),
 ('D','74000000-0000-0000-0000-000000000001','74000000-0000-0000-0000-000000000004',gen_random_uuid(),gen_random_uuid(),gen_random_uuid()),
 ('E','74000000-0000-0000-0000-000000000002','74000000-0000-0000-0000-000000000003',gen_random_uuid(),gen_random_uuid(),gen_random_uuid()),
 ('F','74000000-0000-0000-0000-000000000001','74000000-0000-0000-0000-000000000005',gen_random_uuid(),gen_random_uuid(),gen_random_uuid());
grant select on specs to authenticated,service_role;
insert into intros(id,male_id,female_id,closed_at,outcome)
select intro_id,male_id,female_id,now(),'ticket_used' from specs;
insert into tickets(id,user_id,payment_id,price_krw,state,kind,intro_id,used_at,expires_at)
select ticket_id,male_id,'cycle74-'||code,30000,'used','meeting',intro_id,now(),now()+interval '12 months' from specs;
insert into meetings(id,intro_id,ticket_id) select meeting_id,intro_id,ticket_id from specs;
update meetings set male_attendance_policy_ack_at=now(),female_attendance_policy_ack_at=now()
 where id<>(select meeting_id from specs where code='D');
update meetings m set confirmed_at=now(),private_opens_at=now(),scheduled_at=now()+interval '5 days'+ascii(s.code)*interval '1 day'
 from specs s where s.meeting_id=m.id;
update meetings m set scheduled_at=case s.code
 when 'A' then now()+interval '20 hours' when 'B' then now()+interval '3 hours'
 when 'C' then now()+interval '90 minutes' when 'D' then now()+interval '45 minutes'
 when 'E' then now()+interval '30 hours'
 else (((now() at time zone 'Asia/Seoul')::date-1)+time '19:00') at time zone 'Asia/Seoul' end
 from specs s where s.meeting_id=m.id;
update meetings set male_attendance_at=now() where id=(select meeting_id from specs where code='C');

select ok(not has_function_privilege('anon','my_meeting_checkin(uuid)','execute'),'anonymous cannot read attendance');
select ok(not has_function_privilege('authenticated','meeting_lifecycle_tick()','execute'),'members cannot run lifecycle worker');
select ok(not has_table_privilege('authenticated','meeting_response_warnings','select'),'warning ledger is private');
select ok(not has_table_privilege('authenticated','no_show_reports','insert'),'client cannot forge accused ID by direct insert');
select is((select attendance_policy_version from meetings where id=(select meeting_id from specs where code='A')),'checkin-v1','new confirmation enrolls');
select lives_ok($$select meeting_lifecycle_tick()$$,'worker generates due reminders');
select is((select count(*)::int from notifications where meeting_id=(select meeting_id from specs where code='A') and kind='meeting_checkin_reminder'),2,'D-24h asks both participants');
select is((select count(*)::int from notifications where meeting_id=(select meeting_id from specs where code='B') and kind='meeting_checkin_final'),2,'D-4h sends final reminders');
select lives_ok($$select meeting_lifecycle_tick()$$,'worker retries safely');
select is((select count(*)::int from notifications where meeting_id=(select meeting_id from specs where code='A') and kind='meeting_checkin_reminder'),2,'reminder is not duplicated');
select ok((select cancelled_at is null from meetings where id=(select meeting_id from specs where code='C')),'one response never auto-cancels');
select ok((select cancelled_at is null from meetings where id=(select meeting_id from specs where code='D')),'legacy confirmed meeting is not retroactively enrolled or canceled');

set local role authenticated;
set local request.jwt.claims='{"sub":"74000000-0000-0000-0000-000000000006","role":"authenticated"}';
select throws_ok($$select my_meeting_checkin((select meeting_id from specs where code='A'))$$,'42501',null,'outsider cannot read another meeting');
set local request.jwt.claims='{"sub":"74000000-0000-0000-0000-000000000001","role":"authenticated"}';
select lives_ok($$select confirm_meeting_attendance((select meeting_id from specs where code='A'))$$,'participant confirms own attendance');
select lives_ok($$select confirm_meeting_attendance((select meeting_id from specs where code='A'))$$,'attendance retry is idempotent');
select is((my_meeting_checkin((select meeting_id from specs where code='A'))->>'confirmed')::boolean,true,'own confirmation is visible');
select is((my_meeting_checkin((select meeting_id from specs where code='A'))->>'partnerConfirmed')::boolean,false,'confirmation cannot impersonate partner');
select throws_ok($$select admin_meeting_lifecycle()$$,'42501',null,'member cannot read operator monitor');
set local request.jwt.claims='{"sub":"74000000-0000-0000-0000-000000000002","role":"authenticated"}';
select throws_ok($$select confirm_meeting_attendance((select meeting_id from specs where code='E'))$$,'PT409','checkin not open','check-in opens no sooner than 24h before');
select throws_ok($$select report_no_show((select meeting_id from specs where code='E'))$$,'PT409','meeting_not_yet_eligible','future appointment cannot be a no-show');
select throws_ok($$select submit_meeting_feedback((select meeting_id from specs where code='E'),true,'again',null)$$,'PT409','meeting_not_yet_eligible','future appointment cannot receive feedback');
select throws_ok($$insert into feedbacks(meeting_id,author_id,met) values((select meeting_id from specs where code='E'),auth.uid(),true)$$,'42501',null,'direct feedback insert cannot bypass time guard');
reset role;

update meetings set scheduled_at=now()+interval '1 hour' where id=(select meeting_id from specs where code='B');
select lives_ok($$select meeting_lifecycle_tick()$$,'unread reminders leave the booking for operations');
select ok((select cancelled_at is null from meetings where id=(select meeting_id from specs where code='B')),'notification creation alone cannot cancel a booking');
select is((select count(*)::int from meeting_response_warnings where meeting_id=(select meeting_id from specs where code='B')),0,'unread guidance cannot penalize either participant');
update notifications set read_at=now() where meeting_id=(select meeting_id from specs where code='B') and kind='meeting_checkin_final';
select lives_ok($$select meeting_lifecycle_tick()$$,'both absent at D-2h auto-cancel');
select is((select cancel_reason from meetings where id=(select meeting_id from specs where code='B')),'checkin_no_response','cancellation reason is explicit');
select is((select count(*)::int from tickets where restored_from_ticket_id=(select ticket_id from specs where code='B')),1,'exactly one replacement ticket');
select ok((select t.expires_at=r.expires_at from tickets t join tickets r on r.restored_from_ticket_id=t.id where t.id=(select ticket_id from specs where code='B')),'restoration preserves original expiry');
select lives_ok($$select meeting_lifecycle_tick()$$,'cancellation retry is safe');
select is((select count(*)::int from meeting_response_warnings where meeting_id=(select meeting_id from specs where code='B')),2,'one warning per nonresponding participant');
select ok((select bool_and(account_state='active') from profiles where id in (select male_id from specs where code='B' union select female_id from specs where code='B')),'silence never automatically bans users');
update tickets set used_at=now()-interval '25 hours' where id=(select ticket_id from specs where code='A');
select lives_ok($$select expire_unanswered_meetings()$$,'old request sweeper still runs');
select ok((select cancelled_at is null from meetings where id=(select meeting_id from specs where code='A')),'old request expiry cannot cancel a confirmed appointment');

select is((select count(*)::int from notifications where meeting_id=(select meeting_id from specs where code='F') and kind='feedback_due'),2,'midnight feedback is independent for both people');
set local role authenticated;
set local request.jwt.claims='{"sub":"74000000-0000-0000-0000-000000000005","role":"authenticated"}';
select lives_ok($$select submit_meeting_feedback((select meeting_id from specs where code='F'),true,'again','대화가 편했어요')$$,'feedback and completion commit atomically');
select lives_ok($$select submit_meeting_feedback((select meeting_id from specs where code='F'),true,'again','대화가 편했어요')$$,'same feedback retry succeeds');
select throws_ok($$select submit_meeting_feedback((select meeting_id from specs where code='F'),false,'noshow',null)$$,'PT409','feedback already submitted','retry cannot replace a submitted outcome');
reset role;
delete from notifications where meeting_id=(select meeting_id from specs where code='F') and kind='feedback_due';
select enqueue_feedback_due();
select is((select count(*)::int from notifications where meeting_id=(select meeting_id from specs where code='F') and kind='feedback_due'),1,'after first feedback only the other person is nudged');
set local role authenticated;
set local request.jwt.claims='{"sub":"74000000-0000-0000-0000-000000000001","role":"authenticated"}';
select is((select count(*)::int from feedbacks where meeting_id=(select meeting_id from specs where code='F')),0,'partner feedback is private');
select lives_ok($$select submit_meeting_feedback((select meeting_id from specs where code='F'),true,'friend',null)$$,'other person can finish after first completion');
reset role;
select is((select cardinality(completed_by) from meetings where id=(select meeting_id from specs where code='F')),2,'both completion outcomes are retained');
select is((select count(*)::int from feedbacks where meeting_id=(select meeting_id from specs where code='F')),2,'both private feedback rows exist');

update meetings set scheduled_at=now()-interval '3 days' where id=(select meeting_id from specs where code='E');
select enqueue_feedback_due();
select enqueue_feedback_due();
select enqueue_feedback_due();
select is((select count(*)::int from notifications where meeting_id=(select meeting_id from specs where code='E') and kind='feedback_followup'),2,'unanswered survey gets at most one follow-up per person');

-- A delivery already claimed by a worker becomes irrelevant after check-in.
update notifications set dispatch_state='running',lease_token='74000000-0000-0000-0000-000000000099',lease_until=now()+interval '5 minutes'
 where meeting_id=(select meeting_id from specs where code='A') and user_id='74000000-0000-0000-0000-000000000001' and kind='meeting_checkin_reminder';
set local role service_role;
set local request.jwt.claims='{"role":"service_role"}';
select is(notification_push_still_relevant((select id from notifications where meeting_id=(select meeting_id from specs where code='A') and user_id='74000000-0000-0000-0000-000000000001' and kind='meeting_checkin_reminder'),'74000000-0000-0000-0000-000000000099'),false,'worker suppresses reminder after attendance was confirmed');
reset role;

-- Force the second step to fail: the feedback insert must roll back too.
create function pg_temp.fail_cycle74_report() returns trigger language plpgsql as $$
begin raise exception 'QA simulated report failure'; end $$;
create trigger qa_cycle74_report_failure before insert on no_show_reports for each row execute function pg_temp.fail_cycle74_report();
set local role authenticated;
set local request.jwt.claims='{"sub":"74000000-0000-0000-0000-000000000002","role":"authenticated"}';
select throws_ok($$select submit_meeting_feedback((select meeting_id from specs where code='E'),false,'noshow','기다렸지만 만나지 못했어요')$$,'P0001','QA simulated report failure','report failure rolls back the entire submission');
select is((select count(*)::int from feedbacks where meeting_id=(select meeting_id from specs where code='E')),0,'no orphan feedback after partial failure');
reset role;
drop trigger qa_cycle74_report_failure on no_show_reports;
set local role authenticated;
set local request.jwt.claims='{"sub":"74000000-0000-0000-0000-000000000002","role":"authenticated"}';
select lives_ok($$select submit_meeting_feedback((select meeting_id from specs where code='E'),false,'noshow','기다렸지만 만나지 못했어요')$$,'no-show feedback and report commit together');
select lives_ok($$select submit_meeting_feedback((select meeting_id from specs where code='E'),false,'noshow','기다렸지만 만나지 못했어요')$$,'no-show submission retry is idempotent');
reset role;
select is((select count(*)::int from no_show_reports where meeting_id=(select meeting_id from specs where code='E')),1,'exactly one no-show report');
update no_show_reports set confirm_by=now()-interval '1 hour' where meeting_id=(select meeting_id from specs where code='E');
select expire_unanswered_no_show_reports();
select ok((select state='pending' and review_requested_at is not null from no_show_reports where meeting_id=(select meeting_id from specs where code='E')),'unanswered accusation goes to human review, not an automatic verdict');
select is((select account_state::text from profiles where id='74000000-0000-0000-0000-000000000003'),'active','accused remains active without a human verdict');

-- Alternative branch of C: neither person responds. A second warning is
-- visible to operations, but does not silently impose a ban or a fine.
update meetings set male_attendance_at=null where id=(select meeting_id from specs where code='C');
insert into notifications(user_id,meeting_id,kind,read_at)
select u.user_id,s.meeting_id,'meeting_checkin_final',now() from specs s
cross join lateral(values(s.male_id),(s.female_id)) u(user_id) where s.code='C';
select meeting_lifecycle_tick();
select is((select count(*)::int from meeting_response_warnings where user_id='74000000-0000-0000-0000-000000000002'),2,'repeat silence is counted for operator review');
select is((select account_state::text from profiles where id='74000000-0000-0000-0000-000000000002'),'active','repeated silence alone still does not auto-ban');
set local role authenticated;
set local request.jwt.claims='{"sub":"74000000-0000-0000-0000-000000000006","role":"authenticated","aal":"aal2"}';
select lives_ok($$select admin_meeting_lifecycle()$$,'operator can monitor attendance, warnings and survey counts');
select ok((admin_meeting_lifecycle()->>'total')::int>=6,'monitor count comes from real rows');
reset role;

insert into intro_exclusions(user_lo,user_hi,reason)
select least(male_id,female_id),greatest(male_id,female_id),'qa_pass' from specs where code='A';
set local role authenticated;
set local request.jwt.claims='{"sub":"74000000-0000-0000-0000-000000000006","role":"authenticated","aal":"aal2"}';
select throws_ok($$select admin_set_queue('74000000-0000-0000-0000-000000000001',array['74000000-0000-0000-0000-000000000003']::uuid[],'QA 재등록 방지')$$,'PT409','candidate excluded; refresh queue','operator cannot requeue a permanently excluded pair');
reset role;

select * from finish();
rollback;
