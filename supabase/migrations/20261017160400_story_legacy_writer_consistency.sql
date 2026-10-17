-- A cached v2 client may still publish the old single-paragraph form. Never
-- show an earlier v3 Q&A next to its newly written card text.
create function public.clear_story_on_legacy_copy() returns trigger
  language plpgsql security definer set search_path=public,pg_temp as $$
begin
  if old.profile_story is not null and
     new.profile_story is not distinct from old.profile_story and
     (new.headline is distinct from old.headline or new.intro is distinct from old.intro) then
    new.profile_story := null;
    new.profile_preferences := '{}'::jsonb;
  end if;
  return new;
end $$;
revoke all on function public.clear_story_on_legacy_copy() from public,anon,authenticated;
create trigger profiles_clear_story_on_legacy_copy before update of headline,intro on public.profiles
  for each row execute function public.clear_story_on_legacy_copy();
