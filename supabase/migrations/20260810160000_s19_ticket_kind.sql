-- S19 — 티켓에 종류를 붙인다 (소개 티켓 / 만남 티켓)
--
-- docs/intro-flow-v2.md §3-1. 이 마이그레이션만으로는 **사용자에게 아무 변화가
-- 없다** — 소개 티켓을 파는 곳도, 쓰는 곳도 아직 없다. 목적은 다음 단계(소개 큐
-- + 유료 열람)의 지뢰를 미리 제거하는 것이다.
--
-- 그 지뢰가 무엇인지 분명히 적어 둔다. use_meeting_ticket() 은 지금
--
--     select * from tickets where user_id = v_uid and state = 'unused'
--
-- 로 **아무 미사용 티켓이나** 집는다. 여기에 5,000원 소개 티켓이 섞이면 그것이
-- 30,000원 만남 티켓으로 소비된다. 문서가 "가장 위험한 지점" 이라 부른 곳이다.

create type ticket_kind as enum ('intro', 'meeting');

-- ─────────────────── tickets ───────────────────

alter table tickets add column kind ticket_kind not null default 'meeting';

/*
  기존 행은 전부 만남 티켓이다 — default 로 backfill 된다. 그 뒤 default 를
  지워서 앞으로는 발급하는 쪽이 종류를 반드시 말하게 한다. default 를 남기면
  소개 티켓을 만들 때 인자를 빼먹어도 조용히 만남 티켓이 된다.
*/
alter table tickets alter column kind drop default;

/*
  종류별 금액 범위. 정확한 단가로 묶을 수 없다 — 번들 할인 때문에 장당 금액이
  갈린다(만남 30,000 / 28,333, 소개 5,000 / 4,400). 자리수가 어긋나는 사고만
  잡는 넓은 띠로 둔다. 종류 오용 자체는 아래 kind 필터가 막는다.

  0원은 따로 허용한다 — 노쇼가 인정되면 피해자에게 티켓을 재발급하는데
  (apply_no_show_confirmed) 실제 결제가 아니라 price_krw = 0 이다. 띠만 걸면
  그 보상 경로가 조용히 막힌다.
*/
alter table tickets add constraint tickets_price_band check (
  price_krw = 0
  or (kind = 'intro'   and price_krw between 1000 and 10000)
  or (kind = 'meeting' and price_krw between 10000 and 100000)
);

create index on tickets (user_id, kind) where state = 'unused';

comment on column tickets.kind is
  '소개 열람용(intro) 인지 만남 주선용(meeting) 인지. 섞이면 5천원이 3만원으로 쓰인다.';

-- ─────────────────── 가격 ───────────────────

/*
  종류별 번들.

  구 버전(1인자 amount · 무인자 bundles)은 **지운다.** 남겨 두면 두 가지가
  깨진다.

    ① ticket_bundles() 호출이 모호해진다. 무인자 함수와 기본값을 가진 1인자
       함수가 둘 다 후보라 Postgres 가 "function is not unique" 로 거절한다 —
       상점 화면(api.ts 의 rpc("ticket_bundles"))이 그대로 깨진다.
    ② 만남 가격이 두 곳에 적힌다. 한쪽만 고치면 사용자가 본 금액과 서버가
       검증하는 금액이 갈리는데, s14 가 바로 그 드리프트를 없애려고 만든
       구조다.

  ticket_orders 의 CHECK 가 1인자 함수를 참조하므로 **제약을 먼저 떼야** 함수를
  지울 수 있다. 새 제약은 아래 주문 절에서 2인자 버전으로 다시 붙인다.
*/
alter table ticket_orders drop constraint if exists ticket_orders_amount_matches;

drop function if exists ticket_bundles();
drop function if exists ticket_bundle_amount(smallint);

create or replace function ticket_bundle_amount(p_quantity smallint, p_kind ticket_kind)
  returns integer language sql immutable as $$
  select case p_kind
           when 'meeting' then case p_quantity
                                 when 1 then 30000
                                 when 3 then 85000   -- 장당 28,333원 (6% 할인)
                               end
           when 'intro'   then case p_quantity
                                 when 1 then 5000
                                 when 5 then 22000   -- 장당 4,400원 (12% 할인)
                               end
         end
$$;

comment on function ticket_bundle_amount(smallint, ticket_kind) is
  '종류별 번들 금액. 10장 번들은 없다 — 장당 값이 5장과 같아 살 이유가 없었다.';

create or replace function ticket_bundles(p_kind ticket_kind default 'meeting')
  returns table (quantity smallint, amount integer)
  language sql stable as $$
  select q, ticket_bundle_amount(q, p_kind)
    from (values (1::smallint), (3::smallint), (5::smallint)) as t(q)
   where ticket_bundle_amount(q, p_kind) is not null
$$;

-- 인자 없는 기존 호출(상점 화면)은 만남 번들을 그대로 받는다.
revoke all on function ticket_bundles(ticket_kind) from public, anon;
grant execute on function ticket_bundles(ticket_kind) to authenticated;

-- ─────────────────── 주문 ───────────────────

alter table ticket_orders add column kind ticket_kind not null default 'meeting';
alter table ticket_orders alter column kind drop default;

/*
  금액 검증을 종류까지 보게 바꾼다. **not valid 로 붙인다** — s14 가 남긴 규칙
  그대로다: "CHECK 는 기존 행을 재검사하지 않고, 재검사시켜서도 안 된다(그
  금액으로 결제가 이미 진행됐을 수 있다)." 80,000원 시절 주문이 남아 있을 수
  있으므로 새 주문부터만 검사한다.
*/
alter table ticket_orders drop constraint if exists ticket_orders_amount_matches;
alter table ticket_orders add constraint ticket_orders_amount_matches
  check (amount = ticket_bundle_amount(quantity, kind)) not valid;

-- 구 시그니처를 지운다 — 위 issue_ticket 과 같은 이유(오버로드 모호성).
drop function if exists create_ticket_order(smallint);

create or replace function create_ticket_order(
  p_quantity smallint default 1,
  p_kind     ticket_kind default 'meeting'
) returns ticket_orders
  language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_uid    uuid := auth.uid();
  v_amount integer;
  v_order  ticket_orders;
begin
  if v_uid is null then
    raise exception 'unauthenticated' using errcode = '28000';
  end if;

  v_amount := ticket_bundle_amount(p_quantity, p_kind);
  if v_amount is null then
    raise exception 'unsupported quantity % for %', p_quantity, p_kind using errcode = '22023';
  end if;

  insert into ticket_orders (order_id, user_id, amount, quantity, kind)
  values ('ticket_' || replace(gen_random_uuid()::text, '-', ''),
          v_uid, v_amount, p_quantity, p_kind)
  returning * into v_order;

  return v_order;
end $$;

revoke all on function create_ticket_order(smallint, ticket_kind) from public, anon;
grant execute on function create_ticket_order(smallint, ticket_kind) to authenticated;

-- ─────────────────── 발급 ───────────────────

/*
  인자를 추가하면 **새 함수가 생긴다** — create or replace 가 아니다. 구 버전을
  남기면 기존 3인자 호출(pgTAP·Edge Function)이 "function is not unique" 로
  거절된다. 기본값 덕분에 새 함수가 같은 호출을 그대로 받으므로 구 버전을 지운다.

  실제로 이 함정에 세 번 걸렸다(ticket_bundles · issue_ticket · create_ticket_order).
  인자를 늘릴 때는 항상 구 시그니처를 함께 지운다.
*/
drop function if exists issue_ticket(uuid, text, integer);

create or replace function issue_ticket(
  p_user_id uuid, p_payment_id text, p_price_krw integer default 30000,
  p_kind ticket_kind default 'meeting'
) returns tickets
  language plpgsql security definer set search_path = public, pg_temp as $$
declare v_ticket tickets;
begin
  insert into tickets (user_id, payment_id, price_krw, kind)
  values (p_user_id, p_payment_id, p_price_krw, p_kind)
  on conflict (payment_id) where payment_id is not null do nothing
  returning * into v_ticket;

  if v_ticket.id is null then                   -- 이미 발급됨 → 기존 행 반환 (멱등)
    select * into v_ticket from tickets where payment_id = p_payment_id;
    return v_ticket;
  end if;

  insert into events (user_id, name, props)
  values (p_user_id, 'ticket_purchased',
          jsonb_build_object('ticket_id', v_ticket.id, 'price_krw', p_price_krw,
                             'kind', p_kind));

  return v_ticket;
end $$;

grant execute on function issue_ticket(uuid, text, integer, ticket_kind) to service_role;

-- 주문의 종류를 발급까지 그대로 넘긴다.
create or replace function fulfill_ticket_order(p_order_id text)
  returns integer
  language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_order ticket_orders;
  v_i     integer;
begin
  select * into v_order from ticket_orders where order_id = p_order_id;
  if not found then
    raise exception 'order not found' using errcode = 'P0002';
  end if;

  for v_i in 1..v_order.quantity loop
    perform issue_ticket(
      v_order.user_id,
      p_order_id || '#' || v_i,
      (v_order.amount / v_order.quantity)::integer,
      v_order.kind
    );
  end loop;

  update ticket_orders
     set state = 'confirmed', confirmed_at = coalesce(confirmed_at, now())
   where order_id = p_order_id;

  return v_order.quantity;
end $$;

-- ─────────────────── 소비 (지뢰 제거) ───────────────────

/*
  **이 함수가 이 마이그레이션의 이유다.** kind = 'meeting' 을 넣는다.
  없으면 소개 티켓 한 장이 만남 티켓으로 소비된다.
*/
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

  perform 1 from intros
   where id = p_intro_id and male_id = v_uid and closed_at is null
   for update;
  if not found then
    raise exception 'intro not open for caller' using errcode = '42501';
  end if;

  -- 원자적 차감: unused **만남** 티켓 한 장을 잠그고 전이.
  select * into v_ticket from tickets
   where user_id = v_uid and state = 'unused' and kind = 'meeting'
   order by issued_at
   limit 1
   for update skip locked;
  if not found then
    raise exception 'no unused ticket' using errcode = 'P0002';
  end if;

  update tickets
     set state = 'used', used_at = now(), intro_id = p_intro_id
   where id = v_ticket.id;

  insert into meetings (intro_id, ticket_id) values (p_intro_id, v_ticket.id)
  returning * into v_meeting;

  insert into events (user_id, name, props)
  values (v_uid, 'ticket_used',
          jsonb_build_object('intro_id', p_intro_id, 'ticket_id', v_ticket.id,
                             'kind', 'meeting'));

  return v_meeting;
end $$;

-- ─────────────────── 환불 ───────────────────

/*
  소개 티켓은 **소멸**이다(문서 §1: 패스해도 환불 없음). 만남 티켓 전용으로
  못박아 둔다 — 나중에 큐레이션 쪽에서 실수로 부르면 조용히 5,000원을 돌려주는
  게 아니라 터지는 편이 낫다.
*/
create or replace function refund_ticket(p_ticket_id uuid, p_reason text) returns tickets
  language plpgsql security definer set search_path = public, pg_temp as $$
declare v_ticket tickets;
begin
  select * into v_ticket from tickets where id = p_ticket_id;
  if not found then
    raise exception 'ticket not refundable' using errcode = 'P0002';
  end if;
  if v_ticket.kind <> 'meeting' then
    raise exception 'intro tickets are non-refundable' using errcode = '42501';
  end if;

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

-- 자동 만료도 만남 티켓만 본다. meetings.ticket_id 는 구조상 만남 티켓이지만,
-- 조건을 적어 두면 나중에 이 조인이 넓어져도 소개 티켓이 섞이지 않는다.
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
       and t.kind  = 'meeting'
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

-- ─────────────────── 보상 발급 ───────────────────

/*
  노쇼가 인정되면 피해자에게 티켓을 재발급한다. default 를 지웠으므로 여기도
  종류를 말해야 한다 — 안 고치면 not-null 위반으로 **노쇼 보상 자체가 막힌다**
  (pgTAP s4 가 이걸 잡아냈다).

  재발급되는 것은 잃어버린 **만남** 기회다. 소개 티켓이 아니다.
*/
create or replace function apply_no_show_confirmed(p_report_id uuid) returns no_show_reports
  language plpgsql security definer set search_path = public, pg_temp as $$
declare v_report no_show_reports;
begin
  update no_show_reports set state = 'confirmed', resolved_at = now()
   where id = p_report_id and state = 'pending'
  returning * into v_report;
  if not found then
    raise exception 'report not pending' using errcode = 'P0002';
  end if;

  update profiles set account_state = 'banned' where id = v_report.accused_id;

  -- 피해자(신고자) 티켓 재발급. 실제 결제가 아니므로 price_krw = 0.
  insert into tickets (user_id, payment_id, price_krw, state, kind)
  values (v_report.reporter_id, 'noshow_reissue:' || v_report.id, 0, 'unused', 'meeting');

  insert into events (user_id, name, props)
  values (v_report.reporter_id, 'no_show_confirmed',
          jsonb_build_object('report_id', p_report_id, 'accused_id', v_report.accused_id));

  return v_report;
end $$;

-- ─────────────────── 운영 화면 ───────────────────

-- 회원 상세의 티켓 목록이 종류를 실제 값으로 내게 한다(s17 은 'meeting' 을
-- 문자열로 박아 뒀다 — 그때는 종류가 하나뿐이었다).
create or replace function admin_member_detail(p_user uuid) returns jsonb
  language plpgsql stable security definer set search_path = public, pg_temp as $$
declare v jsonb;
begin
  if not is_admin() then
    raise exception 'admin only' using errcode = '42501';
  end if;

  select jsonb_build_object(
    'profile', to_jsonb(p),

    'tickets', coalesce((
      select jsonb_agg(jsonb_build_object(
               'id', t.id, 'kind', t.kind, 'state', t.state,
               'price_krw', t.price_krw, 'issued_at', t.issued_at,
               'used_at', t.used_at, 'refunded_at', t.refunded_at)
             order by t.issued_at desc)
        from tickets t where t.user_id = p.id), '[]'::jsonb),

    'meetings', coalesce((
      select jsonb_agg(jsonb_build_object(
               'id', m.id,
               'counterpart', case when i.male_id = p.id then f.name else mp.name end,
               'counterpart_id', case when i.male_id = p.id then i.female_id else i.male_id end,
               'role', case when i.male_id = p.id then 'male' else 'female' end,
               'scheduled_at', m.scheduled_at, 'place_name', m.place_name,
               'confirmed_at', m.confirmed_at, 'completed_at', m.completed_at,
               'cancelled_at', m.cancelled_at, 'cancel_reason', m.cancel_reason,
               'created_at', m.created_at)
             order by m.created_at desc)
        from meetings m
        join intros i  on i.id = m.intro_id
        join profiles mp on mp.id = i.male_id
        join profiles f  on f.id  = i.female_id
       where i.male_id = p.id or i.female_id = p.id), '[]'::jsonb),

    'reports_against', coalesce((
      select jsonb_agg(jsonb_build_object(
               'id', r.id, 'kind', r.kind, 'state', r.state,
               'detail', r.detail, 'created_at', r.created_at,
               'reporter_name', rp.name)
             order by r.created_at desc)
        from content_reports r join profiles rp on rp.id = r.reporter_id
       where r.accused_id = p.id), '[]'::jsonb),

    'reports_filed', coalesce((
      select jsonb_agg(jsonb_build_object(
               'id', r.id, 'kind', r.kind, 'state', r.state,
               'detail', r.detail, 'created_at', r.created_at,
               'accused_name', ap.name)
             order by r.created_at desc)
        from content_reports r join profiles ap on ap.id = r.accused_id
       where r.reporter_id = p.id), '[]'::jsonb),

    'admin_actions', coalesce((
      select jsonb_agg(jsonb_build_object(
               'kind', a.kind, 'note', a.note, 'created_at', a.created_at,
               'actor_name', actor.name)
             order by a.created_at desc)
        from admin_actions a join profiles actor on actor.id = a.actor_id
       where a.target_user = p.id), '[]'::jsonb)
  ) into v
  from profiles p where p.id = p_user;

  if v is null then
    raise exception 'member not found' using errcode = 'P0002';
  end if;
  return v;
end $$;
