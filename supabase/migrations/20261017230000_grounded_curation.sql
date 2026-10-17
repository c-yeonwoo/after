-- A recommendation is an operator's draft, never an automatic introduction.
-- Ranking uses declared preferences / fresh availability, not attractiveness,
-- MBTI, inferred personality, purchase history or the length of someone's copy.
create table public.curation_recommendations (
  male_id uuid not null references public.profiles(id) on delete cascade,
  female_id uuid not null references public.profiles(id) on delete cascade,
  score integer not null,
  preference_dimensions integer not null,
  shared_interests integer not null,
  schedule_overlap integer,
  liked_at timestamptz not null,
  computed_at timestamptz not null default now(),
  primary key(male_id,female_id)
);
create table public.curation_batch_state (
  singleton boolean primary key default true check(singleton),
  last_success_at timestamptz not null,
  pair_count integer not null
);
create table public.pair_brief_drafts (
  male_id uuid not null references public.profiles(id) on delete cascade,
  female_id uuid not null references public.profiles(id) on delete cascade,
  source_hash text not null check(source_hash ~ '^[0-9a-f]{64}$'),
  prompt_version text not null,
  model text not null,
  brief jsonb not null check(jsonb_typeof(brief)='object' and octet_length(brief::text)<=16000),
  ai_run_id bigint not null references public.ai_runs(id),
  generated_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  primary key(male_id,female_id)
);
create table public.pair_reason_approvals (
  male_id uuid not null references public.profiles(id) on delete cascade,
  female_id uuid not null references public.profiles(id) on delete cascade,
  source_hash text not null,
  reason_hash text not null,
  primary key(male_id,female_id)
);
alter table public.curation_recommendations enable row level security;
alter table public.curation_batch_state enable row level security;
alter table public.pair_brief_drafts enable row level security;
alter table public.pair_reason_approvals enable row level security;
revoke all on public.curation_recommendations,public.curation_batch_state,public.pair_brief_drafts
  from public,anon,authenticated;
revoke all on public.pair_reason_approvals from public,anon,authenticated;
grant select on public.pair_brief_drafts to service_role;

-- Includes only material already approved for a public introduction. Private
-- choices, contact patterns, availability, names, photos and birthdays stay out.
create function public.pair_brief_context(p_male uuid,p_female uuid) returns jsonb
language plpgsql stable security definer set search_path=public,pg_temp as $$
declare m public.profiles; f public.profiles; material jsonb;
begin
  select p.* into m from public.profiles p join public.eligible_profiles e on e.id=p.id
    where p.id=p_male and p.gender='male';
  select p.* into f from public.profiles p join public.eligible_profiles e on e.id=p.id
    where p.id=p_female and p.gender='female';
  if m.id is null or f.id is null or m.hub_id<>f.hub_id or public.is_excluded(m.id,f.id)
     or not exists(select 1 from public.affinities a where a.from_id=f.id and a.to_id=m.id and a.verdict='like') then
    return null;
  end if;
  select jsonb_object_agg(person, jsonb_build_object(
    'job',p.job,'profile_story',p.profile_story,
    'intro',case when p.profile_story is null then p.intro end,
    'evening_note',case when p.profile_story is null then p.evening_note end,
    'known_as',case when p.profile_story is null then p.known_as end,
    'topic_note',case when p.profile_story is null then p.topic_note end,
    'match_note',case when p.profile_story is null then p.match_note end,
    'interests',case when p.profile_story is null then p.interests else '{}'::text[] end,
    'match_tags',case when p.profile_story is null then p.match_tags else '{}'::text[] end,
    'topics',case when p.profile_story is null then p.topics else '{}'::text[] end,
    'details',case when p.profile_story is null then p.details else '{}'::jsonb end
  )) into material from (select 'a' person,m.* union all select 'b',f.*) p;
  return jsonb_build_object('sources',material,'source_hash',
    encode(extensions.digest(material::text,'sha256'),'hex'));
end $$;
revoke all on function public.pair_brief_context(uuid,uuid) from public,anon,authenticated;
grant execute on function public.pair_brief_context(uuid,uuid) to service_role;

create function public.store_pair_brief_draft(p_male uuid,p_female uuid,p_hash text,p_brief jsonb,
  p_run_id bigint,p_prompt text,p_model text,p_actor uuid) returns boolean
language plpgsql security definer set search_path=public,pg_temp as $$
declare c jsonb;
begin
  perform 1 from public.profiles where id in (p_male,p_female,p_actor) order by id for share;
  c:=public.pair_brief_context(p_male,p_female);
  if c is null or c->>'source_hash' is distinct from p_hash then return false; end if;
  if not exists(select 1 from public.ai_runs r join public.profiles p on p.id=r.user_id
    where r.id=p_run_id and r.user_id=p_actor and r.feature='pair_brief' and r.status='success'
      and p.role='admin' and p.account_state='active') or
    not coalesce((p_brief->>'verified')::boolean,false) then
    raise exception 'verified admin run required' using errcode='42501';
  end if;
  insert into public.pair_brief_drafts(male_id,female_id,source_hash,prompt_version,model,brief,ai_run_id,generated_by)
    values(p_male,p_female,p_hash,p_prompt,p_model,p_brief,p_run_id,p_actor)
    on conflict(male_id,female_id) do update set source_hash=excluded.source_hash,
      prompt_version=excluded.prompt_version,model=excluded.model,brief=excluded.brief,
      ai_run_id=excluded.ai_run_id,generated_by=excluded.generated_by,created_at=now();
  return true;
end $$;
revoke all on function public.store_pair_brief_draft(uuid,uuid,text,jsonb,bigint,text,text,uuid) from public,anon,authenticated;
grant execute on function public.store_pair_brief_draft(uuid,uuid,text,jsonb,bigint,text,text,uuid) to service_role;

create function public.curation_recommendation_tick(p_male uuid default null) returns integer
language plpgsql security definer set search_path=public,pg_temp as $$
declare n integer;
begin
  -- The global and per-member refreshes share a lock: never overwrite each
  -- other's newer snapshot. A read can keep the last snapshot if another runs.
  if not pg_try_advisory_xact_lock(hashtextextended('curation_recommendation_tick',0)) then return 0; end if;
  delete from public.curation_recommendations where p_male is null or male_id=p_male;
  insert into public.curation_recommendations(male_id,female_id,score,
    preference_dimensions,shared_interests,schedule_overlap,liked_at)
  select m.id,f.id,
    dimensions.n + least(shared.n,2) + case when availability.n>0 then 3 else 0 end,
    dimensions.n,shared.n,availability.n,a.created_at
  from public.affinities a
  join public.eligible_profiles em on em.id=a.to_id and em.gender='male'
  join public.eligible_profiles ef on ef.id=a.from_id and ef.gender='female' and ef.hub_id=em.hub_id
  join public.profiles m on m.id=em.id join public.profiles f on f.id=ef.id
  left join public.meet_windows mw on mw.user_id=m.id and mw.updated_at>now()-interval '14 days'
  left join public.meet_windows fw on fw.user_id=f.id and fw.updated_at>now()-interval '14 days'
  cross join lateral (select count(*)::integer n from unnest(array['first_date','closeness','topics']) k
    where exists(select 1 from jsonb_array_elements_text(case
      when jsonb_typeof(m.profile_preferences->'choices'->k)='array' then m.profile_preferences->'choices'->k
      else '[]'::jsonb end) x
      where (case when jsonb_typeof(f.profile_preferences->'choices'->k)='array'
        then f.profile_preferences->'choices'->k else '[]'::jsonb end) ? x)) dimensions
  cross join lateral (select count(distinct x)::integer n from unnest(m.interests) x
    where x=any(f.interests) and btrim(x)<>'') shared
  cross join lateral (select case when mw.user_id is null or fw.user_id is null then null
    else (select count(distinct x)::integer from unnest(mw.weekdays) x where x=any(fw.weekdays)) end n) availability
  where a.verdict='like' and (p_male is null or m.id=p_male)
    and not public.is_excluded(m.id,f.id)
    and not exists(select 1 from public.intros i where i.male_id=m.id and i.female_id=f.id)
    and not exists(select 1 from public.intro_queue q where q.male_id=m.id and q.female_id=f.id);
  get diagnostics n=row_count;
  if p_male is null then
    insert into public.curation_batch_state values(true,now(),n)
      on conflict(singleton) do update set last_success_at=excluded.last_success_at,pair_count=excluded.pair_count;
  end if;
  -- Text is a short-lived drafting aid, not a second permanent profile store.
  delete from public.pair_brief_drafts where created_at<now()-interval '24 hours';
  return n;
end $$;
revoke all on function public.curation_recommendation_tick(uuid) from public,anon,authenticated;
grant execute on function public.curation_recommendation_tick(uuid) to service_role;

create function public.admin_curation_recommendations(p_male uuid) returns jsonb
language plpgsql security definer set search_path=public,pg_temp as $$
begin
  if not public.is_admin() then raise exception 'admin only' using errcode='42501'; end if;
  perform public.curation_recommendation_tick(p_male);
  return jsonb_build_object('batch', (select to_jsonb(s)-'singleton' from public.curation_batch_state s),
    'as_of',now(),'items',coalesce((select jsonb_agg(to_jsonb(r) order by
      (r.liked_at<now()-interval '72 hours') desc,r.score desc,r.liked_at,r.female_id)
      from public.curation_recommendations r
      join public.eligible_profiles m on m.id=r.male_id
      join public.eligible_profiles f on f.id=r.female_id and f.hub_id=m.hub_id
      where r.male_id=p_male and not public.is_excluded(r.male_id,r.female_id)
        and exists(select 1 from public.affinities a where a.from_id=r.female_id and a.to_id=r.male_id and a.verdict='like')
        and not exists(select 1 from public.intros i where i.male_id=r.male_id and i.female_id=r.female_id)
        and not exists(select 1 from public.intro_queue q where q.male_id=r.male_id and q.female_id=r.female_id)), '[]'::jsonb));
end $$;
revoke all on function public.admin_curation_recommendations(uuid) from public,anon;
grant execute on function public.admin_curation_recommendations(uuid) to authenticated;

-- Approval uses the exact verified draft and rechecks the pair + public source
-- fingerprint. A stale browser cannot publish a reason after a profile changes.
create function public.admin_apply_pair_reason(p_male uuid,p_female uuid,p_source_hash text,p_run_id bigint) returns text
language plpgsql security definer set search_path=public,pg_temp as $$
declare c jsonb; d public.pair_brief_drafts; reason text;
begin
  if not public.is_admin() then raise exception 'admin only' using errcode='42501'; end if;
  -- Serialize publication with profile edits; re-check after acquiring both.
  perform 1 from public.profiles where id in (p_male,p_female) order by id for share;
  c:=public.pair_brief_context(p_male,p_female);
  if c is null or c->>'source_hash' is distinct from p_source_hash then
    raise exception 'profile changed; generate again' using errcode='PT409';
  end if;
  if not exists(select 1 from public.intro_queue where male_id=p_male and female_id=p_female
    and opened_at is null and (expires_at is null or expires_at>now())) then
    raise exception 'queue changed; review again' using errcode='PT409';
  end if;
  select * into d from public.pair_brief_drafts where male_id=p_male and female_id=p_female
    and source_hash=p_source_hash and ai_run_id=p_run_id and created_at>now()-interval '24 hours' for share;
  reason:=btrim(d.brief->'recommendation'->>'text');
  if d.ai_run_id is null or char_length(coalesce(reason,'')) not between 20 and 120
     or not coalesce((d.brief->>'verified')::boolean,false)
     or not exists(select 1 from public.ai_runs where id=d.ai_run_id and status='success') then
    raise exception 'verified recommendation required' using errcode='22023';
  end if;
  perform public.admin_set_queue_reason(p_male,p_female,reason);
  insert into public.pair_reason_approvals values(p_male,p_female,p_source_hash,
    encode(extensions.digest(reason,'sha256'),'hex'))
    on conflict(male_id,female_id) do update set source_hash=excluded.source_hash,reason_hash=excluded.reason_hash;
  return reason;
end $$;
revoke all on function public.admin_apply_pair_reason(uuid,uuid,text,bigint) from public,anon;
grant execute on function public.admin_apply_pair_reason(uuid,uuid,text,bigint) to authenticated;

create function public.erase_curation_drafts_on_withdraw() returns trigger
language plpgsql security definer set search_path=public,pg_temp as $$
begin
  if new.account_state='withdrawn' and old.account_state is distinct from 'withdrawn' then
    delete from public.pair_brief_drafts where male_id=new.id or female_id=new.id;
    delete from public.curation_recommendations where male_id=new.id or female_id=new.id;
    delete from public.pair_reason_approvals where male_id=new.id or female_id=new.id;
  end if;
  return new;
end $$;
revoke all on function public.erase_curation_drafts_on_withdraw() from public,anon,authenticated;
create trigger profiles_erase_curation_drafts before update of account_state on public.profiles
  for each row execute function public.erase_curation_drafts_on_withdraw();

-- Undelivered / unopened introductions must not retain AI prose whose evidence
-- changed. Already-opened introductions keep their introduction-time snapshot.
-- Do not erase a separately edited human note: compare the approved text hash.
create function public.invalidate_unopened_pair_reasons() returns trigger
language plpgsql security definer set search_path=public,pg_temp as $$
declare r record; c jsonb;
begin
  for r in select * from public.pair_reason_approvals where male_id=new.id or female_id=new.id loop
    c:=public.pair_brief_context(r.male_id,r.female_id);
    if c is null or c->>'source_hash' is distinct from r.source_hash then
      update public.intro_queue set reason=null where male_id=r.male_id and female_id=r.female_id
        and opened_at is null and encode(extensions.digest(reason,'sha256'),'hex')=r.reason_hash;
      delete from public.pair_reason_approvals where male_id=r.male_id and female_id=r.female_id;
    end if;
  end loop;
  return new;
end $$;
revoke all on function public.invalidate_unopened_pair_reasons() from public,anon,authenticated;
create trigger profiles_invalidate_pair_reasons after update of profile_story,job,intro,interests,
  match_tags,topics,details,evening_note,known_as,topic_note,match_note,hub_id,paused_at,
  photo_state,phone_verified_at,account_state on public.profiles
  for each row execute function public.invalidate_unopened_pair_reasons();
select cron.schedule('curation_recommendations_15m','*/15 * * * *',
  $$ select public.curation_recommendation_tick(); $$);
