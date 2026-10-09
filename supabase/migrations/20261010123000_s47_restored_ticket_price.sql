-- A returned ticket is a no-charge replacement, not a second purchase.
create or replace function refund_ticket(p_ticket_id uuid, p_reason text) returns tickets
  language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_ticket tickets;
  v_replacement tickets;
begin
  select * into v_ticket from tickets where id = p_ticket_id for update;
  if not found or v_ticket.kind <> 'meeting' or v_ticket.state <> 'used' then
    raise exception 'ticket not restorable' using errcode = 'P0002';
  end if;

  update tickets set state = 'refunded', refunded_at = now()
   where id = p_ticket_id
  returning * into v_ticket;

  insert into tickets
    (user_id, kind, price_krw, expires_at, restored_from_ticket_id)
  values
    (v_ticket.user_id, v_ticket.kind, 0,
     v_ticket.expires_at, v_ticket.id)
  returning * into v_replacement;

  insert into events (user_id, name, props)
  values (v_ticket.user_id, 'ticket_refunded',
          jsonb_build_object('ticket_id', p_ticket_id,
                             'restored_ticket_id', v_replacement.id,
                             'reason', p_reason));
  return v_ticket;
end $$;
