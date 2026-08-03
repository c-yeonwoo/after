-- S9 — 알림 아웃박스
--
-- 진단(UX-9)에서 확인된 것: 앱 밖에서 사람을 부를 수단이 하나도 없었다.
-- 푸시·메일·SMS 어느 것도 없는데 티켓은 24시간 안에 답이 없으면 자동 환불된다 —
-- 여성은 요청이 왔다는 사실 자체를 모른 채 남성의 티켓이 만료됐다. 편의가
-- 아니라 공정성 문제다. 그리고 북극성(첫 만남 성사율)을 올리려면 "사용자가
-- 앱을 열었을 때"를 전제하지 않는 경로가 필요하다.
--
-- 왜 트랜잭셔널 아웃박스인가:
--   발송은 실패할 수 있고 느리고 외부에 의존한다. 상태 전이 함수 안에서 직접
--   HTTP 를 부르면 (a) 메일 서버가 느릴 때 티켓 사용이 같이 느려지고
--   (b) 발송이 실패하면 상태 전이까지 롤백되거나, 반대로 롤백된 상태 전이에
--   대한 메일이 나가 버린다. 그래서 **같은 트랜잭션에서는 행만 남기고**,
--   실제 발송은 별도 워커(Edge Function)가 이 표를 비운다.
--
-- 첫 3종은 meetings 의 상태 변화가 곧 사건이라 트리거로 잡는다.
-- 마지막(만남 다음 날 후기 요청)만 시각 기반이라 pg_cron 이 만든다.

create type notification_kind as enum (
  'meeting_requested',  -- 남성이 티켓을 썼다        → 여성에게
  'prefs_submitted',    -- 여성이 가능한 날을 보냈다  → 남성에게
  'meeting_confirmed',  -- 남성이 확정했다            → 여성에게
  'feedback_due'        -- 만남 다음 날               → 양쪽에게
);

create table notifications (
  id         uuid              primary key default gen_random_uuid(),
  user_id    uuid              not null references profiles (id) on delete cascade,
  kind       notification_kind not null,
  meeting_id uuid              references meetings (id) on delete cascade,

  -- 렌더링에 필요한 최소 정보만. 이메일 주소는 넣지 않는다 —
  -- PII 를 표 두 곳에 복제하지 않고, 보낼 때 profiles 에서 조인한다.
  payload    jsonb             not null default '{}'::jsonb,

  created_at timestamptz       not null default now(),
  sent_at    timestamptz,
  attempts   smallint          not null default 0,
  last_error text,

  -- 같은 사건으로 두 번 보내지 않는다. 트리거가 여러 번 돌아도 안전하다.
  unique (user_id, kind, meeting_id)
);

create index notifications_pending on notifications (created_at)
  where sent_at is null;

comment on table notifications is
  '알림 아웃박스. 상태 전이와 같은 트랜잭션에서 기록되고, 발송 워커가 비운다.';

-- 클라이언트는 접근할 이유가 없다. 정책을 정의하지 않는다 = 불가능.
alter table notifications enable row level security;
revoke all on notifications from anon, authenticated;
grant select, insert, update on notifications to service_role;

-- ─────────────── 트리거: meetings 상태 변화 → 아웃박스 ───────────────

/*
  당사자 조회를 한 번만 하도록 intros 를 조인해 둔다.
  SECURITY DEFINER 로 두는 이유: 트리거는 상태를 바꾼 사용자의 권한으로 도는데,
  알림은 **상대에게** 남겨야 하므로 상대 행을 참조할 수 있어야 한다.
*/
create or replace function enqueue_meeting_notification(
  p_meeting_id uuid,
  p_kind       notification_kind,
  p_to_female  boolean
) returns void language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_intro   intros;
  v_target  uuid;
  v_from    uuid;
begin
  select i.* into v_intro
    from meetings m join intros i on i.id = m.intro_id
   where m.id = p_meeting_id;
  if not found then return; end if;

  if p_to_female then
    v_target := v_intro.female_id; v_from := v_intro.male_id;
  else
    v_target := v_intro.male_id;   v_from := v_intro.female_id;
  end if;

  insert into notifications (user_id, kind, meeting_id, payload)
  values (v_target, p_kind, p_meeting_id,
          jsonb_build_object('counterpart_id', v_from))
  on conflict (user_id, kind, meeting_id) do nothing;
end $$;

revoke all on function enqueue_meeting_notification(uuid, notification_kind, boolean)
  from public, anon, authenticated;

create or replace function meetings_notify() returns trigger
  language plpgsql security definer set search_path = public, pg_temp as $$
begin
  -- 티켓 사용 = 만남 행 생성. 여성에게 "요청이 도착했다".
  if tg_op = 'INSERT' then
    perform enqueue_meeting_notification(new.id, 'meeting_requested', true);
    return new;
  end if;

  -- 여성이 가능한 날을 보냈다. 남성에게 "답이 왔다".
  if old.prefs_submitted_at is null and new.prefs_submitted_at is not null then
    perform enqueue_meeting_notification(new.id, 'prefs_submitted', false);
  end if;

  -- 남성이 확정했다. 여성에게 "대화가 열렸다".
  if old.confirmed_at is null and new.confirmed_at is not null then
    perform enqueue_meeting_notification(new.id, 'meeting_confirmed', true);
  end if;

  return new;
end $$;

create trigger meetings_notify_after
  after insert or update on meetings
  for each row execute function meetings_notify();

comment on function meetings_notify is
  '만남 상태 변화를 알림 아웃박스에 남긴다. 발송은 하지 않는다(트랜잭션 안이므로).';

-- ─────────────── 만남 다음 날 후기 요청 (시각 기반) ───────────────
--
-- 북극성의 유일한 원천이 mark_met 인데, 진단 전에는 그 입구가 대화방 안
-- 텍스트 링크 하나뿐이었다. 홈의 사후 카드(S8)에 이 메일을 더해 두 경로로 만든다.

create or replace function enqueue_feedback_due() returns integer
  language plpgsql security definer set search_path = public, pg_temp as $$
declare v_count integer;
begin
  with due as (
    select m.id as meeting_id, i.male_id, i.female_id
      from meetings m join intros i on i.id = m.intro_id
     where m.confirmed_at   is not null
       and m.cancelled_at   is null
       and m.completed_at   is null          -- 이미 답한 만남은 묻지 않는다
       and m.scheduled_at   < now() - interval '12 hours'
       and m.scheduled_at   > now() - interval '14 days'  -- 오래된 것까지 긁지 않는다
  ),
  targets as (
    select meeting_id, male_id   as user_id from due
    union all
    select meeting_id, female_id as user_id from due
  )
  insert into notifications (user_id, kind, meeting_id)
  select user_id, 'feedback_due', meeting_id from targets
  on conflict (user_id, kind, meeting_id) do nothing;

  get diagnostics v_count = row_count;
  return v_count;
end $$;

revoke all on function enqueue_feedback_due() from public, anon, authenticated;
grant execute on function enqueue_feedback_due() to service_role;

-- 12시간 지난 만남을 한 시간에 한 번 훑는다. 발송은 워커가 한다.
select cron.schedule(
  'enqueue_feedback_due_hourly',
  '7 * * * *',
  $$ select enqueue_feedback_due() $$
);
