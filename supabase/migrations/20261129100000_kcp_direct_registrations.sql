-- Only Edge can read a KCP registration key. The browser receives its own key
-- once to POST the hosted form. No identity payload is stored here.
create table public.kcp_direct_registrations (
  id text primary key check (id ~ '^av[0-9a-f]{32}$'),
  flow text not null check (flow in ('signup','member')),
  app_origin text not null,
  registration_key text not null check (length(registration_key) between 1 and 20),
  returned_at timestamptz,
  expires_at timestamptz not null default now() + interval '15 minutes'
);
alter table public.kcp_direct_registrations enable row level security;
revoke all on public.kcp_direct_registrations from public, anon, authenticated;
grant select, insert, update, delete on public.kcp_direct_registrations to service_role;

-- Serialize reservations before an external call so concurrent taps share one daily quota.
create function public.limit_member_identity_attempt() returns trigger
language plpgsql set search_path=public,pg_temp as $$
begin
  perform pg_advisory_xact_lock(hashtextextended('member-identity:' || new.user_id::text, 0));
  if (select count(*) from public.identity_verification_attempts
        where user_id=new.user_id and created_at >= now() - interval '24 hours') >= 5 then
    raise exception 'daily limit' using errcode='P0001';
  end if;
  return new;
end $$;
revoke all on function public.limit_member_identity_attempt() from public,anon,authenticated;
create trigger limit_member_identity_attempt before insert on public.identity_verification_attempts
for each row execute function public.limit_member_identity_attempt();

-- Commit the verification receipt and dispose of the provider key atomically.
create function public.clear_direct_kcp_registration() returns trigger
language plpgsql set search_path=public,pg_temp as $$
begin
  delete from public.kcp_direct_registrations where id=new.id;
  return new;
end $$;
revoke all on function public.clear_direct_kcp_registration() from public,anon,authenticated;
create trigger clear_signup_kcp_registration after update of consumed_at on public.signup_identity_attempts
for each row when (new.consumed_at is not null and old.consumed_at is null)
execute function public.clear_direct_kcp_registration();
create trigger clear_member_kcp_registration after update of consumed_at on public.identity_verification_attempts
for each row when (new.consumed_at is not null and old.consumed_at is null)
execute function public.clear_direct_kcp_registration();
create index kcp_direct_registrations_expiry on public.kcp_direct_registrations(expires_at);
select cron.schedule('expire_kcp_registration_15m','*/15 * * * *',
  $$delete from public.kcp_direct_registrations where expires_at <= now()$$);
