-- Editing an existing profile must not expose changed basic details before the
-- member confirms the interview. Publish basics and copy in one transaction.
create or replace function public.publish_profile_interview(p_expected_revision bigint,p_conditions jsonb)
returns public.profiles language plpgsql security definer set search_path=public,pg_temp as $$
declare
  v_uid uuid := auth.uid();
  v_draft public.profile_interview_drafts;
  v_profile jsonb;
  v_intro text;
  v_headline text;
  v_photos text[];
  v_birth date;
  v_old public.profiles;
  v_saved public.profiles;
begin
  if v_uid is null then raise exception 'unauthenticated' using errcode='28000'; end if;
  select * into v_draft from public.profile_interview_drafts
   where user_id=v_uid for update;
  if not found or v_draft.revision <> p_expected_revision then
    raise exception 'draft changed elsewhere' using errcode='PT409';
  end if;
  select * into v_old from public.profiles where id=v_uid and account_state='active' for update;
  if not found then raise exception 'active profile required' using errcode='42501'; end if;
  v_profile := v_draft.data->'profile';
  v_intro := btrim(v_draft.data->>'intro');
  v_headline := btrim(v_profile->>'headline');
  if v_draft.data->>'stage' <> 'preview' or
     v_profile is null or jsonb_typeof(v_profile) <> 'object' or
     char_length(coalesce(v_headline,'')) not between 3 and 35 or
     char_length(coalesce(v_intro,'')) not between 5 and 300 or
     (v_headline || ' ' || v_intro) ~* '[a-z0-9._%+\-]+@[a-z0-9.\-]+\.[a-z]{2,}' or
     (v_headline || ' ' || v_intro) ~* '(\+?82[- .]?)?0?1[016789][-. ]?[0-9]{3,4}[-. ]?[0-9]{4}' or
     (v_headline || ' ' || v_intro) ~* 'https?://[^[:space:]]+' or
     p_conditions is null or jsonb_typeof(p_conditions) <> 'object' or
     char_length(btrim(coalesce(p_conditions->>'name',''))) not between 2 and 60 or
     char_length(btrim(coalesce(p_conditions->>'job',''))) not between 2 and 80 or
     coalesce(p_conditions->>'smoking','') not in ('none','quit','sometimes','yes') or
     coalesce(p_conditions->>'drinking','') not in ('none','rare','social','often') or
     coalesce(p_conditions->>'religion','') not in ('','none','christian','catholic','buddhist','other') or
     coalesce(p_conditions->>'mbti','') !~ '^([IE][SN][TF][PJ])?$' or
     coalesce(p_conditions->>'birth','') !~ '^\d{4}-\d{2}-\d{2}$' or
     jsonb_typeof(p_conditions->'photos') <> 'array' or
     jsonb_array_length(p_conditions->'photos') not between 3 and 6 then
    raise exception 'incomplete approved profile' using errcode='22023';
  end if;
  select array_agg(path) into v_photos
    from jsonb_array_elements_text(p_conditions->'photos') path;
  if exists(select 1 from unnest(v_photos) path where path is null or btrim(path)='') or
     not public.profile_photo_paths_distinct(v_photos) then
    raise exception 'invalid profile photos' using errcode='22023';
  end if;
  v_birth := (p_conditions->>'birth')::date;
  if extract(year from age((now() at time zone 'Asia/Seoul')::date,v_birth)) not between 19 and 79 or
     (v_old.identity_verified_at is not null and v_birth is distinct from v_old.birth) then
    raise exception 'adult birth required' using errcode='22023';
  end if;
  if jsonb_typeof(v_draft.data->'included') <> 'array' or
     exists(select 1 from jsonb_array_elements_text(v_draft.data->'included') item
       where item not in ('eveningNote','knownAs','topicNote','matchNote')
         and item !~ '^followup:[a-z_]{1,40}$') then
    raise exception 'invalid included answer' using errcode='22023';
  end if;
  update public.profiles set
    name=btrim(p_conditions->>'name'),
    birth=v_birth,
    job=btrim(p_conditions->>'job'),
    photo_paths=v_photos,
    mbti=nullif(btrim(p_conditions->>'mbti'),''),
    smoking=p_conditions->>'smoking',
    drinking=p_conditions->>'drinking',
    religion=nullif(btrim(p_conditions->>'religion'),''),
    headline=v_headline,
    intro=v_intro,
    evening_note=case when v_draft.data->'included' ? 'eveningNote'
      then nullif(btrim(v_profile->>'eveningNote'),'') else null end,
    known_as=case when v_draft.data->'included' ? 'knownAs'
      then nullif(btrim(v_profile->>'knownAs'),'') else null end,
    topic_note=case when v_draft.data->'included' ? 'topicNote'
      then nullif(btrim(v_profile->>'topicNote'),'') else null end,
    match_note=case when v_draft.data->'included' ? 'matchNote'
      then nullif(btrim(v_profile->>'matchNote'),'') else null end,
    interests=coalesce((select array_agg(value) from jsonb_array_elements_text(
      coalesce(v_profile->'interests','[]'::jsonb)) value),'{}'::text[]),
    topics=coalesce((select array_agg(value) from jsonb_array_elements_text(
      coalesce(v_profile->'topics','[]'::jsonb)) value),'{}'::text[]),
    match_tags=coalesce((select array_agg(value) from jsonb_array_elements_text(
      coalesce(v_profile->'matchTags','[]'::jsonb)) value),'{}'::text[]),
    details=coalesce(v_profile->'details','{}'::jsonb),
    onboarding_step=7
   where id=v_uid returning * into v_saved;
  delete from public.profile_interview_drafts where user_id=v_uid;
  insert into public.events(user_id,name,props)
    values(v_uid,'profile_completed',jsonb_build_object('source','interview_v2'));
  return v_saved;
end $$;
