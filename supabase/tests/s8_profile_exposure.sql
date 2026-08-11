-- S8 — 프로필 노출 축소 · 열람권 회수 · 크기 제한
--
-- 통과 케이스와 차단 케이스를 짝으로 둔다. 차단만 검사하면 "전부 막혀서 통과"하는
-- 가짜 초록불이 나온다 — 실제로 S1 에서 그 함정을 밟은 적이 있다.

begin;
select plan(14);

-- 픽스처: 여성 1 · 남성 2. 하나는 소개 상대가 되고, 다른 하나는 평가 대상으로만 남는다.
insert into auth.users (id, email, encrypted_password, email_confirmed_at, aud, role,
                        confirmation_token, recovery_token, email_change,
                        email_change_token_new, email_change_token_current,
                        phone_change, phone_change_token, reauthentication_token,
                        raw_app_meta_data, raw_user_meta_data)
values
  ('a0000000-0000-0000-0000-00000000000a','f@t.co','x',now(),'authenticated','authenticated','','','','','','','','','{}'::jsonb,'{}'::jsonb),
  ('a0000000-0000-0000-0000-00000000000b','m@t.co','x',now(),'authenticated','authenticated','','','','','','','','','{}'::jsonb,'{}'::jsonb),
  ('a0000000-0000-0000-0000-00000000000c','n@t.co','x',now(),'authenticated','authenticated','','','','','','','','','{}'::jsonb,'{}'::jsonb);

insert into profiles (id, gender, hub_id, company_email, email_verified_at, name, birth, job,
                      onboarding_step, terms_agreed_at, privacy_agreed_at)
values
  ('a0000000-0000-0000-0000-00000000000a','female','gangnam','f@t.co',now(),'에프','1995-03-14','디자이너',7,now(),now()),
  ('a0000000-0000-0000-0000-00000000000b','male',  'gangnam','m@t.co',now(),'엠',  '1992-06-21','엔지니어',7,now(),now()),
  ('a0000000-0000-0000-0000-00000000000c','male',  'gangnam','n@t.co',now(),'엔',  '1993-01-05','기획자',  7,now(),now());

-- ───────────────── SEC-1 — 민감 컬럼이 나가지 않는다 ─────────────────

select is(
  (select count(*)::int from information_schema.columns
    where table_name='public_profiles' and column_name in ('company_email','birth','account_state','onboarding_step')),
  0,
  'T1 public_profiles 에 company_email·birth·account_state·onboarding_step 이 없다'
);

select ok(
  (select count(*)::int from information_schema.columns
    where table_name='public_profiles' and column_name='age') = 1,
  'T2 birth 대신 계산된 age 를 내보낸다'
);

set local role authenticated;
set local request.jwt.claims = '{"sub":"a0000000-0000-0000-0000-00000000000a","role":"authenticated"}';

select is(
  (select count(*)::int from profiles where gender='male'),
  0,
  'T3 [차단] 여성이 profiles 테이블에서 남성 행을 직접 읽지 못한다'
);

-- 시드 계정도 같은 권역이라 함께 잡힌다. 픽스처 2명만 세어 단언을 고정한다.
select is(
  (select count(*)::int from public_profiles
    where id in ('a0000000-0000-0000-0000-00000000000b','a0000000-0000-0000-0000-00000000000c')),
  2,
  'T4 [통과] 같은 권역 남성은 뷰로 보인다 — 전부 막힌 가짜 초록불이 아님을 확인'
);

select is(
  (select count(*)::int from profiles where id = auth.uid()),
  1,
  'T5 [통과] 본인 행은 테이블에서 그대로 읽는다 (company_email 자기 확인용)'
);

-- ───────────────── SEC-1 — 남성 쪽 방향 ─────────────────

set local request.jwt.claims = '{"sub":"a0000000-0000-0000-0000-00000000000b","role":"authenticated"}';

select is(
  (select count(*)::int from public_profiles where id <> auth.uid()),
  0,
  'T6 [차단] 소개가 없는 남성은 아무도 못 본다 (여성 목록 열람 불가)'
);

-- ───────────────── SEC-2 — 소개가 닫히면 열람권도 닫힌다 ─────────────────

reset role;
insert into affinities (from_id, to_id, verdict)
values ('a0000000-0000-0000-0000-00000000000a','a0000000-0000-0000-0000-00000000000b','like');

set local role authenticated;
set local request.jwt.claims = '{"sub":"a0000000-0000-0000-0000-00000000000b","role":"authenticated"}';
/*
  v2(s20): 소개는 운영자 큐에서 나오고 열람에 **소개 티켓 1장**을 쓴다.
  v1 은 호감만 있으면 open_intro() 가 열렸지만 이제 전제가 둘 더 붙는다.
  curated_by 는 이 픽스처에 운영자가 없어 남성 자신으로 둔다(검사 대상이 아니다).
*/
-- intro_queue 는 authenticated 에 INSERT 권한이 없다(운영자 RPC 만 쓴다).
-- 픽스처만 소유자 롤로 넣고 곧바로 원래 롤로 되돌린다.
reset role;
insert into intro_queue (male_id, female_id, position, curated_by, delivered_at, expires_at)
values ('a0000000-0000-0000-0000-00000000000b', 'a0000000-0000-0000-0000-00000000000a', 1, 'a0000000-0000-0000-0000-00000000000b', now(), now() + interval '3 weeks');
select issue_ticket('a0000000-0000-0000-0000-00000000000b', 'intro_s8_a', 5000, 'intro');
set local role authenticated;
select open_intro();

select is(
  (select count(*)::int from public_profiles where id='a0000000-0000-0000-0000-00000000000a'),
  1,
  'T7 [통과] 소개가 열리면 상대 여성이 보인다'
);

select is(
  (select count(*)::int from profiles where id='a0000000-0000-0000-0000-00000000000a'),
  0,
  'T8 [차단] 소개 상대여도 profiles 테이블 직접 조회는 안 된다 (company_email 차단)'
);

select pass_intro((select id from intros where male_id=auth.uid() and closed_at is null));

select is(
  (select count(*)::int from public_profiles where id='a0000000-0000-0000-0000-00000000000a'),
  0,
  'T9 [차단] 소개를 넘기면(영구 배제) 상대 프로필 열람권이 즉시 회수된다'
);

-- ───────────────── SEC-2 — 티켓을 쓴 상대는 계속 보인다 ─────────────────
-- mark_met() 이 소개를 닫으므로, 만남 경로가 없으면 만남 직후 대화방에서
-- 상대 이름이 사라진다.

reset role;
insert into affinities (from_id, to_id, verdict)
values ('a0000000-0000-0000-0000-00000000000a','a0000000-0000-0000-0000-00000000000c','like');

set local role authenticated;
set local request.jwt.claims = '{"sub":"a0000000-0000-0000-0000-00000000000c","role":"authenticated"}';
/*
  v2(s20): 소개는 운영자 큐에서 나오고 열람에 **소개 티켓 1장**을 쓴다.
  v1 은 호감만 있으면 open_intro() 가 열렸지만 이제 전제가 둘 더 붙는다.
  curated_by 는 이 픽스처에 운영자가 없어 남성 자신으로 둔다(검사 대상이 아니다).
*/
-- intro_queue 는 authenticated 에 INSERT 권한이 없다(운영자 RPC 만 쓴다).
-- 픽스처만 소유자 롤로 넣고 곧바로 원래 롤로 되돌린다.
reset role;
insert into intro_queue (male_id, female_id, position, curated_by, delivered_at, expires_at)
values ('a0000000-0000-0000-0000-00000000000c', 'a0000000-0000-0000-0000-00000000000a', 1, 'a0000000-0000-0000-0000-00000000000c', now(), now() + interval '3 weeks');
select issue_ticket('a0000000-0000-0000-0000-00000000000c', 'intro_s8_b', 5000, 'intro');
set local role authenticated;
select open_intro();

reset role;
select issue_ticket('a0000000-0000-0000-0000-00000000000c', 'test', 30000);

set local role authenticated;
set local request.jwt.claims = '{"sub":"a0000000-0000-0000-0000-00000000000c","role":"authenticated"}';
select use_meeting_ticket((select id from intros where male_id=auth.uid() and closed_at is null));
select is(
  (select count(*)::int from public_profiles where id='a0000000-0000-0000-0000-00000000000a'),
  1,
  'T10 [통과] 티켓을 쓴 상대는 계속 보인다'
);

reset role;
update intros set closed_at = now(), outcome = 'ticket_used'
 where male_id = 'a0000000-0000-0000-0000-00000000000c';

set local role authenticated;
set local request.jwt.claims = '{"sub":"a0000000-0000-0000-0000-00000000000c","role":"authenticated"}';

select is(
  (select count(*)::int from public_profiles where id='a0000000-0000-0000-0000-00000000000a'),
  1,
  'T11 [통과] 소개가 닫혀도 만남이 살아 있으면 상대가 보인다 (대화방·피드백)'
);

-- ───────────────── SEC-3 — 크기 제한 ─────────────────

reset role;

select throws_ok(
  $$ update profiles set photo_url = repeat('A', 2*1024*1024)
      where id = 'a0000000-0000-0000-0000-00000000000b' $$,
  '23514',
  null,
  'T12 [차단] 2MB photo_url 은 CHECK 로 거부된다'
);

select throws_ok(
  $$ update profiles set intro = repeat('가', 2000)
      where id = 'a0000000-0000-0000-0000-00000000000b' $$,
  '23514',
  null,
  'T13 [차단] 1500자를 넘는 intro 는 거부된다'
);

select lives_ok(
  $$ update profiles set intro = repeat('가', 1400), headline = '한 줄 소개'
      where id = 'a0000000-0000-0000-0000-00000000000b' $$,
  'T14 [통과] 상한 안쪽 값은 정상 저장된다'
);

select * from finish();
rollback;
