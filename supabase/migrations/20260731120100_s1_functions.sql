-- S1 — 서버 권위 함수
--
-- 이 파일이 S1의 핵심이다. 아래 연산은 클라이언트가 직접 테이블을 쓰는 방식으로는
-- 절대 수행할 수 없고, 여기 정의된 SECURITY DEFINER 함수만이 수행한다:
--   · 티켓 차감            → use_meeting_ticket()
--   · 티켓 발급            → issue_ticket()        (service_role 전용, 결제 웹훅)
--   · 티켓 환불            → refund_ticket()       (service_role 전용, 스케줄 잡)
--   · 소개 오픈            → open_intro()          (불변식 1·2를 서버가 계산)
--   · 영구 배제            → pass_intro()          (append-only 기록)
--   · 사적 채팅 오픈 시각   → confirm_meeting()     (컬럼을 클라이언트가 못 켬)
--
-- 모든 함수는 `set search_path` 를 고정한다 — SECURITY DEFINER 에서 이걸 빼면
-- 호출자가 search_path 를 바꿔 함수 내부의 테이블 참조를 가로챌 수 있다.

-- ─────────────────────────── 헬퍼 ───────────────────────────

create or replace function my_gender() returns gender
  language sql stable security definer set search_path = public, pg_temp as $$
  select gender from profiles where id = auth.uid()
$$;

-- profiles 의 RLS 정책이 "내 hub_id"를 알아야 할 때 profiles 를 인라인 서브쿼리로
-- 다시 조회하면 같은 정책이 재귀적으로 재평가돼 "infinite recursion detected in
-- policy for relation profiles" 가 난다. SECURITY DEFINER 함수는 RLS를 우회하고
-- 값만 반환하므로 재귀가 끊긴다. my_gender() 와 같은 이유로 존재한다.
create or replace function my_hub_id() returns text
  language sql stable security definer set search_path = public, pg_temp as $$
  select hub_id from profiles where id = auth.uid()
$$;

create or replace function is_excluded(a uuid, b uuid) returns boolean
  language sql stable security definer set search_path = public, pg_temp as $$
  select exists (
    select 1 from intro_exclusions
     where user_lo = least(a, b) and user_hi = greatest(a, b)
  )
$$;

-- 만남 전날 18:00 KST. 단 확정이 이미 그 시각을 지났으면 확정 시각(= 즉시 오픈).
create or replace function private_open_at(p_scheduled timestamptz, p_confirmed timestamptz)
  returns timestamptz language sql stable as $$
  select greatest(
    (   date_trunc('day', p_scheduled at time zone 'Asia/Seoul')
      - interval '1 day'
      + interval '18 hours'
    ) at time zone 'Asia/Seoul',
    p_confirmed
  )
$$;

comment on function private_open_at is
  'P2: 사적 채팅은 만남 전날 18시(KST). 확정이 그 시각 이후면 즉시 오픈.';

-- 내가 이 만남의 당사자인가. RLS 정책에서 재사용한다.
create or replace function is_meeting_participant(p_meeting_id uuid) returns boolean
  language sql stable security definer set search_path = public, pg_temp as $$
  select exists (
    select 1 from meetings m join intros i on i.id = m.intro_id
     where m.id = p_meeting_id
       and auth.uid() in (i.male_id, i.female_id)
  )
$$;

-- 이 채널이 지금 열려 있는가. **컬럼이 아니라 파생 조건이다.**
create or replace function is_channel_open(p_meeting_id uuid, p_channel msg_channel)
  returns boolean language sql stable security definer set search_path = public, pg_temp as $$
  select case p_channel
    when 'coord'   then m.prefs_submitted_at is not null
    when 'private' then m.private_opens_at is not null and now() >= m.private_opens_at
  end
    and m.cancelled_at is null
  from meetings m where m.id = p_meeting_id
$$;

comment on function is_channel_open is
  '조율 = 선호 응답 제출 시점부터. 사적 = private_opens_at 이후. bool 컬럼을 두지 않는다.';

-- 영구 배제 기록. 쌍을 정규화해 (a,b)=(b,a) 로 만든다.
create or replace function exclude_pair(a uuid, b uuid, p_reason text) returns void
  language sql security definer set search_path = public, pg_temp as $$
  insert into intro_exclusions (user_lo, user_hi, reason)
  values (least(a, b), greatest(a, b), p_reason)
  on conflict (user_lo, user_hi) do nothing
$$;

-- ─────────────────── 소개 오픈 (불변식 1 · 2) ───────────────────

create or replace function open_intro() returns intros
  language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_uid    uuid := auth.uid();
  v_intro  intros;
  v_hub    text;
  v_female uuid;
begin
  if v_uid is null then
    raise exception 'unauthenticated' using errcode = '28000';
  end if;
  if my_gender() <> 'male' then
    raise exception 'only male users receive introductions' using errcode = '42501';
  end if;

  -- 불변식 2: 이미 오픈된 소개가 있으면 그것을 반환한다 (새로 만들지 않는다)
  select * into v_intro from intros
   where male_id = v_uid and closed_at is null;
  if found then
    return v_intro;
  end if;

  select hub_id into v_hub from profiles where id = v_uid;

  -- 불변식 1: 나에게 like 를 준 여성 ∩ 같은 권역 ∩ 배제되지 않음 ∩ 미소개
  select a.from_id into v_female
    from affinities a
    join eligible_profiles p on p.id = a.from_id
   where a.to_id    = v_uid
     and a.verdict  = 'like'
     and p.gender   = 'female'
     and p.hub_id   = v_hub
     and not is_excluded(v_uid, a.from_id)
     and not exists (
       select 1 from intros i where i.male_id = v_uid and i.female_id = a.from_id
     )
   order by a.created_at
   limit 1;

  if v_female is null then
    raise exception 'no eligible candidate' using errcode = 'P0002';
  end if;

  insert into intros (male_id, female_id) values (v_uid, v_female)
  returning * into v_intro;

  insert into events (user_id, name, props)
  values (v_uid, 'intro_opened', jsonb_build_object('intro_id', v_intro.id));

  return v_intro;
end $$;

-- ──────────── 소개 넘기기 = 영구 배제 (D3 · P1) ────────────
-- 라벨은 '이 소개 넘기기'이며, 누르기 전에 영구성을 고지해야 한다.

create or replace function pass_intro(p_intro_id uuid) returns void
  language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_uid   uuid := auth.uid();
  v_intro intros;
begin
  select * into v_intro from intros
   where id = p_intro_id and male_id = v_uid and closed_at is null
   for update;
  if not found then
    raise exception 'intro not open for caller' using errcode = '42501';
  end if;

  update intros set closed_at = now(), outcome = 'passed' where id = p_intro_id;
  perform exclude_pair(v_intro.male_id, v_intro.female_id, 'intro_passed');

  insert into events (user_id, name, props)
  values (v_uid, 'intro_passed', jsonb_build_object('intro_id', p_intro_id));
end $$;

-- ─────────── 티켓 차감 (원자적) + 만남 생성 ───────────

create or replace function use_meeting_ticket(p_intro_id uuid) returns meetings
  language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_uid     uuid := auth.uid();
  v_ticket  tickets;
  v_meeting meetings;
begin
  if v_uid is null then
    raise exception 'unauthenticated' using errcode = '28000';
  end if;

  -- 호출자가 이 소개의 남성 당사자이고, 소개가 아직 열려 있어야 한다
  perform 1 from intros
   where id = p_intro_id and male_id = v_uid and closed_at is null
   for update;
  if not found then
    raise exception 'intro not open for caller' using errcode = '42501';
  end if;

  -- 원자적 차감: unused 티켓 한 장을 잠그고 전이. 동시 요청은 SKIP LOCKED 로 갈린다.
  select * into v_ticket from tickets
   where user_id = v_uid and state = 'unused'
   order by issued_at
   limit 1
   for update skip locked;
  if not found then
    raise exception 'no unused ticket' using errcode = 'P0002';
  end if;

  update tickets
     set state = 'used', used_at = now(), intro_id = p_intro_id
   where id = v_ticket.id;

  -- 소개는 여기서 닫지 않는다. 만남이 끝날 때까지 열어 두어
  -- 불변식 2(동시 1건)가 만남 진행 중에도 유지되게 한다.
  insert into meetings (intro_id, ticket_id) values (p_intro_id, v_ticket.id)
  returning * into v_meeting;

  insert into events (user_id, name, props)
  values (v_uid, 'ticket_used',
          jsonb_build_object('intro_id', p_intro_id, 'ticket_id', v_ticket.id));

  return v_meeting;
end $$;

-- ─────── 선호 응답 제출 (여성 당사자만) → 조율 채널 오픈 ───────

create or replace function submit_meeting_prefs(p_meeting_id uuid, p_prefs jsonb)
  returns meetings language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_uid     uuid := auth.uid();
  v_female  uuid;
  v_meeting meetings;
begin
  select i.female_id into v_female
    from meetings m join intros i on i.id = m.intro_id
   where m.id = p_meeting_id
   for update of m;
  if not found then
    raise exception 'meeting not found' using errcode = '42501';
  end if;
  if v_female is distinct from v_uid then
    raise exception 'only the female participant submits preferences' using errcode = '42501';
  end if;

  update meetings
     set prefs = p_prefs, prefs_submitted_at = coalesce(prefs_submitted_at, now())
   where id = p_meeting_id
  returning * into v_meeting;

  return v_meeting;
end $$;

-- ─────── 만남 확정 → 사적 채팅 오픈 시각 계산 (P2) ───────

create or replace function confirm_meeting(
  p_meeting_id  uuid,
  p_scheduled_at timestamptz,
  p_place_name  text,
  p_place_kind  text default null
) returns meetings
  language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_meeting meetings;
  v_now     timestamptz := now();
begin
  if not is_meeting_participant(p_meeting_id) then
    raise exception 'not a participant' using errcode = '42501';
  end if;

  select * into v_meeting from meetings where id = p_meeting_id for update;
  if v_meeting.prefs_submitted_at is null then
    raise exception 'preferences not submitted yet' using errcode = '42501';
  end if;
  if v_meeting.cancelled_at is not null then
    raise exception 'meeting cancelled' using errcode = '42501';
  end if;
  if p_scheduled_at <= v_now then
    raise exception 'scheduled_at must be in the future' using errcode = '22007';
  end if;

  update meetings
     set scheduled_at     = p_scheduled_at,
         place_name       = p_place_name,
         place_kind       = p_place_kind,
         confirmed_at     = v_now,
         private_opens_at = private_open_at(p_scheduled_at, v_now)
   where id = p_meeting_id
  returning * into v_meeting;

  insert into events (user_id, name, props)
  values (auth.uid(), 'meeting_confirmed',
          jsonb_build_object('meeting_id', p_meeting_id, 'place_kind', p_place_kind));

  return v_meeting;
end $$;

-- ─────────── "만났어요" 1탭 → 북극성 입력 ───────────

create or replace function mark_met(p_meeting_id uuid) returns meetings
  language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_uid     uuid := auth.uid();
  v_meeting meetings;
begin
  if not is_meeting_participant(p_meeting_id) then
    raise exception 'not a participant' using errcode = '42501';
  end if;

  update meetings
     set completed_by = (select array_agg(distinct x)
                           from unnest(completed_by || v_uid) as t(x)),
         completed_at = coalesce(completed_at, now())
   where id = p_meeting_id and confirmed_at is not null
  returning * into v_meeting;
  if not found then
    raise exception 'meeting not confirmed' using errcode = '42501';
  end if;

  -- 만남이 끝나면 소개를 닫는다 (다음 소개가 열릴 수 있게)
  update intros set closed_at = now(), outcome = 'ticket_used'
   where id = v_meeting.intro_id and closed_at is null;

  insert into events (user_id, name, props)
  values (v_uid, 'meeting_completed',
          jsonb_build_object('meeting_id', p_meeting_id,
                             'place_kind', v_meeting.place_kind,
                             'both_confirmed', array_length(v_meeting.completed_by, 1) = 2));

  return v_meeting;
end $$;

-- ═══════════ service_role 전용 (클라이언트에 EXECUTE 없음) ═══════════

-- 결제 웹훅만 티켓을 발급한다. payment_id 로 멱등.
create or replace function issue_ticket(
  p_user_id uuid, p_payment_id text, p_price_krw integer default 30000
) returns tickets
  language plpgsql security definer set search_path = public, pg_temp as $$
declare v_ticket tickets;
begin
  insert into tickets (user_id, payment_id, price_krw)
  values (p_user_id, p_payment_id, p_price_krw)
  on conflict (payment_id) where payment_id is not null do nothing
  returning * into v_ticket;

  if v_ticket.id is null then                   -- 이미 발급됨 → 기존 행 반환 (멱등)
    select * into v_ticket from tickets where payment_id = p_payment_id;
    return v_ticket;
  end if;

  insert into events (user_id, name, props)
  values (p_user_id, 'ticket_purchased',
          jsonb_build_object('ticket_id', v_ticket.id, 'price_krw', p_price_krw));

  return v_ticket;
end $$;

create or replace function refund_ticket(p_ticket_id uuid, p_reason text) returns tickets
  language plpgsql security definer set search_path = public, pg_temp as $$
declare v_ticket tickets;
begin
  update tickets set state = 'refunded', refunded_at = now()
   where id = p_ticket_id and state <> 'refunded'
  returning * into v_ticket;
  if not found then
    raise exception 'ticket not refundable' using errcode = 'P0002';
  end if;

  insert into events (user_id, name, props)
  values (v_ticket.user_id, 'ticket_refunded',
          jsonb_build_object('ticket_id', p_ticket_id, 'reason', p_reason));

  return v_ticket;
end $$;

-- P3: 24시간 무응답 시 자동 환불. Cloudflare Cron → 이 함수 호출.
create or replace function expire_unanswered_meetings() returns integer
  language plpgsql security definer set search_path = public, pg_temp as $$
declare v_count integer := 0; r record;
begin
  for r in
    select m.id as meeting_id, m.ticket_id, m.intro_id
      from meetings m join tickets t on t.id = m.ticket_id
     where m.prefs_submitted_at is null
       and m.cancelled_at is null
       and t.used_at < now() - interval '24 hours'
       and t.state = 'used'
  loop
    update meetings set cancelled_at = now(), cancel_reason = 'no_response_24h'
     where id = r.meeting_id;
    update intros set closed_at = now(), outcome = 'expired'
     where id = r.intro_id and closed_at is null;
    perform refund_ticket(r.ticket_id, 'no_response_24h');
    v_count := v_count + 1;
  end loop;
  return v_count;
end $$;

comment on function expire_unanswered_meetings is
  'P3: 티켓 사용 후 24시간 상대 무응답 → 자동 환불. 사용자 요청을 기다리지 않는다.';

-- ─────────────────────── EXECUTE 권한 ───────────────────────

revoke execute on all functions in schema public from public, anon, authenticated;

-- 클라이언트가 호출할 수 있는 것
grant execute on function open_intro()                                       to authenticated;
grant execute on function pass_intro(uuid)                                   to authenticated;
grant execute on function use_meeting_ticket(uuid)                           to authenticated;
grant execute on function submit_meeting_prefs(uuid, jsonb)                  to authenticated;
grant execute on function confirm_meeting(uuid, timestamptz, text, text)     to authenticated;
grant execute on function mark_met(uuid)                                     to authenticated;

-- RLS 정책이 내부적으로 쓰는 술어
grant execute on function my_gender()                                        to authenticated;
grant execute on function my_hub_id()                                        to authenticated;
grant execute on function is_excluded(uuid, uuid)                            to authenticated;
grant execute on function is_meeting_participant(uuid)                       to authenticated;
grant execute on function is_channel_open(uuid, msg_channel)                 to authenticated;
grant execute on function private_open_at(timestamptz, timestamptz)          to authenticated;

-- issue_ticket / refund_ticket / expire_unanswered_meetings 는 authenticated 에
-- 부여하지 않는다. service_role 은 RLS 는 우회하지만(BYPASSRLS) 함수 EXECUTE 권한은
-- 그것과 별개다 — PostgreSQL 기본 정책상 소유자(postgres) 외 롤은 명시적으로
-- GRANT 해야 호출할 수 있다. exclude_pair 는 pass_intro() 내부에서만 쓰이므로
-- 외부 EXECUTE 권한이 아예 필요 없다 (둘 다 postgres 소유의 SECURITY DEFINER).
grant execute on function issue_ticket(uuid, text, integer)                  to service_role;
grant execute on function refund_ticket(uuid, text)                          to service_role;
grant execute on function expire_unanswered_meetings()                      to service_role;
