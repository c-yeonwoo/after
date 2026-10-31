begin;
select no_plan();
update app_settings set payments_enabled=false;

-- Isolate candidate selection from any local development seed.
update public.profiles set paused_at = now() where hub_id = 'yeouido';

insert into auth.users (id, email, encrypted_password, email_confirmed_at, aud, role)
select ('a1410000-0000-0000-0000-' || lpad(i::text, 12, '0'))::uuid,
       'flex141-' || i || '@corp.example', '', now(), 'authenticated', 'authenticated'
  from generate_series(1, 4) i;

insert into public.profiles (id, gender, hub_id, company_email, email_verified_at,
  name, birth, job, onboarding_step, terms_agreed_at, privacy_agreed_at,
  phone_verified_at, photo_paths)
select id,
       (case when i in (1, 4) then 'female' else 'male' end)::public.gender,
       case when i in (1, 2) then 'yeouido' else 'pangyo' end,
       'flex141-' || i || '@corp.example', now(), '지역검증' || i,
       '1994-01-01'::date, '기획', 7, now(), now(), now(),
       array[id::text || '/1.png', id::text || '/2.png', id::text || '/3.png']
  from (
    select i, ('a1410000-0000-0000-0000-' || lpad(i::text, 12, '0'))::uuid as id
      from generate_series(1, 4) i
  ) members;
update public.profiles set photo_state = 'approved'
 where id::text like 'a1410000-%';


-- No location is inferred from email, and email verification is not employment proof.
insert into auth.users(id,email,email_confirmed_at,aud,role)
values ('a1410000-0000-0000-0000-000000000005','flex141@gmail.com',now(),'authenticated','authenticated');
select set_config('request.jwt.claims','{"sub":"a1410000-0000-0000-0000-000000000005","role":"authenticated"}',true);
set local role authenticated;
select lives_ok($$ select create_my_profile('male','undecided') $$,'personal email may create an account before choosing a place');
select is((select hub_id from profiles where id=auth.uid()),'undecided','no guessed location');
select throws_ok($$ update profiles set onboarding_step=7 where id=auth.uid() $$,'22023','choose meeting areas','profile cannot finish without meeting preferences');
select throws_ok($$ select set_my_meeting_areas('gangnam',array['invalid']) $$,'22023','choose meeting areas','unknown areas rejected');
select throws_ok($$ select set_my_meeting_areas('gangnam',array['pangyo']) $$,'22023','choose meeting areas','primary must belong to chosen range');
select throws_ok($$ select set_my_meeting_areas('gangnam',array['gangnam',null]) $$,'22023','choose meeting areas','null range entries rejected');
select lives_ok($$ select set_my_meeting_areas('busan',array['busan']) $$,'signup is not restricted to original four work zones');
select is(my_meeting_areas(),array['busan'],'owner can read range');
select is((select count(*)::int from member_meeting_areas),1,'only own range is directly readable');
select ok(not has_function_privilege('authenticated','public.member_area_ids(uuid)','EXECUTE'),'no arbitrary-user private range reads');
select ok(not has_table_privilege('authenticated','public.member_meeting_areas','INSERT'),'no forging another owner');
reset role;

select set_config('request.jwt.claims','{"sub":"a1410000-0000-0000-0000-000000000001","role":"authenticated"}',true);
set local role authenticated;
select is(my_meeting_areas(),array['yeouido'],'legacy member keeps original range');
select is(is_eligible_candidate('a1410000-0000-0000-0000-000000000003'),false,'legacy pair is not automatically widened');
select lives_ok($$ select set_my_meeting_areas('yeouido',array['yeouido','pangyo']) $$,'member explicitly widens range');
select is(is_eligible_candidate('a1410000-0000-0000-0000-000000000003'),true,'different primary areas with a common meeting area are eligible');
select is((select hub_id from profiles where id=auth.uid()),'yeouido','primary preference stays separate from range');
select is((select id from next_candidate()),'a1410000-0000-0000-0000-000000000002'::uuid,'primary meeting area is preferred within the expanded range');
select lives_ok($$ insert into affinities(from_id,to_id,verdict) values(auth.uid(),'a1410000-0000-0000-0000-000000000003','like') $$,'cross-area interest uses the normal workflow');
reset role;
select curation_recommendation_tick('a1410000-0000-0000-0000-000000000003');
select is((select count(*)::int from curation_recommendations where male_id='a1410000-0000-0000-0000-000000000003' and female_id='a1410000-0000-0000-0000-000000000001'),1,'curation includes cross-area interest');
select ok(pair_brief_context('a1410000-0000-0000-0000-000000000003','a1410000-0000-0000-0000-000000000001') is not null,'grounded manager explanation allows this pair');
insert into intro_queue(male_id,female_id,position,curated_by)
values('a1410000-0000-0000-0000-000000000003','a1410000-0000-0000-0000-000000000001',1,'a1410000-0000-0000-0000-000000000003');
select promote_intro_queue('a1410000-0000-0000-0000-000000000003');
select is((select count(*)::int from next_openable_card('a1410000-0000-0000-0000-000000000003')),1,'new area intro is delivered and openable');
select set_config('request.jwt.claims','{"sub":"a1410000-0000-0000-0000-000000000001","role":"authenticated"}',true);
set local role authenticated;
select set_my_meeting_areas('yeouido',array['yeouido']);
reset role;
select is((select count(*)::int from next_openable_card('a1410000-0000-0000-0000-000000000003')),0,'range shrink removes paid-open opportunity before any ticket use');
select is((select count(*)::int from intro_queue where female_id='a1410000-0000-0000-0000-000000000001'),0,'unopened queue outside new range is removed');
select throws_ok($$ insert into intro_queue(male_id,female_id,position,curated_by)
values('a1410000-0000-0000-0000-000000000003','a1410000-0000-0000-0000-000000000001',1,'a1410000-0000-0000-0000-000000000003') $$,'23514','meeting areas do not overlap','admin/service role cannot force a pair outside member limits');

-- Existing paid rights and appointment history are not cancelled by narrowing preferences.
select set_config('request.jwt.claims','{"sub":"a1410000-0000-0000-0000-000000000001","role":"authenticated"}',true);
set local role authenticated;
select set_my_meeting_areas('yeouido',array['yeouido','pangyo']);
reset role;
insert into intros(male_id,female_id) values('a1410000-0000-0000-0000-000000000003','a1410000-0000-0000-0000-000000000001');
-- A venue in the shared area is available even though the primary regions differ.
insert into meet_places(id,hub_id,name,station,kind,active) values
 ('a1410000-0000-0000-0000-0000000000c1','pangyo','합성 판교 카페','판교','cafe',true),
 ('a1410000-0000-0000-0000-0000000000c2','yeouido','합성 여의도 카페','여의도','cafe',true);
create temp table area_intro as select id from intros where male_id='a1410000-0000-0000-0000-000000000003' and female_id='a1410000-0000-0000-0000-000000000001';
grant select on area_intro to authenticated;
select set_config('request.jwt.claims','{"sub":"a1410000-0000-0000-0000-000000000003","role":"authenticated"}',true);
set local role authenticated;
select is((select count(*)::int from meet_places_for_intro((select id from area_intro)) where id='a1410000-0000-0000-0000-0000000000c1'),1,'shared-area venue appears');
select is((select count(*)::int from meet_places_for_intro((select id from area_intro)) where id='a1410000-0000-0000-0000-0000000000c2'),0,'venue only one person accepts stays out');
select lives_ok($$select request_meeting((select id from area_intro),
 array[(date_trunc('week',now() at time zone 'Asia/Seoul')+interval '8 days 19 hours') at time zone 'Asia/Seoul'],
 'a1410000-0000-0000-0000-0000000000c1',null)$$,'cross-area pair can request a real shared venue with a beta ticket');
reset role;
select set_config('request.jwt.claims','{"sub":"a1410000-0000-0000-0000-000000000001","role":"authenticated"}',true);
set local role authenticated;
select lives_ok($$select accept_meeting_slot((select id from meetings where intro_id=(select id from area_intro)),0)$$,'female accepts without a legacy same-work-zone error');
reset role;
set local role authenticated;
select set_my_meeting_areas('yeouido',array['yeouido']);
select is((select count(*)::int from get_public_profile('a1410000-0000-0000-0000-000000000003')),1,'opened introduction remains readable');
reset role;
update profiles set account_state='withdrawn' where id='a1410000-0000-0000-0000-000000000005';
select is((select count(*)::int from member_meeting_areas where user_id='a1410000-0000-0000-0000-000000000005'),0,'withdrawal erases private range');
select * from finish();
rollback;
