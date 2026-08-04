-- S14 — 가격 · 잠시 쉬기 · 탈퇴
--
-- 탈퇴에서 지켜야 하는 것: **나가는 사람 때문에 남는 사람이 손해를 보지 않는다.**
-- 그래서 티켓 환불과 "영구 배제 기록이 남지 않는가"를 함께 검사한다.

begin;
select plan(14);

insert into auth.users (id, email, encrypted_password, email_confirmed_at, aud, role,
                        confirmation_token, recovery_token, email_change,
                        email_change_token_new, email_change_token_current,
                        phone_change, phone_change_token, reauthentication_token,
                        raw_app_meta_data, raw_user_meta_data)
values
  ('f0000000-0000-0000-0000-00000000000a','wf@t.co','x',now(),'authenticated','authenticated','','','','','','','','','{}'::jsonb,'{}'::jsonb),
  ('f0000000-0000-0000-0000-00000000000b','wm@t.co','x',now(),'authenticated','authenticated','','','','','','','','','{}'::jsonb,'{}'::jsonb),
  ('f0000000-0000-0000-0000-00000000000c','wn@t.co','x',now(),'authenticated','authenticated','','','','','','','','','{}'::jsonb,'{}'::jsonb);

insert into profiles (id, gender, hub_id, company_email, email_verified_at, name, birth, job,
                      onboarding_step, terms_agreed_at, privacy_agreed_at, created_at)
values
  ('f0000000-0000-0000-0000-00000000000a','female','gangnam','wf@t.co',now(),'더블유여','1995-03-14','디자이너',7,now(),now(), now() - interval '5 day'),
  ('f0000000-0000-0000-0000-00000000000b','male',  'gangnam','wm@t.co',now(),'더블유남','1992-06-21','엔지니어',7,now(),now(), now() - interval '4 day'),
  ('f0000000-0000-0000-0000-00000000000c','male',  'gangnam','wn@t.co',now(),'더블유남2','1993-01-05','기획자',7,now(),now(), now() - interval '3 day');

-- ─────────────── 가격 ───────────────

select is(ticket_bundle_amount(1::smallint), 30000, 'T1 1장 30,000원');
select is(ticket_bundle_amount(3::smallint), 85000, 'T2 3장 85,000원');

select is(
  (select count(*)::int from ticket_bundles()),
  2,
  'T3 상품 목록은 2종 (표시값이 서버에서 나온다)'
);

select is(
  (select amount from ticket_bundles() where quantity = 3),
  85000,
  'T4 목록의 금액이 ticket_bundle_amount() 와 같다 — 드리프트 없음'
);

-- ─────────────── 잠시 쉬기 ───────────────

set local role authenticated;
set local request.jwt.claims = '{"sub":"f0000000-0000-0000-0000-00000000000a","role":"authenticated"}';

select ok(
  (select remaining_candidates()) >= 2,
  'T5 [통과] 쉬기 전에는 픽스처 남성 2명이 후보에 있다'
);

set local request.jwt.claims = '{"sub":"f0000000-0000-0000-0000-00000000000b","role":"authenticated"}';
select set_paused(true);

select ok(
  (select paused_at from profiles where id = auth.uid()) is not null,
  'T6 [통과] set_paused(true) 가 시각을 찍는다'
);

set local request.jwt.claims = '{"sub":"f0000000-0000-0000-0000-00000000000a","role":"authenticated"}';

select is(
  (select count(*)::int from next_candidate()
    where id = 'f0000000-0000-0000-0000-00000000000b'),
  0,
  'T7 [차단] 쉬는 중인 남성은 후보에서 빠진다'
);

reset role;
select is(
  (select count(*)::int from eligible_profiles
    where id = 'f0000000-0000-0000-0000-00000000000b'),
  0,
  'T8 [차단] eligible_profiles 에서도 빠진다 (open_intro 가 이 뷰를 쓴다)'
);

-- 다시 켜면 돌아온다
set local role authenticated;
set local request.jwt.claims = '{"sub":"f0000000-0000-0000-0000-00000000000b","role":"authenticated"}';
select set_paused(false);
reset role;

select is(
  (select count(*)::int from eligible_profiles
    where id = 'f0000000-0000-0000-0000-00000000000b'),
  1,
  'T9 [통과] 다시 켜면 자격이 돌아온다'
);

-- ─────────────── 탈퇴 ───────────────
-- 남성이 티켓을 쓴 상태에서 여성이 탈퇴하는 경우.

insert into affinities (from_id, to_id, verdict)
values ('f0000000-0000-0000-0000-00000000000a','f0000000-0000-0000-0000-00000000000b','like');

set local role authenticated;
set local request.jwt.claims = '{"sub":"f0000000-0000-0000-0000-00000000000b","role":"authenticated"}';
select open_intro();

reset role;
select issue_ticket('f0000000-0000-0000-0000-00000000000b', 'w-test', 30000);

set local role authenticated;
set local request.jwt.claims = '{"sub":"f0000000-0000-0000-0000-00000000000b","role":"authenticated"}';
select use_meeting_ticket((select id from intros where male_id=auth.uid() and closed_at is null));

-- 여성이 탈퇴한다
set local request.jwt.claims = '{"sub":"f0000000-0000-0000-0000-00000000000a","role":"authenticated"}';
select withdraw_account('테스트');
reset role;

select is(
  (select state::text from tickets where payment_id = 'w-test'),
  'refunded',
  'T10 [통과] 남는 사람의 티켓이 환불된다 — 나가는 사람 때문에 손해 보지 않는다'
);

select is(
  (select cancel_reason from meetings m join intros i on i.id=m.intro_id
    where i.male_id='f0000000-0000-0000-0000-00000000000b'),
  'counterpart_withdrawn',
  'T11 [통과] 약속이 사유와 함께 취소된다'
);

select is(
  (select outcome::text from intros where male_id='f0000000-0000-0000-0000-00000000000b'),
  'withdrawn',
  'T12 [통과] 소개는 passed 가 아니라 withdrawn 으로 닫힌다'
);

select is(
  (select count(*)::int from intro_exclusions
    where 'f0000000-0000-0000-0000-00000000000a' in (user_lo, user_hi)),
  0,
  'T13 [통과] 영구 배제가 기록되지 않는다 — 탈퇴는 거절이 아니다'
);

select is(
  (select name || '|' || company_email || '|' || account_state
     from profiles where id='f0000000-0000-0000-0000-00000000000a'),
  null,
  'T14 [통과] 이름이 지워져 결합 결과가 null 이다 (신원 삭제)'
);

select * from finish();
rollback;
