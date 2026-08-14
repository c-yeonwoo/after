-- S27 — 결제를 켜기 전까지 운영자가 티켓을 발급한다
--
-- v2 는 유료가 전제다(소개 5,000 · 만남 30,000). 그런데 토스 키가 나오기 전까지
-- 상점은 주문만 받고 티켓은 나가지 않는다 — 즉 **지금 이 상태로는 아무도 소개를
-- 열 수 없다.** 베타를 돌리려면 돈을 받지 않고도 티켓이 나가는 길이 필요하다.
--
-- ── 왜 환경변수가 아니라 DB 인가 ──
-- 결제를 켜는 시점은 "토스 심사가 끝난 그 순간" 이라 배포와 맞물리지 않는다.
-- 환경변수로 두면 키가 나온 날 재배포를 해야 하고, 되돌리려면 또 배포해야 한다.
-- 운영자가 화면에서 누르면 즉시 바뀌는 값이어야 한다.
--
-- ── 왜 자동 발급이 아니라 승인인가 ──
-- 무료 발급에 한도를 두지 않기로 했다(작은 지인 베타). 한도가 없으면 남는 방어선은
-- **사람** 뿐이다. 주문이 목록에 쌓이고 운영자가 사유와 함께 승인해야 티켓이 나간다.
-- 승인 사유는 다른 운영 조작과 같은 자리(admin_actions)에 남는다.

-- ─────────────── 설정 ───────────────
--
-- 한 행만 존재한다. id 를 boolean primary key + check 로 못 박으면 두 번째 행이
-- 물리적으로 들어갈 수 없다 — "설정이 두 벌이 되어 어느 쪽이 참인지 모르는" 상태를
-- 애초에 만들지 않는다.

create table app_settings (
  id              boolean primary key default true check (id),
  payments_enabled boolean not null default false,
  updated_at      timestamptz not null default now(),
  updated_by      uuid references profiles(id)
);

insert into app_settings (id) values (true);

alter table app_settings enable row level security;

/*
  읽기는 로그인한 모두에게 연다. 상점 화면이 "지금 결제를 받는가" 를 알아야
  문구와 버튼이 갈리기 때문이다. 숨길 것이 없는 값이고, 숨기면 화면이 서버에
  한 번 더 물어보는 RPC 를 만들어야 한다.
*/
create policy app_settings_read on app_settings
  for select to authenticated using (true);

-- 쓰기 정책은 만들지 않는다. 변경은 admin_set_payments() 만 할 수 있다.

/*
  정책과 별개로 **테이블 권한**을 준다. RLS 정책은 보이는 행을 거를 뿐이고,
  GRANT 가 없으면 정책을 통과해도 `permission denied` 다 — 검증에서 실제로
  이걸로 막혔다. 두 개는 다른 장치이고 둘 다 있어야 한다.
*/
revoke all on table app_settings from public, anon;
grant select on table app_settings to authenticated;

comment on table app_settings is
  '서비스 전역 설정. 한 행만 존재한다(id = true 강제).';
comment on column app_settings.payments_enabled is
  'true 면 토스 결제로만 티켓이 나간다. false 면 베타 — 운영자가 주문을 승인해 0원으로 발급한다.';

-- ─────────────── 주문에 처리 흔적을 남긴다 ───────────────
--
-- 승인 사유를 주문 행에 둔다. admin_actions.target_ref 는 uuid 인데 order_id 는
-- 'ticket_...' 텍스트라 거기에 걸 수 없다. profiles.banned_reason 이 admin_actions
-- 와 나란히 존재하는 것과 같은 관계다 — 감사 기록은 이력, 이 컬럼은 현재 상태.

alter table ticket_orders
  add column fulfilled_by uuid references profiles(id),
  add column fulfill_note text check (fulfill_note is null or length(btrim(fulfill_note)) > 0);

comment on column ticket_orders.fulfill_note is
  '베타 발급 승인 사유. 결제로 발급된 주문은 null 이다.';

-- ─────────────── 감사 기록 종류 추가 ───────────────

alter table admin_actions drop constraint admin_actions_kind_check;
alter table admin_actions add constraint admin_actions_kind_check
  check (kind in ('resolve_report', 'ban', 'unban', 'refund', 'cancel_meeting',
                  'review_photo', 'set_queue', 'resolve_no_show',
                  'set_payments', 'fulfill_order'));

-- ─────────────── 결제 스위치 ───────────────

create function admin_set_payments(p_on boolean, p_note text)
  returns app_settings
  language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_uid uuid := auth.uid();
  v_row app_settings;
begin
  if not is_admin() then
    raise exception 'admin only' using errcode = '42501';
  end if;
  if p_note is null or length(btrim(p_note)) = 0 then
    raise exception 'note required' using errcode = '22023';
  end if;

  update app_settings
     set payments_enabled = p_on, updated_at = now(), updated_by = v_uid
   where id
  returning * into v_row;

  insert into admin_actions (actor_id, kind, target_user, target_ref, note)
  values (v_uid, 'set_payments', null, null,
          (case when p_on then '결제 켬 — ' else '결제 끔(베타) — ' end) || p_note);

  return v_row;
end $$;

comment on function admin_set_payments(boolean, text) is
  '결제 활성화 전환. 켜면 티켓은 토스 승인으로만 나가고, 끄면 운영자 승인으로 나간다.';

revoke all on function admin_set_payments(boolean, text)    from public, anon;
grant execute on function admin_set_payments(boolean, text) to authenticated;

-- ─────────────── 주문 목록 ───────────────

create function admin_ticket_orders(p_state text default null)
  returns table (
    order_id     text,
    state        text,
    kind         ticket_kind,
    quantity     smallint,
    amount       integer,
    created_at   timestamptz,
    confirmed_at timestamptz,
    user_id      uuid,
    user_name    text,
    user_gender  gender,
    fulfill_note text,
    -- 결제로 나간 주문인지 운영자가 승인한 주문인지. 목록에서 섞이면
    -- "이 사람이 돈을 냈는가" 를 알 수 없다.
    by_admin     boolean
  )
  language plpgsql stable security definer set search_path = public, pg_temp as $$
begin
  if not is_admin() then
    raise exception 'admin only' using errcode = '42501';
  end if;

  return query
  select o.order_id, o.state, o.kind, o.quantity, o.amount,
         o.created_at, o.confirmed_at,
         o.user_id, p.name, p.gender,
         o.fulfill_note,
         o.fulfilled_by is not null
    from ticket_orders o
    join profiles p on p.id = o.user_id
   where p_state is null or o.state = p_state
   order by (o.state = 'pending') desc, o.created_at desc;
end $$;

comment on function admin_ticket_orders(text) is
  '티켓 주문 목록. 대기 건이 먼저 온다.';

revoke all on function admin_ticket_orders(text)    from public, anon;
grant execute on function admin_ticket_orders(text) to authenticated;

-- ─────────────── 베타 발급 ───────────────

create function admin_fulfill_order(p_order_id text, p_note text)
  returns integer
  language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_uid   uuid := auth.uid();
  v_order ticket_orders;
  v_i     integer;
begin
  if not is_admin() then
    raise exception 'admin only' using errcode = '42501';
  end if;
  if p_note is null or length(btrim(p_note)) = 0 then
    raise exception 'note required' using errcode = '22023';
  end if;

  /*
    결제가 켜져 있으면 발급 주체는 토스다.

    여기서 막지 않으면 결제를 켠 뒤에도 운영자가 무료로 티켓을 낼 수 있고,
    그러면 "돈을 낸 사람과 안 낸 사람" 이 같은 표에 구분 없이 섞인다.
    베타를 끝내는 순간 이 문이 닫혀야 한다.
  */
  if (select payments_enabled from app_settings where id) then
    raise exception 'payments are enabled — tickets are issued by payment confirmation'
      using errcode = '42501';
  end if;

  select * into v_order from ticket_orders where order_id = p_order_id for update;
  if not found then
    raise exception 'order not found' using errcode = 'P0002';
  end if;

  -- 이미 처리된 건은 양성 경합이다. 500 이 아니라 409 로 낸다(s16c 와 같은 규칙).
  if v_order.state = 'confirmed' then
    raise exception 'order already fulfilled' using errcode = 'PT409';
  end if;

  /*
    0원으로 발급한다. price_krw = 0 은 tickets_price_band 가 종류와 무관하게
    허용한다(s19 에서 노쇼 보상 티켓 때문에 열어 둔 길이다).

    payment_id 는 결제 경로와 같은 형식('<order_id>#<n>')을 쓴다 — issue_ticket 의
    멱등 키가 여기 걸려 있어서, 나중에 같은 주문이 결제로 다시 들어와도 티켓이
    두 번 나가지 않는다.
  */
  for v_i in 1..v_order.quantity loop
    perform issue_ticket(v_order.user_id, p_order_id || '#' || v_i, 0, v_order.kind);
  end loop;

  update ticket_orders
     set state = 'confirmed',
         confirmed_at = coalesce(confirmed_at, now()),
         fulfilled_by = v_uid,
         fulfill_note = btrim(p_note)
   where order_id = p_order_id;

  insert into admin_actions (actor_id, kind, target_user, target_ref, note)
  values (v_uid, 'fulfill_order', v_order.user_id, null,
          '베타 발급 ' || v_order.quantity || '장(' || v_order.kind || ') — ' || btrim(p_note));

  insert into events (user_id, name, props)
  values (v_order.user_id, 'ticket_granted',
          jsonb_build_object('order_id', p_order_id, 'quantity', v_order.quantity,
                             'kind', v_order.kind, 'by', v_uid));

  return v_order.quantity;
end $$;

comment on function admin_fulfill_order(text, text) is
  '베타 기간 무료 발급. 결제가 켜져 있으면 거부한다 — 그때는 토스가 발급 주체다.';

revoke all on function admin_fulfill_order(text, text)    from public, anon;
grant execute on function admin_fulfill_order(text, text) to authenticated;

-- ─────────────── 대시보드에 적체 항목 추가 ───────────────
--
-- 베타에서는 주문이 곧 사람이 손대야 하는 일이다. 다른 적체와 같은 자리에 없으면
-- 운영자가 상점을 따로 들여다봐야 한다는 뜻이고, 그러면 놓친다.

create or replace function admin_dashboard()
  returns jsonb
  language plpgsql stable security definer set search_path = public, pg_temp as $$
declare v jsonb;
begin
  if not is_admin() then
    raise exception 'admin only' using errcode = '42501';
  end if;

  select jsonb_build_object(
    'payments_enabled', (select payments_enabled from app_settings where id),

    'members', jsonb_build_object(
      'female', (select count(*) from profiles
                  where gender = 'female' and account_state = 'active'
                    and onboarding_step >= 7 and role <> 'admin'),
      'male',   (select count(*) from profiles
                  where gender = 'male'   and account_state = 'active'
                    and onboarding_step >= 7 and role <> 'admin'),
      'paused', (select count(*) from profiles
                  where paused_at is not null and account_state = 'active'
                    and role <> 'admin'),
      'banned', (select count(*) from profiles
                  where account_state = 'banned' and role <> 'admin')
    ),

    'flow', jsonb_build_object(
      'open_intros',      (select count(*) from intros  where closed_at is null),
      'active_meetings',  (select count(*) from meetings
                            where cancelled_at is null and completed_at is null),
      'confirmed',        (select count(*) from meetings
                            where confirmed_at is not null
                              and cancelled_at is null and completed_at is null),
      'completed',        (select count(*) from meetings where completed_at is not null),
      'queued_cards',     (select count(*) from intro_queue where opened_at is null)
    ),

    'backlog', jsonb_build_object(
      'pending_reports',   (select count(*) from content_reports where state = 'pending'),
      'pending_no_shows',  (select count(*) from no_show_reports where state = 'pending'),
      'pending_photos',    (select count(*) from profiles
                             where photo_url is not null and photo_state = 'pending'
                               and role <> 'admin'),
      -- 발급을 기다리는 주문. 결제가 켜져 있으면 토스가 처리하므로 사람 일이 아니다.
      'pending_orders',    (select count(*) from ticket_orders where state = 'pending'),
      -- 큐레이션 대기 = 아직 어느 큐에도 들어가지 않은 호감
      'unmatched_likes',   (select count(*) from affinities a
                             where a.verdict = 'like'
                               and not exists (select 1 from intro_queue q
                                                where q.male_id = a.to_id
                                                  and q.female_id = a.from_id)
                               and not exists (select 1 from intros i
                                                where i.male_id = a.to_id
                                                  and i.female_id = a.from_id)),
      -- 큐가 비어 지금 아무것도 못 받는 활성 남성
      'starved_males',     (select count(*) from profiles p
                             where p.gender = 'male' and p.account_state = 'active'
                               and p.onboarding_step = 7 and p.paused_at is null
                               and p.role <> 'admin'
                               and not exists (select 1 from intro_queue q
                                                where q.male_id = p.id
                                                  and q.opened_at is null)),
      'oldest_like_hours', (select round(extract(epoch from (now() - min(a.created_at))) / 3600)
                              from affinities a
                             where a.verdict = 'like'
                               and not exists (select 1 from intro_queue q
                                                where q.male_id = a.to_id
                                                  and q.female_id = a.from_id)
                               and not exists (select 1 from intros i
                                                where i.male_id = a.to_id
                                                  and i.female_id = a.from_id))
    ),

    'quality', jsonb_build_object(
      'intros_total',  (select count(*) from intros),
      'intros_passed', (select count(*) from intros where outcome = 'passed'),
      'intros_used',   (select count(*) from intros where outcome = 'ticket_used'),
      -- 큐레이션 노동이 회수되는 비율 (§5). 낮으면 노동이 새고 있다.
      'cards_delivered', (select count(*) from intro_queue where delivered_at is not null),
      'cards_opened',    (select count(*) from intro_queue where opened_at is not null),
      'cards_expired',   (select count(*) from events where name = 'intro_queue_expired')
    )
  ) into v;

  return v;
end $$;
