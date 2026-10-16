-- A transport failure is not a declined payment. Keep the order's original
-- state and surface the unresolved provider result to the operator.
alter table public.ticket_orders
  add column payment_attention text check (payment_attention in (
    'confirm_unknown', 'cancel_unknown', 'provider_mismatch'
  )),
  add column provider_checked_at timestamptz;

drop function public.admin_ticket_orders(text);
create function public.admin_ticket_orders(p_state text default null)
  returns table (
    order_id text,
    state text,
    kind public.ticket_kind,
    quantity smallint,
    amount integer,
    created_at timestamptz,
    confirmed_at timestamptz,
    user_id uuid,
    user_name text,
    user_gender public.gender,
    fulfill_note text,
    by_admin boolean,
    payment_required boolean,
    payment_attention text,
    provider_checked_at timestamptz
  )
  language plpgsql stable security definer set search_path = public, pg_temp as $$
begin
  if not public.is_admin() then
    raise exception 'admin only' using errcode = '42501';
  end if;
  return query
  select o.order_id, o.state, o.kind, o.quantity, o.amount,
         o.created_at, o.confirmed_at, o.user_id, p.name, p.gender,
         o.fulfill_note, o.fulfilled_by is not null, o.payment_required,
         o.payment_attention, o.provider_checked_at
    from public.ticket_orders o
    join public.profiles p on p.id = o.user_id
   where p_state is null or o.state = p_state
   order by (o.state = 'pending') desc, o.created_at desc;
end $$;
revoke all on function public.admin_ticket_orders(text) from public, anon;
grant execute on function public.admin_ticket_orders(text) to authenticated;

-- Reconciliation is server-only. This does not itself infer a successful
-- payment: the Edge handler must first read and validate the Toss Payment.
create function public.record_payment_provider_check(
  p_order_id text, p_attention text default null, p_checked boolean default false
) returns void
  language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if p_attention is not null and p_attention not in (
    'confirm_unknown', 'cancel_unknown', 'provider_mismatch'
  ) then
    raise exception 'invalid payment attention' using errcode = '22023';
  end if;
  update public.ticket_orders
     set payment_attention = p_attention,
         provider_checked_at = case when p_checked then now() else provider_checked_at end
   where order_id = p_order_id and payment_required;
  if not found then
    raise exception 'paid order not found' using errcode = 'P0002';
  end if;
end $$;
revoke all on function public.record_payment_provider_check(text, text, boolean)
  from public, anon, authenticated;
grant execute on function public.record_payment_provider_check(text, text, boolean) to service_role;

alter table public.admin_actions drop constraint admin_actions_kind_check;
alter table public.admin_actions add constraint admin_actions_kind_check check (kind = any (array[
  'resolve_report', 'ban', 'unban', 'refund', 'cancel_meeting', 'review_photo', 'set_queue',
  'resolve_no_show', 'set_payments', 'fulfill_order', 'reset_photo', 'retry_notification',
  'set_queue_reason', 'upsert_place', 'reconcile_payment'
]));

-- Only a server-side provider read may call this RPC. The order transition,
-- ticket mutation and operator audit all commit together.
create function public.apply_payment_reconciliation(
  p_order_id text, p_actor uuid, p_provider_status text,
  p_payment_key text, p_total_amount integer,
  p_balance_amount integer, p_method text default null
) returns text
  language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_order public.ticket_orders;
  v_result text;
begin
  if not exists (
    select 1 from public.profiles
     where id = p_actor and role = 'admin' and account_state = 'active'
  ) then
    raise exception 'active admin required' using errcode = '42501';
  end if;
  select * into v_order from public.ticket_orders where order_id = p_order_id for update;
  if not found or not v_order.payment_required or
     p_total_amount is distinct from v_order.amount then
    raise exception 'paid order does not match provider' using errcode = 'PT409';
  end if;
  if p_provider_status = 'DONE' and v_order.state = 'pending' then
    if p_payment_key is null or length(btrim(p_payment_key)) = 0 or
       p_balance_amount is distinct from v_order.amount then
      raise exception 'payment does not match pending order' using errcode = 'PT409';
    end if;
    perform public.fulfill_paid_ticket_order(p_order_id, p_payment_key, p_method);
    v_result := 'fulfilled';
  elsif p_provider_status = 'CANCELED' and v_order.state = 'canceling' then
    if p_payment_key is distinct from v_order.payment_key or
       p_balance_amount is distinct from 0 then
      raise exception 'cancellation does not match reserved order' using errcode = 'PT409';
    end if;
    perform public.finalize_paid_order_cancel(
      p_order_id, '토스 조회로 전액 취소 확인'
    );
    v_result := 'canceled';
  else
    raise exception 'provider state is not reconcilable from current order state'
      using errcode = 'PT409';
  end if;
  update public.ticket_orders
     set payment_attention = null, provider_checked_at = now()
   where order_id = p_order_id;
  insert into public.admin_actions (actor_id, kind, target_user, note)
  values (p_actor, 'reconcile_payment', v_order.user_id,
          '결제 대사: ' || p_order_id || ' → ' || v_result);
  return v_result;
end $$;
revoke all on function public.apply_payment_reconciliation(
  text, uuid, text, text, integer, integer, text
) from public, anon, authenticated;
grant execute on function public.apply_payment_reconciliation(
  text, uuid, text, text, integer, integer, text
) to service_role;
