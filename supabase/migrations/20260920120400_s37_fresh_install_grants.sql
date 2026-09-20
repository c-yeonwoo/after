-- s37: make fresh installs match the hardened production permission surface.
-- PostgreSQL grants EXECUTE on new functions to PUBLIC by default, and newer
-- Supabase bootstrap images can also restore broader table grants. Keep the
-- final migration authoritative so CI, local resets, and production agree.

revoke all on function public.is_admin() from public, anon;
grant execute on function public.is_admin() to authenticated, service_role;

revoke all on function public.is_eligible_candidate(uuid) from public, anon;
grant execute on function public.is_eligible_candidate(uuid) to authenticated, service_role;

revoke all on table public.ticket_orders from public, anon, authenticated;
grant select on table public.ticket_orders to authenticated;
grant select, insert, update on table public.ticket_orders to service_role;

-- Functions created after this migration must opt in to client execution.
alter default privileges in schema public
  revoke execute on functions from public;

alter default privileges for role postgres in schema public
  revoke execute on functions from public;
