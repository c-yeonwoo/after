-- A withdrawn account keeps a transaction shell, never its approved story or
-- private generation candidates.
create or replace function public.erase_on_withdraw() returns trigger
  language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if new.account_state = 'withdrawn' and old.account_state is distinct from 'withdrawn' then
    delete from public.device_tokens where user_id = new.id;
    delete from public.profile_generation_versions where user_id = new.id;
    new.phone := null;
    new.phone_verified_at := null;
    new.evening_note := null;
    new.known_as := null;
    new.profile_story := null;
  end if;
  return new;
end $$;
