-- S9 — 알림 아웃박스
--
-- 검사할 것: (a) 사건마다 올바른 **상대**에게 행이 남는가
--            (b) 같은 사건이 두 번 쌓이지 않는가(멱등)
--            (c) 클라이언트가 접근할 수 없는가
--            (d) 상태 전이 트랜잭션이 롤백되면 알림도 함께 사라지는가
--
-- (d)가 아웃박스를 쓰는 이유 그 자체다. 전이 함수 안에서 메일을 직접 보냈다면
-- 롤백된 전이에 대한 메일이 이미 나가 있었을 것이다.

begin;
select plan(11);

insert into auth.users (id, email, encrypted_password, email_confirmed_at, aud, role,
                        confirmation_token, recovery_token, email_change,
                        email_change_token_new, email_change_token_current,
                        phone_change, phone_change_token, reauthentication_token,
                        raw_app_meta_data, raw_user_meta_data)
values
  ('b0000000-0000-0000-0000-00000000000a','nf@t.co','x',now(),'authenticated','authenticated','','','','','','','','','{}'::jsonb,'{}'::jsonb),
  ('b0000000-0000-0000-0000-00000000000b','nm@t.co','x',now(),'authenticated','authenticated','','','','','','','','','{}'::jsonb,'{}'::jsonb);

insert into profiles (id, gender, hub_id, company_email, email_verified_at, name, birth, job,
                      onboarding_step, terms_agreed_at, privacy_agreed_at)
values
  ('b0000000-0000-0000-0000-00000000000a','female','gangnam','nf@t.co',now(),'엔에프','1995-03-14','디자이너',7,now(),now()),
  ('b0000000-0000-0000-0000-00000000000b','male',  'gangnam','nm@t.co',now(),'엔엠',  '1992-06-21','엔지니어',7,now(),now());

insert into affinities (from_id, to_id, verdict)
values ('b0000000-0000-0000-0000-00000000000a','b0000000-0000-0000-0000-00000000000b','like');

-- 시드 데이터에도 알림이 쌓여 있다. 단언은 픽스처 두 사람 것만 본다.
create temp view mine as
  select * from notifications
   where user_id in ('b0000000-0000-0000-0000-00000000000a',
                     'b0000000-0000-0000-0000-00000000000b');

-- ─────────────── 클라이언트 접근 차단 ───────────────

set local role authenticated;
set local request.jwt.claims = '{"sub":"b0000000-0000-0000-0000-00000000000b","role":"authenticated"}';

select throws_ok(
  'select * from notifications',
  '42501',
  null,
  'T1 [차단] 로그인 사용자는 알림 표를 읽을 수 없다'
);

select throws_ok(
  $$ insert into notifications (user_id, kind) values (auth.uid(), 'meeting_requested') $$,
  '42501',
  null,
  'T2 [차단] 로그인 사용자는 알림을 직접 만들 수 없다'
);

-- ─────────────── 사건 → 올바른 수신자 ───────────────

select open_intro();

reset role;
select issue_ticket('b0000000-0000-0000-0000-00000000000b', 'test-notify', 30000);

set local role authenticated;
set local request.jwt.claims = '{"sub":"b0000000-0000-0000-0000-00000000000b","role":"authenticated"}';
select use_meeting_ticket((select id from intros where male_id=auth.uid() and closed_at is null));

reset role;

select is(
  (select user_id from mine where kind='meeting_requested'),
  'b0000000-0000-0000-0000-00000000000a'::uuid,
  'T3 [통과] 티켓 사용 → 여성에게 요청 도착 알림'
);

select is(
  (select (payload->>'counterpart_id')::uuid from mine where kind='meeting_requested'),
  'b0000000-0000-0000-0000-00000000000b'::uuid,
  'T4 [통과] payload 에 상대(남성) 가 담긴다 — 발송 시 이름 조회용'
);

-- 여성이 가능한 날을 보낸다
set local role authenticated;
set local request.jwt.claims = '{"sub":"b0000000-0000-0000-0000-00000000000a","role":"authenticated"}';
select submit_meeting_prefs(
  (select m.id from meetings m join intros i on i.id=m.intro_id where i.female_id=auth.uid()),
  '{"dates":["2026-08-20T10:00:00.000Z"],"stations":["강남"],"anywhere":false}'::jsonb
);
reset role;

select is(
  (select user_id from mine where kind='prefs_submitted'),
  'b0000000-0000-0000-0000-00000000000b'::uuid,
  'T5 [통과] 선호 제출 → 남성에게 답변 도착 알림'
);

-- 남성이 확정한다
set local role authenticated;
set local request.jwt.claims = '{"sub":"b0000000-0000-0000-0000-00000000000b","role":"authenticated"}';
select confirm_meeting(
  (select m.id from meetings m join intros i on i.id=m.intro_id where i.male_id=auth.uid()),
  '2026-08-20T10:00:00.000Z'::timestamptz,
  '강남역 근처 카페',
  '카페'
);
reset role;

select is(
  (select user_id from mine where kind='meeting_confirmed'),
  'b0000000-0000-0000-0000-00000000000a'::uuid,
  'T6 [통과] 확정 → 여성에게 대화 오픈 알림'
);

select is(
  (select count(*)::int from mine),
  3,
  'T7 [통과] 사건 3건에 알림 3건 — 과다 생성 없음'
);

-- ─────────────── 후기 요청 (시각 기반) + 멱등 ───────────────

update meetings set scheduled_at = now() - interval '1 day'
 where confirmed_at is not null
   and intro_id in (select id from intros where male_id='b0000000-0000-0000-0000-00000000000b');

-- 반환값(생성 건수)으로 단언하면 커밋된 데모 데이터에 좌우된다.
-- 픽스처 두 사람의 행 수만 본다.
select enqueue_feedback_due();

select is(
  (select count(*)::int from mine where kind='feedback_due'),
  2,
  'T8 [통과] 만남 다음 날 → 양쪽 모두에게 후기 요청'
);

select enqueue_feedback_due();

select is(
  (select count(*)::int from mine where kind='feedback_due'),
  2,
  'T9 [멱등] 다시 돌려도 같은 만남으로 또 쌓지 않는다'
);

-- 이미 답한 만남은 묻지 않는다
update meetings set completed_at = now(),
                    completed_by = array['b0000000-0000-0000-0000-00000000000b'::uuid]
 where confirmed_at is not null
   and intro_id in (select id from intros where male_id='b0000000-0000-0000-0000-00000000000b');

delete from notifications
 where kind='feedback_due'
   and user_id in ('b0000000-0000-0000-0000-00000000000a',
                   'b0000000-0000-0000-0000-00000000000b');
select enqueue_feedback_due();

select is(
  (select count(*)::int from mine where kind='feedback_due'),
  0,
  'T10 [통과] 성사 여부를 이미 답한 만남에는 후기 요청을 보내지 않는다'
);

-- ─────────────── 롤백되면 알림도 사라진다 ───────────────
-- 아웃박스를 쓰는 이유. 전이 안에서 메일을 보냈다면 되돌릴 수 없었다.

savepoint before_cancel;
  update meetings set prefs_submitted_at = null
   where intro_id in (select id from intros where male_id='b0000000-0000-0000-0000-00000000000b');
  update meetings set prefs_submitted_at = now()
   where intro_id in (select id from intros where male_id='b0000000-0000-0000-0000-00000000000b');
rollback to savepoint before_cancel;

select is(
  (select count(*)::int from mine where kind='prefs_submitted'),
  1,
  'T11 [통과] 롤백된 상태 전이는 알림을 남기지 않는다 (트랜잭션 경계 공유)'
);

select * from finish();
rollback;
