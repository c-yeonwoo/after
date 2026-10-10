-- S49 — 리부팅 A1: 돈·신뢰 경로와 결정 반영
--
-- 2026-10-10 진단에서 롤백 트랜잭션으로 재현한 두 건을 고정한다.
-- ① 정지·쉬는 여성의 카드가 열려 남성의 소개 티켓이 사라졌다.
-- ② 소개 받기를 끈 남성에게도 카드가 전송되고 3주 만료가 흘렀다.
-- 그리고 D5(사진 필수)·D6(취향 문답 제거)·남성 반환 알림.

begin;
select plan(13);

insert into auth.users (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at, created_at, updated_at)
values
  ('49000000-0000-0000-0000-0000000000a1','00000000-0000-0000-0000-000000000000','authenticated','authenticated','m49@corp.example','',now(),now(),now()),
  ('49000000-0000-0000-0000-0000000000f1','00000000-0000-0000-0000-000000000000','authenticated','authenticated','f49a@corp.example','',now(),now(),now()),
  ('49000000-0000-0000-0000-0000000000f2','00000000-0000-0000-0000-000000000000','authenticated','authenticated','f49b@corp.example','',now(),now(),now()),
  ('49000000-0000-0000-0000-0000000000a2','00000000-0000-0000-0000-000000000000','authenticated','authenticated','nophoto49@corp.example','',now(),now(),now()),
  ('49000000-0000-0000-0000-0000000000ad','00000000-0000-0000-0000-000000000000','authenticated','authenticated','admin49@corp.example','',now(),now(),now());

insert into profiles (id, gender, hub_id, company_email, email_verified_at, name, birth, job,
                      onboarding_step, terms_agreed_at, privacy_agreed_at, role)
values
  ('49000000-0000-0000-0000-0000000000a1','male',  'gangnam','m49@corp.example',now(),'남사구','1992-01-01','기획',7,now(),now(),'member'),
  ('49000000-0000-0000-0000-0000000000f1','female','gangnam','f49a@corp.example',now(),'여사구가','1994-01-01','회계',7,now(),now(),'member'),
  ('49000000-0000-0000-0000-0000000000f2','female','gangnam','f49b@corp.example',now(),'여사구나','1995-01-01','디자인',7,now(),now(),'member'),
  ('49000000-0000-0000-0000-0000000000a2','male',  'gangnam','nophoto49@corp.example',now(),'사진없음','1991-01-01','개발',7,now(),now(),'member'),
  ('49000000-0000-0000-0000-0000000000ad','male',  'gangnam','admin49@corp.example',now(),'운영','1990-01-01','운영',7,now(),now(),'admin');

-- a2 만 사진이 없다.
update profiles set photo_paths = array[id::text || '/portrait.png', id::text || '/2.png', id::text || '/3.png']
 where id::text like '49000000-%' and id <> '49000000-0000-0000-0000-0000000000a2';
update profiles set photo_state = 'approved', photo_reviewed_at = now()
 where photo_url = id::text || '/portrait.png' and id::text like '49000000-%';

-- ─────────── D5 사진 필수 ───────────

select is(
  (select count(*)::int from eligible_profiles where id = '49000000-0000-0000-0000-0000000000a2'),
  0, 'T1 사진이 없는 회원은 eligible_profiles 에 없다'
);

set local role authenticated;
set local request.jwt.claims = '{"sub":"49000000-0000-0000-0000-0000000000f1","role":"authenticated"}';
select is(is_eligible_candidate('49000000-0000-0000-0000-0000000000a2'), false,
  'T2 사진 없는 남성은 여성 평가 후보가 아니다');
select is(is_eligible_candidate('49000000-0000-0000-0000-0000000000a1'), true,
  'T3 승인된 사진이 있는 남성은 후보다');
reset role;

-- ─────────── ② 쉬는 남성에게는 보내지 않는다 ───────────

update profiles set paused_at = now() where id = '49000000-0000-0000-0000-0000000000a1';
insert into intro_queue (male_id, female_id, position, curated_by)
values ('49000000-0000-0000-0000-0000000000a1','49000000-0000-0000-0000-0000000000f1',0,'49000000-0000-0000-0000-0000000000ad'),
       ('49000000-0000-0000-0000-0000000000a1','49000000-0000-0000-0000-0000000000f2',1,'49000000-0000-0000-0000-0000000000ad');

select is(promote_intro_queue('49000000-0000-0000-0000-0000000000a1'), 0,
  'T4 쉬는 남성에게는 카드를 전송하지 않는다');
select is(
  (select count(*)::int from intro_queue
    where male_id = '49000000-0000-0000-0000-0000000000a1' and delivered_at is not null),
  0, 'T5 그래서 3주 만료도 시작되지 않는다');

set local role authenticated;
set local request.jwt.claims = '{"sub":"49000000-0000-0000-0000-0000000000a1","role":"authenticated"}';
select set_paused(false);
reset role;
select is(
  (select count(*)::int from intro_queue
    where male_id = '49000000-0000-0000-0000-0000000000a1' and delivered_at is not null),
  2, 'T6 다시 켜면 막아 둔 카드가 바로 전송된다');

-- ─────────── ① 정지·쉬는 여성의 카드는 열리지 않는다 ───────────

insert into tickets (user_id, kind, price_krw)
values ('49000000-0000-0000-0000-0000000000a1','intro',5000);

-- 맨 앞 카드의 여성이 쉬기를 켰다.
update profiles set paused_at = now() where id = '49000000-0000-0000-0000-0000000000f1';

set local role authenticated;
set local request.jwt.claims = '{"sub":"49000000-0000-0000-0000-0000000000a1","role":"authenticated"}';
select is(
  (select female_id from open_intro()),
  '49000000-0000-0000-0000-0000000000f2'::uuid,
  'T7 쉬는 여성의 카드는 건너뛰고 다음 자격 있는 카드를 연다');
reset role;

select is(
  (select count(*)::int from tickets
    where user_id = '49000000-0000-0000-0000-0000000000a1' and kind = 'intro' and state = 'used'),
  1, 'T8 소개 티켓은 실제로 연 한 장에만 쓰였다');

-- 정지되면 그 사람이 걸린 미열람 카드는 큐에서 사라진다.
update profiles set account_state = 'banned' where id = '49000000-0000-0000-0000-0000000000f1';
select is(
  (select count(*)::int from intro_queue
    where female_id = '49000000-0000-0000-0000-0000000000f1' and opened_at is null),
  0, 'T9 정지되면 미열람 큐 카드가 지워진다');

-- ─────────── 남성 반환 알림 ───────────

insert into tickets (user_id, kind, price_krw)
values ('49000000-0000-0000-0000-0000000000a1','meeting',30000);

set local role authenticated;
set local request.jwt.claims = '{"sub":"49000000-0000-0000-0000-0000000000a1","role":"authenticated"}';
select use_meeting_ticket((select id from intros
                            where male_id = '49000000-0000-0000-0000-0000000000a1' and closed_at is null));

set local request.jwt.claims = '{"sub":"49000000-0000-0000-0000-0000000000f2","role":"authenticated"}';
select decline_meeting((select m.id from meetings m join intros i on i.id = m.intro_id
                         where i.female_id = '49000000-0000-0000-0000-0000000000f2'), null);
reset role;

select is(
  (select count(*)::int from notifications
    where user_id = '49000000-0000-0000-0000-0000000000a1' and kind = 'meeting_released'),
  1, 'T10 거절되면 남성에게 "티켓을 돌려드렸다" 알림이 쌓인다');
select is(
  (select count(*)::int from tickets
    where user_id = '49000000-0000-0000-0000-0000000000a1' and kind = 'meeting' and state = 'unused'),
  1, 'T11 그리고 만남 티켓은 실제로 돌아와 있다');

-- ─────────── D6 취향 문답 제거 ───────────

select hasnt_function('public', 'preference_agreement', 'T12 취향 일치 계산 함수는 없다');
select ok(
  not has_table_privilege('authenticated', 'preference_answers', 'INSERT'),
  'T13 로그인 사용자는 취향 문답에 쓸 수 없다 (테이블은 보존)');

select * from finish();
rollback;
