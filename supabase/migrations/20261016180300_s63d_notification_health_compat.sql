-- Keep the established dashboard RPCs, but replace their historical
-- sent_at/attempts interpretation with the delivery ledger projection.
alter function public.admin_operational_health() rename to admin_operational_health_legacy;
revoke all on function public.admin_operational_health_legacy()
  from public, anon, authenticated;
create function public.admin_operational_health() returns jsonb
  language plpgsql stable security definer set search_path = public, pg_temp as $$
begin
  if not public.is_admin() then
    raise exception 'admin only' using errcode = '42501';
  end if;
  return jsonb_set(public.admin_operational_health_legacy(),
                   '{notifications}', public.admin_notification_health());
end $$;
revoke all on function public.admin_operational_health() from public, anon;
grant execute on function public.admin_operational_health() to authenticated;

alter function public.admin_system_overview() rename to admin_system_overview_legacy;
revoke all on function public.admin_system_overview_legacy()
  from public, anon, authenticated;
create function public.admin_system_overview() returns jsonb
  language plpgsql stable security definer set search_path = public, pg_temp as $$
begin
  if not public.is_admin() then
    raise exception 'admin only' using errcode = '42501';
  end if;
  return jsonb_set(public.admin_system_overview_legacy(),
                   '{notifications}', public.admin_notification_health());
end $$;
revoke all on function public.admin_system_overview() from public, anon;
grant execute on function public.admin_system_overview() to authenticated;
