-- AI calls are reserved before contacting the provider. A count-then-insert
-- in an Edge Function permits concurrent requests to exceed the quota.
alter table public.ai_runs add column request_id uuid unique;
alter table public.ai_runs add column source_hash text
  check (source_hash is null or source_hash ~ '^[0-9a-f]{64}$');
alter table public.ai_runs add column finished_at timestamptz;
alter table public.ai_runs drop constraint ai_runs_status_check;
alter table public.ai_runs add constraint ai_runs_status_check
  check (status in ('reserved','success','refused','invalid','error'));
create index ai_runs_active_source on public.ai_runs(user_id,feature,source_hash,created_at desc)
  where status='reserved';

create function public.reserve_ai_run(
  p_user uuid,p_feature text,p_source_hash text,p_request_id uuid,
  p_prompt_version text,p_model text
) returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare v_limit integer; v_id bigint; v_duplicate bigint;
begin
  if p_feature='profile_copy' then v_limit:=5;
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
revoke all on function public.reserve_ai_run(uuid,text,text,uuid,text,text)
  from public,anon,authenticated;
grant execute on function public.reserve_ai_run(uuid,text,text,uuid,text,text) to service_role;

create function public.finish_ai_run(
  p_request_id uuid,p_status text,p_latency_ms integer,
  p_input_tokens integer default null,p_output_tokens integer default null
) returns bigint language plpgsql security definer set search_path=public,pg_temp as $$
declare v_id bigint;
begin
  if p_status not in ('success','refused','invalid','error') or
     p_request_id is null or p_latency_ms<0 or p_latency_ms is null or
     p_input_tokens<0 or p_output_tokens<0 then
    raise exception 'invalid completion' using errcode='22023';
  end if;
  update public.ai_runs set status=p_status,latency_ms=p_latency_ms,
      input_tokens=p_input_tokens,output_tokens=p_output_tokens,finished_at=now()
   where request_id=p_request_id and status='reserved'
   returning id into v_id;
  if v_id is null then
    raise exception 'reservation missing or finished' using errcode='PT409';
  end if;
  return v_id;
end $$;
revoke all on function public.finish_ai_run(uuid,text,integer,integer,integer)
  from public,anon,authenticated;
grant execute on function public.finish_ai_run(uuid,text,integer,integer,integer) to service_role;

-- A choice is recorded only after a successful run. Generated text and source
-- answers are never copied into this ledger.
create table public.ai_decisions (
  id bigint generated always as identity primary key,
  run_id bigint not null unique references public.ai_runs(id) on delete cascade,
  user_id uuid references public.profiles(id) on delete set null,
  decision text not null check(decision in ('accepted','edited','discarded')),
  created_at timestamptz not null default now()
);
alter table public.ai_decisions enable row level security;
revoke all on public.ai_decisions from public,anon,authenticated;

create function public.record_my_ai_decision(p_run_id bigint,p_decision text)
  returns boolean language plpgsql security definer set search_path=public,pg_temp as $$
declare v_uid uuid:=auth.uid();
begin
  if v_uid is null then raise exception 'unauthenticated' using errcode='28000'; end if;
  if p_decision not in ('accepted','edited','discarded') then
    raise exception 'invalid decision' using errcode='22023';
  end if;
  if not exists(select 1 from public.ai_runs
      where id=p_run_id and user_id=v_uid and status='success') then
    raise exception 'run not found' using errcode='42501';
  end if;
  insert into public.ai_decisions(run_id,user_id,decision)
    values(p_run_id,v_uid,p_decision)
    on conflict(run_id) do nothing;
  return true;
end $$;
revoke all on function public.record_my_ai_decision(bigint,text) from public,anon;
grant execute on function public.record_my_ai_decision(bigint,text) to authenticated;

create function public.admin_ai_quality_v2() returns jsonb
  language plpgsql stable security definer set search_path=public,pg_temp as $$
begin
  if not public.is_admin() then raise exception 'admin only' using errcode='42501'; end if;
  return (select jsonb_build_object(
    'as_of',now(),
    'period_days',14,
    'runs',(select count(*) from public.ai_runs where created_at>=now()-interval '14 days'),
    'reserved',(select count(*) from public.ai_runs where status='reserved'
      and created_at>=now()-interval '14 days'),
    'success',(select count(*) from public.ai_runs where status='success'
      and created_at>=now()-interval '14 days'),
    'failed',(select count(*) from public.ai_runs where status in ('refused','invalid','error')
      and created_at>=now()-interval '14 days'),
    'accepted',(select count(*) from public.ai_decisions d join public.ai_runs r on r.id=d.run_id
      where d.decision='accepted' and r.created_at>=now()-interval '14 days'),
    'edited',(select count(*) from public.ai_decisions d join public.ai_runs r on r.id=d.run_id
      where d.decision='edited' and r.created_at>=now()-interval '14 days'),
    'discarded',(select count(*) from public.ai_decisions d join public.ai_runs r on r.id=d.run_id
      where d.decision='discarded' and r.created_at>=now()-interval '14 days')
  ));
end $$;
revoke all on function public.admin_ai_quality_v2() from public,anon;
grant execute on function public.admin_ai_quality_v2() to authenticated;
