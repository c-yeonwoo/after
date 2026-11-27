begin isolation level repeatable read;
select no_plan();
select set_config('request.jwt.claims','{"role":"service_role","aal":"aal2"}',true);
create function pg_temp.person(n int) returns uuid language sql immutable as $$
  select ('93190000-0000-0000-0000-'||lpad(n::text,12,'0'))::uuid
$$;
create function pg_temp.login(n int) returns text language sql as $$
  select set_config('request.jwt.claims',json_build_object('sub',pg_temp.person(n),'role','authenticated','aal','aal2')::text,true)
$$;
insert into auth.users(id,email,aud,role,email_confirmed_at,encrypted_password)
select pg_temp.person(n),'betaobs'||n||'@verify.local','authenticated','authenticated',now(),'x' from generate_series(1,4)n;
insert into profiles(id,company_email,gender,role,name,hub_id) values(pg_temp.person(1),'betaobs1@verify.local','male','admin','테스트 운영','yeouido');
select pg_temp.login(1);
create temporary table snapshots(k text primary key, s jsonb);
grant select,insert on snapshots to authenticated;
insert into snapshots values('before',admin_invite_beta_observations());
select set_config('request.jwt.claims','{"role":"service_role","aal":"aal2"}',true);
insert into profiles(id,company_email,gender,hub_id,name,job,birth,onboarding_step,email_verified_at,terms_agreed_at,
 privacy_agreed_at,agreed_policy_version,phone_verified_at,photo_state,photo_paths,created_at)
select pg_temp.person(n),'betaobs'||n||'@verify.local',case when n=2 then 'female'::gender else 'male'::gender end,
 'yeouido','베타'||n,'기획','1993-01-01',7,now(),now(),now(),'2026-10-31.1',now(),'approved',array[n||'/1',n||'/2',n||'/3'],now()-interval '40 days' from generate_series(2,4)n;
insert into events(user_id,name,created_at) select pg_temp.person(n),'profile_completed',
 now()-interval '99 days' from generate_series(2,4)n;
update domain_events set occurred_at=now()-case when subject_id=pg_temp.person(4) then interval '40 days' else interval '5 hours' end
 where subject_id in(pg_temp.person(2),pg_temp.person(3),pg_temp.person(4)) and event_type='member_profile_completed';
-- Oldest ready state, not a later reactivation, anchors each member's elapsed time.
update domain_events set occurred_at=now()-case when subject_id=pg_temp.person(4) then interval '39 days' else interval '3 hours' end
 where subject_id in(pg_temp.person(2),pg_temp.person(3),pg_temp.person(4)) and event_type='member_became_ready';
select pg_temp.login(1);
insert into snapshots values('waiting',admin_invite_beta_observations());
select is((s#>>'{waits,male,waiting}')::int-(select (s#>>'{waits,male,waiting}')::int from snapshots where k='before'),2,'all current waiters include a member older than the reporting period') from snapshots where k='waiting';
select cmp_ok((s#>>'{waits,male,oldest_seconds}')::numeric,'>=',39*86400::numeric,'long pending waits stay visible') from snapshots where k='waiting';
insert into candidate_impressions(viewer_id,candidate_id) values(pg_temp.person(2),pg_temp.person(3));
set local role authenticated;
select pg_temp.login(2);
select throws_ok('select admin_invite_beta_observations()','42501',null,'member cannot see admin aggregates');
select throws_ok(format('select admin_log_beta_help(%L,%L)','intro',pg_temp.person(9)),'42501',null,'member cannot create operator logs');
select throws_ok('select count(*) from intro_reason_reactions','42501',null,'raw votes are private');
select throws_ok(format('select rate_intro_reason(%L,true)',pg_temp.person(4)),'42501',null,'cannot vote on an unseen profile');
reset role;
select set_config('request.jwt.claims','{"role":"service_role","aal":"aal2"}',true);
update profiles set paused_at=now() where id=pg_temp.person(2);
set local role authenticated;
select pg_temp.login(2);
select throws_ok(format('select rate_intro_reason(%L,true)',pg_temp.person(3)),'42501',null,'paused viewer cannot rate the previous card');
reset role;
select set_config('request.jwt.claims','{"role":"service_role","aal":"aal2"}',true);
update profiles set paused_at=null where id=pg_temp.person(2);
set local role authenticated;
select pg_temp.login(2);
select rate_intro_reason(pg_temp.person(3),false);
select rate_intro_reason(pg_temp.person(3),true);
select rate_intro_reason(pg_temp.person(3),true);
reset role;
insert into affinities(from_id,to_id,verdict) values(pg_temp.person(2),pg_temp.person(3),'like');
set local role authenticated;
select pg_temp.login(1);
select admin_set_queue(pg_temp.person(3),array[pg_temp.person(2)],'local beta test');
select pg_temp.login(3);
create temporary table teaser as select intro_teaser_with_evidence() t;
select isnt(t#>>'{evidence,reaction_ref}',pg_temp.person(2)::text,'teaser survey never gives out the peer ID') from teaser;
select rate_intro_reason((t#>>'{evidence,reaction_ref}')::uuid,false) from teaser;
select is(intro_teaser_with_evidence()#>>'{evidence,resonated}','false','saved vote survives refresh');
select pg_temp.login(4);
select throws_ok(format('select rate_intro_reason(%L,true)',(select t#>>'{evidence,reaction_ref}' from teaser)),'42501',null,'another reader cannot reuse a teaser ref');
select pg_temp.login(1);
select admin_log_beta_help('feedback',pg_temp.person(9));
select admin_log_beta_help('feedback',pg_temp.person(9));
select throws_ok(format('select admin_log_beta_help(%L,%L)','meeting',pg_temp.person(9)),'PT409',null,'a retried operator action cannot change stage');
insert into snapshots values('delivered',admin_invite_beta_observations());
select is((a.s#>>'{reactions,total}')::int-(b.s#>>'{reactions,total}')::int,2,'two separate opinions for the same pair') from snapshots a,snapshots b where a.k='delivered' and b.k='before';
select is((a.s#>>'{reactions,yes}')::int-(b.s#>>'{reactions,yes}')::int,1,'changed and repeated vote counts once') from snapshots a,snapshots b where a.k='delivered' and b.k='before';
select is(coalesce((a.s#>>'{actions,feedback,manual}')::int,0)-coalesce((b.s#>>'{actions,feedback,manual}')::int,0),1,'one manual explanation per retry key') from snapshots a,snapshots b where a.k='delivered' and b.k='before';
select is(coalesce((a.s#>>'{actions,intro,logged}')::int,0)-coalesce((b.s#>>'{actions,intro,logged}')::int,0),1,'queue action reused once') from snapshots a,snapshots b where a.k='delivered' and b.k='before';
select is((a.s#>>array['waits',g,'intro_n'])::int-(b.s#>>array['waits',g,'intro_n'])::int,1,'first arrival counts once for '||g) from snapshots a,snapshots b,unnest(array['female','male']) g where a.k='delivered' and b.k='before';
select is((a.s#>>array['waits',g,'total_n'])::int-(b.s#>>array['waits',g,'total_n'])::int,1,'full duration needs both observed timestamps for '||g) from snapshots a,snapshots b,unnest(array['female','male']) g where a.k='delivered' and b.k='before';
select pg_temp.login(2);
select throws_ok(format('select rate_intro_reason(%L,true)',pg_temp.person(3)),'42501',null,'stale evaluated card cannot accept a new vote');
reset role;
select set_config('request.jwt.claims','{"role":"service_role","aal":"aal2"}',true);
update profiles set account_state='withdrawn' where id=pg_temp.person(2);
select is((select count(*)::int from intro_reason_reactions where reader_id=pg_temp.person(2) or peer_id=pg_temp.person(2)),0,'withdrawal erases both directions');
select * from finish();
rollback;
