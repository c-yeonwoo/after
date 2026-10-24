-- Dark launch: deployment never enables private storage or action execution.
alter table public.app_settings
  add column assistant_chat_enabled boolean not null default false,
  add column assistant_memory_enabled boolean not null default false,
  add column assistant_schedule_enabled boolean not null default false;

create function public.assistant_capabilities() returns jsonb
language sql stable security definer set search_path=public,pg_temp as $$
  select jsonb_build_object('chat',assistant_chat_enabled,'memory',assistant_memory_enabled,'schedule',assistant_schedule_enabled)
  from app_settings where id and auth.uid() is not null
$$;
revoke all on function public.assistant_capabilities() from public,anon;
grant execute on function public.assistant_capabilities() to authenticated;

create table public.assistant_preferences (
  owner_id uuid primary key references public.profiles(id) on delete cascade,
  consented_at timestamptz,
  policy_version text,
  revision bigint not null default 1
);
create table public.assistant_turns (
  id uuid primary key,
  owner_id uuid not null references public.profiles(id) on delete cascade,
  privacy_revision bigint not null,
  question text not null check (length(question) between 1 and 1000),
  answer text check (length(answer) between 1 and 1000),
  state text not null default 'pending' check (state in ('pending','complete','failed')),
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default now()+interval '30 days'
);
create index assistant_turns_owner on public.assistant_turns(owner_id,created_at desc);
create table public.assistant_memories (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.profiles(id) on delete cascade,
  content text not null check (length(content) between 2 and 240),
  source_kind text not null check (source_kind in ('manual','conversation')),
  source_id uuid,
  version integer not null default 1,
  approved_at timestamptz not null default now(),
  expires_at timestamptz not null default now()+interval '90 days'
);
create index assistant_memories_owner on public.assistant_memories(owner_id);
alter table public.assistant_preferences enable row level security;
alter table public.assistant_turns enable row level security;
alter table public.assistant_memories enable row level security;
-- No generic table access, even for an authenticated owner. Validated RPCs
-- enforce consent, bounded reads and revision fences on every operation.
revoke all on public.assistant_preferences,public.assistant_turns,public.assistant_memories from public,anon,authenticated;
grant all on public.assistant_preferences,public.assistant_turns,public.assistant_memories to service_role;

create function public.assistant_require_owner() returns uuid
language plpgsql stable security definer set search_path=public,pg_temp as $$
begin
  if auth.uid() is null or not exists(select 1 from profiles where id=auth.uid()
    and account_state='active' and onboarding_step>=7) then
    raise exception 'assistant unavailable' using errcode='42501';
  end if;
  return auth.uid();
end $$;
revoke all on function public.assistant_require_owner() from public,anon,authenticated;

create function public.my_assistant_state() returns jsonb
language plpgsql stable security definer set search_path=public,pg_temp as $$
declare u uuid:=public.assistant_require_owner(); p public.assistant_preferences;
begin
  select * into p from assistant_preferences where owner_id=u;
  return jsonb_build_object(
    'flags',(select jsonb_build_object('chat',assistant_chat_enabled,'memory',assistant_memory_enabled,'schedule',assistant_schedule_enabled) from app_settings where id),
    'consented',p.consented_at is not null,'revision',coalesce(p.revision,0),
    'memories',coalesce((select jsonb_agg(to_jsonb(t) order by t.approved_at desc) from
      (select id,content,version,source_kind,approved_at,expires_at from assistant_memories where owner_id=u and expires_at>now()) t),'[]'::jsonb),
    'turns',coalesce((select jsonb_agg(to_jsonb(t) order by t.created_at) from
      (select id,question,answer,case when state='pending' and created_at<now()-interval '2 minutes' then 'failed' else state end as state,created_at
       from assistant_turns where owner_id=u and expires_at>now() order by created_at desc limit 20) t),'[]'::jsonb));
end $$;
revoke all on function public.my_assistant_state() from public,anon;
grant execute on function public.my_assistant_state() to authenticated;

create function public.assistant_consent(p_agree boolean) returns jsonb
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

create function public.assistant_begin_turn(p_id uuid,p_question text,p_expected_revision bigint) returns jsonb
language plpgsql security definer set search_path=public,pg_temp as $$
declare u uuid:=public.assistant_require_owner(); p public.assistant_preferences; t public.assistant_turns;
begin
  select * into p from assistant_preferences where owner_id=u for update;
  if p.consented_at is null or not (select assistant_chat_enabled from app_settings where id) then
    raise exception 'consent required or disabled' using errcode='PT403'; end if;
  if p.revision is distinct from p_expected_revision then raise exception 'context changed' using errcode='PT409'; end if;
  delete from assistant_memories where owner_id=u and expires_at<=now();
  select * into p from assistant_preferences where owner_id=u;
  if p_id is null or length(btrim(p_question)) not between 1 and 1000 or p_question is null then
    raise exception 'invalid question' using errcode='22023'; end if;
  select * into t from assistant_turns where id=p_id;
  if found then
    if t.owner_id<>u or t.question<>btrim(p_question) then raise exception 'request conflict' using errcode='PT409'; end if;
    return jsonb_build_object('id',t.id,'state',case when t.state='pending' and t.created_at<=now()-interval '2 minutes' then 'failed' else t.state end,'revision',t.privacy_revision,'created',false);
  end if;
  if exists(select 1 from assistant_turns where owner_id=u and state='pending' and created_at>now()-interval '2 minutes') then
    raise exception 'turn in progress' using errcode='PT409'; end if;
  -- ai_runs survives deletion of private text: clearing history cannot reset cost limits.
  if (select count(*) from ai_runs where user_id=u and feature='assistant_chat' and created_at>now()-interval '24 hours')>=10 then
    raise exception 'daily limit' using errcode='PT429'; end if;
  insert into assistant_turns(id,owner_id,privacy_revision,question) values(p_id,u,p.revision,btrim(p_question));
  return jsonb_build_object('id',p_id,'state','pending','revision',p.revision,'created',true);
end $$;
revoke all on function public.assistant_begin_turn(uuid,text,bigint) from public,anon;
grant execute on function public.assistant_begin_turn(uuid,text,bigint) to authenticated;

create function public.assistant_turn_context(p_id uuid) returns jsonb
language plpgsql stable security definer set search_path=public,pg_temp as $$
declare u uuid:=public.assistant_require_owner(); t public.assistant_turns; p public.assistant_preferences;
begin
  select * into t from assistant_turns where id=p_id and owner_id=u;
  select * into p from assistant_preferences where owner_id=u;
  if t.id is null or t.state<>'pending' or t.created_at<now()-interval '2 minutes' or p.consented_at is null
    or p.revision<>t.privacy_revision or not (select assistant_chat_enabled from app_settings where id) then
    raise exception 'context unavailable' using errcode='PT409'; end if;
  return jsonb_build_object('revision',p.revision,'question',t.question,
    'history',coalesce((select jsonb_agg(to_jsonb(h) order by h.created_at) from
      (select question,answer,created_at from assistant_turns where owner_id=u and state='complete'
        and expires_at>now() and created_at<t.created_at order by created_at desc limit 6) h),'[]'::jsonb),
    'memories',case when (select assistant_memory_enabled from app_settings where id) then
      coalesce((select jsonb_agg(content order by approved_at) from assistant_memories where owner_id=u and expires_at>now()),'[]'::jsonb) else '[]'::jsonb end);
end $$;
revoke all on function public.assistant_turn_context(uuid) from public,anon;
grant execute on function public.assistant_turn_context(uuid) to authenticated;

create function public.assistant_finish_turn(p_owner uuid,p_id uuid,p_revision bigint,p_answer text) returns boolean
language plpgsql security definer set search_path=public,pg_temp as $$
declare p public.assistant_preferences; affected integer;
begin
  -- All private mutations lock this row. A delete/withdrawal fences late results.
  select * into p from assistant_preferences where owner_id=p_owner for update;
  if p.consented_at is null or p.revision is distinct from p_revision or
    not (select assistant_chat_enabled from app_settings where id) or
    not exists(select 1 from profiles where id=p_owner and account_state='active') then return false; end if;
  update assistant_turns set answer=p_answer,state=case when p_answer is null then 'failed' else 'complete' end
    where id=p_id and owner_id=p_owner and privacy_revision=p_revision and state='pending'
      and created_at>now()-interval '2 minutes';
  get diagnostics affected=row_count;
  return affected=1;
end $$;
revoke all on function public.assistant_finish_turn(uuid,uuid,bigint,text) from public,anon,authenticated;
grant execute on function public.assistant_finish_turn(uuid,uuid,bigint,text) to service_role;

create function public.assistant_save_memory(p_id uuid,p_content text,p_version integer,p_source_id uuid default null,p_expected_revision bigint default null) returns jsonb
language plpgsql security definer set search_path=public,pg_temp as $$
declare u uuid:=public.assistant_require_owner(); p public.assistant_preferences;
begin
  select * into p from assistant_preferences where owner_id=u for update;
  if p.revision is distinct from p_expected_revision or p_expected_revision is null then
    raise exception 'context changed' using errcode='PT409'; end if;
  if p.consented_at is null or not (select assistant_memory_enabled from app_settings where id) then
    raise exception 'memory disabled or no consent' using errcode='PT403'; end if;
  if p_content is null or length(btrim(p_content)) not between 2 and 240 then raise exception 'invalid memory' using errcode='22023'; end if;
  if p_source_id is not null and not exists(select 1 from assistant_turns where id=p_source_id
    and owner_id=u and question=btrim(p_content) and expires_at>now()) then
    raise exception 'source unavailable' using errcode='PT409'; end if;
  if p_id is null then
    if (select count(*) from assistant_memories where owner_id=u and expires_at>now())>=10 then raise exception 'memory limit' using errcode='PT429'; end if;
    insert into assistant_memories(owner_id,content,source_kind,source_id)
      values(u,btrim(p_content),case when p_source_id is null then 'manual' else 'conversation' end,p_source_id);
  else
    update assistant_memories set content=btrim(p_content),version=version+1,approved_at=now(),
      expires_at=now()+interval '90 days',source_kind='manual',source_id=null
      where id=p_id and owner_id=u and version=p_version;
    if not found then raise exception 'memory changed' using errcode='PT409'; end if;
    delete from assistant_turns where owner_id=u;
  end if;
  update assistant_preferences set revision=revision+1 where owner_id=u;
  update assistant_turns set state='failed' where owner_id=u and state='pending';
  return my_assistant_state();
end $$;
revoke all on function public.assistant_save_memory(uuid,text,integer,uuid,bigint) from public,anon;
grant execute on function public.assistant_save_memory(uuid,text,integer,uuid,bigint) to authenticated;

create function public.assistant_forget(p_scope text,p_memory_id uuid default null) returns jsonb
language plpgsql security definer set search_path=public,pg_temp as $$
declare u uuid:=public.assistant_require_owner();
begin
  if p_scope is null or p_scope not in ('history','memory','all') then raise exception 'invalid scope' using errcode='22023'; end if;
  perform 1 from assistant_preferences where owner_id=u for update;
  if p_scope='memory' then
    delete from assistant_memories where id=p_memory_id and owner_id=u;
    if not found then raise exception 'memory unavailable' using errcode='PT409'; end if;
  elsif p_scope='all' then delete from assistant_memories where owner_id=u;
  end if;
  -- Do not leave quoted/summarized copies of a deleted memory in chat history.
  delete from assistant_turns where owner_id=u;
  update assistant_preferences set revision=revision+1 where owner_id=u;
  return my_assistant_state();
end $$;
revoke all on function public.assistant_forget(text,uuid) from public,anon;
grant execute on function public.assistant_forget(text,uuid) to authenticated;

create function public.purge_inactive_assistant() returns trigger
language plpgsql security definer set search_path=public,pg_temp as $$
begin
  if new.account_state<>'active' then
    perform 1 from assistant_preferences where owner_id=new.id for update;
    delete from assistant_turns where owner_id=new.id;
    delete from assistant_memories where owner_id=new.id;
    update assistant_preferences set consented_at=null,policy_version=null,revision=revision+1 where owner_id=new.id;
  end if;
  return new;
end $$;
revoke all on function public.purge_inactive_assistant() from public,anon,authenticated;
create trigger purge_inactive_assistant after update of account_state on public.profiles
  for each row execute function public.purge_inactive_assistant();

create function public.fence_deleted_assistant_memory() returns trigger
language plpgsql security definer set search_path=public,pg_temp as $$
begin
  perform 1 from assistant_preferences where owner_id=old.owner_id for update;
  update assistant_preferences set revision=revision+1 where owner_id=old.owner_id;
  delete from assistant_turns where owner_id=old.owner_id;
  return old;
end $$;
revoke all on function public.fence_deleted_assistant_memory() from public,anon,authenticated;
create trigger fence_deleted_assistant_memory after delete on public.assistant_memories
  for each row execute function public.fence_deleted_assistant_memory();

create function public.expire_private_assistant() returns void
language plpgsql security definer set search_path=public,pg_temp as $$
declare u uuid;
begin
  -- Match interactive mutation lock order: preference -> memory -> history.
  for u in select distinct owner_id from assistant_memories where expires_at<=now() order by owner_id loop
    perform 1 from assistant_preferences where owner_id=u for update;
    delete from assistant_memories where owner_id=u and expires_at<=now();
  end loop;
  delete from assistant_turns where expires_at<=now();
end $$;
revoke all on function public.expire_private_assistant() from public,anon,authenticated;
select cron.schedule('expire-private-assistant','23 * * * *',$$select public.expire_private_assistant()$$);

alter table public.ai_runs drop constraint ai_runs_feature_check;
alter table public.ai_runs add constraint ai_runs_feature_check
  check(feature in ('profile_copy','profile_followup','pair_brief','conversation_prep','assistant_chat'));
alter function public.reserve_ai_run(uuid,text,text,uuid,text,text) rename to reserve_ai_run_before_private_assistant;
revoke all on function public.reserve_ai_run_before_private_assistant(uuid,text,text,uuid,text,text) from public,anon,authenticated,service_role;
create function public.reserve_ai_run(p_user uuid,p_feature text,p_source_hash text,p_request_id uuid,p_prompt_version text,p_model text)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare v_id bigint;
begin
  if p_feature is distinct from 'assistant_chat' then
    return reserve_ai_run_before_private_assistant(p_user,p_feature,p_source_hash,p_request_id,p_prompt_version,p_model);
  end if;
  if p_user is null or p_request_id is null or p_source_hash is null or p_source_hash !~ '^[0-9a-f]{64}$'
    or p_prompt_version is null or length(p_prompt_version) not between 1 and 60 or p_model is null or length(p_model) not between 1 and 80 then
    raise exception 'invalid reservation' using errcode='22023'; end if;
  perform pg_advisory_xact_lock(hashtextextended(p_user::text||':'||p_feature,0));
  if not exists(select 1 from profiles where id=p_user and account_state='active') or
    not (select assistant_chat_enabled from app_settings where id) then raise exception 'unavailable' using errcode='42501'; end if;
  if exists(select 1 from ai_runs where request_id=p_request_id) then
    return jsonb_build_object('reserved',false,'reason','duplicate_request'); end if;
  if (select count(*) from ai_runs where user_id=p_user and feature=p_feature and created_at>now()-interval '24 hours')>=10 then
    return jsonb_build_object('reserved',false,'reason','daily_limit'); end if;
  insert into ai_runs(user_id,feature,prompt_version,model,status,request_id,source_hash)
    values(p_user,p_feature,p_prompt_version,p_model,'reserved',p_request_id,p_source_hash) returning id into v_id;
  return jsonb_build_object('reserved',true,'run_id',v_id);
end $$;
revoke all on function public.reserve_ai_run(uuid,text,text,uuid,text,text) from public,anon,authenticated;
grant execute on function public.reserve_ai_run(uuid,text,text,uuid,text,text) to service_role;
