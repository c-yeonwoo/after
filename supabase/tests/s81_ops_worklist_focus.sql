begin;
select plan(12);
insert into auth.users(id,email,aud,role,raw_app_meta_data,raw_user_meta_data)
values ('81000000-0000-0000-0000-000000000001','ops81@verify.local','authenticated','authenticated','{}','{}');
insert into profiles(id,gender,hub_id,company_email,name,role)
values ('81000000-0000-0000-0000-000000000001','male','gangnam','ops81@verify.local','합성 운영자','admin');
insert into ops_cases(case_type,source_id,subject_id,occurrence,priority,status,due_at,next_check_at,source_revision,resolved_at)
values
('support','focus81-overdue','81000000-0000-0000-0000-000000000001',1,'high','open',now()-interval '1 hour',null,'1',null),
('support','focus81-today','81000000-0000-0000-0000-000000000001',1,'normal','open',now(),null,'1',null),
('support','focus81-followup','81000000-0000-0000-0000-000000000001',1,'normal','waiting',now()+interval '2 days',now()-interval '1 minute','1',null),
('support','focus81-closed','81000000-0000-0000-0000-000000000001',1,'normal','resolved',now()-interval '1 day',now()-interval '1 minute','1',now());
select set_config('test.focus_overdue',(select count(*) from ops_cases where status not in ('resolved','superseded') and due_at<now())::text,true);
select set_config('test.focus_today',(select count(*) from ops_cases where status not in ('resolved','superseded') and due_at>=now() and due_at< (date_trunc('day',now() at time zone 'Asia/Seoul')+interval '1 day') at time zone 'Asia/Seoul')::text,true);
select set_config('test.focus_followup',(select count(*) from ops_cases where status not in ('resolved','superseded') and next_check_at<=now())::text,true);
set local role authenticated;
set local request.jwt.claims='{"sub":"81000000-0000-0000-0000-000000000001","role":"authenticated","aal":"aal2"}';
select is((admin_ops_worklist(p_focus=>'overdue')->>'total')::integer,current_setting('test.focus_overdue')::integer,'overdue uses the complete active dataset');
select is((admin_ops_worklist(p_focus=>'today')->>'total')::integer,current_setting('test.focus_today')::integer,'today excludes past due and uses the Seoul day boundary');
select is((admin_ops_worklist(p_focus=>'followup')->>'total')::integer,current_setting('test.focus_followup')::integer,'followup includes due rechecks but excludes closed work');
select is((admin_ops_worklist(p_status=>'resolved',p_focus=>'overdue')->>'total')::integer,0,'closed cases never appear as urgent');
select is((admin_ops_worklist()->>'total')::integer,(admin_ops_cases()->>'total')::integer,'unfiltered total matches the backwards-compatible RPC');
select set_config('test.focus_page',admin_ops_worklist(p_limit=>1)::text,true);
select is(jsonb_array_length(current_setting('test.focus_page')::jsonb->'items'),1,'page size enforced');
select isnt(admin_ops_worklist(p_limit=>1,p_cursor=>current_setting('test.focus_page')::jsonb->'next_cursor')->'items'->0->>'id',current_setting('test.focus_page')::jsonb->'items'->0->>'id','cursor advances without repeating the first row');
select throws_ok($$select admin_ops_worklist(p_focus=>'anything')$$,'22023',null,'unknown focus rejected');
select throws_ok($$select admin_ops_worklist(p_limit=>null)$$,'22023',null,'unbounded null page size rejected');
select throws_ok($$select admin_ops_worklist(p_cursor=>'{"rank":null,"due_at":null,"id":null}')$$,'22023',null,'null cursor rejected');
set local request.jwt.claims='{"sub":"81000000-0000-0000-0000-000000000099","role":"authenticated"}';
select throws_ok($$select admin_ops_worklist()$$,'42501',null,'non-admin denied');
set local role anon;
select throws_ok($$select admin_ops_worklist()$$,'42501',null,'anonymous denied');
reset role;
select * from finish();
rollback;
