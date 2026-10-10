-- S51 — 퇴근 동선 위의 확정 약속 (D1-B, 2026-10-10)
--
-- 예전 조율은 왕복 두 번이었다: 남성이 티켓을 쓰면 여성이 가능한 날짜·역을 보내고,
-- 남성이 그중 하나를 고른 뒤 장소를 **빈칸에 직접** 적었다. 첫 만남에서 가장 어색한
-- 협상(언제·어디서)을 두 사람에게 그대로 맡긴 셈이다.
--
-- 이제 남성은 요청할 때 평일 저녁 후보 1~3개와 장소 하나를 같이 보낸다. 장소는 운영팀이
-- 권역마다 골라 둔 목록에서 고르고, 목록이 비어 있으면 직접 적는다(운영 초기 대비).
-- 여성은 후보 하나를 누르면 그 자리에서 약속이 확정된다. 다른 날이 편하면 기존 "가능한
-- 날짜 보내기" 로, 아니면 기존 거절로 간다 — 두 길은 그대로다.
--
-- 예약은 하지 않는다(PRD F6). 장소 목록은 "가기 좋은 곳" 추천이지 예약이 아니다.

-- ═══════════════════ 장소 목록 ═══════════════════

create table if not exists meet_places (
  id          uuid primary key default gen_random_uuid(),
  hub_id      text not null,
  name        text not null check (char_length(btrim(name)) between 1 and 60),
  station     text not null check (char_length(btrim(station)) between 1 and 20),
  kind        text not null default 'cafe'
              check (kind in ('cafe', 'restaurant', 'bar', 'etc')),
  address     text check (address is null or char_length(address) <= 120),
  map_url     text check (map_url is null or map_url ~ '^https://'),
  note        text check (note is null or char_length(note) <= 120),
  active      boolean not null default true,
  created_by  uuid references profiles (id) on delete set null,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

comment on table meet_places is
  '권역별 약속 장소 추천 목록(운영팀 관리). 예약하지 않는다. 회원은 meet_places_for_me() 로만 읽는다.';

alter table meet_places enable row level security;
-- 표면은 함수뿐이다(s32·s37 원칙). 운영 프로젝트의 새 테이블 자동 노출도 막는다.
revoke all on meet_places from public, anon, authenticated;

-- ═══════════════════ 만남 후보 ═══════════════════

alter table meetings add column if not exists proposed_slots timestamptz[];
alter table meetings add column if not exists proposed_place_id uuid references meet_places (id) on delete set null;
alter table meetings add column if not exists proposed_place_name text;
alter table meetings add column if not exists place_id uuid references meet_places (id) on delete set null;
alter table meetings add column if not exists accepted_slot smallint;

comment on column meetings.proposed_slots is '남성이 요청과 함께 보낸 평일 저녁 후보(1~3).';
comment on column meetings.accepted_slot is '여성이 고른 후보의 순번(0부터). null 이면 기존 흐름으로 확정됐다.';

-- ═══════════════════ 회원: 내 권역 장소 ═══════════════════

create or replace function meet_places_for_me()
  returns table(id uuid, name text, station text, kind text, address text,
                map_url text, note text)
  language sql stable security definer set search_path = public, pg_temp as $$
  select p.id, p.name, p.station, p.kind, p.address, p.map_url, p.note
    from meet_places p
   where p.active and p.hub_id = my_hub_id()
   order by p.station, p.name
$$;

revoke all on function meet_places_for_me() from public, anon;
grant execute on function meet_places_for_me() to authenticated;

-- ═══════════════════ 남성: 후보와 함께 요청 ═══════════════════

/*
  만남 티켓 사용과 후보 저장을 한 트랜잭션에 둔다. 따로 두면 티켓만 쓰이고 후보가 없는
  요청이 생길 수 있다 — 그러면 여성 화면은 고를 것이 없는 요청을 받는다.
*/
create or replace function request_meeting(
  p_intro_id   uuid,
  p_slots      timestamptz[],
  p_place_id   uuid,
  p_place_name text
) returns meetings
  language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_n       integer := coalesce(array_length(p_slots, 1), 0);
  v_place   meet_places;
  v_name    text;
  v_meeting meetings;
begin
  if auth.uid() is null then
    raise exception 'unauthenticated' using errcode = '28000';
  end if;
  if v_n < 1 or v_n > 3 then
    raise exception 'propose 1 to 3 slots' using errcode = '22023';
  end if;
  if (select count(distinct s) from unnest(p_slots) s) <> v_n then
    raise exception 'slots must be distinct' using errcode = '22023';
  end if;
  -- 당일 몇 시간 뒤는 상대가 답할 시간이 없다. 3주를 넘기면 카드 만료와 어긋난다.
  if exists (select 1 from unnest(p_slots) s
              where s < now() + interval '3 hours' or s > now() + interval '21 days') then
    raise exception 'slots must be between 3 hours and 21 days from now' using errcode = '22023';
  end if;

  if p_place_id is not null then
    select * into v_place from meet_places
     where id = p_place_id and active and hub_id = my_hub_id();
    if not found then
      raise exception 'place not available' using errcode = '22023';
    end if;
    v_name := v_place.name || ' · ' || v_place.station || '역';
  else
    v_name := nullif(btrim(coalesce(p_place_name, '')), '');
    if v_name is null or char_length(v_name) > 60 then
      raise exception 'place required' using errcode = '22023';
    end if;
  end if;

  v_meeting := use_meeting_ticket(p_intro_id);

  update meetings
     set proposed_slots      = (select array_agg(s order by s) from unnest(p_slots) s),
         proposed_place_id   = p_place_id,
         proposed_place_name = v_name
   where id = v_meeting.id
  returning * into v_meeting;

  return v_meeting;
end $$;

revoke all on function request_meeting(uuid, timestamptz[], uuid, text) from public, anon;
grant execute on function request_meeting(uuid, timestamptz[], uuid, text) to authenticated;

-- ═══════════════════ 여성: 후보 하나로 확정 ═══════════════════

create or replace function accept_meeting_slot(p_meeting_id uuid, p_index integer)
  returns meetings
  language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_uid     uuid := auth.uid();
  v_meeting meetings;
  v_slot    timestamptz;
  v_kind    text;
  v_now     timestamptz := now();
begin
  if v_uid is null then
    raise exception 'unauthenticated' using errcode = '28000';
  end if;

  select m.* into v_meeting
    from meetings m join intros i on i.id = m.intro_id
   where m.id = p_meeting_id and i.female_id = v_uid
   for update of m;
  if not found then
    raise exception 'meeting not found for caller' using errcode = '42501';
  end if;
  if v_meeting.cancelled_at is not null or v_meeting.confirmed_at is not null then
    raise exception 'meeting not open for answers' using errcode = '42501';
  end if;
  if v_meeting.proposed_slots is null
     or p_index < 0 or p_index >= coalesce(array_length(v_meeting.proposed_slots, 1), 0) then
    raise exception 'no such slot' using errcode = '22023';
  end if;

  v_slot := v_meeting.proposed_slots[p_index + 1];
  if v_slot <= v_now then
    raise exception 'slot already passed' using errcode = '22007';
  end if;

  select kind into v_kind from meet_places where id = v_meeting.proposed_place_id;

  update meetings
     set accepted_slot      = p_index,
         prefs_submitted_at = coalesce(prefs_submitted_at, v_now),
         scheduled_at       = v_slot,
         place_name         = proposed_place_name,
         place_id           = proposed_place_id,
         place_kind         = v_kind,
         confirmed_at       = v_now,
         private_opens_at   = private_open_at(v_slot, v_now)
   where id = p_meeting_id
  returning * into v_meeting;

  insert into events (user_id, name, props)
  values (v_uid, 'meeting_confirmed',
          jsonb_build_object('meeting_id', p_meeting_id, 'via', 'slot',
                             'slot_index', p_index, 'place_kind', v_kind));
  return v_meeting;
end $$;

revoke all on function accept_meeting_slot(uuid, integer) from public, anon;
grant execute on function accept_meeting_slot(uuid, integer) to authenticated;

-- ═══════════════════ 알림 ═══════════════════

/*
  후보를 고르면 "날짜가 왔다"(prefs_submitted)와 "확정됐다"가 한 번에 일어난다.
  남성에게는 확정만 알린다. 그리고 이번엔 여성이 확정했으니 확정 알림은 **남성에게** 간다.
*/
create or replace function meetings_notify() returns trigger
  language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if tg_op = 'INSERT' then
    perform enqueue_meeting_notification(new.id, 'meeting_requested', true);
    return new;
  end if;

  if old.prefs_submitted_at is null and new.prefs_submitted_at is not null
     and new.confirmed_at is null then
    perform enqueue_meeting_notification(new.id, 'prefs_submitted', false);
  end if;

  if old.confirmed_at is null and new.confirmed_at is not null then
    perform enqueue_meeting_notification(new.id, 'meeting_confirmed',
                                         new.accepted_slot is null);
  end if;

  if old.cancelled_at is null and new.cancelled_at is not null
     and new.confirmed_at is null
     and new.cancel_reason in ('declined', 'no_response_24h') then
    perform enqueue_meeting_notification(new.id, 'meeting_released', false);
  end if;

  return new;
end $$;

-- ═══════════════════ 운영자: 장소 관리 ═══════════════════

alter table admin_actions drop constraint if exists admin_actions_kind_check;
alter table admin_actions add constraint admin_actions_kind_check check (kind = any (array[
  'resolve_report', 'ban', 'unban', 'refund', 'cancel_meeting', 'review_photo', 'set_queue',
  'resolve_no_show', 'set_payments', 'fulfill_order', 'reset_photo', 'retry_notification',
  'set_queue_reason', 'upsert_place'
]));

create or replace function admin_meet_places()
  returns setof meet_places
  language plpgsql stable security definer set search_path = public, pg_temp as $$
begin
  if not is_admin() then
    raise exception 'admin only' using errcode = '42501';
  end if;
  return query select * from meet_places order by hub_id, active desc, station, name;
end $$;

revoke all on function admin_meet_places() from public, anon;
grant execute on function admin_meet_places() to authenticated;

create or replace function admin_upsert_meet_place(
  p_id uuid, p_hub_id text, p_name text, p_station text, p_kind text,
  p_address text, p_map_url text, p_note text, p_active boolean
) returns meet_places
  language plpgsql security definer set search_path = public, pg_temp as $$
declare v_place meet_places;
begin
  if not is_admin() then
    raise exception 'admin only' using errcode = '42501';
  end if;

  if p_id is null then
    insert into meet_places (hub_id, name, station, kind, address, map_url, note, active, created_by)
    values (p_hub_id, btrim(p_name), btrim(p_station), coalesce(p_kind, 'cafe'),
            nullif(btrim(coalesce(p_address, '')), ''), nullif(btrim(coalesce(p_map_url, '')), ''),
            nullif(btrim(coalesce(p_note, '')), ''), coalesce(p_active, true), auth.uid())
    returning * into v_place;
  else
    update meet_places
       set hub_id = p_hub_id, name = btrim(p_name), station = btrim(p_station),
           kind = coalesce(p_kind, kind),
           address = nullif(btrim(coalesce(p_address, '')), ''),
           map_url = nullif(btrim(coalesce(p_map_url, '')), ''),
           note = nullif(btrim(coalesce(p_note, '')), ''),
           active = coalesce(p_active, active), updated_at = now()
     where id = p_id
    returning * into v_place;
    if not found then
      raise exception 'place not found' using errcode = 'P0002';
    end if;
  end if;

  insert into admin_actions (actor_id, kind, target_user, target_ref, note)
  values (auth.uid(), 'upsert_place', null, v_place.id,
          format('%s · %s역 · %s', v_place.name, v_place.station,
                 case when v_place.active then '사용' else '숨김' end));
  return v_place;
end $$;

revoke all on function admin_upsert_meet_place(uuid, text, text, text, text, text, text, text, boolean)
  from public, anon;
grant execute on function admin_upsert_meet_place(uuid, text, text, text, text, text, text, text, boolean)
  to authenticated;
