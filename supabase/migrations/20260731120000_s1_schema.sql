-- S1 — 스키마
-- 애프터(after) MVP · 기준: docs/prd-after-mvp.md
--
-- 설계 원칙: 이 스키마는 "클라이언트를 못 믿는다"를 전제로 만든다.
--   · 돈(tickets)은 행(row)이다. 카운터가 아니다 → 차감이 원자적 상태전이가 된다.
--   · 영구 배제(intro_exclusions)는 append-only다 → DELETE/UPDATE 정책을 정의하지 않는다.
--   · 사적 채팅 오픈은 컬럼이 아니라 시각 비교로 판정한다 → 클라이언트가 bool을 켤 수 없다.

create extension if not exists pgcrypto;

-- ─────────────────────────── 열거형 ───────────────────────────

create type gender           as enum ('female', 'male');
create type account_state    as enum ('active', 'banned', 'withdrawn');
create type ticket_state     as enum ('unused', 'used', 'refunded');
create type affinity_verdict as enum ('like', 'pass');
create type intro_outcome    as enum ('passed', 'ticket_used', 'expired', 'withdrawn');
create type msg_channel      as enum ('coord', 'private');
create type report_state     as enum ('pending', 'confirmed', 'dismissed');

-- ─────────────────────────── 프로필 ───────────────────────────

create table profiles (
  id                uuid primary key references auth.users (id) on delete cascade,

  -- 가입 후 변경 불가 (D: 성별) · 클라이언트에 UPDATE 권한을 주지 않는다 (rls.sql)
  gender            gender        not null,
  hub_id            text          not null check (hub_id in ('gangnam', 'pangyo', 'jongno', 'yeouido')),

  -- 직장 인증. email_verified_at 은 서버(토큰 검증)만 쓴다.
  -- isCompanyEmail 도메인 차단 목록은 보조 수단이며 인증이 아니다.
  company_email     text          not null,
  email_verified_at timestamptz,

  account_state     account_state not null default 'active',
  banned_reason     text,

  -- 인터뷰 프로필 (F2). "AI" 표기는 쓰지 않는다 (D9)
  name              text,
  birth             date,
  job               text,
  photo_url         text,
  mbti              text,
  smoking           text,
  drinking          text,
  religion          text,
  headline          text,
  interests         text[]        not null default '{}',
  match_tags        text[]        not null default '{}',
  topics            text[]        not null default '{}',

  -- 온보딩 단계별 진행 저장. 현재 코드는 완료 시점에만 저장해 중간 이탈 시 7단계를 재입력한다.
  onboarding_step   smallint      not null default 0 check (onboarding_step between 0 and 7),

  created_at        timestamptz   not null default now(),
  updated_at        timestamptz   not null default now()
);

comment on column profiles.email_verified_at is
  '서버 전용. 메일 토큰 검증만 이 값을 쓴다. 클라이언트 UPDATE 권한 없음.';
comment on column profiles.onboarding_step is
  '단계별 진행 저장용. 0=시작, 7=완료.';

-- 매칭 대상 자격: 인증 완료 + 활성
create view eligible_profiles with (security_invoker = true) as
  select * from profiles
  where email_verified_at is not null
    and account_state = 'active'
    and onboarding_step = 7;

-- ─────────────────── 호·불 평가 (여성 선행, D2) ───────────────────

create table affinities (
  id         uuid             primary key default gen_random_uuid(),
  from_id    uuid             not null references profiles (id) on delete cascade,
  to_id      uuid             not null references profiles (id) on delete cascade,
  verdict    affinity_verdict not null,
  created_at timestamptz      not null default now(),

  unique (from_id, to_id),          -- 중복 평가 방지
  check  (from_id <> to_id)
);

create index affinities_pool on affinities (to_id, verdict) where verdict = 'like';

-- ────────────── 영구 배제 (D3) · APPEND-ONLY ──────────────
-- 쌍을 정규화해 (a,b) 와 (b,a) 가 같은 행이 되게 한다.
-- 현 프로토타입은 myAnswer 를 flow 전역 단일 필드로 두어 한 번의 pass 가
-- 이후 모든 소개를 차단한다. 이 테이블이 그것을 쌍 단위로 바로잡는다.

create table intro_exclusions (
  id         uuid        primary key default gen_random_uuid(),
  user_lo    uuid        not null references profiles (id) on delete cascade,
  user_hi    uuid        not null references profiles (id) on delete cascade,
  reason     text        not null,
  created_at timestamptz not null default now(),

  unique (user_lo, user_hi),
  check  (user_lo < user_hi)
);

comment on table intro_exclusions is
  'APPEND-ONLY. UPDATE/DELETE 정책을 정의하지 않는다 — 제외 이력이 지워지면 재큐잉 규칙이 무너진다.';

-- ─────────────────────── 소개 (F4) ───────────────────────

create table intros (
  id         uuid          primary key default gen_random_uuid(),
  male_id    uuid          not null references profiles (id),
  female_id  uuid          not null references profiles (id),
  opened_at  timestamptz   not null default now(),
  closed_at  timestamptz,
  outcome    intro_outcome,

  unique (male_id, female_id),
  check  (male_id <> female_id),
  check  ((closed_at is null) = (outcome is null))
);

-- 불변식 2: 동시 오픈 소개 ≤ 1
create unique index intros_one_open_per_male
  on intros (male_id) where closed_at is null;

-- ─────────────────── 만남 티켓 (F5) · 30,000원 ───────────────────
-- 행 단위. 카운터가 아니다 → 차감은 unused→used 원자적 전이.
-- 발급은 결제 웹훅(service_role)만 한다. authenticated 에 INSERT 권한 없음.

create table tickets (
  id          uuid         primary key default gen_random_uuid(),
  user_id     uuid         not null references profiles (id),
  state       ticket_state not null default 'unused',
  price_krw   integer      not null default 30000 check (price_krw >= 0),
  payment_id  text,                        -- PG 거래 식별자. 멱등키로도 쓴다.
  intro_id    uuid         references intros (id),   -- 사용된 소개
  issued_at   timestamptz  not null default now(),
  used_at     timestamptz,
  refunded_at timestamptz,

  check (state <> 'used'     or used_at     is not null),
  check (state <> 'refunded' or refunded_at is not null),
  check (state <> 'used'     or intro_id    is not null)
);

-- 결제 멱등: 같은 payment_id 로 두 번 발급되지 않는다
create unique index tickets_payment_idempotent
  on tickets (payment_id) where payment_id is not null;

create index tickets_unused on tickets (user_id) where state = 'unused';

comment on table tickets is
  '행 단위 티켓. authenticated 는 SELECT 만 가능. 상태 전이는 SECURITY DEFINER 함수만.';

-- ─────────────────────── 만남 (F6·F8) ───────────────────────

create table meetings (
  id                 uuid        primary key default gen_random_uuid(),
  intro_id           uuid        not null unique references intros (id) on delete cascade,
  ticket_id          uuid        not null unique references tickets (id),

  -- 여성이 제출한 가능 날짜·선호 지역. 이 제출이 조율 채널을 연다.
  prefs              jsonb,
  prefs_submitted_at timestamptz,

  -- 확정. 장소·음식·예산은 제품이 제한하지 않는다 (D5 폐기).
  scheduled_at       timestamptz,
  place_name         text,
  place_kind         text,        -- 관측용. 값 집합을 강제하지 않는다.
  confirmed_at       timestamptz,

  -- 사적 채팅 오픈 시각 (P2). confirm_meeting() 이 계산해 넣는다.
  private_opens_at   timestamptz,

  -- "만났어요" 1탭. 북극성의 유일한 입력.
  completed_by       uuid[]      not null default '{}',
  completed_at       timestamptz,

  cancelled_at       timestamptz,
  cancel_reason      text,
  created_at         timestamptz not null default now(),

  check ((confirmed_at is null) = (scheduled_at is null)),
  check (confirmed_at is null or private_opens_at is not null)
);

comment on column meetings.place_kind is
  '제약이 아니라 관측용. 장소 종류 분포를 보기 위한 것이며 값을 강제하지 않는다.';
comment on column meetings.private_opens_at is
  '사적 채팅 오픈 시각. 만남 전날 18:00 KST, 단 확정이 그 시각 이후면 확정 시각. confirm_meeting() 이 설정.';

-- ─────────────── 메시지 (F7) · 게이트는 RLS 가 판정 ───────────────

create table messages (
  id         uuid        primary key default gen_random_uuid(),
  meeting_id uuid        not null references meetings (id) on delete cascade,
  sender_id  uuid        not null references profiles (id),
  channel    msg_channel not null,
  body       text        not null check (char_length(body) between 1 and 2000),
  created_at timestamptz not null default now()
);

create index messages_thread on messages (meeting_id, channel, created_at);

-- ─────────────────── 피드백 (F9) · 실제로 저장한다 ───────────────────
-- 현 코드는 toast 만 띄우고 저장하지 않아 북극성 입력이 소멸한다.

create table feedbacks (
  id         uuid        primary key default gen_random_uuid(),
  meeting_id uuid        not null references meetings (id) on delete cascade,
  author_id  uuid        not null references profiles (id),
  met        boolean     not null,              -- "만났어요"
  result     text,
  body       text,
  created_at timestamptz not null default now(),

  unique (meeting_id, author_id)
);

-- ─────────────── 노쇼 신고 (P4) · 단일 신고로 제명하지 않는다 ───────────────

create table no_show_reports (
  id           uuid         primary key default gen_random_uuid(),
  meeting_id   uuid         not null references meetings (id),
  reporter_id  uuid         not null references profiles (id),
  accused_id   uuid         not null references profiles (id),
  state        report_state not null default 'pending',
  confirm_by   timestamptz  not null,           -- 상대 확인 기한
  resolved_at  timestamptz,
  created_at   timestamptz  not null default now(),

  unique (meeting_id, reporter_id),
  check  (reporter_id <> accused_id)
);

comment on table no_show_reports is
  'P4: 신고 → 상대 확인 요청 → 무응답·노쇼 확정 시 제명. 단일 미검증 신고로 즉시 제명하지 않는다.';

-- ─────────────────── 계측 (F10) · 이벤트 8종 ───────────────────

create table events (
  id         bigint      generated always as identity primary key,
  user_id    uuid        references profiles (id) on delete set null,
  name       text        not null,
  props      jsonb       not null default '{}',
  created_at timestamptz not null default now()
);

create index events_name_time on events (name, created_at desc);
create index events_user_time on events (user_id, created_at desc);

comment on table events is
  '최소 이벤트 8종: signup_verified / profile_completed / affinity_submitted / intro_opened '
  '/ intro_passed / ticket_purchased / meeting_confirmed / meeting_completed. '
  '베타에서는 비율이 아니라 절대 개수와 사용자별 타임라인으로 읽는다.';

-- ─────────────────────── updated_at 트리거 ───────────────────────

create or replace function touch_updated_at() returns trigger
  language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end $$;

create trigger profiles_touch before update on profiles
  for each row execute function touch_updated_at();
