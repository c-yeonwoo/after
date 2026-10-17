-- Choices used for concierge coordination are private, not part of the public
-- profile view or the general admin list.
alter table public.profiles add column profile_preferences jsonb not null default '{}'::jsonb
  check (jsonb_typeof(profile_preferences)='object' and octet_length(profile_preferences::text) <= 5000);

create function public.approve_profile_story_sources() returns trigger
  language plpgsql security definer set search_path=public,pg_temp as $$
declare v_data jsonb;
begin
  if new.profile_story is null or new.profile_story is not distinct from old.profile_story then
    return new;
  end if;
  select data into v_data from public.profile_interview_drafts
    where user_id=new.id and data->>'version'='3' and data->>'stage'='preview';
  if v_data is null then raise exception 'approved interview draft required' using errcode='22023'; end if;
  if jsonb_typeof(v_data->'publicIds') <> 'array' then
    raise exception 'public scope required' using errcode='22023';
  end if;
  new.profile_preferences := jsonb_build_object(
    'version',1,
    'choices',coalesce(v_data->'choices','{}'::jsonb),
    'choiceCustom',coalesce(v_data->'choiceCustom','{}'::jsonb)
  );
  if not (v_data->'publicIds' ? 'answer:daily_life') then new.evening_note := null; end if;
  if not (v_data->'publicIds' ? 'answer:getting_closer') then new.known_as := null; end if;
  if not (v_data->'publicIds' ? 'answer:conversation') then new.topic_note := null; end if;
  return new;
end $$;
revoke all on function public.approve_profile_story_sources() from public,anon,authenticated;
create trigger profiles_approve_story_sources before update of profile_story on public.profiles
  for each row execute function public.approve_profile_story_sources();

create function public.erase_profile_preferences_on_withdraw() returns trigger
  language plpgsql security definer set search_path=public,pg_temp as $$
begin
  if new.account_state='withdrawn' and old.account_state is distinct from 'withdrawn' then
    new.profile_preferences := '{}'::jsonb;
  end if;
  return new;
end $$;
revoke all on function public.erase_profile_preferences_on_withdraw() from public,anon,authenticated;
create trigger profiles_erase_profile_preferences before update of account_state on public.profiles
  for each row execute function public.erase_profile_preferences_on_withdraw();

create function public.admin_profile_story(p_user uuid) returns jsonb
  language plpgsql stable security definer set search_path=public,pg_temp as $$
declare v_story jsonb;
begin
  if not public.is_admin() then raise exception 'admin only' using errcode='42501'; end if;
  select profile_story into v_story from public.profiles where id=p_user;
  return v_story;
end $$;
revoke all on function public.admin_profile_story(uuid) from public,anon;
grant execute on function public.admin_profile_story(uuid) to authenticated;
