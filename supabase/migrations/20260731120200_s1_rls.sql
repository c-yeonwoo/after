-- S1 — RLS 정책 + 컬럼 권한
--
-- 이 파일의 목적: 진단에서 라이브로 재현된 두 우회로를 데이터 계층에서 닫는다.
--   ① /chat/$id 가 chatOpen 을 검사하지 않아 대화방이 열렸다
--      → messages 정책이 is_channel_open() 을 요구한다. 라우트가 잊어도 DB가 거부한다.
--   ② 남성이 여성 전용 /prefs 를 제출해 게이트를 켰다
--      → meetings 에 클라이언트 UPDATE 권한이 없다. submit_meeting_prefs() 가 성별을 검사한다.
--
-- 원칙: 기본 거부. 정책이 없는 연산은 불가능하다.
--       특히 tickets 와 intro_exclusions 에는 INSERT/UPDATE/DELETE 정책을 **정의하지 않는다.**

alter table profiles         enable row level security;
alter table affinities       enable row level security;
alter table intro_exclusions enable row level security;
alter table intros           enable row level security;
alter table tickets          enable row level security;
alter table meetings         enable row level security;
alter table messages         enable row level security;
alter table feedbacks        enable row level security;
alter table no_show_reports  enable row level security;
alter table events           enable row level security;

-- 테이블 기본 권한을 걷어내고 필요한 것만 다시 준다
revoke all on all tables in schema public from anon, authenticated;

-- service_role 은 BYPASSRLS 속성이 있지만, 로컬 클러스터의 기본 ACL은
-- postgres 소유 테이블에 D/x/t/m(삭제·트런케이트·트리거·유지보수)만 주고
-- SELECT/INSERT/UPDATE 는 주지 않는다. service_role 은 설계상 신뢰된
-- 백엔드 전용 롤(결제 웹훅·스케줄 잡)이므로 RLS 가 아니라 GRANT 로 전체 접근을 준다 —
-- 이 롤은 이 파일의 나머지 정책이 제한하는 대상(anon·authenticated)이 아니다.
grant select, insert, update, delete on all tables in schema public to service_role;

-- ─────────────────────────── profiles ───────────────────────────

grant select on profiles to authenticated;
grant insert on profiles to authenticated;

-- 변경 가능한 컬럼만 UPDATE 를 허용한다.
-- gender / hub_id 는 가입 후 변경 불가, email_verified_at·account_state 는 서버 전용.
grant update (
  name, birth, job, photo_url, mbti, smoking, drinking, religion,
  headline, interests, match_tags, topics, onboarding_step
) on profiles to authenticated;

-- 내 프로필은 전체 열람
create policy profiles_select_self on profiles
  for select to authenticated using (id = auth.uid());

-- 남의 프로필은 "소개가 열린 상대" 또는 "내가 평가할 대상"만
create policy profiles_select_counterpart on profiles
  for select to authenticated using (
    exists (
      select 1 from intros i
       where (i.male_id = auth.uid() and i.female_id = profiles.id)
          or (i.female_id = auth.uid() and i.male_id = profiles.id)
    )
    -- 여성은 같은 권역 남성을 평가하기 위해 열람할 수 있다 (D2)
    -- onboarding_step = 7 을 반드시 확인한다 — 아니면 이메일만 인증하고
    -- 이름·직업 등은 비어있는 반쪽짜리 프로필이 평가 대상으로 노출된다.
    -- open_intro()/eligible_profiles 는 이미 이 조건을 걸고 있었는데
    -- 이 정책엔 빠져 있었다 (S2 통합 중 발견).
    or (
      my_gender() = 'female'
      and profiles.gender = 'male'
      and profiles.email_verified_at is not null
      and profiles.account_state = 'active'
      and profiles.onboarding_step = 7
      and profiles.hub_id = my_hub_id()
      and not is_excluded(auth.uid(), profiles.id)
    )
  );

create policy profiles_insert_self on profiles
  for insert to authenticated with check (id = auth.uid());

create policy profiles_update_self on profiles
  for update to authenticated
  using (id = auth.uid()) with check (id = auth.uid());

-- 제명/탈퇴 계정은 스스로를 되살릴 수 없다 (account_state 는 컬럼 권한으로도 이미 차단)

-- ────────────────────────── affinities ──────────────────────────

grant select, insert on affinities to authenticated;

create policy affinities_select_own on affinities
  for select to authenticated using (from_id = auth.uid());

-- D2: 여성만 선행 평가한다. 대상은 같은 권역 · 인증 완료 · 미배제 남성.
create policy affinities_insert_female_only on affinities
  for insert to authenticated with check (
    from_id = auth.uid()
    and my_gender() = 'female'
    and exists (
      select 1 from profiles t
       where t.id = affinities.to_id
         and t.gender = 'male'
         and t.email_verified_at is not null
         and t.account_state = 'active'
         and t.onboarding_step = 7
         and t.hub_id = my_hub_id()
    )
    and not is_excluded(auth.uid(), affinities.to_id)
  );

-- UPDATE/DELETE 정책 없음 → 평가는 되돌릴 수 없다

-- ─────────────────── intro_exclusions (APPEND-ONLY) ───────────────────

grant select on intro_exclusions to authenticated;

-- 내가 포함된 배제만 볼 수 있다 (고지·디버깅용)
create policy exclusions_select_own on intro_exclusions
  for select to authenticated
  using (auth.uid() in (user_lo, user_hi));

-- INSERT / UPDATE / DELETE 정책을 정의하지 않는다.
-- 기록은 exclude_pair() (SECURITY DEFINER) 만 한다.

-- ──────────────────────────── intros ────────────────────────────

grant select on intros to authenticated;

create policy intros_select_participant on intros
  for select to authenticated
  using (auth.uid() in (male_id, female_id));

-- INSERT/UPDATE/DELETE 정책 없음 → open_intro() / pass_intro() / mark_met() 만 쓴다.
-- 클라이언트가 직접 intros 를 만들면 불변식 1(호감 풀 ⊆)이 무너진다.

-- ──────────────────────────── tickets ────────────────────────────
-- ★ 돈. SELECT 만 허용한다.

grant select on tickets to authenticated;

create policy tickets_select_own on tickets
  for select to authenticated using (user_id = auth.uid());

-- INSERT / UPDATE / DELETE 정책을 정의하지 않는다.
--   발급 = issue_ticket()  (결제 웹훅, service_role)
--   차감 = use_meeting_ticket()
--   환불 = refund_ticket() (스케줄 잡, service_role)
-- 이 세 가지 외에 티켓 상태를 바꿀 방법은 없다.

-- ──────────────────────────── meetings ────────────────────────────

grant select on meetings to authenticated;

create policy meetings_select_participant on meetings
  for select to authenticated using (is_meeting_participant(id));

-- INSERT/UPDATE/DELETE 정책 없음.
--   생성 = use_meeting_ticket()
--   선호 = submit_meeting_prefs()  ← 여성 당사자만 (우회로 ② 차단)
--   확정 = confirm_meeting()       ← private_opens_at 을 서버가 계산
--   완료 = mark_met()

-- ──────────────────────────── messages ────────────────────────────
-- ★ 채팅 게이트. 라우트가 검사를 잊어도 여기서 막힌다 (우회로 ① 차단).

grant select, insert on messages to authenticated;

create policy messages_select_open_channel on messages
  for select to authenticated using (
    is_meeting_participant(meeting_id)
    and is_channel_open(meeting_id, channel)
  );

create policy messages_insert_open_channel on messages
  for insert to authenticated with check (
    sender_id = auth.uid()
    and is_meeting_participant(meeting_id)
    and is_channel_open(meeting_id, channel)
  );

-- UPDATE/DELETE 정책 없음 → 메시지는 수정·삭제 불가

-- ──────────────────────────── feedbacks ────────────────────────────

grant select, insert on feedbacks to authenticated;

create policy feedbacks_select_own on feedbacks
  for select to authenticated using (author_id = auth.uid());

-- 상대에게 공개되지 않는다 (F9) → 위 정책은 author 본인만 조회
create policy feedbacks_insert_participant on feedbacks
  for insert to authenticated with check (
    author_id = auth.uid()
    and is_meeting_participant(meeting_id)
    and exists (
      select 1 from meetings m
       where m.id = feedbacks.meeting_id and m.confirmed_at is not null
    )
  );

-- ────────────────────────── no_show_reports ──────────────────────────

grant select, insert on no_show_reports to authenticated;

create policy noshow_select_involved on no_show_reports
  for select to authenticated
  using (auth.uid() in (reporter_id, accused_id));

create policy noshow_insert_participant on no_show_reports
  for insert to authenticated with check (
    reporter_id = auth.uid()
    and is_meeting_participant(meeting_id)
    and accused_id <> auth.uid()
  );

-- 판정(state 전이)은 클라이언트가 하지 않는다 → UPDATE 정책 없음.
-- P4: 신고 → 상대 확인 요청 → 무응답·노쇼 확정 시 제명. 단일 신고로 즉시 제명 금지.

-- ──────────────────────────── events ────────────────────────────

grant insert on events to authenticated;

-- 계측은 쓰기 전용. 클라이언트가 남의 이벤트를 읽지 못한다.
create policy events_insert_self on events
  for insert to authenticated with check (user_id = auth.uid());

-- SELECT 정책 없음 → 분석은 service_role 로만
