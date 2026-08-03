-- S10 — 후보 선정 RPC
--
-- 예전 경로(클라이언트가 전원 받아 [0] 만 쓰고, 평가한 ID 전체를 URL 에 넣음)는
-- 평가 약 210건에서 HTTP 414 로 죽었고 권역 남성 전원이 브라우저에 내려왔다.
-- 여기서 검사하는 것: 자격·제외·노출면·순서가 서버에서 지켜지는가.

begin;
select plan(9);

insert into auth.users (id, email, encrypted_password, email_confirmed_at, aud, role,
                        confirmation_token, recovery_token, email_change,
                        email_change_token_new, email_change_token_current,
                        phone_change, phone_change_token, reauthentication_token,
                        raw_app_meta_data, raw_user_meta_data)
select ('d0000000-0000-0000-0000-' || lpad(i::text,12,'0'))::uuid,
       'nc'||i||'@t.co','x',now(),'authenticated','authenticated',
       '','','','','','','','','{}'::jsonb,'{}'::jsonb
  from generate_series(1,4) i;

-- 1 = 여성(호출자), 2·3 = 자격 있는 남성, 4 = 온보딩 미완료 남성
insert into profiles (id, gender, hub_id, company_email, email_verified_at, name, birth, job,
                      onboarding_step, terms_agreed_at, privacy_agreed_at, created_at)
values
  ('d0000000-0000-0000-0000-000000000001','female','gangnam','nc1@t.co',now(),'디여','1995-03-14','디자이너',7,now(),now(), now() - interval '10 day'),
  ('d0000000-0000-0000-0000-000000000002','male',  'gangnam','nc2@t.co',now(),'디남1','1992-06-21','엔지니어',7,now(),now(), now() - interval '9 day'),
  ('d0000000-0000-0000-0000-000000000003','male',  'gangnam','nc3@t.co',now(),'디남2','1993-01-05','기획자',  7,now(),now(), now() - interval '8 day'),
  ('d0000000-0000-0000-0000-000000000004','male',  'gangnam','nc4@t.co',now(),'디남3','1994-02-02','마케터',  4,now(),now(), now() - interval '7 day');

set local role authenticated;
set local request.jwt.claims = '{"sub":"d0000000-0000-0000-0000-000000000001","role":"authenticated"}';

-- ─────────────── 순서 · 자격 ───────────────

select is(
  (select name from next_candidate()),
  '디남1',
  'T1 [통과] 오래 기다린 사람부터 나온다 (created_at 순)'
);

select ok(
  (select remaining_candidates()) >= 2,
  'T2 [통과] 자격 있는 남성 2명이 남은 수에 잡힌다'
);

select is(
  (select count(*)::int from next_candidate()),
  1,
  'T3 [통과] 한 번에 한 명만 나온다 — 전체 풀이 클라이언트로 내려가지 않는다'
);

-- 온보딩 미완료(step 4)는 후보가 아니다
select is(
  (select count(*)::int from next_candidate() where name = '디남3'),
  0,
  'T4 [차단] 온보딩을 마치지 않은 사람은 후보에 들지 않는다'
);

-- ─────────────── 노출면 ───────────────

select is(
  (select count(*)::int from information_schema.columns
    where table_name = 'public_profiles'
      and column_name in ('company_email','birth')),
  0,
  'T5 [통과] 반환 타입이 public_profiles 라 민감 컬럼이 없다'
);

-- ─────────────── 평가한 상대는 다시 안 나온다 ───────────────

insert into affinities (from_id, to_id, verdict)
values ('d0000000-0000-0000-0000-000000000001','d0000000-0000-0000-0000-000000000002','pass');

select is(
  (select name from next_candidate()),
  '디남2',
  'T6 [통과] 평가한 상대는 빠지고 다음 사람이 나온다'
);

insert into affinities (from_id, to_id, verdict)
values ('d0000000-0000-0000-0000-000000000001','d0000000-0000-0000-0000-000000000003','like');

-- 시드 남성도 같은 권역이라 후보로 남는다. 픽스처 두 명이 빠졌는지만 본다.
select is(
  (select count(*)::int from next_candidate()
    where id in ('d0000000-0000-0000-0000-000000000002',
                 'd0000000-0000-0000-0000-000000000003')),
  0,
  'T7 [통과] 평가를 마친 상대는 후보에서 완전히 빠진다'
);

-- ─────────────── 성별 게이트 ───────────────

set local request.jwt.claims = '{"sub":"d0000000-0000-0000-0000-000000000002","role":"authenticated"}';

select is(
  (select count(*)::int from next_candidate()),
  0,
  'T8 [차단] 남성이 부르면 조용히 0명 (평가는 여성 선행이다 — D2)'
);

select is(
  (select remaining_candidates()),
  0,
  'T9 [차단] 남성에게는 남은 후보 수도 0이다'
);

select * from finish();
rollback;
