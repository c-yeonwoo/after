-- Personal manager: explicit renewal, continuous owner archive, bounded grounding.
-- No production feature flags are enabled. No existing consent or TTL is rewritten.
create or replace function public.assistant_manager_consent(p_agree boolean,p_policy_version text) returns jsonb
language plpgsql security definer set search_path=public,pg_temp as $$
declare u uuid:=public.assistant_require_owner();
begin
  if p_policy_version is distinct from 'manager-continuity-v2' then raise exception 'policy changed' using errcode='PT409'; end if;
  if p_agree is null then raise exception 'choose consent' using errcode='22023'; end if;
  if p_agree and not (select assistant_chat_enabled from app_settings where id) then
    raise exception 'feature disabled' using errcode='PT403'; end if;
  insert into assistant_preferences(owner_id) values(u) on conflict do nothing;
  perform 1 from assistant_preferences where owner_id=u for update;
  if not p_agree then
    delete from assistant_turns where owner_id=u;
    delete from assistant_memories where owner_id=u;
  end if;
  update assistant_preferences set consented_at=case when p_agree then now() end,
    policy_version=case when p_agree then 'manager-continuity-v2' end,revision=revision+1 where owner_id=u;
  if p_agree then
    -- Only explicit renewal extends still-live records; expired records stay expired.
    update assistant_turns set expires_at='infinity'::timestamptz
      where owner_id=u and expires_at>now();
  end if;
  return my_assistant_state();
end $$;

revoke all on function public.assistant_manager_consent(boolean,text) from public,anon;
grant execute on function public.assistant_manager_consent(boolean,text) to authenticated;

-- Old clients cannot acknowledge a notice they have never seen.
create or replace function public.assistant_consent(p_agree boolean) returns jsonb
language plpgsql security definer set search_path=public,pg_temp as $$
declare u uuid:=public.assistant_require_owner();
begin
  if p_agree is null then raise exception 'choose consent' using errcode='22023'; end if;
  if p_agree and not (select assistant_chat_enabled from app_settings where id) then
    raise exception 'feature disabled' using errcode='PT403'; end if;
  insert into assistant_preferences(owner_id) values(u) on conflict do nothing;
  perform 1 from assistant_preferences where owner_id=u for update;
  if not p_agree then
    delete from assistant_turns where owner_id=u;
    delete from assistant_memories where owner_id=u;
  end if;
  update assistant_preferences set consented_at=case when p_agree then now() end,
    policy_version=case when p_agree then 'assistant-private-v1' end,revision=revision+1 where owner_id=u;
  return my_assistant_state();
end $$;
revoke all on function public.assistant_consent(boolean) from public,anon;
grant execute on function public.assistant_consent(boolean) to authenticated;

create or replace function public.assistant_bind_turn_session() returns trigger
language plpgsql security definer set search_path=public,pg_temp as $$
declare p assistant_preferences;
begin
  select * into p from assistant_preferences where owner_id=new.owner_id for update;
  if p.consented_at is null or p.session_id is null or p.revision is distinct from new.privacy_revision then
    raise exception 'context changed' using errcode='PT409';
  end if;
  new.session_id:=p.session_id;
  if p.policy_version='manager-continuity-v2' then new.expires_at:='infinity'::timestamptz; end if;
  return new;
end $$;

create or replace function public.my_assistant_state() returns jsonb
language plpgsql stable security definer set search_path=public,pg_temp as $$
declare u uuid:=public.assistant_require_owner(); p assistant_preferences;
begin
  select * into p from assistant_preferences where owner_id=u;
  return jsonb_build_object('flags',public.assistant_capabilities(),
    'consented',p.consented_at is not null and p.policy_version='manager-continuity-v2','revision',coalesce(p.revision,0),'session_id',p.session_id,
    'memories',coalesce((select jsonb_agg(to_jsonb(t) order by t.approved_at desc) from
      (select id,content,version,source_kind,approved_at,expires_at from assistant_memories
        where owner_id=u and expires_at>now() and p.consented_at is not null) t),'[]'::jsonb),
    'turns',public.assistant_history()->'turns');
end $$;

create or replace function public.assistant_begin_turn(p_id uuid,p_question text,p_expected_revision bigint) returns jsonb
language plpgsql security definer set search_path=public,pg_temp as $$
declare u uuid:=public.assistant_require_owner(); p assistant_preferences; t assistant_turns;
begin
  select * into p from assistant_preferences where owner_id=u for update;
  if p.consented_at is null or p.policy_version is distinct from 'manager-continuity-v2' or not (select assistant_chat_enabled from app_settings where id) then
    raise exception 'consent required or disabled' using errcode='PT403'; end if;
  if p.revision is distinct from p_expected_revision then raise exception 'context changed' using errcode='PT409'; end if;
  delete from assistant_memories where owner_id=u and expires_at<=now();
  -- Legacy preference expiry fences pending responses without erasing the archive.
  select * into p from assistant_preferences where owner_id=u;
  if p_id is null or p_question is null or length(btrim(p_question)) not between 1 and 1000 then
    raise exception 'invalid question' using errcode='22023'; end if;
  select * into t from assistant_turns where id=p_id;
  if found then
    if t.owner_id<>u or t.question<>btrim(p_question) or t.session_id<>p.session_id then
      raise exception 'request conflict' using errcode='PT409'; end if;
    return jsonb_build_object('id',t.id,'session_id',t.session_id,
      'state',case when t.state='pending' and t.created_at<=now()-interval '2 minutes' then 'failed' else t.state end,
      'revision',t.privacy_revision,'created',false);
  end if;
  if exists(select 1 from assistant_turns where owner_id=u and state='pending' and created_at>now()-interval '2 minutes') then
    raise exception 'turn in progress' using errcode='PT409'; end if;
  insert into assistant_turns(id,owner_id,privacy_revision,question) values(p_id,u,p.revision,btrim(p_question));
  return jsonb_build_object('id',p_id,'session_id',p.session_id,'state','pending','revision',p.revision,'created',true);
end $$;

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
      'intro',pr.intro,'profile_story',pr.profile_story)
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

create or replace function public.fence_deleted_assistant_memory() returns trigger
language plpgsql security definer set search_path=public,pg_temp as $$
begin
  perform 1 from assistant_preferences where owner_id=old.owner_id for update;
  if old.expires_at<=now() and exists(select 1 from assistant_preferences
      where owner_id=old.owner_id and policy_version='manager-continuity-v2') then
    -- Expiry stops using the preference, but does not erase the renewed archive.
    update assistant_preferences set revision=revision+1 where owner_id=old.owner_id;
    update assistant_turns set state='failed' where owner_id=old.owner_id and state='pending';
    return old;
  end if;
  update assistant_preferences set revision=revision+1,session_id=gen_random_uuid() where owner_id=old.owner_id;
  delete from assistant_turns where owner_id=old.owner_id;
  return old;
end $$;
notify pgrst, 'reload schema';

