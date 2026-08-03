-- S8 — 프로필 노출 축소 · 열람권 회수 · 크기 제한 · 인덱스
--
-- 진단(2026-08-03)에서 확인된 것:
--   SEC-1 여성이 권역 내 남성 **전원**의 company_email 과 정확한 birth 를 읽었다.
--         RLS 는 "어느 행" 만 판정한다. 컬럼은 테이블 GRANT 가 정하는데
--         `grant select on profiles` 라 열람 자격이 생기는 순간 전 컬럼이 열렸다.
--         회사 메일은 이름과 직장을 동시에 드러내는 사실상의 신원이고,
--         이 제품은 좁은 권역에 한정돼 있어 특정이 특히 쉽다.
--   SEC-2 소개를 넘겨 **영구 배제된 뒤에도** 상대 프로필이 계속 읽혔다.
--         정책의 exists 절에 closed_at 조건이 없었다.
--   SEC-3 profiles 의 텍스트 컬럼에 길이 제한이 없었다(messages 에는 2000자 CHECK 가 있다).
--         본인 행에 5MB photo_url 을 쓰는 데 성공했다.
--   PERF-2 profiles 인덱스가 PK 하나뿐이라 후보 조회가 Seq Scan 이었다.
--
-- 접근: 노출용 컬럼만 담은 뷰를 만들고, 테이블 자체는 본인 행으로 잠근다.
--       컬럼 단위 GRANT 로는 안 된다 — GRANT 는 롤 단위라 "내 행은 전부, 남의 행은 일부"를
--       표현할 수 없기 때문이다.

-- ─────────────── SEC-1 · SEC-2 — 노출용 뷰 ───────────────

-- 정책 안의 서브쿼리도 대상 테이블의 RLS 를 탄다. profiles_select_counterpart 를
-- 지우면 이 정책의 `exists (select 1 from profiles t ...)` 가 0행이 되어
-- 여성의 호감 평가가 전부 거부된다. 판정을 SECURITY DEFINER 로 뽑아낸다.
create or replace function is_eligible_candidate(p_id uuid) returns boolean
  language sql stable security definer set search_path = public, pg_temp as $$
  select exists (
    select 1 from profiles t
     where t.id                = p_id
       and t.gender            = 'male'
       and t.email_verified_at is not null
       and t.account_state     = 'active'
       and t.onboarding_step   = 7
       and t.terms_agreed_at   is not null
       and t.privacy_agreed_at is not null
       and t.hub_id            = my_hub_id()
  )
$$;

comment on function is_eligible_candidate is
  '여성이 평가할 수 있는 남성인가. 정책 서브쿼리가 profiles RLS 에 걸리는 것을 피한다.';

revoke all on function is_eligible_candidate(uuid) from public;
grant execute on function is_eligible_candidate(uuid) to authenticated;

drop policy affinities_insert_female_only on affinities;
create policy affinities_insert_female_only on affinities
  for insert to authenticated with check (
    from_id = auth.uid()
    and my_gender() = 'female'
    and is_eligible_candidate(affinities.to_id)
    and not is_excluded(auth.uid(), affinities.to_id)
  );

-- 테이블은 본인 행만. 남의 행은 아래 뷰로만 나간다.
drop policy profiles_select_counterpart on profiles;

/*
  public_profiles — 상대에게 보여도 되는 컬럼만.

  security_invoker 를 켜지 **않는다**(기본값 false). 뷰 소유자(postgres) 권한으로
  실행되어 profiles 의 RLS 를 우회하고, 가시성 판정은 이 뷰의 where 절이 단독으로
  책임진다. 그래서 노출 규칙이 두 곳(정책 + 뷰)으로 갈라지지 않는다.

  빠진 컬럼이 이 마이그레이션의 요점이다:
    company_email · email_verified_at · account_state · banned_reason ·
    onboarding_step · terms_agreed_at · privacy_agreed_at · gender ·
    match_note · topic_note · created_at · updated_at
  birth 는 age 로 바꿔 내보낸다 — 화면은 나이만 쓴다(ageFrom(birth) 뿐이었다).
*/
create view public_profiles as
select
  p.id,
  p.hub_id,
  p.name,
  case when p.birth is null then null
       else extract(year from age(p.birth))::int end as age,
  p.job,
  p.photo_url,
  p.mbti,
  p.smoking,
  p.drinking,
  p.religion,
  p.headline,
  p.intro,
  p.interests,
  p.match_tags,
  p.topics,
  p.details
from profiles p
where
  -- 본인
  p.id = auth.uid()

  -- 진행 중인 소개의 상대. closed_at 조건이 SEC-2 의 수정이다 —
  -- 넘긴(영구 배제) 상대는 여기서 즉시 빠진다.
  or exists (
    select 1 from intros i
     where i.closed_at is null
       and (   (i.male_id   = auth.uid() and i.female_id = p.id)
            or (i.female_id = auth.uid() and i.male_id   = p.id))
  )

  -- 티켓을 쓴 상대. mark_met() 이 소개를 닫으므로 위 절만으로는 만남 직후
  -- 대화방·피드백 화면에서 상대 이름이 사라진다.
  or exists (
    select 1 from meetings m join intros i on i.id = m.intro_id
     where m.cancelled_at is null
       and (   (i.male_id   = auth.uid() and i.female_id = p.id)
            or (i.female_id = auth.uid() and i.male_id   = p.id))
  )

  -- 여성이 평가할 같은 권역 남성 (D2)
  or (my_gender() = 'female' and p.gender = 'male' and is_eligible_candidate(p.id));

comment on view public_profiles is
  '상대에게 노출해도 되는 컬럼만. company_email·birth 는 절대 나가지 않는다.';

grant select on public_profiles to authenticated;

-- ─────────────── SEC-3 — 크기 제한 ───────────────
-- messages.body 에는 2000자 CHECK 가 있었는데 profiles 에는 아무것도 없었다.
-- 후보 조회가 권역 남성 전원을 읽으므로, 한 명이 남긴 거대한 값이
-- 다른 모두의 로딩 비용이 된다.

alter table profiles
  add constraint profiles_text_len check (
        char_length(coalesce(name,       '')) <=   40
    and char_length(coalesce(job,        '')) <=   60
    and char_length(coalesce(mbti,       '')) <=    8
    and char_length(coalesce(smoking,    '')) <=   20
    and char_length(coalesce(drinking,   '')) <=   20
    and char_length(coalesce(religion,   '')) <=   20
    and char_length(coalesce(headline,   '')) <=  120
    and char_length(coalesce(intro,      '')) <= 1500
    and char_length(coalesce(match_note, '')) <=  300
    and char_length(coalesce(topic_note, '')) <=  300
  );

-- photo_url 은 별도로 둔다. 지금은 base64 data URL 이 그대로 들어오고 있어
-- (UX-3) Storage 로 옮기기 전까지는 완전히 좁힐 수 없다. 1MB 로 상한만 건다 —
-- 5MB 사진이 권역 인원수만큼 곱해지는 것을 막는 것이 목적이다.
alter table profiles
  add constraint profiles_photo_len check (char_length(coalesce(photo_url, '')) <= 1048576);

-- 배열도 무한정 늘릴 수 있었다.
alter table profiles
  add constraint profiles_array_len check (
        coalesce(array_length(interests,  1), 0) <= 12
    and coalesce(array_length(match_tags, 1), 0) <= 12
    and coalesce(array_length(topics,     1), 0) <= 12
  );

-- ─────────────── PERF-2 — 인덱스 ───────────────
-- 후보 조회의 실제 필터 순서에 맞춘다. 지금은 행이 몇 개뿐이라 티가 안 나지만,
-- 데이터가 쌓인 뒤에 거는 인덱스는 잠금을 동반한다.
create index profiles_candidate_pool on profiles (hub_id, gender, account_state, onboarding_step)
  where email_verified_at is not null;

-- myPendingNoShowReport() 의 조회 경로.
create index no_show_reports_pending on no_show_reports (accused_id, created_at)
  where state = 'pending';
