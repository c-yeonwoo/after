-- Approved interview copy is separate from the legacy 300-character card summary.
alter table public.profiles add column profile_story jsonb;
alter table public.profiles add constraint profile_story_v3_shape check (
  profile_story is null or (
    jsonb_typeof(profile_story) = 'object' and
    profile_story->>'version' = '3' and
    jsonb_typeof(profile_story->'sections') = 'array' and
    jsonb_array_length(profile_story->'sections') between 1 and 3 and
    octet_length(profile_story::text) <= 6000
  )
);

alter table public.profile_interview_drafts drop constraint profile_interview_drafts_data_check;
alter table public.profile_interview_drafts add constraint profile_interview_drafts_data_check check (
  jsonb_typeof(data) = 'object' and data->>'version' in ('2','3')
  and octet_length(data::text) <= 40000
);

create or replace function public.save_profile_interview_draft(p_data jsonb, p_expected_revision bigint)
returns bigint language plpgsql security definer set search_path = public, pg_temp as $$
declare v_uid uuid := auth.uid(); v_revision bigint;
begin
  if v_uid is null then raise exception 'unauthenticated' using errcode = '28000'; end if;
  if not exists(select 1 from public.profiles where id=v_uid and account_state='active') then
    raise exception 'active profile required' using errcode = '42501';
  end if;
  if p_expected_revision is null or p_expected_revision < 0 or
     p_data is null or jsonb_typeof(p_data) <> 'object' or
     p_data->>'version' not in ('2','3') or octet_length(p_data::text) > 40000 then
    raise exception 'invalid interview draft' using errcode = '22023';
  end if;
  if p_expected_revision = 0 then
    insert into public.profile_interview_drafts(user_id,revision,data)
      values(v_uid,1,p_data) on conflict (user_id) do nothing
      returning revision into v_revision;
  else
    update public.profile_interview_drafts
       set revision=revision+1,data=p_data,updated_at=now()
     where user_id=v_uid and revision=p_expected_revision
     returning revision into v_revision;
  end if;
  if v_revision is null then raise exception 'draft changed elsewhere' using errcode='PT409'; end if;
  return v_revision;
end $$;

-- Private evaluation trail. Never included in public profiles or admin lists.
create table public.profile_generation_versions (
  id bigint generated always as identity primary key,
  user_id uuid not null references public.profiles(id) on delete cascade,
  ai_run_id bigint references public.ai_runs(id),
  source_hash text not null check (source_hash ~ '^[0-9a-f]{64}$'),
  prompt_version text not null,
  model text not null,
  analysis jsonb not null,
  candidate jsonb not null,
  verification jsonb not null,
  created_at timestamptz not null default now()
);
create index profile_generation_versions_user_created
  on public.profile_generation_versions(user_id, created_at desc);
alter table public.profile_generation_versions enable row level security;
revoke all on public.profile_generation_versions from public, anon, authenticated;
grant select on public.profile_generation_versions to authenticated;
grant all on public.profile_generation_versions to service_role;
create policy profile_generation_versions_self on public.profile_generation_versions
  for select to authenticated using (user_id=auth.uid());

-- Append only: existing view consumers using its composite row type keep their fields.
create or replace view public.public_profiles as
select p.id, p.hub_id, p.name,
  case when p.birth is null then null else extract(year from age(p.birth))::int end as age,
  p.job, p.photo_url, p.mbti, p.smoking, p.drinking, p.religion,
  p.headline, p.intro, p.interests, p.match_tags, p.topics, p.details, p.photo_paths,
  p.profile_story
from public.profiles p
where (p.id = auth.uid() or (
  not public.is_excluded(auth.uid(), p.id) and (
    exists (select 1 from public.intros i where i.closed_at is null
      and ((i.male_id = auth.uid() and i.female_id = p.id)
        or (i.female_id = auth.uid() and i.male_id = p.id)))
    or exists (select 1 from public.meetings m join public.intros i on i.id = m.intro_id
      where m.cancelled_at is null
        and ((i.male_id = auth.uid() and i.female_id = p.id)
          or (i.female_id = auth.uid() and i.male_id = p.id)))
    or (public.my_gender() = 'female' and p.gender = 'male'
        and (public.member_readiness(auth.uid())->>'ready')::boolean
        and public.is_eligible_candidate(p.id))
  )
)) and (p.id = auth.uid() or not public.carrier_identity_required()
  or public.my_carrier_adult_verified() or public.is_admin());

-- V3 publication is atomic, including lifestyle and all visible copy. V2 clients
-- retain their existing RPC during rollout.
create function public.publish_profile_interview_v3(p_expected_revision bigint,p_conditions jsonb)
returns public.profiles language plpgsql security definer set search_path=public,pg_temp as $$
declare
  v_uid uuid := auth.uid();
  v_draft public.profile_interview_drafts;
  v_old public.profiles;
  v_saved public.profiles;
  v_story jsonb;
  v_headline text;
  v_summary text;
  v_answer text;
  v_section jsonb;
  v_photos text[];
  v_birth date;
  v_sections text[] := '{}';
begin
  if v_uid is null then raise exception 'unauthenticated' using errcode='28000'; end if;
  select * into v_draft from public.profile_interview_drafts where user_id=v_uid for update;
  if not found or v_draft.revision <> p_expected_revision then
    raise exception 'draft changed elsewhere' using errcode='PT409';
  end if;
  select * into v_old from public.profiles where id=v_uid and account_state='active' for update;
  if not found then raise exception 'active profile required' using errcode='42501'; end if;
  v_story := v_draft.data->'story';
  v_headline := btrim(v_story->>'headline');
  v_summary := btrim(v_story->>'summary');
  if v_draft.data->>'version' <> '3' or v_draft.data->>'stage' <> 'preview' or
     v_draft.data->>'sourceRevision' is distinct from v_draft.data->>'storySourceRevision' or
     v_story->>'version' <> '3' or
     char_length(coalesce(v_headline,'')) not between 3 and 35 or
     char_length(coalesce(v_summary,'')) not between 5 and 300 or
     jsonb_typeof(v_story->'sections') <> 'array' or
     jsonb_array_length(v_story->'sections') not between 1 and 3 or
     jsonb_typeof(v_story->'conversationHooks') <> 'array' or
     jsonb_array_length(v_story->'conversationHooks') > 2 or
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
  for v_section in select value from jsonb_array_elements(v_story->'sections') loop
    if v_section->>'id' not in ('daily_life','getting_closer','conversation') or
       v_section->>'id'=any(v_sections) or
       v_section->>'questionId' <> (v_section->>'id')||'_v1' or
       v_section->>'questionVersion' <> '1' or
       char_length(btrim(coalesce(v_section->>'question',''))) not between 5 and 80 or
       char_length(btrim(coalesce(v_section->>'answer',''))) not between 5 and 240 then
      raise exception 'invalid story section' using errcode='22023';
    end if;
    v_sections := array_append(v_sections,v_section->>'id');
  end loop;
  if exists(select 1 from jsonb_array_elements_text(v_story->'conversationHooks') h
    where char_length(h) > 100) then
    raise exception 'invalid conversation hook' using errcode='22023';
  end if;
  if (v_story::text) ~* '[a-z0-9._%+\-]+@[a-z0-9.\-]+\.[a-z]{2,}|(\+?82[- .]?)?0?1[016789][-. ]?[0-9]{3,4}[-. ]?[0-9]{4}|https?://[^[:space:]]+' then
    raise exception 'contact details cannot be published' using errcode='22023';
  end if;
  select array_agg(path) into v_photos from jsonb_array_elements_text(p_conditions->'photos') path;
  if exists(select 1 from unnest(v_photos) path where path is null or btrim(path)='') or
     not public.profile_photo_paths_distinct(v_photos) then
    raise exception 'invalid profile photos' using errcode='22023';
  end if;
  v_birth := (p_conditions->>'birth')::date;
  if extract(year from age((now() at time zone 'Asia/Seoul')::date,v_birth)) not between 19 and 79 or
     (v_old.identity_verified_at is not null and v_birth is distinct from v_old.birth) then
    raise exception 'adult birth required' using errcode='22023';
  end if;
  v_story := jsonb_set(v_story,'{publishedRevision}',to_jsonb(v_draft.revision));
  update public.profiles set
    name=btrim(p_conditions->>'name'), birth=v_birth, job=btrim(p_conditions->>'job'),
    photo_paths=v_photos, mbti=nullif(btrim(p_conditions->>'mbti'),''),
    smoking=p_conditions->>'smoking', drinking=p_conditions->>'drinking',
    religion=nullif(btrim(p_conditions->>'religion'),''),
    headline=v_headline, intro=v_summary, profile_story=v_story,
    evening_note=nullif(btrim(v_draft.data->'answers'->>'daily_life'),''),
    known_as=nullif(btrim(v_draft.data->'answers'->>'getting_closer'),''),
    topic_note=nullif(btrim(v_draft.data->'answers'->>'conversation'),''),
    onboarding_step=7
  where id=v_uid returning * into v_saved;
  delete from public.profile_interview_drafts where user_id=v_uid;
  insert into public.events(user_id,name,props)
    values(v_uid,'profile_completed',jsonb_build_object('source','interview_v3'));
  return v_saved;
end $$;
revoke all on function public.publish_profile_interview_v3(bigint,jsonb) from public,anon;
grant execute on function public.publish_profile_interview_v3(bigint,jsonb) to authenticated;
