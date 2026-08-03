-- S13 — 티켓 묶음 · 알림 수신 설정
--
-- 마이페이지를 허브로 나누면서 나온 두 가지:
--   · 티켓 상점 — 1장/3장. 지금까지 create_ticket_order() 는 항상 1장 30,000원이었다.
--   · 알림 수신 설정 — S9 로 메일을 보내기 시작했는데 끌 수단이 없었다.

-- ─────────────── 가격: 한 곳에서만 정한다 ───────────────
--
-- S5 는 금액을 테이블 CHECK 로도 강제했다("방어를 이중으로"). 그 기조는 유지하되
-- 수량이 늘었으니 숫자를 함수 하나로 모은다 — CHECK 가 이 함수를 참조하므로
-- 가격을 바꿀 곳이 한 군데가 된다. immutable 이어야 CHECK 에서 쓸 수 있다.

create or replace function ticket_bundle_amount(p_quantity smallint)
  returns integer language sql immutable as $$
  select case p_quantity
           when 1 then 30000
           when 3 then 80000   -- 장당 26,667원 (11% 할인)
         end
$$;

comment on function ticket_bundle_amount is
  '수량별 결제 금액. 가격을 바꾸는 유일한 지점 — ticket_orders CHECK 가 이걸 참조한다.';

alter table ticket_orders
  add column quantity smallint not null default 1;

-- 예전 CHECK(amount = 30000) 은 1장만 전제한다.
alter table ticket_orders drop constraint ticket_orders_amount_check;
alter table ticket_orders
  add constraint ticket_orders_amount_matches
  check (amount = ticket_bundle_amount(quantity));

-- ─────────────── 주문 생성 (수량 인자 추가) ───────────────
-- 인자 목록이 바뀌면 다른 함수가 되므로 기존 0-인자 버전을 먼저 지운다.
drop function if exists create_ticket_order();

create or replace function create_ticket_order(p_quantity smallint default 1)
  returns ticket_orders
  language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_uid    uuid := auth.uid();
  v_amount integer;
  v_order  ticket_orders;
begin
  if v_uid is null then
    raise exception 'unauthenticated' using errcode = '28000';
  end if;

  v_amount := ticket_bundle_amount(p_quantity);
  if v_amount is null then
    raise exception 'unsupported quantity: %', p_quantity using errcode = '22023';
  end if;

  insert into ticket_orders (order_id, user_id, amount, quantity)
  values ('ticket_' || replace(gen_random_uuid()::text, '-', ''), v_uid, v_amount, p_quantity)
  returning * into v_order;

  return v_order;
end $$;

revoke all on function create_ticket_order(smallint) from public, anon;
grant execute on function create_ticket_order(smallint) to authenticated;

-- ─────────────── 주문 이행: N장 발급 ───────────────
--
-- issue_ticket() 은 payment_id UNIQUE 로 멱등하다. 한 주문에서 여러 장을 내려면
-- 장마다 다른 payment_id 가 필요하므로 주문 번호에서 파생시킨다 —
-- 같은 주문으로 두 번 불려도 같은 3장이 나오고 그 이상은 안 나온다.

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
      (v_order.amount / v_order.quantity)::integer
    );
  end loop;

  update ticket_orders
     set state = 'confirmed', confirmed_at = coalesce(confirmed_at, now())
   where order_id = p_order_id;

  return v_order.quantity;
end $$;

revoke all on function fulfill_ticket_order(text) from public, anon, authenticated;
grant execute on function fulfill_ticket_order(text) to service_role;

comment on function fulfill_ticket_order is
  '결제 승인 후 주문 수량만큼 티켓 발급. payment_id 를 주문에서 파생시켜 멱등하다.';

-- ─────────────── 알림 수신 설정 ───────────────
--
-- 4종 중 후기 요청만 끌 수 있게 한다. 만남 진행 알림(요청 도착·답변·확정)은
-- 끄면 상대의 티켓이 조용히 만료된다 — 24시간 무응답이 곧 환불이므로 이건
-- 편의가 아니라 상대에 대한 의무다. 끄고 싶은 사람에게 필요한 건 알림 해제가
-- 아니라 "잠시 쉬기"(후보 풀에서 빠지기)이고, 그건 별도 기능이다.

alter table profiles
  add column feedback_emails boolean not null default true;

comment on column profiles.feedback_emails is
  '만남 후 후기 요청 메일 수신 여부. 만남 진행 알림은 끌 수 없다(상대의 환불 기한이 걸려 있다).';

grant update (feedback_emails) on profiles to authenticated;

-- 아웃박스에 아예 넣지 않는다 — 표에 남기고 발송만 건너뛰면 아웃박스가
-- "안 보낸 알림"으로 계속 쌓여 실패와 구분되지 않는다.
create or replace function enqueue_feedback_due() returns integer
  language plpgsql security definer set search_path = public, pg_temp as $$
declare v_count integer;
begin
  with due as (
    select m.id as meeting_id, i.male_id, i.female_id
      from meetings m join intros i on i.id = m.intro_id
     where m.confirmed_at   is not null
       and m.cancelled_at   is null
       and m.completed_at   is null
       and m.scheduled_at   < now() - interval '12 hours'
       and m.scheduled_at   > now() - interval '14 days'
  ),
  targets as (
    select meeting_id, male_id   as user_id from due
    union all
    select meeting_id, female_id as user_id from due
  )
  insert into notifications (user_id, kind, meeting_id)
  select t.user_id, 'feedback_due', t.meeting_id
    from targets t
    join profiles p on p.id = t.user_id
   where p.feedback_emails
  on conflict (user_id, kind, meeting_id) do nothing;

  get diagnostics v_count = row_count;
  return v_count;
end $$;

revoke all on function enqueue_feedback_due() from public, anon, authenticated;
grant execute on function enqueue_feedback_due() to service_role;
