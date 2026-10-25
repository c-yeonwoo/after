-- One private timeline. No feature flags are enabled by this migration.
alter table public.assistant_turns
  add column kind text not null default 'conversation'
    check (kind in ('conversation','profile_applied','schedule_applied')),
  add column source_id uuid;
create unique index assistant_turns_receipt on public.assistant_turns(owner_id,kind,source_id)
  where source_id is not null;

-- Server receipts only: never accept a caller-supplied claim that an action succeeded.
create function public.assistant_record_completion() returns trigger
language plpgsql security definer set search_path=public,pg_temp as $$
declare p assistant_preferences; event_kind text; message text;
begin
  if new.state is not distinct from old.state then return new; end if;
  if tg_table_name='profile_revision_drafts' and new.state='approved' then
    event_kind:='profile_applied';
    message:='확인하신 수정안을 프로필에 반영했어요. 내 프로필에서 확인할 수 있어요.';
  elsif tg_table_name='assistant_actions' and new.state='succeeded' then
    event_kind:='schedule_applied';
    message:=case new.kind
      when 'preferences' then '승인하신 가능한 시간을 전달했어요. 약속 상세에서 다음 단계를 확인해 주세요.'
      when 'accept_slot' then '선택하신 시간을 반영했어요. 약속 상세에서 현재 상태를 확인해 주세요.'
      when 'confirm' then '승인하신 약속 확인을 반영했어요. 약속 상세에서 시간과 장소를 확인해 주세요.'
      when 'change' then '승인하신 일정 변경 요청을 전달했어요. 상대의 답변은 약속 상세에서 확인해 주세요.'
    end;
  else return new;
  end if;
  select * into p from assistant_preferences where owner_id=new.owner_id for update;
  if p.consented_at is null or not coalesce((select assistant_chat_enabled from app_settings where id),false)
    or not exists(select 1 from profiles where id=new.owner_id and account_state='active') then return new; end if;
  insert into assistant_turns(id,owner_id,privacy_revision,question,answer,state,kind,source_id)
    values(gen_random_uuid(),new.owner_id,p.revision,
      case event_kind when 'profile_applied' then '프로필 반영 결과' else '일정 처리 결과' end,
      message,'complete',event_kind,new.id)
    on conflict (owner_id,kind,source_id) where source_id is not null do nothing;
  return new;
end $$;
revoke all on function public.assistant_record_completion() from public,anon,authenticated;
create trigger assistant_profile_completion after update of state on public.profile_revision_drafts
  for each row execute function public.assistant_record_completion();
create trigger assistant_schedule_completion after update of state on public.assistant_actions
  for each row execute function public.assistant_record_completion();

-- Stable cursor pagination. A privacy revision fences pages loaded before deletion.
create function public.assistant_history(p_before timestamptz default null,p_before_id uuid default null)
returns jsonb language plpgsql stable security definer set search_path=public,pg_temp as $$
declare u uuid:=public.assistant_require_owner(); p assistant_preferences;
begin
  select * into p from assistant_preferences where owner_id=u;
  return jsonb_build_object('revision',coalesce(p.revision,0),'turns',
    coalesce((select jsonb_agg(to_jsonb(t) order by t.created_at,t.id) from (
      select id,kind,question,answer,
        case when state='pending' and created_at<now()-interval '2 minutes' then 'failed' else state end as state,created_at
      from assistant_turns where owner_id=u and expires_at>now() and p.consented_at is not null
        and (p_before is null or (created_at,id)<(p_before,p_before_id))
      order by created_at desc,id desc limit 20
    ) t),'[]'::jsonb));
end $$;
revoke all on function public.assistant_history(timestamptz,uuid) from public,anon;
grant execute on function public.assistant_history(timestamptz,uuid) to authenticated;

create or replace function public.my_assistant_state() returns jsonb
language plpgsql stable security definer set search_path=public,pg_temp as $$
declare u uuid:=public.assistant_require_owner(); p assistant_preferences;
begin
  select * into p from assistant_preferences where owner_id=u;
  return jsonb_build_object('flags',public.assistant_capabilities(),
    'consented',p.consented_at is not null,'revision',coalesce(p.revision,0),
    'memories',coalesce((select jsonb_agg(to_jsonb(t) order by t.approved_at desc) from
      (select id,content,version,source_kind,approved_at,expires_at from assistant_memories
        where owner_id=u and expires_at>now()) t),'[]'::jsonb),
    'turns',public.assistant_history()->'turns');
end $$;

-- Completion receipts are UI evidence, not new user disclosures or commands to the LLM.
create or replace function public.assistant_turn_context(p_id uuid) returns jsonb
language plpgsql stable security definer set search_path=public,pg_temp as $$
declare u uuid:=public.assistant_require_owner(); t assistant_turns; p assistant_preferences;
begin
  select * into t from assistant_turns where id=p_id and owner_id=u;
  select * into p from assistant_preferences where owner_id=u;
  if t.id is null or t.state<>'pending' or t.created_at<now()-interval '2 minutes' or p.consented_at is null
    or p.revision<>t.privacy_revision or not (select assistant_chat_enabled from app_settings where id) then
    raise exception 'context unavailable' using errcode='PT409'; end if;
  return jsonb_build_object('revision',p.revision,'question',t.question,
    'history',coalesce((select jsonb_agg(to_jsonb(h) order by h.created_at,h.id) from
      (select id,question,answer,created_at from assistant_turns where owner_id=u and state='complete'
        and kind='conversation' and expires_at>now() and (created_at,id)<(t.created_at,t.id)
        order by created_at desc,id desc limit 6) h),'[]'::jsonb),
    'memories',case when (select assistant_memory_enabled from app_settings where id) then
      coalesce((select jsonb_agg(content order by approved_at) from assistant_memories where owner_id=u and expires_at>now()),'[]'::jsonb) else '[]'::jsonb end);
end $$;
-- Token quota belongs at reserve_ai_run, after deterministic routing, not at
-- transcript creation. An exhausted model budget must not disable service help.
create or replace function public.assistant_begin_turn(p_id uuid,p_question text,p_expected_revision bigint) returns jsonb
language plpgsql security definer set search_path=public,pg_temp as $$
declare u uuid:=public.assistant_require_owner(); p assistant_preferences; t assistant_turns;
begin
  select * into p from assistant_preferences where owner_id=u for update;
  if p.consented_at is null or not (select assistant_chat_enabled from app_settings where id) then
    raise exception 'consent required or disabled' using errcode='PT403'; end if;
  if p.revision is distinct from p_expected_revision then raise exception 'context changed' using errcode='PT409'; end if;
  delete from assistant_memories where owner_id=u and expires_at<=now();
  -- Expiry deletion fences context through a trigger and advances this revision.
  select * into p from assistant_preferences where owner_id=u;
  if p_id is null or p_question is null or length(btrim(p_question)) not between 1 and 1000 then
    raise exception 'invalid question' using errcode='22023'; end if;
  select * into t from assistant_turns where id=p_id;
  if found then
    if t.owner_id<>u or t.question<>btrim(p_question) then raise exception 'request conflict' using errcode='PT409'; end if;
    return jsonb_build_object('id',t.id,'state',case when t.state='pending' and t.created_at<=now()-interval '2 minutes' then 'failed' else t.state end,'revision',t.privacy_revision,'created',false);
  end if;
  if exists(select 1 from assistant_turns where owner_id=u and state='pending' and created_at>now()-interval '2 minutes') then
    raise exception 'turn in progress' using errcode='PT409'; end if;
  insert into assistant_turns(id,owner_id,privacy_revision,question) values(p_id,u,p.revision,btrim(p_question));
  return jsonb_build_object('id',p_id,'state','pending','revision',p.revision,'created',true);
end $$;
notify pgrst, 'reload schema';
