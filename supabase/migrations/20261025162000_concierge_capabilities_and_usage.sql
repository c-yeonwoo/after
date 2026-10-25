-- New concierge features remain dark on deployment. Existing flags are unchanged.
-- Edge needs only this flag lookup; the rest of app_settings stays RPC-owned.
grant select (id,assistant_introduction_enabled) on public.app_settings to service_role;
create or replace function public.assistant_capabilities() returns jsonb
language sql stable security definer set search_path=public,pg_temp as $$
  select jsonb_build_object(
    'chat',assistant_chat_enabled,'memory',assistant_memory_enabled,
    'schedule',assistant_schedule_enabled,'introduction',assistant_introduction_enabled,
    'profileEdit',assistant_profile_edit_enabled)
  from app_settings where id and auth.uid() is not null
$$;
revoke all on function public.assistant_capabilities() from public,anon;
grant execute on function public.assistant_capabilities() to authenticated;

create or replace function public.my_assistant_state() returns jsonb
language plpgsql stable security definer set search_path=public,pg_temp as $$
declare u uuid:=public.assistant_require_owner(); p public.assistant_preferences;
begin
  select * into p from assistant_preferences where owner_id=u;
  return jsonb_build_object(
    'flags',public.assistant_capabilities(),
    'consented',p.consented_at is not null,'revision',coalesce(p.revision,0),
    'memories',coalesce((select jsonb_agg(to_jsonb(t) order by t.approved_at desc) from
      (select id,content,version,source_kind,approved_at,expires_at from assistant_memories where owner_id=u and expires_at>now()) t),'[]'::jsonb),
    'turns',coalesce((select jsonb_agg(to_jsonb(t) order by t.created_at) from
      (select id,question,answer,case when state='pending' and created_at<now()-interval '2 minutes' then 'failed' else state end as state,created_at
       from assistant_turns where owner_id=u and expires_at>now() order by created_at desc limit 20) t),'[]'::jsonb));
end $$;

alter table public.ai_runs drop constraint ai_runs_feature_check;
alter table public.ai_runs add constraint ai_runs_feature_check
  check(feature in ('profile_copy','profile_followup','pair_brief','conversation_prep',
    'assistant_chat','member_introduction','profile_revision'));

create or replace function public.reserve_ai_run(
  p_user uuid,p_feature text,p_source_hash text,p_request_id uuid,p_prompt_version text,p_model text
) returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare v_limit integer; v_id bigint; v_duplicate bigint;
begin
  case p_feature
    when 'profile_copy' then v_limit:=5;
    when 'profile_followup' then v_limit:=5;
    when 'pair_brief' then v_limit:=60;
    when 'conversation_prep' then v_limit:=5;
    when 'assistant_chat' then v_limit:=10;
    when 'member_introduction' then v_limit:=5;
    when 'profile_revision' then v_limit:=5;
    else raise exception 'invalid feature' using errcode='22023';
  end case;
  if p_user is null or p_request_id is null or p_source_hash is null
    or p_source_hash !~ '^[0-9a-f]{64}$' or p_prompt_version is null
    or length(p_prompt_version) not between 1 and 60 or p_model is null
    or length(p_model) not between 1 and 80 then
    raise exception 'invalid reservation' using errcode='22023';
  end if;
  perform pg_advisory_xact_lock(hashtextextended(p_user::text||':'||p_feature,0));
  if not exists(select 1 from profiles where id=p_user and account_state='active') then
    raise exception 'unavailable' using errcode='42501';
  end if;
  if (p_feature='assistant_chat' and not coalesce((select assistant_chat_enabled from app_settings where id),false))
    or (p_feature='member_introduction' and not coalesce((select assistant_introduction_enabled from app_settings where id),false))
    or (p_feature='profile_revision' and not coalesce((select assistant_profile_edit_enabled from app_settings where id),false)) then
    raise exception 'unavailable' using errcode='42501';
  end if;
  select id into v_duplicate from ai_runs where request_id=p_request_id;
  if found then return jsonb_build_object('reserved',false,'reason','duplicate_request','run_id',v_duplicate); end if;
  update ai_runs set status='error',finished_at=now() where user_id=p_user and feature=p_feature
    and status='reserved' and created_at<now()-interval '2 minutes';
  if p_feature<>'assistant_chat' and exists(select 1 from ai_runs where user_id=p_user and feature=p_feature and source_hash=p_source_hash
    and status='reserved' and created_at>=now()-interval '2 minutes') then
    return jsonb_build_object('reserved',false,'reason','in_progress');
  end if;
  if (select count(*) from ai_runs where user_id=p_user and feature=p_feature and created_at>=now()-interval '24 hours')>=v_limit then
    return jsonb_build_object('reserved',false,'reason','daily_limit');
  end if;
  insert into ai_runs(user_id,feature,prompt_version,model,status,request_id,source_hash)
    values(p_user,p_feature,p_prompt_version,p_model,'reserved',p_request_id,p_source_hash) returning id into v_id;
  return jsonb_build_object('reserved',true,'run_id',v_id);
end $$;
revoke all on function public.reserve_ai_run(uuid,text,text,uuid,text,text) from public,anon,authenticated;
grant execute on function public.reserve_ai_run(uuid,text,text,uuid,text,text) to service_role;

create or replace function public.admin_assistant_health() returns jsonb
language plpgsql stable security definer set search_path=public,pg_temp as $$
begin
  if not is_admin() or not admin_sensitive_auth_ok() then raise exception 'admin authentication required' using errcode='42501'; end if;
  return jsonb_build_object(
    'asOf',now(),'flags',public.assistant_capabilities(),
    'turnsPending',(select count(*) from assistant_turns where state='pending' and created_at>=now()-interval '2 minutes'),
    'turnsStalled',(select count(*) from assistant_turns where state='pending' and created_at<now()-interval '2 minutes' and expires_at>now()),
    'actionsAwaiting',(select count(*) from assistant_actions where state='awaiting_approval' and expires_at>now()),
    'actionsExpired',(select count(*) from assistant_actions where state='awaiting_approval' and expires_at<=now() and created_at>now()-interval '24 hours'),
    'actionsSucceeded',(select count(*) from assistant_actions where state='succeeded' and executed_at>now()-interval '24 hours'),
    'runs24h',coalesce((select jsonb_agg(to_jsonb(q)) from (
      select feature,status,count(*) as count,sum(input_tokens) as input_tokens,sum(output_tokens) as output_tokens
      from ai_runs where feature in ('assistant_chat','conversation_prep','member_introduction','profile_revision') and created_at>now()-interval '24 hours'
      group by feature,status) q),'[]'::jsonb),
    'cleanup',coalesce((select jsonb_agg(jsonb_build_object('name',j.jobname,'active',j.active,'lastStatus',r.status,'lastFinished',r.end_time))
      from cron.job j left join lateral (select status,end_time from cron.job_run_details where jobid=j.jobid order by start_time desc limit 1) r on true
      where j.jobname in ('expire-private-assistant','expire-assistant-actions')),'[]'::jsonb));
end $$;
notify pgrst, 'reload schema';
