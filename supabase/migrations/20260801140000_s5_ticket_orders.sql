-- S5 — 결제 웹훅(토스페이먼츠) 이전 단계: 주문 생성
--
-- 토스페이먼츠 결제위젯은 orderId를 클라이언트가 만들어 넘기는 구조라, 결제
-- 승인 콜백(paymentKey·orderId·amount)만으로는 그게 우리 쪽 어느 user_id의
-- 결제인지 알 수 없다. 그래서 체크아웃을 시작하기 전에 서버가 먼저 orderId를
-- 만들어 user_id와 묶어 두고(ticket_orders), 결제 승인 콜백은 그 매핑을
-- 조회해서만 issue_ticket()을 부른다 — 클라이언트가 자기 user_id나 금액을
-- 직접 주장하지 못한다(N1: 결제→티켓 발급은 클라이언트를 믿지 않는다).
--
-- 가격(30,000원)은 F5에서 이미 고정값이라 테이블 CHECK로도 강제한다 —
-- create_ticket_order()가 하드코딩하지만, 방어를 이중으로 둔다.

create table ticket_orders (
  order_id     text        primary key,
  user_id      uuid        not null references profiles (id),
  amount       integer     not null check (amount = 30000),
  state        text        not null default 'pending' check (state in ('pending', 'confirmed', 'failed')),
  created_at   timestamptz not null default now(),
  confirmed_at timestamptz,

  check (state <> 'confirmed' or confirmed_at is not null)
);

create index ticket_orders_user_time on ticket_orders (user_id, created_at desc);

alter table ticket_orders enable row level security;

-- 클라이언트는 자기 주문을 읽을 수만 있다(체크아웃 진행 상태 폴링용).
-- INSERT/UPDATE 정책은 없다 — 생성은 create_ticket_order() RPC로만,
-- 상태 전이(confirmed/failed)는 결제 승인 Edge Function이 service_role로만
-- 한다(다른 곳과 동일한 "정책 없음 = 불가능" 패턴, intros와 동일 구조).
grant select on ticket_orders to authenticated;

create policy ticket_orders_select_self on ticket_orders
  for select using (user_id = auth.uid());

-- service_role은 BYPASSRLS와 별개로 테이블 GRANT가 필요하다(버그 2와 같은 함정).
-- 이 테이블은 이번에 새로 만들어서 S1의 일괄 grant 대상에 없었다.
grant select, insert, update on ticket_orders to service_role;

-- ─────────────── 주문 생성 (체크아웃 시작) ───────────────
create or replace function create_ticket_order() returns ticket_orders
  language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_uid   uuid := auth.uid();
  v_order ticket_orders;
begin
  if v_uid is null then
    raise exception 'unauthenticated' using errcode = '28000';
  end if;

  insert into ticket_orders (order_id, user_id, amount)
  values ('ticket_' || replace(gen_random_uuid()::text, '-', ''), v_uid, 30000)
  returning * into v_order;

  return v_order;
end $$;

revoke execute on function create_ticket_order() from public, anon, authenticated;
grant execute on function create_ticket_order() to authenticated;
