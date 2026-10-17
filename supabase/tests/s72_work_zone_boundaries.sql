begin;
select plan(13);

-- Isolate candidate selection from any local development seed.
update public.profiles set paused_at = now() where hub_id = 'yeouido';

insert into auth.users (id, email, encrypted_password, email_confirmed_at, aud, role)
select ('72000000-0000-0000-0000-' || lpad(i::text, 12, '0'))::uuid,
       'zone72-' || i || '@corp.example', '', now(), 'authenticated', 'authenticated'
  from generate_series(1, 4) i;

insert into public.profiles (id, gender, hub_id, company_email, email_verified_at,
  name, birth, job, onboarding_step, terms_agreed_at, privacy_agreed_at,
  phone_verified_at, photo_paths)
select id,
       (case when i in (1, 4) then 'female' else 'male' end)::public.gender,
       case when i in (1, 2) then 'yeouido' else 'pangyo' end,
       'zone72-' || i || '@corp.example', now(), '지역검증' || i,
       '1994-01-01'::date, '기획', 7, now(), now(), now(),
       array[id::text || '/1.png', id::text || '/2.png', id::text || '/3.png']
  from (
    select i, ('72000000-0000-0000-0000-' || lpad(i::text, 12, '0'))::uuid as id
      from generate_series(1, 4) i
  ) members;
update public.profiles set photo_state = 'approved'
 where id::text like '72000000-%';

set local role authenticated;
set local request.jwt.claims =
  '{"sub":"72000000-0000-0000-0000-000000000001","role":"authenticated"}';

select is((select id from public.next_candidate()),
  '72000000-0000-0000-0000-000000000002'::uuid,
  '직장 지역이 같은 남성만 새 후보가 된다');
select is(public.remaining_candidates(), 1,
  '다른 직장 지역의 회원을 대기 후보 수에 포함하지 않는다');
select is_empty($$ select id from public.get_public_profile(
  '72000000-0000-0000-0000-000000000003') $$,
  '다른 지역의 프로필은 ID를 알아도 공개하지 않는다');
select throws_ok($$ insert into public.affinities(from_id, to_id, verdict) values
  ('72000000-0000-0000-0000-000000000001',
   '72000000-0000-0000-0000-000000000003', 'like') $$,
  '23514', 'different work zones', '다른 지역으로 호감을 보낼 수 없다');
select lives_ok($$ insert into public.affinities(from_id, to_id, verdict) values
  ('72000000-0000-0000-0000-000000000001',
   '72000000-0000-0000-0000-000000000002', 'like') $$,
  '같은 지역의 호감은 정상 기록된다');
reset role;

select throws_ok($$ insert into public.affinities(from_id, to_id, verdict) values
  ('72000000-0000-0000-0000-000000000004',
   '72000000-0000-0000-0000-000000000002', 'like') $$,
  '23514', 'different work zones', 'RLS를 우회한 직접 입력도 지역 경계를 지킨다');
select lives_ok($$ insert into public.intro_queue(male_id, female_id, position, curated_by)
  values ('72000000-0000-0000-0000-000000000002',
          '72000000-0000-0000-0000-000000000001', 1,
          '72000000-0000-0000-0000-000000000002') $$,
  '같은 지역의 수동 소개 큐를 만들 수 있다');
select throws_ok($$ insert into public.intro_queue(male_id, female_id, position, curated_by)
  values ('72000000-0000-0000-0000-000000000003',
          '72000000-0000-0000-0000-000000000001', 1,
          '72000000-0000-0000-0000-000000000002') $$,
  '23514', 'different work zones', '수동 소개 큐에도 다른 지역의 상대를 넣을 수 없다');
select throws_ok($$ update public.intro_queue
  set female_id = '72000000-0000-0000-0000-000000000004'
  where male_id = '72000000-0000-0000-0000-000000000002' $$,
  '23514', 'different work zones', '큐 상대를 바꿀 때도 같은 지역을 유지한다');
select lives_ok($$ insert into public.intros(male_id, female_id) values
  ('72000000-0000-0000-0000-000000000002',
   '72000000-0000-0000-0000-000000000001') $$,
  '같은 지역의 실제 소개는 정상 생성된다');
select throws_ok($$ insert into public.intros(male_id, female_id) values
  ('72000000-0000-0000-0000-000000000003',
   '72000000-0000-0000-0000-000000000001') $$,
  '23514', 'different work zones', '실제 소개도 다른 지역끼리 생성할 수 없다');
select throws_ok($$ update public.intros
  set female_id = '72000000-0000-0000-0000-000000000004'
  where male_id = '72000000-0000-0000-0000-000000000002' $$,
  '23514', 'different work zones', '생성된 소개의 상대를 바꿔도 지역을 넘을 수 없다');
select ok(not has_function_privilege('authenticated',
  'public.guard_pair_work_zone()', 'EXECUTE'), '회원이 내부 트리거 함수를 직접 호출할 수 없다');

select * from finish();
rollback;
