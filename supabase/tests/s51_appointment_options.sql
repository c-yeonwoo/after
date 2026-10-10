-- S51 — 퇴근 동선 위의 확정 약속 (D1-B)
--
-- 남성이 후보 1~3개와 장소 하나로 요청하고, 여성이 하나를 누르면 확정된다.

begin;
select plan(15);

insert into auth.users (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at, created_at, updated_at)
values
  ('51000000-0000-0000-0000-0000000000a1','00000000-0000-0000-0000-000000000000','authenticated','authenticated','m51@corp.example','',now(),now(),now()),
  ('51000000-0000-0000-0000-0000000000f1','00000000-0000-0000-0000-000000000000','authenticated','authenticated','f51@corp.example','',now(),now(),now()),
  ('51000000-0000-0000-0000-0000000000ad','00000000-0000-0000-0000-000000000000','authenticated','authenticated','admin51@corp.example','',now(),now(),now());

insert into profiles (id, gender, hub_id, company_email, email_verified_at, name, birth, job,
                      onboarding_step, terms_agreed_at, privacy_agreed_at, role)
values
  ('51000000-0000-0000-0000-0000000000a1','male','gangnam','m51@corp.example',now(),'남오일','1992-01-01','기획',7,now(),now(),'member'),
  ('51000000-0000-0000-0000-0000000000f1','female','gangnam','f51@corp.example',now(),'여오일','1994-01-01','회계',7,now(),now(),'member'),
  ('51000000-0000-0000-0000-0000000000ad','male','gangnam','admin51@corp.example',now(),'운영','1990-01-01','운영',7,now(),now(),'admin');

update profiles set phone_verified_at = now(), photo_paths = array[id::text || '/portrait.png', id::text || '/2.png', id::text || '/3.png'] where id::text like '51000000-%';
update profiles set photo_state = 'approved', photo_reviewed_at = now()
 where photo_url = id::text || '/portrait.png' and id::text like '51000000-%';

insert into meet_places (id, hub_id, name, station, kind, active)
values ('51000000-0000-0000-0000-00000000c001','gangnam','예시 카페','역삼','cafe',true),
       ('51000000-0000-0000-0000-00000000c002','gangnam','닫은 곳','강남','bar',false),
       ('51000000-0000-0000-0000-00000000c003','pangyo','판교 카페','판교','cafe',true);

insert into intros (id, male_id, female_id)
values ('51000000-0000-0000-0000-0000000000e1','51000000-0000-0000-0000-0000000000a1','51000000-0000-0000-0000-0000000000f1');
insert into tickets (user_id, kind, price_krw) values ('51000000-0000-0000-0000-0000000000a1','meeting',30000);

set local role authenticated;
set local request.jwt.claims = '{"sub":"51000000-0000-0000-0000-0000000000a1","role":"authenticated"}';

-- ─────────── 장소 목록 ───────────

-- 로컬 시드 장소가 섞여도 흔들리지 않게 이 파일의 행만 센다.
select is((select count(*)::int from meet_places_for_me() where id::text like '51000000-%'), 1,
  'T1 회원에게는 내 권역의 사용 중인 장소만 보인다');
select ok(not has_table_privilege('authenticated', 'meet_places', 'SELECT'),
  'T2 장소 테이블은 직접 읽을 수 없다 (함수로만)');

-- ─────────── 요청 검증 ───────────

select throws_ok(
  $$ select request_meeting('51000000-0000-0000-0000-0000000000e1', '{}'::timestamptz[],
                            '51000000-0000-0000-0000-00000000c001', null) $$,
  '22023', null, 'T3 후보가 없으면 요청할 수 없다');
select throws_ok(
  format($$ select request_meeting('51000000-0000-0000-0000-0000000000e1', array[%L]::timestamptz[],
                                   '51000000-0000-0000-0000-00000000c001', null) $$,
         now() + interval '1 hour'),
  '22023', null, 'T4 몇 시간 뒤 같은 너무 이른 후보는 받지 않는다');
select throws_ok(
  format($$ select request_meeting('51000000-0000-0000-0000-0000000000e1', array[%L]::timestamptz[],
                                   '51000000-0000-0000-0000-00000000c002', null) $$,
         now() + interval '2 days'),
  '22023', 'place not available', 'T5 숨긴 장소는 고를 수 없다');
select throws_ok(
  format($$ select request_meeting('51000000-0000-0000-0000-0000000000e1', array[%L]::timestamptz[],
                                   '51000000-0000-0000-0000-00000000c003', null) $$,
         now() + interval '2 days'),
  '22023', 'place not available', 'T6 다른 권역 장소는 고를 수 없다');
select throws_ok(
  format($$ select request_meeting('51000000-0000-0000-0000-0000000000e1', array[%L]::timestamptz[],
                                   null, '   ') $$,
         now() + interval '2 days'),
  '22023', 'place required', 'T7 장소 목록을 안 쓰면 직접 적어야 한다');

-- ─────────── 요청 ───────────

select is(
  (select proposed_place_name from request_meeting(
     '51000000-0000-0000-0000-0000000000e1',
     array[now() + interval '3 days', now() + interval '2 days']::timestamptz[],
     '51000000-0000-0000-0000-00000000c001', null)),
  '예시 카페 · 역삼역', 'T8 후보와 장소로 요청한다 (장소 이름은 서버가 만든다)');

reset role;
select is(
  (select proposed_slots[1] < proposed_slots[2] from meetings
    where intro_id = '51000000-0000-0000-0000-0000000000e1'),
  true, 'T9 후보는 시간순으로 저장된다');
select is(
  (select count(*)::int from tickets
    where user_id = '51000000-0000-0000-0000-0000000000a1' and kind = 'meeting' and state = 'used'),
  1, 'T10 만남 티켓은 요청과 같은 트랜잭션에서 쓰인다');

-- ─────────── 여성 1탭 확정 ───────────

set local role authenticated;
set local request.jwt.claims = '{"sub":"51000000-0000-0000-0000-0000000000a1","role":"authenticated"}';
select throws_ok(
  $$ select accept_meeting_slot((select id from meetings
                                  where intro_id = '51000000-0000-0000-0000-0000000000e1'), 0) $$,
  '42501', null, 'T11 남성은 후보를 고를 수 없다');

set local request.jwt.claims = '{"sub":"51000000-0000-0000-0000-0000000000f1","role":"authenticated"}';
select results_eq(
  $$ select accepted_slot::int, place_name, place_id::text, confirmed_at is not null,
            scheduled_at = proposed_slots[2]
       from accept_meeting_slot((select id from meetings
                                  where intro_id = '51000000-0000-0000-0000-0000000000e1'), 1) $$,
  $$ values (1, '예시 카페 · 역삼역'::text, '51000000-0000-0000-0000-00000000c001'::text, true, true) $$,
  'T12 여성이 하나를 누르면 그 날짜·장소로 바로 확정된다');
select throws_ok(
  $$ select accept_meeting_slot((select id from meetings
                                  where intro_id = '51000000-0000-0000-0000-0000000000e1'), 0) $$,
  '42501', null, 'T13 확정된 뒤에는 다시 고를 수 없다');
reset role;

select results_eq(
  $$ select kind::text from notifications
      where meeting_id = (select id from meetings
                           where intro_id = '51000000-0000-0000-0000-0000000000e1')
        and user_id = '51000000-0000-0000-0000-0000000000a1'
      order by kind::text $$,
  $$ values ('meeting_confirmed'::text) $$,
  'T14 남성에게는 확정 알림 하나만 간다 (날짜 도착 알림은 겹치지 않는다)');

-- ─────────── 운영자 장소 관리 ───────────

set local role authenticated;
set local request.jwt.claims = '{"sub":"51000000-0000-0000-0000-0000000000ad","role":"authenticated"}';
select is(
  (select station from admin_upsert_meet_place(null, 'gangnam', ' 새 카페 ', '선릉', 'cafe',
                                                null, 'https://map.example/1', null, true)),
  '선릉', 'T15 운영자는 장소를 추가한다');

select * from finish();
rollback;
