-- Only explicitly approved choice IDs become public. Private choices are never backfilled.
create function public.profile_signal_options() returns jsonb language sql immutable set search_path=public,pg_temp as $$
 select '[{"id": "rhythm", "title": "퇴근 후 시간이 생기면 주로 어떻게 보내세요?", "max": 2, "options": ["혼자 푹 쉬기", "운동하기", "사람 만나기", "취미에 몰입하기", "동네 돌아보기"]}, {"id": "first_date", "title": "처음 만날 때 편한 자리는 어떤 쪽인가요?", "max": 2, "options": ["짧게 커피", "함께 걷기", "식사하며 대화", "가벼운 술자리", "활동이나 체험"]}, {"id": "closeness", "title": "어떤 순간에 상대와 가까워졌다고 느끼나요?", "max": 2, "options": ["일상을 나눌 때", "함께 무언가 할 때", "작은 배려를 느낄 때", "생각을 깊이 나눌 때"]}, {"id": "topics", "title": "만나면 자연스럽게 꺼내고 싶은 이야기는요?", "max": 3, "options": ["요즘 일상", "영화·드라마", "음식", "운동", "음악", "여행", "하는 일", "중요하게 생각하는 것"]}, {"id": "relationship_goal", "title": "어떤 관계를 기대하나요?", "max": 1, "options": ["좋은 사람과 진지한 연애", "천천히 알아가는 연애", "결혼도 생각하는 연애", "아직 알아가는 중"]}, {"id": "care", "title": "바쁜 날, 어떤 배려가 편한가요?", "max": 2, "options": ["짧게 안부 전하기", "이야기 들어주기", "혼자 쉴 시간 존중하기", "작은 약속 꾸준히 지키기"]}]'::jsonb
$$;
create function public.normalize_profile_signals(p_value jsonb) returns jsonb
language plpgsql immutable set search_path=public,pg_temp as $$
declare q jsonb; selected jsonb; result jsonb:='{}'; vals jsonb; option text;
begin
 if jsonb_typeof(p_value) is distinct from 'object' then return result; end if;
 for q in select value from jsonb_array_elements(public.profile_signal_options()) loop
  selected:=p_value->(q->>'id'); vals:='[]';
  if jsonb_typeof(selected) is distinct from 'array' then continue; end if;
  for option in select jsonb_array_elements_text(q->'options') loop
   if selected @> jsonb_build_array(option) and jsonb_array_length(vals)<(q->>'max')::int then vals:=vals||jsonb_build_array(option); end if;
  end loop;
  if jsonb_array_length(vals)>0 then result:=result||jsonb_build_object(q->>'id',vals); end if;
 end loop;
 return result;
end $$;
create function public.approved_profile_signals(p_draft jsonb) returns jsonb
language plpgsql immutable set search_path=public,pg_temp as $$
declare q jsonb; option text; idx int; result jsonb:='{}'; vals jsonb; choices jsonb;
begin
 if jsonb_typeof(p_draft->'publicIds') is distinct from 'array' then return result; end if;
 choices:=public.normalize_profile_signals(p_draft->'choices');
 for q in select value from jsonb_array_elements(public.profile_signal_options()) loop
  vals:='[]'; idx:=0;
  for option in select jsonb_array_elements_text(q->'options') loop
   if coalesce(choices->(q->>'id'),'[]') @> jsonb_build_array(option)
      and (p_draft->'publicIds') ? ('choice:'||(q->>'id')||':'||idx::text) then vals:=vals||jsonb_build_array(option); end if;
   idx:=idx+1;
  end loop;
  if jsonb_array_length(vals)>0 then result:=result||jsonb_build_object(q->>'id',vals); end if;
 end loop;
 return result;
end $$;
revoke all on function public.profile_signal_options(),public.normalize_profile_signals(jsonb),public.approved_profile_signals(jsonb) from public,anon;
grant execute on function public.profile_signal_options(),public.normalize_profile_signals(jsonb),public.approved_profile_signals(jsonb) to authenticated,service_role;

alter table public.profiles add column profile_public_signals jsonb not null default '{}'::jsonb
 check (octet_length(profile_public_signals::text)<=4000 and profile_public_signals=public.normalize_profile_signals(profile_public_signals));

-- A client cannot expose a private preference by directly assigning the public projection.
create function public.guard_profile_public_signals() returns trigger language plpgsql set search_path=public,pg_temp as $$
begin
 if current_user in ('authenticated','anon') and
   ((tg_op='INSERT' and new.profile_public_signals<>'{}') or
    (tg_op='UPDATE' and new.profile_public_signals is distinct from old.profile_public_signals)) then
  raise exception 'publish approved profile choices instead' using errcode='42501';
 end if;
 return new;
end $$;
revoke all on function public.guard_profile_public_signals() from public,anon,authenticated;
create trigger profiles_guard_public_signals_insert before insert on public.profiles for each row execute function public.guard_profile_public_signals();
create trigger profiles_guard_public_signals_update before update of profile_public_signals on public.profiles for each row execute function public.guard_profile_public_signals();

create or replace function public.approve_profile_story_sources() returns trigger
language plpgsql security definer set search_path=public,pg_temp as $$
declare v_data jsonb;
begin
  if new.profile_story is null or new.profile_story is not distinct from old.profile_story then return new; end if;
  if auth.uid()=new.id and coalesce((select assistant_profile_edit_enabled from app_settings where id),false)
    and exists(select 1 from profile_revision_drafts d where d.owner_id=new.id and d.state='approved'
      and d.approved_at=transaction_timestamp() and d.after_story=new.profile_story
      and d.source_document=public.profile_revision_document(old)) then
    new.profile_preferences:=old.profile_preferences;
    new.profile_public_signals:=old.profile_public_signals;
    return new;
  end if;
  select data into v_data from public.profile_interview_drafts
    where user_id=new.id and data->>'version'='3' and data->>'stage'='preview';
  if v_data is null then raise exception 'approved interview draft required' using errcode='22023'; end if;
  if jsonb_typeof(v_data->'publicIds')<>'array' then raise exception 'public scope required' using errcode='22023'; end if;
  new.profile_preferences:=jsonb_build_object('version',1,'choices',coalesce(v_data->'choices','{}'::jsonb),'choiceCustom',coalesce(v_data->'choiceCustom','{}'::jsonb));
  new.profile_public_signals:=public.approved_profile_signals(v_data);
  if not (v_data->'publicIds' ? 'answer:daily_life') then new.evening_note:=null; end if;
  if not (v_data->'publicIds' ? 'answer:getting_closer') then new.known_as:=null; end if;
  if not (v_data->'publicIds' ? 'answer:conversation') then new.topic_note:=null; end if;
  return new;
end $$;
revoke all on function public.approve_profile_story_sources() from public,anon,authenticated;


create or replace view public.public_profiles as
select p.id, p.hub_id, p.name,
  case when p.birth is null then null else extract(year from age(p.birth))::int end as age,
  p.job, p.photo_url, p.mbti, p.smoking, p.drinking, p.religion,
  p.headline, p.intro, p.interests, p.match_tags, p.topics, p.details, p.photo_paths,
  p.profile_story, p.profile_public_signals
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


create function public.clear_inactive_profile_signals() returns trigger language plpgsql set search_path=public,pg_temp as $$
begin
 if new.account_state<>'active' then new.profile_public_signals:='{}'; end if;
 return new;
end $$;
revoke all on function public.clear_inactive_profile_signals() from public,anon,authenticated;
create trigger profiles_clear_inactive_signals before update of account_state on public.profiles for each row execute function public.clear_inactive_profile_signals();
notify pgrst,'reload schema';

-- Publishing identical prose must still advance its approval revision and refresh selected choices.
create or replace function public.publish_profile_interview_v3(p_expected_revision bigint,p_conditions jsonb)
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
  v_story := jsonb_set(v_story,'{publishedRevision}',to_jsonb(greatest(v_draft.revision, coalesce((v_old.profile_story->>'publishedRevision')::bigint,0)+1)));
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

-- Scheduling overlap and waiting priority remain unchanged; these are support counts, not chemistry probabilities.
create or replace function public.curation_recommendation_tick(p_male uuid default null) returns integer
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
  cross join lateral (select count(*)::integer n from unnest(array['rhythm','first_date','closeness','topics','relationship_goal','care']) k
    where exists(select 1 from jsonb_array_elements_text(case
      when jsonb_typeof(m.profile_public_signals->k)='array' then m.profile_public_signals->k
      else '[]'::jsonb end) x
      where (case when jsonb_typeof(f.profile_public_signals->k)='array'
        then f.profile_public_signals->k else '[]'::jsonb end) ? x)) dimensions
  cross join lateral (select count(distinct x)::integer n from unnest(m.interests) x
    where x=any(f.interests) and btrim(x)<>'' and m.profile_story is null and f.profile_story is null) shared
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


create or replace function public.pair_brief_context(p_male uuid,p_female uuid) returns jsonb
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
    'job',p.job,'profile_story',p.profile_story,'profile_public_signals',p.profile_public_signals,
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


-- The owner can receive advice from their own approved preferences without another model call.
create or replace function public.assistant_turn_context(p_id uuid) returns jsonb
language plpgsql stable security definer set search_path=public,pg_temp as $$
declare u uuid:=public.assistant_require_owner(); t assistant_turns; p assistant_preferences;
begin
  select * into t from assistant_turns where id=p_id and owner_id=u;
  select * into p from assistant_preferences where owner_id=u;
  if t.id is null or t.state<>'pending' or t.created_at<now()-interval '2 minutes' or t.expires_at<=now()
    or p.consented_at is null or p.policy_version is distinct from 'manager-continuity-v2' or p.revision<>t.privacy_revision or t.session_id is distinct from p.session_id
    or not (select assistant_chat_enabled from app_settings where id) then
    raise exception 'context unavailable' using errcode='PT409'; end if;
  return jsonb_build_object('revision',p.revision,'session_id',p.session_id,'question',t.question,
    'owner_profile',(select jsonb_build_object(
      'age',extract(year from age(pr.birth))::int,'job',pr.job,
      'introduction_area',pr.hub_id,'mbti',pr.mbti,'headline',pr.headline,
      'intro',pr.intro,'profile_story',pr.profile_story,'profile_public_signals',pr.profile_public_signals)
      from profiles pr where pr.id=u),
    'related_history',coalesce((select jsonb_agg(to_jsonb(r) order by r.created_at) from (
      select old.question,old.created_at from assistant_turns old
      where old.owner_id=u and old.session_id=p.session_id and old.state='complete'
        and old.kind='conversation' and old.expires_at>now() and (old.created_at,old.id)<(t.created_at,t.id)
        and old.id not in (select recent.id from assistant_turns recent where recent.owner_id=u
          and recent.session_id=p.session_id and recent.state='complete' and recent.kind='conversation'
          and recent.expires_at>now() and (recent.created_at,recent.id)<(t.created_at,t.id)
          order by recent.created_at desc,recent.id desc limit 6)
        and exists(select 1 from (select word from regexp_split_to_table(t.question,'[^가-힣a-zA-Z0-9]+') word
          where length(word)>=2 order by length(word) desc,word limit 8) terms
          where strpos(lower(old.question),lower(terms.word))>0)
      order by old.created_at desc,old.id desc limit 4
    ) r),'[]'::jsonb),
    'history',coalesce((select jsonb_agg(to_jsonb(h) order by h.created_at,h.id) from
      (select id,question,answer,created_at from assistant_turns where owner_id=u and session_id=p.session_id and state='complete'
        and kind='conversation' and expires_at>now() and (created_at,id)<(t.created_at,t.id)
        order by created_at desc,id desc limit 6) h),'[]'::jsonb),
    'memories',case when (select assistant_memory_enabled from app_settings where id) then
      coalesce((select jsonb_agg(content order by approved_at) from assistant_memories where owner_id=u and expires_at>now()),'[]'::jsonb) else '[]'::jsonb end);
end $$;


drop trigger profiles_invalidate_pair_reasons on public.profiles;
create trigger profiles_invalidate_pair_reasons after update of profile_public_signals,profile_story,job,intro,interests,
  match_tags,topics,details,evening_note,known_as,topic_note,match_note,hub_id,paused_at,
  photo_state,phone_verified_at,account_state on public.profiles
  for each row execute function public.invalidate_unopened_pair_reasons();
