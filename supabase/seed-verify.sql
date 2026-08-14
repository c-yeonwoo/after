-- 출시 전 검증용 목 데이터 (docs/release-scenarios.md §0)
--
-- **로컬 전용이다.** seed.sql 과 따로 두는 이유: seed.sql 은 db reset 마다 돌아
-- 개발 기본 상태를 만들고, 이 파일은 검증 시나리오가 요구하는 **특정 상태들**을
-- 얹는다. 두 목적을 한 파일에 섞으면 개발 중에 검증용 이상 상태(사진 검수 대기,
-- 소개 받기 OFF)가 늘 끼어든다.
--
-- 실행: psql "$DB_URL" -f supabase/seed-verify.sql
--
-- 계정 7개가 각각 다른 상태를 맡는다. 왜 이 구성인지는 시나리오 §0 표에 있다.

begin;

-- ─────────────── 정리 (재실행 가능) ───────────────
--
-- profiles 는 auth.users 삭제로 cascade 되지만(profiles_id_fkey = cascade),
-- **profiles 를 참조하는 것들은 cascade 가 아니다.** 티켓이 남아 있으면
-- FK 위반으로 트랜잭션이 통째로 중단되고, 그 뒤 모든 구문이 조용히 건너뛰어진다
-- (처음엔 그걸 못 보고 "사진 검수 대기 6" 이라는 엉뚱한 결과를 봤다).
--
-- 참조하는 쪽부터 지운다. 순서가 곧 의존 그래프의 역순이다.
/*
  **seed.sql 의 데모 계정도 함께 지운다.**

  db reset 은 seed.sql 을 항상 돌려 데모 회원(하나·연우·민수·지호 @demo.after)을
  만든다. 그런데 그 이름이 검증 계정과 겹쳐서, 큐레이션 작업 대상 목록에 같은
  이름이 두 번씩 떴다(남성 3명인데 6줄). 어느 쪽 데이터를 보고 있는지 알 수 없으면
  검증이 성립하지 않는다.

  검증 중에는 DB 에 **이 7개 계정만** 있어야 한다. 개발 상태로 돌아가려면
  `supabase db reset` 한 번이면 된다.
*/
create temporary table _verify_ids as
  select id from profiles
   where company_email like '%@verify.local'
      or company_email like '%@demo.after';

delete from feedbacks       where author_id in (select id from _verify_ids);
delete from no_show_reports where reporter_id in (select id from _verify_ids)
                              or accused_id  in (select id from _verify_ids);
delete from content_reports where reporter_id in (select id from _verify_ids)
                              or accused_id  in (select id from _verify_ids);
delete from admin_actions   where actor_id in (select id from _verify_ids)
                              or target_user in (select id from _verify_ids);
delete from notifications   where user_id in (select id from _verify_ids);
delete from meetings        where intro_id in (
  select id from intros where male_id in (select id from _verify_ids)
                           or female_id in (select id from _verify_ids));
delete from tickets         where user_id in (select id from _verify_ids);
delete from intro_queue     where male_id in (select id from _verify_ids)
                              or female_id in (select id from _verify_ids);
delete from intro_exclusions where user_lo in (select id from _verify_ids)
                               or user_hi in (select id from _verify_ids);
delete from intros          where male_id in (select id from _verify_ids)
                              or female_id in (select id from _verify_ids);
delete from affinities      where from_id in (select id from _verify_ids)
                              or to_id in (select id from _verify_ids);
delete from events          where user_id in (select id from _verify_ids);

drop table _verify_ids;

-- 프로필을 참조하는 것들을 위에서 다 지웠으므로 이제 계정을 지운다.
-- 데모 계정(@demo.after)도 함께 — 위 주석의 이유.
delete from auth.users where email like '%@verify.local' or email like '%@demo.after';

-- ─────────────── 계정 ───────────────
--
-- id 를 읽기 쉬운 규칙으로 둔다: aaaa=운영자, ffff=여성, dddd=남성.
-- uuid 는 **16진수만** 허용하므로 mmmm(남성) 같은 기억하기 좋은 접두사는 못 쓴다
-- (처음에 그렇게 썼다가 invalid input syntax 로 막혔다).
-- 검증 중 SQL 로 확인할 일이 많아서 uuid 를 눈으로 구분할 수 있어야 한다.

do $$
declare
  r record;
begin
  for r in
    select * from (values
      ('aaaa0000-0000-4000-8000-000000000001'::uuid, 'admin@verify.local',  'male',   '운영자', '1990-01-01'::date, '운영'),
      ('ffff0000-0000-4000-8000-000000000001'::uuid, 'f1@verify.local',     'female', '서연',   '1993-04-12'::date, 'UX 디자이너'),
      ('ffff0000-0000-4000-8000-000000000002'::uuid, 'f2@verify.local',     'female', '지우',   '1994-08-03'::date, '마케터'),
      ('ffff0000-0000-4000-8000-000000000003'::uuid, 'f3@verify.local',     'female', '하람',   '1992-11-21'::date, '약사'),
      ('dddd0000-0000-4000-8000-000000000001'::uuid, 'm1@verify.local',     'male',   '연우',   '1991-06-21'::date, '백엔드 엔지니어'),
      ('dddd0000-0000-4000-8000-000000000002'::uuid, 'm2@verify.local',     'male',   '민수',   '1990-02-17'::date, '변호사'),
      ('dddd0000-0000-4000-8000-000000000003'::uuid, 'm3@verify.local',     'male',   '지호',   '1995-09-09'::date, '데이터 분석가')
    ) as t(id, email, gender, name, birth, job)
  loop
    /*
      instance_id·created_at·updated_at 을 빼면 GoTrue 가 행을 읽다 실패한다
      (422 otp_disabled, 500 "Database error finding user"). seed.sql 이 같은
      형태를 쓰는 이유이고, 여기서도 그대로 맞춘다.
    */
    insert into auth.users (
      instance_id, id, email, encrypted_password, email_confirmed_at, aud, role,
      confirmation_token, recovery_token, email_change, email_change_token_new,
      email_change_token_current, phone_change, phone_change_token,
      reauthentication_token, raw_app_meta_data, raw_user_meta_data,
      created_at, updated_at)
    values ('00000000-0000-0000-0000-000000000000', r.id, r.email, 'x', now(),
            'authenticated', 'authenticated', '', '', '', '', '', '', '', '',
            '{}'::jsonb, '{}'::jsonb, now(), now());

    insert into profiles (
      id, gender, hub_id, company_email, email_verified_at, onboarding_step,
      terms_agreed_at, privacy_agreed_at, agreed_policy_version,
      name, birth, job, headline, intro, interests, match_tags, topics,
      mbti, smoking, drinking, religion, details)
    values (
      r.id, r.gender::gender, 'gangnam', r.email, now(), 7,
      now(), now(), '2026-08-01',
      r.name, r.birth, r.job,
      case r.name
        when '서연' then '주말엔 작은 전시를 찾아다닙니다.'
        when '지우' then '달리기와 커피로 하루를 엽니다.'
        when '하람' then '조용한 동네 산책을 좋아합니다.'
        when '연우' then '코드는 조용히, 저녁은 느긋하게.'
        when '민수' then '요즘 도자기를 배우고 있습니다.'
        when '지호' then '주말 아침 빵집 투어를 합니다.'
        else '운영 계정입니다.' end,
      case when r.name = '운영자' then '운영 계정입니다.'
           else '요즘은 새로 배우는 것에 시간을 쓰고 있습니다. 처음 만나는 자리라면 가벼운 저녁이 좋아요.' end,
      case when r.name = '운영자' then array[]::text[] else array['동네 산책', '전시 보기'] end,
      case when r.name = '운영자' then array[]::text[] else array['말이 느긋한 사람', '질문을 잘하는 사람'] end,
      case when r.name = '운영자' then array[]::text[] else array['요즘 빠져 있는 것'] end,
      'INFP', 'none', 'social', 'none',
      case when r.name = '운영자' then '{}'::jsonb
           else '{"동네 산책":"퇴근길에 한 정거장 먼저 내려 걷습니다.","전시 보기":"작은 갤러리를 찾아 다니는 걸 좋아합니다."}'::jsonb end);
  end loop;
end $$;

-- ─────────────── 상태 부여 ───────────────

-- 운영자: role=admin. paused_at 을 채워 후보 풀에서 뺀다(seed.sql 과 같은 이유).
update profiles
   set role = 'admin', paused_at = now()
 where company_email = 'admin@verify.local';

/*
  여성1 서연 — 사진 승인됨. 정상 경로 담당.
  여성2 지우 — **사진 검수 대기.** 후보 풀에서 빠져 있어야 한다(시나리오 B3).
  여성3 하람 — 사진 없음. 게이트를 통과해야 한다(시나리오 B7).

  사진 파일은 별도 스크립트가 Storage 에 올린다 — SQL 로는 경로만 심는다.

  ── 두 단계로 나눈 이유 ──
  photo_url 과 photo_state 를 한 UPDATE 로 넣으면 **트리거가 state 를 pending 으로
  덮어쓴다**(s18: 사진이 바뀌면 다시 검수). 트리거가 의도대로 동작하는 것이므로
  끄지 않고, 경로를 먼저 넣은 뒤 state 만 따로 지정한다 — photo_url 을 건드리지
  않는 UPDATE 는 트리거를 타지 않는다.

  처음에 한 번에 넣었다가 7명 중 6명이 검수 대기로 남았다.
*/

-- ① 경로를 심는다 (트리거가 전부 pending 으로 만든다)
update profiles set photo_url = id::text || '/v.png'
 where company_email in ('f1@verify.local', 'f2@verify.local',
                         'm1@verify.local', 'm2@verify.local', 'm3@verify.local');

-- 하람은 사진이 없다. 사진이 없으면 검수할 것도 없다.
update profiles set photo_url = null where company_email = 'f3@verify.local';

-- ② 검수 상태만 따로 — 지우만 대기로 남긴다
update profiles set photo_state = 'approved', photo_reviewed_at = now()
 where company_email in ('f1@verify.local', 'f3@verify.local',
                         'm1@verify.local', 'm2@verify.local', 'm3@verify.local',
                         'admin@verify.local');

-- 남성3 지호 — 소개 받기 OFF. 큐레이션 대상·여성 평가 큐에서 빠져야 한다.
update profiles set paused_at = now() where company_email = 'm3@verify.local';

-- ─────────────── 티켓 ───────────────
--
-- 남성1 연우: 0장. "티켓 없이 열람 시도 → 차단" 을 담당(시나리오 E1).
-- 남성2 민수: 소개 2장 + 만남 1장. 끝까지 가는 경로를 담당.
-- 남성3 지호: 소개 1장만. 소개 받기 OFF 라 카드가 안 오는 상태를 담당.

select issue_ticket('dddd0000-0000-4000-8000-000000000002', 'verify-m2-intro-1', 5000,  'intro');
select issue_ticket('dddd0000-0000-4000-8000-000000000002', 'verify-m2-intro-2', 5000,  'intro');
select issue_ticket('dddd0000-0000-4000-8000-000000000002', 'verify-m2-meet-1',  30000, 'meeting');
select issue_ticket('dddd0000-0000-4000-8000-000000000003', 'verify-m3-intro-1', 5000,  'intro');

-- ─────────────── 호감 (여성 → 남성) ───────────────
--
-- 민수에게 3명이 호감 → 큐를 3장 이상 세워 "상위 3장 전송" 을 확인할 수 있다.
-- 연우에게 1명 → 티켓 없이 열람 시도용.
-- 지호에게 1명 → 소개 받기 OFF 인데 호감이 있는 상태(큐레이션 목록에서 배제 확인).

insert into affinities (from_id, to_id, verdict) values
  ('ffff0000-0000-4000-8000-000000000001', 'dddd0000-0000-4000-8000-000000000002', 'like'),
  ('ffff0000-0000-4000-8000-000000000002', 'dddd0000-0000-4000-8000-000000000002', 'like'),
  ('ffff0000-0000-4000-8000-000000000003', 'dddd0000-0000-4000-8000-000000000002', 'like'),
  ('ffff0000-0000-4000-8000-000000000001', 'dddd0000-0000-4000-8000-000000000001', 'like'),
  ('ffff0000-0000-4000-8000-000000000003', 'dddd0000-0000-4000-8000-000000000003', 'like');

/*
  호감 시각을 벌려 둔다 — 큐레이션 목록의 "최장 대기" 와 호감 풀의 "N일 대기" 가
  전부 0일이면 정렬이 맞는지 확인할 수 없다.
*/
update affinities set created_at = now() - interval '5 days'
 where from_id = 'ffff0000-0000-4000-8000-000000000001'
   and to_id   = 'dddd0000-0000-4000-8000-000000000002';
update affinities set created_at = now() - interval '2 days'
 where from_id = 'ffff0000-0000-4000-8000-000000000002'
   and to_id   = 'dddd0000-0000-4000-8000-000000000002';
update affinities set created_at = now() - interval '9 days'
 where from_id = 'ffff0000-0000-4000-8000-000000000001'
   and to_id   = 'dddd0000-0000-4000-8000-000000000001';

commit;

-- ─────────────── 확인 ───────────────
select '계정' as 구분, count(*)::text as 값 from profiles where company_email like '%@verify.local'
union all select '  운영자', count(*)::text from profiles where company_email like '%@verify.local' and role='admin'
union all select '  여성', count(*)::text from profiles where company_email like '%@verify.local' and gender='female'
union all select '  남성', count(*)::text from profiles where company_email like '%@verify.local' and gender='male' and role<>'admin'
union all select '사진 검수 대기', count(*)::text from profiles where company_email like '%@verify.local' and photo_state='pending'
union all select '소개 받기 OFF(남)', count(*)::text from profiles where company_email like '%@verify.local' and gender='male' and role<>'admin' and paused_at is not null
union all select '호감', count(*)::text from affinities a join profiles p on p.id=a.from_id where p.company_email like '%@verify.local'
union all select '소개 티켓(미사용)', count(*)::text from tickets t join profiles p on p.id=t.user_id where p.company_email like '%@verify.local' and t.kind='intro' and t.state='unused'
union all select '만남 티켓(미사용)', count(*)::text from tickets t join profiles p on p.id=t.user_id where p.company_email like '%@verify.local' and t.kind='meeting' and t.state='unused';
