-- A member's unfinished interview is private even when their published profile
-- is readable by a counterpart. The old four-question clients keep working.
create table public.profile_interview_drafts (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  revision bigint not null default 1 check (revision > 0),
  data jsonb not null check (
    jsonb_typeof(data) = 'object' and data->>'version' = '2'
    and octet_length(data::text) <= 24000
  ),
  updated_at timestamptz not null default now()
);
alter table public.profile_interview_drafts enable row level security;
revoke all on public.profile_interview_drafts from public, anon, authenticated;
grant select on public.profile_interview_drafts to authenticated;
grant select, insert, update, delete on public.profile_interview_drafts to service_role;
create policy profile_interview_drafts_self on public.profile_interview_drafts
  for select to authenticated using (user_id = auth.uid());

create function public.save_profile_interview_draft(p_data jsonb, p_expected_revision bigint)
returns bigint language plpgsql security definer set search_path = public, pg_temp as $$
declare v_uid uuid := auth.uid(); v_revision bigint;
begin
  if v_uid is null then raise exception 'unauthenticated' using errcode = '28000'; end if;
  if not exists(select 1 from public.profiles where id=v_uid and account_state='active') then
    raise exception 'active profile required' using errcode = '42501';
  end if;
  if p_expected_revision is null or p_expected_revision < 0 or
     p_data is null or jsonb_typeof(p_data) <> 'object' or
     p_data->>'version' <> '2' or octet_length(p_data::text) > 24000 then
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
revoke all on function public.save_profile_interview_draft(jsonb,bigint) from public,anon;
grant execute on function public.save_profile_interview_draft(jsonb,bigint) to authenticated;

-- This is the only point where a v2 draft becomes a visible profile. The
-- profile update and removal of the private draft commit in one transaction.
create function public.publish_profile_interview(p_expected_revision bigint,p_conditions jsonb)
returns public.profiles language plpgsql security definer set search_path=public,pg_temp as $$
declare
  v_uid uuid := auth.uid();
  v_draft public.profile_interview_drafts;
  v_profile jsonb;
  v_intro text;
  v_headline text;
  v_saved public.profiles;
begin
  if v_uid is null then raise exception 'unauthenticated' using errcode='28000'; end if;
  select * into v_draft from public.profile_interview_drafts
   where user_id=v_uid for update;
  if not found or v_draft.revision <> p_expected_revision then
    raise exception 'draft changed elsewhere' using errcode='PT409';
  end if;
  if not exists(select 1 from public.profiles where id=v_uid and account_state='active') then
    raise exception 'active profile required' using errcode='42501';
  end if;
  v_profile := v_draft.data->'profile';
  v_intro := btrim(v_draft.data->>'intro');
  v_headline := btrim(v_profile->>'headline');
  if v_draft.data->>'stage' <> 'preview' or
     v_profile is null or jsonb_typeof(v_profile) <> 'object' or
     char_length(coalesce(v_headline,'')) not between 3 and 35 or
     char_length(coalesce(v_intro,'')) not between 5 and 300 or
     p_conditions is null or jsonb_typeof(p_conditions) <> 'object' or
     coalesce(p_conditions->>'smoking','') = '' or
     coalesce(p_conditions->>'drinking','') = '' then
    raise exception 'incomplete approved profile' using errcode='22023';
  end if;
  if exists(select 1 from jsonb_array_elements_text(coalesce(v_draft.data->'included','[]'::jsonb)) item
    where item not in ('eveningNote','knownAs','topicNote','matchNote')
      and item !~ '^followup:[a-z_]{1,40}$') then
    raise exception 'invalid included answer' using errcode='22023';
  end if;
  update public.profiles set
    mbti=nullif(btrim(p_conditions->>'mbti'),''),
    smoking=nullif(btrim(p_conditions->>'smoking'),''),
    drinking=nullif(btrim(p_conditions->>'drinking'),''),
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
revoke all on function public.publish_profile_interview(bigint,jsonb) from public,anon;
grant execute on function public.publish_profile_interview(bigint,jsonb) to authenticated;

create function public.erase_profile_interview_draft_on_withdraw()
returns trigger language plpgsql security definer set search_path=public,pg_temp as $$
begin
  if old.account_state is distinct from 'withdrawn' and new.account_state='withdrawn' then
    delete from public.profile_interview_drafts where user_id=new.id;
  end if;
  return new;
end $$;
revoke all on function public.erase_profile_interview_draft_on_withdraw() from public,anon,authenticated;
create trigger profiles_erase_interview_draft after update of account_state on public.profiles
  for each row execute function public.erase_profile_interview_draft_on_withdraw();

-- Question selection has an independent, small budget so it cannot consume
-- all of a member's writing quota before they reach the preview.
alter table public.ai_runs drop constraint ai_runs_feature_check;
alter table public.ai_runs add constraint ai_runs_feature_check
  check (feature in ('profile_copy','profile_followup','pair_brief'));
create or replace function public.reserve_ai_run(
  p_user uuid,p_feature text,p_source_hash text,p_request_id uuid,
  p_prompt_version text,p_model text
) returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare v_limit integer; v_id bigint; v_duplicate bigint;
begin
  if p_feature='profile_copy' then v_limit:=5;
  elsif p_feature='profile_followup' then v_limit:=5;
  elsif p_feature='pair_brief' then v_limit:=60;
  else raise exception 'invalid feature' using errcode='22023'; end if;
  if p_user is null or p_request_id is null or
     p_source_hash !~ '^[0-9a-f]{64}$' or p_source_hash is null or
     char_length(p_prompt_version) not between 1 and 60 or
     char_length(p_model) not between 1 and 80 then
    raise exception 'invalid reservation' using errcode='22023';
  end if;
  perform pg_advisory_xact_lock(hashtextextended(p_user::text||':'||p_feature,0));
  if not exists(select 1 from public.profiles where id=p_user and account_state='active') then
    raise exception 'inactive account' using errcode='42501';
  end if;
  select id into v_duplicate from public.ai_runs where request_id=p_request_id;
  if found then
    return jsonb_build_object('reserved',false,'reason','duplicate_request','run_id',v_duplicate);
  end if;
  update public.ai_runs set status='error',finished_at=now()
   where user_id=p_user and feature=p_feature and status='reserved'
     and created_at<now()-interval '2 minutes';
  select id into v_duplicate from public.ai_runs
   where user_id=p_user and feature=p_feature and source_hash=p_source_hash
     and status='reserved' and created_at>=now()-interval '2 minutes'
   order by created_at desc limit 1;
  if found then
    return jsonb_build_object('reserved',false,'reason','in_progress');
  end if;
  if (select count(*) from public.ai_runs
      where user_id=p_user and feature=p_feature
        and created_at>=now()-interval '24 hours')>=v_limit then
    return jsonb_build_object('reserved',false,'reason','daily_limit');
  end if;
  insert into public.ai_runs(user_id,feature,prompt_version,model,status,request_id,source_hash)
    values(p_user,p_feature,p_prompt_version,p_model,'reserved',p_request_id,p_source_hash)
    returning id into v_id;
  return jsonb_build_object('reserved',true,'run_id',v_id);
end $$;
