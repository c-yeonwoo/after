-- Order mode is fixed when the order is created. The admin list must show
-- that per-order mode even if the global payment switch changes later.
drop function admin_ticket_orders(text);

create function admin_ticket_orders(p_state text default null)
  returns table (
    order_id text,
    state text,
    kind ticket_kind,
    quantity smallint,
    amount integer,
    created_at timestamptz,
    confirmed_at timestamptz,
    user_id uuid,
    user_name text,
    user_gender gender,
    fulfill_note text,
    by_admin boolean,
    payment_required boolean
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
         o.fulfill_note, o.fulfilled_by is not null,
         o.payment_required
    from ticket_orders o
    join profiles p on p.id = o.user_id
   where p_state is null or o.state = p_state
   order by (o.state = 'pending') desc, o.created_at desc;
end $$;

comment on function admin_ticket_orders(text) is
  '티켓 주문 목록. 주문 생성 당시의 결제 모드도 표시한다.';

revoke all on function admin_ticket_orders(text) from public, anon;
grant execute on function admin_ticket_orders(text) to authenticated;
