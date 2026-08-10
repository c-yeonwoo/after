-- S16 — 신고 · 차단 · 운영자 권한
--
-- App Store Guideline 1.2 는 사용자 생성 콘텐츠를 다루는 앱에 **콘텐츠 신고**와
-- **사용자 차단**을 요구한다. 이 앱에는 1:1 채팅과 프로필 글·사진이 있는데 둘 다
-- 없었다 — 있는 것은 노쇼 신고뿐이고 그건 "약속에 안 나왔다"를 다루는 것이라
-- Apple 이 말하는 콘텐츠 신고가 아니다.
--
-- ── 차단과 신고를 가르는 기준 ──
--
--   차단  = 내가 스스로 끊는다. 만남은 취소되고 **티켓은 환불되지 않는다.**
--           끊는 비용을 끊는 쪽이 진다. 되돌릴 수 없다.
--   신고  = 상대에게 문제가 있다고 알린다. 즉시 차단 효과가 나되, **운영자가
--           인정하면 그때 환불**한다.
--
-- 채팅이 약속 조율에 한정돼 있어 환불로 갈 일은 드물 것이다. 다만 약속 직전에
-- 파토를 내는 경우가 있고, 그 피해는 사후 환불로만 메울 수 있다.
--
-- ── 차단의 실제 효과는 기존 배제를 그대로 쓴다 ──
--
-- intro_exclusions 가 이미 "두 사람이 영영 소개되지 않는다"를 대칭으로 보장한다.
-- 새 테이블을 만들면 배제 경로가 둘이 되고, is_eligible_candidate 가 두 곳을
-- 봐야 한다. 차단은 exclude_pair() 를 부르는 것으로 족하다.

-- ─────────────────── 운영자 권한 ───────────────────

alter table profiles
  add column role text not null default 'member'
  check (role in ('member', 'admin'));

comment on column profiles.role is
  '운영자 여부. 첫 운영자는 SQL 로 심는다 — 앱에는 승격 경로가 없다.';

/*
  SECURITY DEFINER 다.

  정책 안에서 profiles 를 직접 조회하면 그 서브쿼리가 **다시 profiles 의 RLS 를
  탄다.** S8 에서 affinities 정책이 정확히 이 함정에 빠져 insert 가 통째로
  막혔었다. 소유자 권한으로 도는 함수로 감싸 그 재귀를 끊는다.
*/
create or replace function is_admin() returns boolean
  language sql stable security definer set search_path = public, pg_temp as $$
  select exists (
    select 1 from profiles
     where id = auth.uid() and role = 'admin' and account_state = 'active'
  )
$$;

comment on function is_admin() is
  '현재 사용자가 운영자인가. 정책·운영자 RPC 의 단일 관문.';

-- ─────────────────── 운영자 개입 기록 ───────────────────

/*
  강제 조작에는 사유가 남는다. note 를 nullable 로 두면 "왜 정지시켰는지" 를
  아무도 모르는 행이 반드시 생긴다 — not null 로 강제한다.
*/
create table admin_actions (
  id          uuid primary key default gen_random_uuid(),
  actor_id    uuid not null references profiles(id),
  kind        text not null check (kind in (
                'resolve_report', 'ban', 'unban', 'refund', 'cancel_meeting')),
  target_user uuid references profiles(id),
  target_ref  uuid,                        -- report_id · meeting_id 등
  note        text not null check (length(btrim(note)) > 0),
  created_at  timestamptz not null default now()
);
create index on admin_actions (created_at desc);
create index on admin_actions (target_user);

-- ─────────────────── 콘텐츠 신고 ───────────────────

create type report_kind as enum ('profile', 'message');

-- state 는 노쇼 신고가 이미 쓰는 report_state(pending·confirmed·dismissed)를
-- 그대로 쓴다. 새 타입을 만들면 같은 뜻의 어휘가 두 벌이 된다.

create table content_reports (
  id          uuid primary key default gen_random_uuid(),
  reporter_id uuid not null references profiles(id) on delete cascade,
  accused_id  uuid not null references profiles(id) on delete cascade,
  kind        report_kind not null,
  -- 메시지 신고면 어느 메시지인지. 프로필 신고면 null.
  message_id  uuid references messages(id) on delete set null,
  -- 신고 시점의 만남(있으면). 사후 환불 대상을 찾는 데 쓴다.
  meeting_id  uuid references meetings(id) on delete set null,
  detail      text not null check (length(btrim(detail)) between 1 and 1000),
  state       report_state not null default 'pending',
  resolved_at timestamptz,
  resolved_by uuid references profiles(id),
  created_at  timestamptz not null default now(),

  check (reporter_id <> accused_id),
  check (kind <> 'message' or message_id is not null)
);
create index on content_reports (state, created_at) where state = 'pending';
create index on content_reports (accused_id);

comment on table content_reports is
  '콘텐츠 신고. 노쇼 신고(no_show_reports)와 별개다 — 그쪽은 약속 불이행이고 '
  '이쪽은 프로필·메시지의 부적절함이다.';

-- ─────────────────── 차단 ───────────────────

/*
  진행 중인 만남을 끊는 공통부. 차단과 신고가 같은 효과를 내야 하므로 한 곳에
  둔다. **환불하지 않는다** — 환불은 운영자가 신고를 인정했을 때만 일어난다.

  반환값은 끊긴 만남의 id(없으면 null). 신고가 meeting_id 를 기록하는 데 쓴다.
*/
create or replace function sever_active_meeting(p_a uuid, p_b uuid, p_reason text)
  returns uuid language plpgsql security definer set search_path = public, pg_temp as $$
declare v_meeting_id uuid;
begin
  update meetings m
     set cancelled_at = now(), cancel_reason = p_reason
    from intros i
   where i.id = m.intro_id
     and m.cancelled_at is null
     and m.completed_at is null
     and ((i.male_id = p_a and i.female_id = p_b)
       or (i.male_id = p_b and i.female_id = p_a))
  returning m.id into v_meeting_id;

  return v_meeting_id;
end $$;

create or replace function block_user(p_target uuid, p_reason text default null)
  returns void language plpgsql security definer set search_path = public, pg_temp as $$
declare v_uid uuid := auth.uid();
begin
  if v_uid is null then
    raise exception 'unauthenticated' using errcode = '28000';
  end if;
  if p_target = v_uid then
    raise exception 'cannot block yourself' using errcode = '42501';
  end if;
  if not exists (select 1 from profiles where id = p_target) then
    raise exception 'user not found' using errcode = 'P0002';
  end if;

  -- 영영 소개되지 않는다. 대칭이고 되돌릴 수 없다.
  perform exclude_pair(v_uid, p_target, coalesce(p_reason, 'blocked'));
  perform sever_active_meeting(v_uid, p_target, 'blocked');

  insert into events (user_id, name, props)
  values (v_uid, 'user_blocked', jsonb_build_object('target', p_target));
end $$;

comment on function block_user(uuid, text) is
  '스스로 차단. 만남은 취소되고 티켓은 환불하지 않는다 — 끊는 비용은 끊는 쪽이 진다.';

-- ─────────────────── 신고 ───────────────────

create or replace function report_content(
  p_target     uuid,
  p_kind       report_kind,
  p_detail     text,
  p_message_id uuid default null
) returns content_reports
  language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_uid     uuid := auth.uid();
  v_meeting uuid;
  v_report  content_reports;
begin
  if v_uid is null then
    raise exception 'unauthenticated' using errcode = '28000';
  end if;
  if p_target = v_uid then
    raise exception 'cannot report yourself' using errcode = '42501';
  end if;

  -- 메시지 신고는 그 메시지가 신고 대상의 것이어야 한다. 이걸 안 보면 남의
  -- 메시지를 근거로 아무나 신고할 수 있다.
  if p_kind = 'message' then
    if p_message_id is null then
      raise exception 'message_id required' using errcode = '22023';
    end if;
    if not exists (
      select 1 from messages where id = p_message_id and sender_id = p_target
    ) then
      raise exception 'message does not belong to the accused' using errcode = '42501';
    end if;
  end if;

  -- 즉시 차단 효과. 신고했는데 계속 마주치면 신고할 이유가 없다.
  perform exclude_pair(v_uid, p_target, 'reported');
  v_meeting := sever_active_meeting(v_uid, p_target, 'reported');

  insert into content_reports (reporter_id, accused_id, kind, message_id, meeting_id, detail)
  values (v_uid, p_target, p_kind, p_message_id, v_meeting, p_detail)
  returning * into v_report;

  insert into events (user_id, name, props)
  values (v_uid, 'content_reported',
          jsonb_build_object('report_id', v_report.id, 'kind', p_kind));

  return v_report;
end $$;

comment on function report_content(uuid, report_kind, text, uuid) is
  '콘텐츠 신고. 즉시 차단 효과가 나되 환불은 운영자 인정 후에만 일어난다.';

-- ─────────────────── 운영자 처리 ───────────────────

create or replace function resolve_content_report(
  p_report_id uuid,
  p_upheld    boolean,
  p_note      text,
  p_ban       boolean default false
) returns content_reports
  language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_uid    uuid := auth.uid();
  v_report content_reports;
  v_ticket uuid;
begin
  if not is_admin() then
    raise exception 'admin only' using errcode = '42501';
  end if;
  if length(btrim(coalesce(p_note, ''))) = 0 then
    raise exception 'note required' using errcode = '22023';
  end if;

  update content_reports
     -- CASE 는 text 를 내므로 enum 으로 명시 캐스팅한다. 안 하면
     -- `column "state" is of type report_state but expression is of type text`.
     set state       = (case when p_upheld then 'confirmed' else 'dismissed' end)::report_state,
         resolved_at = now(),
         resolved_by = v_uid
   where id = p_report_id and state = 'pending'
  returning * into v_report;
  if not found then
    raise exception 'report not found or already resolved' using errcode = 'P0002';
  end if;

  if p_upheld then
    -- 신고자가 쓴 티켓을 돌려준다. 만남이 없었으면 돌려줄 것도 없다.
    if v_report.meeting_id is not null then
      select m.ticket_id into v_ticket
        from meetings m
       where m.id = v_report.meeting_id
         and exists (select 1 from tickets t
                      where t.id = m.ticket_id
                        and t.user_id = v_report.reporter_id
                        and t.state = 'used');
      if v_ticket is not null then
        perform refund_ticket(v_ticket, 'report_upheld');
      end if;
    end if;

    if p_ban then
      update profiles
         set account_state = 'banned', banned_reason = p_note
       where id = v_report.accused_id;
    end if;
  end if;

  insert into admin_actions (actor_id, kind, target_user, target_ref, note)
  values (v_uid, 'resolve_report', v_report.accused_id, v_report.id, p_note);

  return v_report;
end $$;

comment on function resolve_content_report(uuid, boolean, text, boolean) is
  '운영자 판정. 인정하면 신고자 티켓을 환불한다. 사유(note)는 필수다.';

-- ─────────────────── RLS ───────────────────

alter table admin_actions   enable row level security;
alter table content_reports enable row level security;

grant select on content_reports to authenticated;
grant select on admin_actions   to authenticated;

/*
  신고자는 자기 신고만 본다. 피신고자에게는 보이지 않는다 — 누가 신고했는지
  알면 보복이 가능해지고, 그러면 아무도 신고하지 않는다.
*/
create policy reports_select_own on content_reports
  for select to authenticated
  using (reporter_id = auth.uid() or is_admin());

create policy actions_select_admin on admin_actions
  for select to authenticated
  using (is_admin());

-- INSERT·UPDATE 정책은 두지 않는다. 쓰기는 위의 SECURITY DEFINER 함수로만
-- 일어난다 — "정책 없음 = 불가능".

-- ─────────────────── 실행 권한 ───────────────────

revoke all on function is_admin()                                    from public;
revoke all on function sever_active_meeting(uuid, uuid, text)        from public, anon, authenticated;
revoke all on function block_user(uuid, text)                        from public, anon;
revoke all on function report_content(uuid, report_kind, text, uuid) from public, anon;
revoke all on function resolve_content_report(uuid, boolean, text, boolean) from public, anon;

grant execute on function is_admin()                                 to authenticated;
grant execute on function block_user(uuid, text)                     to authenticated;
grant execute on function report_content(uuid, report_kind, text, uuid) to authenticated;
-- 운영자 함수도 authenticated 에 준다 — 판정은 함수 안의 is_admin() 이 한다.
-- 롤로 나누면 운영자에게 별도 DB 롤이 필요해지는데, 로그인이 하나뿐인 구조에서
-- 그건 유지가 안 된다.
grant execute on function resolve_content_report(uuid, boolean, text, boolean) to authenticated;

-- sever_active_meeting 은 어떤 롤에도 주지 않는다. block_user·report_content
-- 안에서만 불리며, 둘 다 postgres 소유 SECURITY DEFINER 라 별도 권한이 필요 없다.
