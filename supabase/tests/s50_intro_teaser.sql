-- S50 — 열기 전 공개 (D2 ①)
--
-- 가장 중요한 성질: **티저가 보여 준 사람이 실제로 열린다.** 티저는 A 를 보여 주고
-- 열면 B 가 열리면, 돈을 받고 다른 사람을 준 셈이다.

begin;
select plan(10);

insert into auth.users (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at, created_at, updated_at)
values
  ('50000000-0000-0000-0000-0000000000a1','00000000-0000-0000-0000-000000000000','authenticated','authenticated','m50@corp.example','',now(),now(),now()),
  ('50000000-0000-0000-0000-0000000000f1','00000000-0000-0000-0000-000000000000','authenticated','authenticated','f50a@corp.example','',now(),now(),now()),
  ('50000000-0000-0000-0000-0000000000f2','00000000-0000-0000-0000-000000000000','authenticated','authenticated','f50b@corp.example','',now(),now(),now()),
  ('50000000-0000-0000-0000-0000000000ad','00000000-0000-0000-0000-000000000000','authenticated','authenticated','admin50@corp.example','',now(),now(),now());

insert into profiles (id, gender, hub_id, company_email, email_verified_at, name, birth, job, headline,
                      topics, interests, onboarding_step, terms_agreed_at, privacy_agreed_at, role)
values
  ('50000000-0000-0000-0000-0000000000a1','male','gangnam','m50@corp.example',now(),'남오공','1992-01-01','기획',
   '저녁엔 달립니다', '{좋아하는 음악,여행 다녀온 이야기}', '{러닝,재즈}', 7,now(),now(),'member'),
  ('50000000-0000-0000-0000-0000000000f1','female','gangnam','f50a@corp.example',now(),'여오공가',
   (current_date - interval '30 years')::date,'회계','요즘은 클라이밍',
   '{좋아하는 음악,일 이야기}', '{재즈,클라이밍}', 7,now(),now(),'member'),
  ('50000000-0000-0000-0000-0000000000f2','female','gangnam','f50b@corp.example',now(),'여오공나',
   (current_date - interval '28 years')::date,'디자인','산책을 좋아해요',
   '{반려동물}', '{산책}', 7,now(),now(),'member'),
  ('50000000-0000-0000-0000-0000000000ad','male','gangnam','admin50@corp.example',now(),'운영','1990-01-01','운영',
   null, '{}', '{}', 7,now(),now(),'admin');

update profiles set photo_paths = array[id::text || '/portrait.png', id::text || '/2.png', id::text || '/3.png'] where id::text like '50000000-%';
update profiles set photo_state = 'approved', photo_reviewed_at = now()
 where photo_url = id::text || '/portrait.png' and id::text like '50000000-%';

insert into affinities (from_id, to_id, verdict)
values ('50000000-0000-0000-0000-0000000000f1','50000000-0000-0000-0000-0000000000a1','like'),
       ('50000000-0000-0000-0000-0000000000f2','50000000-0000-0000-0000-0000000000a1','like');

insert into intro_queue (male_id, female_id, position, curated_by, reason)
values ('50000000-0000-0000-0000-0000000000a1','50000000-0000-0000-0000-0000000000f1',0,'50000000-0000-0000-0000-0000000000ad','두 분 다 퇴근 후 재즈 공연을 적으셨어요.'),
       ('50000000-0000-0000-0000-0000000000a1','50000000-0000-0000-0000-0000000000f2',1,'50000000-0000-0000-0000-0000000000ad',null);
select promote_intro_queue('50000000-0000-0000-0000-0000000000a1');

-- ─────────── 티저 ───────────

set local role authenticated;
set local request.jwt.claims = '{"sub":"50000000-0000-0000-0000-0000000000a1","role":"authenticated"}';

select results_eq(
  $$ select age, job, headline, shared, reason, delivered from intro_teaser() $$,
  $$ values (30, '회계'::text, '요즘은 클라이밍'::text, array['재즈','좋아하는 음악']::text[],
             '두 분 다 퇴근 후 재즈 공연을 적으셨어요.'::text, 2) $$,
  'T1 티저: 나이·직업·한 줄 소개·같이 적은 것·운영팀 한 줄·도착 수');

select is(
  (select count(*)::int from information_schema.routines r
     join information_schema.parameters p on p.specific_name = r.specific_name
    where r.routine_name = 'intro_teaser' and p.parameter_mode = 'OUT'
      and p.parameter_name in ('name', 'photo_url', 'intro')),
  0, 'T2 티저에는 이름·사진·소개글이 없다');

-- 맨 앞 여성이 쉬기를 켰다 → 티저와 열람이 함께 다음 사람으로 넘어간다.
reset role;
update profiles set paused_at = now() where id = '50000000-0000-0000-0000-0000000000f1';
insert into tickets (user_id, kind, price_krw) values ('50000000-0000-0000-0000-0000000000a1','intro',5000);
set local role authenticated;
set local request.jwt.claims = '{"sub":"50000000-0000-0000-0000-0000000000a1","role":"authenticated"}';

select is((select job from intro_teaser()), '디자인',
  'T3 자격 없는 카드는 티저에서도 건너뛴다');
select is((select female_id from open_intro()), '50000000-0000-0000-0000-0000000000f2'::uuid,
  'T4 티저가 보여 준 사람이 실제로 열린다');
select is((select count(*)::int from intro_teaser()), 0,
  'T5 이미 열린 소개가 있으면 티저는 없다 (다음 카드를 미리 보이지 않는다)');

-- ─────────── 운영자 한 줄 ───────────

select throws_ok(
  $$ select admin_set_queue_reason('50000000-0000-0000-0000-0000000000a1',
                                   '50000000-0000-0000-0000-0000000000f1', '아무 말') $$,
  '42501', null, 'T6 운영자가 아니면 한 줄을 쓸 수 없다');

set local request.jwt.claims = '{"sub":"50000000-0000-0000-0000-0000000000ad","role":"authenticated"}';
select is(
  (select reason from admin_set_queue_reason('50000000-0000-0000-0000-0000000000a1',
                                             '50000000-0000-0000-0000-0000000000f1', '  산책 이야기를 나눠 보세요  ')),
  '산책 이야기를 나눠 보세요', 'T7 운영자는 카드별 한 줄을 쓴다 (앞뒤 공백 정리)');
select is(
  (select reason from admin_queue('50000000-0000-0000-0000-0000000000a1')
    where female_id = '50000000-0000-0000-0000-0000000000f1'),
  '산책 이야기를 나눠 보세요', 'T8 운영자 큐 조회에 한 줄이 보인다');
reset role;

-- 열 때 한 줄이 소개로 옮겨진다.
update profiles set paused_at = null where id = '50000000-0000-0000-0000-0000000000f1';
update intros set closed_at = now(), outcome = 'passed' where male_id = '50000000-0000-0000-0000-0000000000a1';
insert into tickets (user_id, kind, price_krw) values ('50000000-0000-0000-0000-0000000000a1','intro',5000);
set local role authenticated;
set local request.jwt.claims = '{"sub":"50000000-0000-0000-0000-0000000000a1","role":"authenticated"}';
select is((select reason from open_intro()), '산책 이야기를 나눠 보세요',
  'T9 열면 운영팀 한 줄이 소개에 남는다');

set local request.jwt.claims = '{"sub":"50000000-0000-0000-0000-0000000000f1","role":"authenticated"}';
select throws_ok($$ select * from intro_teaser() $$, '42501', null,
  'T10 여성에게는 티저가 없다');

select * from finish();
rollback;
