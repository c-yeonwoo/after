-- The beta store promised no expiry. Do not shorten the life of tickets that
-- were already granted for free before this policy change. New grants and all
-- paid tickets use the 12-month default from s44.
alter table tickets drop constraint tickets_max_validity;

update tickets t
   set expires_at = 'infinity'::timestamptz
 where not exists (
   select 1 from ticket_orders o
    where o.payment_required
      and split_part(t.payment_id, '#', 1) = o.order_id
 );

alter table tickets add constraint tickets_max_validity
  check (expires_at = 'infinity'::timestamptz
         or expires_at <= issued_at + interval '12 months');
