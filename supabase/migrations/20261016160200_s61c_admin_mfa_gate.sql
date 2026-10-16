-- Leave enforcement OFF until the sole operator has enrolled a verified
-- factor and tested recovery. The server boundary is ready before that switch.
alter table public.app_settings
  add column admin_mfa_required boolean not null default false;

create function public.admin_sensitive_auth_ok() returns boolean
  language sql stable security definer set search_path = public, pg_temp as $$
  select not coalesce((select admin_mfa_required from public.app_settings where id), false)
    or coalesce((auth.jwt()->>'aal') = 'aal2', false)
$$;
revoke all on function public.admin_sensitive_auth_ok() from public, anon;
grant execute on function public.admin_sensitive_auth_ok() to authenticated;

create function public.guard_admin_mfa_for_payments() returns trigger
  language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if old.payments_enabled is false and new.payments_enabled is true
     and old.admin_mfa_required and not public.admin_sensitive_auth_ok() then
    raise exception 'MFA required to enable payments' using errcode = '42501';
  end if;
  return new;
end $$;
revoke all on function public.guard_admin_mfa_for_payments() from public, anon, authenticated;
create trigger guard_admin_mfa_for_payments
  before update of payments_enabled on public.app_settings
  for each row execute function public.guard_admin_mfa_for_payments();

create function public.guard_admin_mfa_for_sanctions() returns trigger
  language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if auth.uid() is not null and public.is_admin()
     and (new.role is distinct from old.role or
          (new.account_state is distinct from old.account_state and
           (new.account_state = 'banned' or old.account_state = 'banned')))
     and not public.admin_sensitive_auth_ok() then
    raise exception 'MFA required for sensitive admin action' using errcode = '42501';
  end if;
  return new;
end $$;
revoke all on function public.guard_admin_mfa_for_sanctions() from public, anon, authenticated;
create trigger guard_admin_mfa_for_sanctions
  before update of role, account_state on public.profiles
  for each row execute function public.guard_admin_mfa_for_sanctions();
