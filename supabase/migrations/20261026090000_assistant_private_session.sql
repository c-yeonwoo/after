-- One server-owned private conversation per consenting account. Privacy revision
-- remains the independent late-write fence; no caller can select a session/owner.
-- Existing RPC signatures and dark-launch flags remain unchanged.
alter table public.assistant_preferences add column session_id uuid;
update public.assistant_preferences set session_id=gen_random_uuid() where consented_at is not null;
create unique index assistant_preferences_session on public.assistant_preferences(session_id)
  where session_id is not null;
alter table public.assistant_turns add column session_id uuid not null default gen_random_uuid();
update public.assistant_turns t set session_id=p.session_id
  from public.assistant_preferences p where p.owner_id=t.owner_id and p.session_id is not null;
create index assistant_turns_session on public.assistant_turns(owner_id,session_id,created_at desc,id desc);

-- Also covers existing consent and account-deactivation RPCs without new args.
create function public.assistant_session_consent() returns trigger
language plpgsql security definer set search_path=public,pg_temp as $$
begin
  if new.consented_at is null then new.session_id:=null;
  elsif new.session_id is null then new.session_id:=gen_random_uuid();
  end if;
  return new;
end $$;
revoke all on function public.assistant_session_consent() from public,anon,authenticated;
create trigger assistant_session_consent before insert or update on public.assistant_preferences
  for each row execute function public.assistant_session_consent();
alter table public.assistant_preferences add constraint assistant_session_consent_check
  check ((consented_at is null) = (session_id is null));

-- Both conversation turns and existing server completion receipts bind here.
-- Even a service insert cannot accidentally assign another account's session.
create function public.assistant_bind_turn_session() returns trigger
language plpgsql security definer set search_path=public,pg_temp as $$
declare p assistant_preferences;
begin
  select * into p from assistant_preferences where owner_id=new.owner_id for update;
  if p.consented_at is null or p.session_id is null or p.revision is distinct from new.privacy_revision then
    raise exception 'context changed' using errcode='PT409';
  end if;
  new.session_id:=p.session_id;
  return new;
end $$;
revoke all on function public.assistant_bind_turn_session() from public,anon,authenticated;
create trigger assistant_bind_turn_session before insert on public.assistant_turns
  for each row execute function public.assistant_bind_turn_session();

create or replace function public.assistant_history(p_before timestamptz default null,p_before_id uuid default null)
returns jsonb language plpgsql stable security definer set search_path=public,pg_temp as $$
declare u uuid:=public.assistant_require_owner(); p assistant_preferences;
begin
  select * into p from assistant_preferences where owner_id=u;
  return jsonb_build_object('revision',coalesce(p.revision,0),'session_id',p.session_id,'turns',
    coalesce((select jsonb_agg(to_jsonb(t) order by t.created_at,t.id) from (
      select id,session_id,kind,question,answer,
        case when state='pending' and created_at<now()-interval '2 minutes' then 'failed' else state end as state,created_at
      from assistant_turns where owner_id=u and session_id=p.session_id and expires_at>now() and p.consented_at is not null
        and (p_before is null or (created_at,id)<(p_before,p_before_id))
      order by created_at desc,id desc limit 20
    ) t),'[]'::jsonb));
end $$;

create or replace function public.my_assistant_state() returns jsonb
language plpgsql stable security definer set search_path=public,pg_temp as $$
declare u uuid:=public.assistant_require_owner(); p assistant_preferences;
begin
  select * into p from assistant_preferences where owner_id=u;
  return jsonb_build_object('flags',public.assistant_capabilities(),
    'consented',p.consented_at is not null,'revision',coalesce(p.revision,0),'session_id',p.session_id,
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
  if p.consented_at is null or not (select assistant_chat_enabled from app_settings where id) then
    raise exception 'consent required or disabled' using errcode='PT403'; end if;
  if p.revision is distinct from p_expected_revision then raise exception 'context changed' using errcode='PT409'; end if;
  delete from assistant_memories where owner_id=u and expires_at<=now();
  -- Memory expiry clears context and rotates the session before the new turn.
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
    or p.consented_at is null or p.revision<>t.privacy_revision or t.session_id is distinct from p.session_id
    or not (select assistant_chat_enabled from app_settings where id) then
    raise exception 'context unavailable' using errcode='PT409'; end if;
  return jsonb_build_object('revision',p.revision,'session_id',p.session_id,'question',t.question,
    'history',coalesce((select jsonb_agg(to_jsonb(h) order by h.created_at,h.id) from
      (select id,question,answer,created_at from assistant_turns where owner_id=u and session_id=p.session_id and state='complete'
        and kind='conversation' and expires_at>now() and (created_at,id)<(t.created_at,t.id)
        order by created_at desc,id desc limit 6) h),'[]'::jsonb),
    'memories',case when (select assistant_memory_enabled from app_settings where id) then
      coalesce((select jsonb_agg(content order by approved_at) from assistant_memories where owner_id=u and expires_at>now()),'[]'::jsonb) else '[]'::jsonb end);
end $$;

create or replace function public.assistant_finish_turn(p_owner uuid,p_id uuid,p_revision bigint,p_answer text) returns boolean
language plpgsql security definer set search_path=public,pg_temp as $$
declare p assistant_preferences; affected integer;
begin
  select * into p from assistant_preferences where owner_id=p_owner for update;
  if p.consented_at is null or p.revision is distinct from p_revision or
    not (select assistant_chat_enabled from app_settings where id) or
    not exists(select 1 from profiles where id=p_owner and account_state='active') then return false; end if;
  update assistant_turns set answer=p_answer,state=case when p_answer is null then 'failed' else 'complete' end
    where id=p_id and owner_id=p_owner and session_id=p.session_id and privacy_revision=p_revision and state='pending'
      and created_at>now()-interval '2 minutes' and expires_at>now();
  get diagnostics affected=row_count;
  return affected=1;
end $$;

create or replace function public.assistant_forget(p_scope text,p_memory_id uuid default null) returns jsonb
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
  delete from assistant_turns where owner_id=u;
  update assistant_preferences set revision=revision+1,session_id=gen_random_uuid() where owner_id=u;
  return my_assistant_state();
end $$;

create or replace function public.assistant_save_memory(p_id uuid,p_content text,p_version integer,p_source_id uuid default null,p_expected_revision bigint default null) returns jsonb
language plpgsql security definer set search_path=public,pg_temp as $$
declare u uuid:=public.assistant_require_owner(); p assistant_preferences;
begin
  select * into p from assistant_preferences where owner_id=u for update;
  if p.revision is distinct from p_expected_revision or p_expected_revision is null then
    raise exception 'context changed' using errcode='PT409'; end if;
  if p.consented_at is null or not (select assistant_memory_enabled from app_settings where id) then
    raise exception 'memory disabled or no consent' using errcode='PT403'; end if;
  if p_content is null or length(btrim(p_content)) not between 2 and 240 then raise exception 'invalid memory' using errcode='22023'; end if;
  if p_source_id is not null and not exists(select 1 from assistant_turns where id=p_source_id
    and owner_id=u and session_id=p.session_id and question=btrim(p_content) and expires_at>now()) then
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
  update assistant_preferences set revision=revision+1,
    session_id=case when p_id is null then session_id else gen_random_uuid() end where owner_id=u;
  update assistant_turns set state='failed' where owner_id=u and state='pending';
  return my_assistant_state();
end $$;

create or replace function public.fence_deleted_assistant_memory() returns trigger
language plpgsql security definer set search_path=public,pg_temp as $$
begin
  perform 1 from assistant_preferences where owner_id=old.owner_id for update;
  update assistant_preferences set revision=revision+1,session_id=gen_random_uuid() where owner_id=old.owner_id;
  delete from assistant_turns where owner_id=old.owner_id;
  return old;
end $$;

-- Expiring a transcript row does not create a new session or extend retention.
-- The existing cleanup job and 30/90-day TTLs remain in force.
notify pgrst, 'reload schema';
