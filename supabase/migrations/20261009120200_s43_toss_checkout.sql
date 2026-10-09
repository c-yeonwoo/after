-- S43 - preserve the payment mode of each order and reconcile Toss payments.
-- The global switch controls new orders. An order already sent to Toss must
-- still be confirmable if the operator turns the switch off in the meantime.

alter table ticket_orders
  add column payment_required boolean not null default false,
  add column payment_key text unique,
  add column payment_method text,
  add column paid_at timestamptz,
  add column canceled_at timestamptz,
  add column cancel_reason text;

alter table ticket_orders drop constraint ticket_orders_state_check;
alter table ticket_orders add constraint ticket_orders_state_check
  check (state in ('pending', 'confirmed', 'failed', 'canceling', 'canceled'));
alter table ticket_orders add constraint ticket_orders_payment_consistency check (
  (payment_key is null and paid_at is null)
  or (payment_required and payment_key is not null and paid_at is not null)
);
alter table ticket_orders add constraint ticket_orders_free_fulfillment_mode
  check (fulfilled_by is null or not payment_required);

-- A cancellation reservation makes an unused ticket unavailable to the
-- consumption RPCs before the external refund request is sent to Toss.
alter table tickets add column refund_locked boolean not null default false;
alter table tickets add constraint tickets_refund_lock_unused
  check (not refund_locked or state = 'unused');

create or replace function create_ticket_order(
  p_quantity smallint default 1,
  p_kind ticket_kind default 'meeting'
) returns ticket_orders
  language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_uid uuid := auth.uid();
  v_amount integer;
  v_order ticket_orders;
begin
  if v_uid is null then
    raise exception 'unauthenticated' using errcode = '28000';
  end if;
  if my_gender() <> 'male' then
    raise exception 'tickets are used by male members only' using errcode = '42501';
  end if;

  v_amount := ticket_bundle_amount(p_quantity, p_kind);
  if v_amount is null then
    raise exception 'unsupported quantity % for %', p_quantity, p_kind using errcode = '22023';
  end if;

  insert into ticket_orders (order_id, user_id, amount, quantity, kind, payment_required)
  values ('ticket_' || replace(gen_random_uuid()::text, '-', ''),
          v_uid, v_amount, p_quantity, p_kind,
          (select payments_enabled from app_settings where id))
  returning * into v_order;
  return v_order;
end $$;

-- A confirmed Toss response is the only caller of this service-role RPC.
-- Store paymentKey and issue all bundle tickets in one database transaction.
create function fulfill_paid_ticket_order(
  p_order_id text, p_payment_key text, p_method text default null
) returns integer
  language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_order ticket_orders;
  v_i integer;
  v_price integer;
begin
  if p_payment_key is null or length(btrim(p_payment_key)) = 0 then
    raise exception 'payment key required' using errcode = '22023';
  end if;
  select * into v_order from ticket_orders where order_id = p_order_id for update;
  if not found then
    raise exception 'order not found' using errcode = 'P0002';
  end if;
  if not v_order.payment_required then
    raise exception 'order was created for free beta' using errcode = '42501';
  end if;
  if v_order.state = 'confirmed' and v_order.payment_key = p_payment_key then
    return v_order.quantity;
  end if;
  if v_order.state <> 'pending' then
    raise exception 'order cannot be fulfilled from %', v_order.state using errcode = 'PT409';
  end if;

  for v_i in 1..v_order.quantity loop
    -- Assign the remainder to the last ticket, so ticket prices sum exactly
    -- to the Toss amount for bundles such as 85,000 / 3.
    v_price := v_order.amount / v_order.quantity;
    if v_i = v_order.quantity then
      v_price := v_order.amount - v_price * (v_order.quantity - 1);
    end if;
    perform issue_ticket(v_order.user_id, p_order_id || '#' || v_i,
                         v_price, v_order.kind);
  end loop;

  update ticket_orders
     set state = 'confirmed', confirmed_at = coalesce(confirmed_at, now()),
         payment_key = p_payment_key, payment_method = p_method, paid_at = now()
   where order_id = p_order_id;
  return v_order.quantity;
end $$;

revoke all on function fulfill_paid_ticket_order(text, text, text)
  from public, anon, authenticated;
grant execute on function fulfill_paid_ticket_order(text, text, text) to service_role;

create function reserve_paid_order_cancel(p_order_id text)
  returns ticket_orders
  language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_order ticket_orders;
  v_count bigint;
  v_eligible boolean;
begin
  select * into v_order from ticket_orders where order_id = p_order_id for update;
  if not found then
    raise exception 'order not found' using errcode = 'P0002';
  end if;
  if not v_order.payment_required or v_order.payment_key is null then
    raise exception 'not a paid order' using errcode = '42501';
  end if;
  if v_order.state = 'canceling' then
    return v_order;
  end if;
  if v_order.state <> 'confirmed' then
    raise exception 'order cannot be canceled from %', v_order.state using errcode = 'PT409';
  end if;

  perform 1 from tickets
   where left(payment_id, length(p_order_id) + 1) = p_order_id || '#'
   for update;
  select count(*), coalesce(bool_and(state = 'unused' and not refund_locked), false)
    into v_count, v_eligible
    from tickets
   where left(payment_id, length(p_order_id) + 1) = p_order_id || '#';
  if v_count <> v_order.quantity or not v_eligible then
    raise exception 'all order tickets must be unused' using errcode = 'PT409';
  end if;

  update tickets set refund_locked = true
   where left(payment_id, length(p_order_id) + 1) = p_order_id || '#';
  update ticket_orders set state = 'canceling' where order_id = p_order_id
  returning * into v_order;
  return v_order;
end $$;

revoke all on function reserve_paid_order_cancel(text) from public, anon, authenticated;
grant execute on function reserve_paid_order_cancel(text) to service_role;

create function finalize_paid_order_cancel(p_order_id text, p_reason text)
  returns integer
  language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_order ticket_orders;
  v_count integer;
begin
  if p_reason is null or length(btrim(p_reason)) = 0 then
    raise exception 'cancel reason required' using errcode = '22023';
  end if;
  select * into v_order from ticket_orders where order_id = p_order_id for update;
  if not found then
    raise exception 'order not found' using errcode = 'P0002';
  end if;
  if v_order.state = 'canceled' then
    return v_order.quantity;
  end if;
  if v_order.state <> 'canceling' then
    raise exception 'order is not reserved for cancellation' using errcode = 'PT409';
  end if;

  update tickets
     set state = 'refunded', refunded_at = now(), refund_locked = false
   where left(payment_id, length(p_order_id) + 1) = p_order_id || '#'
     and state = 'unused' and refund_locked;
  get diagnostics v_count = row_count;
  if v_count <> v_order.quantity then
    raise exception 'ticket count changed during cancellation' using errcode = 'PT409';
  end if;
  update ticket_orders
     set state = 'canceled', canceled_at = now(), cancel_reason = btrim(p_reason)
   where order_id = p_order_id;
  insert into events (user_id, name, props)
  values (v_order.user_id, 'payment_canceled',
          jsonb_build_object('order_id', p_order_id, 'amount', v_order.amount));
  return v_count;
end $$;

revoke all on function finalize_paid_order_cancel(text, text)
  from public, anon, authenticated;
grant execute on function finalize_paid_order_cancel(text, text) to service_role;

create function release_paid_order_cancel(p_order_id text)
  returns void
  language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_order ticket_orders;
begin
  select * into v_order from ticket_orders where order_id = p_order_id for update;
  if not found or v_order.state <> 'canceling' then
    return;
  end if;
  update tickets set refund_locked = false
   where left(payment_id, length(p_order_id) + 1) = p_order_id || '#'
     and state = 'unused';
  update ticket_orders set state = 'confirmed' where order_id = p_order_id;
end $$;

revoke all on function release_paid_order_cancel(text) from public, anon, authenticated;
grant execute on function release_paid_order_cancel(text) to service_role;
