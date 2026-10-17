begin;
select no_plan();
insert into auth.users(id,email,email_confirmed_at,aud,role)
select ('75000000-0000-0000-0000-'||lpad(n::text,12,'0'))::uuid,'beta75-'||n||'@verify.local',now(),'authenticated','authenticated' from generate_series(1,6)n;
-- Generate valid synthetic numbers without using real contact data.
insert into profiles(id,gender,hub_id,company_email,name,role,phone,phone_verified_at)
select id,case when email in('beta75-3@verify.local','beta75-4@verify.local','beta75-5@verify.local') then 'female'::gender else 'male'::gender end,
 'gangnam',email,'QA75',case when email='beta75-6@verify.local' then 'admin' else 'member' end,
 '+82107500000'||right(id::text,1),now() from auth.users where id::text like '75000000-%';
create temp table pairs(code text,meeting_id uuid,intro_id uuid,ticket_id uuid,male_id uuid,female_id uuid);
insert into pairs values
('A',gen_random_uuid(),gen_random_uuid(),gen_random_uuid(),'75000000-0000-0000-0000-000000000001','75000000-0000-0000-0000-000000000003'),
('B',gen_random_uuid(),gen_random_uuid(),gen_random_uuid(),'75000000-0000-0000-0000-000000000002','75000000-0000-0000-0000-000000000004'),
('C',gen_random_uuid(),gen_random_uuid(),gen_random_uuid(),'75000000-0000-0000-0000-000000000001','75000000-0000-0000-0000-000000000005'),
('D',gen_random_uuid(),gen_random_uuid(),gen_random_uuid(),'75000000-0000-0000-0000-000000000001','75000000-0000-0000-0000-000000000004');
grant select on pairs to authenticated,service_role;
insert into intros(id,male_id,female_id,closed_at,outcome) select intro_id,male_id,female_id,now(),'ticket_used' from pairs;
insert into tickets(id,user_id,payment_id,intro_id,state,kind,used_at,expires_at) select ticket_id,male_id,'beta75-'||code,intro_id,'used','meeting',now(),now()+interval '12 months' from pairs;
insert into meetings(id,intro_id,ticket_id,male_attendance_policy_ack_at,female_attendance_policy_ack_at)
select meeting_id,intro_id,ticket_id,now(),now() from pairs;
update meetings m set confirmed_at=now(),scheduled_at=now()+ascii(p.code)*interval '1 day',private_opens_at=now()
 from pairs p where m.id=p.meeting_id;
update meetings set scheduled_at=now()+interval '20 hours' where id=(select meeting_id from pairs where code='A');
update meetings set scheduled_at=now()+interval '3 hours' where id=(select meeting_id from pairs where code='B');
create function pg_temp.next_evening(offset_days integer) returns timestamptz language sql stable as $$
 select (((now() at time zone 'Asia/Seoul')::date+n)+time '19:00') at time zone 'Asia/Seoul'
 from generate_series(offset_days,offset_days+6)n
 where extract(isodow from ((now() at time zone 'Asia/Seoul')::date+n))<=5 order by n limit 1
$$;
grant execute on function pg_temp.next_evening(integer) to authenticated;
select meeting_lifecycle_tick();
update notifications set read_at=now() where meeting_id=(select meeting_id from pairs where code='A');
select set_config('test.old_notice',(select id::text from notifications where meeting_id=(select meeting_id from pairs where code='A') and kind='meeting_checkin_reminder' limit 1),true);
update notifications set dispatch_state='submitted',sent_at=now()-interval '1 hour'
  where id=current_setting('test.old_notice')::uuid;
update meetings set male_attendance_at=now(),female_attendance_at=now()
  where id=(select meeting_id from pairs where code='A');

select ok(not has_table_privilege('authenticated','meeting_change_requests','select'),'schedule negotiations are not a public table');
select ok(not has_table_privilege('authenticated','member_contact_preferences','select'),'contact consent is private');
select ok(not has_function_privilege('anon','request_meeting_change(uuid,timestamptz,integer,uuid)','execute'),'anonymous cannot negotiate a schedule');
set local role authenticated;
set local request.jwt.claims='{"sub":"75000000-0000-0000-0000-000000000005","role":"authenticated"}';
select throws_ok($$select my_meeting_change((select meeting_id from pairs where code='A'))$$,'42501','not a participant','outsider cannot read schedule negotiations');
set local request.jwt.claims='{"sub":"75000000-0000-0000-0000-000000000001","role":"authenticated"}';
select lives_ok($$select request_meeting_change((select meeting_id from pairs where code='A'),pg_temp.next_evening(3),1,'75000000-0000-0000-0000-000000000010')$$,'participant proposes a new time');
select lives_ok($$select request_meeting_change((select meeting_id from pairs where code='A'),pg_temp.next_evening(3),1,'75000000-0000-0000-0000-000000000010')$$,'same proposal retry is idempotent');
select set_config('test.change',(my_meeting_change((select meeting_id from pairs where code='A'))->'change'->>'id'),true);
select throws_ok($$select respond_meeting_change(current_setting('test.change')::uuid,true)$$,'42501','partner agreement required','requester cannot forge partner agreement');
reset role;
select ok((select expires_at<=proposed_at-interval '3 hours' from meeting_change_requests where id=current_setting('test.change')::uuid),'proposal deadline never promises acceptance after the new slot becomes too close');
select is((select schedule_revision from meetings where id=(select meeting_id from pairs where code='A')),1,'proposal alone does not change the booking');
set local role authenticated;
set local request.jwt.claims='{"sub":"75000000-0000-0000-0000-000000000003","role":"authenticated"}';
select lives_ok($$select respond_meeting_change(current_setting('test.change')::uuid,false)$$,'partner can keep the original appointment');
select lives_ok($$select respond_meeting_change(current_setting('test.change')::uuid,false)$$,'decline retry does not alter anything');
set local request.jwt.claims='{"sub":"75000000-0000-0000-0000-000000000001","role":"authenticated"}';
select lives_ok($$select request_meeting_change((select meeting_id from pairs where code='A'),pg_temp.next_evening(3),1,'75000000-0000-0000-0000-000000000011')$$,'a different proposal can follow a declined proposal');
select set_config('test.change',(my_meeting_change((select meeting_id from pairs where code='A'))->'change'->>'id'),true);
set local request.jwt.claims='{"sub":"75000000-0000-0000-0000-000000000003","role":"authenticated"}';
select lives_ok($$select respond_meeting_change(current_setting('test.change')::uuid,true)$$,'partner consent atomically changes the schedule');
select lives_ok($$select respond_meeting_change(current_setting('test.change')::uuid,true)$$,'accept retry cannot charge or change the booking again');
reset role;
select is((select schedule_revision from meetings where id=(select meeting_id from pairs where code='A')),2,'accepted schedule has a new revision');
select is((select scheduled_at from meetings where id=(select meeting_id from pairs where code='A')),pg_temp.next_evening(3),'agreed time is authoritative');
select ok((select male_attendance_at is null and female_attendance_at is null from meetings where id=(select meeting_id from pairs where code='A')),'attendance is checked again for the new time');
select ok((select bool_and(last_error='schedule_superseded' and dispatch_state not in ('pending','retry','running')) from notifications where meeting_id=(select meeting_id from pairs where code='A') and schedule_revision=1),'old schedule notifications are retained but invalidated');
select ok((select dispatch_state='submitted' and sent_at=now()-interval '1 hour' from notifications where id=current_setting('test.old_notice')::uuid),'previous provider submission evidence is preserved');
select ok((select bool_and(sent_at is null) from notifications where meeting_id=(select meeting_id from pairs where code='A') and schedule_revision=1 and id<>current_setting('test.old_notice')::uuid),'obsolete pending notices are not falsely marked as sent');
select is((select count(*)::integer from notifications where meeting_id=(select meeting_id from pairs where code='A') and kind='meeting_changed'),2,'both receive the changed schedule notification');
select is((select count(*)::integer from tickets where restored_from_ticket_id=(select ticket_id from pairs where code='A')),0,'rescheduling is not a ticket refund');
select is((select state::text from tickets where id=(select ticket_id from pairs where code='A')),'used','original ticket stays in use');
select is(meeting_checkin_notice_read((select meeting_id from pairs where code='A'),'75000000-0000-0000-0000-000000000001'),false,'old read receipts do not authorize cancellation of a new schedule');
update meetings set scheduled_at=now()+interval '20 hours',proposed_slots=array[now()+interval '20 hours'],accepted_slot=0 where id=(select meeting_id from pairs where code='A');
select meeting_lifecycle_tick();
select is((select count(*)::integer from notifications where meeting_id=(select meeting_id from pairs where code='A') and kind='meeting_checkin_reminder'),4,'new schedule gets new reminders without deleting historical reminders');
set local role authenticated;
set local request.jwt.claims='{"sub":"75000000-0000-0000-0000-000000000001","role":"authenticated"}';
select is((select count(*)::integer from my_notifications(100) where id=current_setting('test.old_notice')::uuid),0,'superseded notice is not in the member inbox');
select mark_notifications_read();
reset role;
select ok((select bool_and(read_at is null) from notifications where meeting_id=(select meeting_id from pairs where code='A') and schedule_revision=2 and kind='meeting_checkin_reminder'),'legacy read-all cannot acknowledge unseen attendance guidance');
select set_config('test.own_notice',(select id::text from notifications where meeting_id=(select meeting_id from pairs where code='A') and schedule_revision=2 and kind='meeting_checkin_reminder' and user_id='75000000-0000-0000-0000-000000000001'),true);
select set_config('test.partner_notice',(select id::text from notifications where meeting_id=(select meeting_id from pairs where code='A') and schedule_revision=2 and kind='meeting_checkin_reminder' and user_id='75000000-0000-0000-0000-000000000003'),true);
set local role authenticated;
set local request.jwt.claims='{"sub":"75000000-0000-0000-0000-000000000001","role":"authenticated"}';
select mark_displayed_notifications_read(array[current_setting('test.own_notice')::uuid,current_setting('test.partner_notice')::uuid]);
select throws_ok($$select request_meeting_change((select meeting_id from pairs where code='A'),pg_temp.next_evening(3),1,gen_random_uuid())$$,'PT409','schedule changed or unavailable','stale schedule revision cannot overwrite a newer booking');
select throws_ok($$select request_meeting_change((select meeting_id from pairs where code='A'),now(),2,gen_random_uuid())$$,'22023','choose a weekday evening between 3 hours and 21 days','invalid near/past proposal is rejected');
reset role;
select ok((select read_at is not null from notifications where id=current_setting('test.own_notice')::uuid),'displayed acknowledgement marks own notification');
select ok((select read_at is null from notifications where id=current_setting('test.partner_notice')::uuid),'displayed acknowledgement cannot impersonate partner reading');

select set_config('test.contact_case',(select id::text from ops_cases where case_type='meeting_followup' and source_id=(select meeting_id::text from pairs where code='B') and status='open'),true);
select set_config('test.contact_version',(select version::text from ops_cases where id=current_setting('test.contact_case')::uuid),true);
select ok(current_setting('test.contact_case') is not null,'approaching unconfirmed meeting is queued without SQL intervention');
set local role authenticated;
set local request.jwt.claims='{"sub":"75000000-0000-0000-0000-000000000002","role":"authenticated"}';
select is(my_meeting_contact_preference(),false,'existing members are not silently opted in');
select throws_ok($$select admin_meeting_contact_details(current_setting('test.contact_case')::uuid,current_setting('test.contact_version')::int,gen_random_uuid())$$,'42501','authorized admin required','member cannot retrieve contact details');
select lives_ok($$select set_meeting_contact_preference(true,'meeting-contact-v1')$$,'member can separately opt into operational calling');
set local request.jwt.claims='{"sub":"75000000-0000-0000-0000-000000000006","role":"authenticated","aal":"aal2"}';
select is(jsonb_array_length(jsonb_path_query_array(admin_meeting_contact_details(current_setting('test.contact_case')::uuid,current_setting('test.contact_version')::int,'75000000-0000-0000-0000-000000000012'),'$[*] ? (@.phone != null)')),1,'only the opted-in participant phone is disclosed');
select lives_ok($$select admin_meeting_contact_details(current_setting('test.contact_case')::uuid,current_setting('test.contact_version')::int,'75000000-0000-0000-0000-000000000012')$$,'contact access retry is logged once');
select throws_ok($$select admin_complete_meeting_operation(current_setting('test.contact_case')::uuid,current_setting('test.contact_version')::int,'연락을 시도했지만 아직 확인하지 못함',gen_random_uuid(),false)$$,'22023','both participants must explicitly confirm before the meeting','contact attempt alone is not attendance confirmation');
select lives_ok($$select admin_complete_meeting_operation(current_setting('test.contact_case')::uuid,current_setting('test.contact_version')::int,'양쪽에서 현재 약속 참석 의사를 직접 확인했습니다','75000000-0000-0000-0000-000000000013',true)$$,'operator can record a real dual confirmation with a reason');
select lives_ok($$select admin_complete_meeting_operation(current_setting('test.contact_case')::uuid,current_setting('test.contact_version')::int,'양쪽에서 현재 약속 참석 의사를 직접 확인했습니다','75000000-0000-0000-0000-000000000013',true)$$,'manual confirmation retry is idempotent');
reset role;
select is((select count(*)::integer from ops_case_events where request_id='75000000-0000-0000-0000-000000000012'),1,'contact access is audited without copying the phone');
update meetings set scheduled_at=now()+interval '1 hour' where id=(select meeting_id from pairs where code='B');
update notifications set read_at=now() where meeting_id=(select meeting_id from pairs where code='B');
select meeting_lifecycle_tick();
select ok((select cancelled_at is null from meetings where id=(select meeting_id from pairs where code='B')),'manual dual confirmation prevents erroneous auto-cancel');
select ok((select male_attendance_at is null and female_attendance_at is null from meetings where id=(select meeting_id from pairs where code='B')),'operator confirmation does not impersonate member taps');
set local role authenticated;
set local request.jwt.claims='{"sub":"75000000-0000-0000-0000-000000000004","role":"authenticated"}';
select is((my_meeting_checkin((select meeting_id from pairs where code='B'))->>'operatorConfirmed')::boolean,true,'member sees that the operator confirmed attendance');
reset role;

insert into meeting_response_warnings(user_id,meeting_id,reason) select '75000000-0000-0000-0000-000000000001',meeting_id,'checkin_timeout' from pairs where code in('A','C');
select refresh_meeting_operations();
select set_config('test.review_case',(select id::text from ops_cases where case_type='response_review' and source_id='75000000-0000-0000-0000-000000000001' and status='open'),true);
select set_config('test.review_version',(select version::text from ops_cases where id=current_setting('test.review_case')::uuid),true);
set local role authenticated;
set local request.jwt.claims='{"sub":"75000000-0000-0000-0000-000000000006","role":"authenticated","aal":"aal2"}';
select lives_ok($$select admin_complete_meeting_operation(current_setting('test.review_case')::uuid,current_setting('test.review_version')::int,'경고 두 건의 기록을 확인했고 안내 후 관찰합니다','75000000-0000-0000-0000-000000000014',false)$$,'operator can finish a repeated warning review');
reset role;
select is(warning_review_needed('75000000-0000-0000-0000-000000000001'),false,'reviewed warnings no longer remain a permanent active task');
select is((select count(*)::integer from meeting_response_warnings where user_id='75000000-0000-0000-0000-000000000001'),2,'review completion never deletes warnings');
insert into meeting_response_warnings(user_id,meeting_id,reason) select '75000000-0000-0000-0000-000000000001',meeting_id,'checkin_timeout' from pairs where code='D';
select refresh_meeting_operations();
select is(warning_review_needed('75000000-0000-0000-0000-000000000001'),true,'a genuinely new warning reopens review');
select is((select max(occurrence) from ops_cases where case_type='response_review' and source_id='75000000-0000-0000-0000-000000000001'),2,'new warning has a new review occurrence');
select is((select account_state::text from profiles where id='75000000-0000-0000-0000-000000000001'),'active','reviewing or repeating warnings never automatically bans a member');
set local role authenticated;
set local request.jwt.claims='{"sub":"75000000-0000-0000-0000-000000000001","role":"authenticated"}';
select lives_ok($$select set_meeting_contact_preference(false,'meeting-contact-v1')$$,'operational contact consent can be revoked independently');
select is(my_meeting_contact_preference(),false,'revocation is immediately authoritative');
reset role;
select is((select count(*)::int from member_contact_preference_events where user_id='75000000-0000-0000-0000-000000000001'),1,'consent decisions are recorded separately from the current preference');
update profiles set account_state='withdrawn' where id='75000000-0000-0000-0000-000000000004';
select ok((select bool_and(note is null) from ops_case_events where case_id=current_setting('test.contact_case')::uuid),'withdrawal redacts contact notes even when the subject was the other participant');
set local role authenticated;
set local request.jwt.claims='{"sub":"75000000-0000-0000-0000-000000000006","role":"authenticated","aal":"aal2"}';
select lives_ok($$select admin_ops_case_detail(current_setting('test.contact_case')::uuid)$$,'redacted task can still be opened safely');
select throws_ok($$select admin_meeting_contact_details(current_setting('test.contact_case')::uuid,current_setting('test.contact_version')::int,gen_random_uuid())$$,'PT409','contact case unavailable','erased contact tasks reject access safely rather than casting erased identifiers');
reset role;
select * from finish();
rollback;
