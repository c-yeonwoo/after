-- Old interest/topic fields must not keep influencing the concierge brief after
-- a member approves a new story with a different public scope.
create function public.clear_legacy_story_sources() returns trigger
  language plpgsql security definer set search_path=public,pg_temp as $$
begin
  if new.profile_story is not null and new.profile_story is distinct from old.profile_story then
    new.interests := '{}'::text[];
    new.match_tags := '{}'::text[];
    new.topics := '{}'::text[];
    new.details := '{}'::jsonb;
    new.match_note := null;
  end if;
  return new;
end $$;
revoke all on function public.clear_legacy_story_sources() from public,anon,authenticated;
create trigger profiles_clear_legacy_story_sources before update of profile_story on public.profiles
  for each row execute function public.clear_legacy_story_sources();

create function public.admin_profile_preferences(p_user uuid) returns jsonb
  language plpgsql stable security definer set search_path=public,pg_temp as $$
declare v_preferences jsonb;
begin
  if not public.is_admin() then raise exception 'admin only' using errcode='42501'; end if;
  select profile_preferences into v_preferences from public.profiles where id=p_user;
  return v_preferences;
end $$;
revoke all on function public.admin_profile_preferences(uuid) from public,anon;
grant execute on function public.admin_profile_preferences(uuid) to authenticated;
