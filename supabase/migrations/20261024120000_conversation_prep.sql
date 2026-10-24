-- Private, bounded, read-only conversation preparation. No new member permissions.
alter table public.ai_runs drop constraint ai_runs_feature_check;
alter table public.ai_runs add constraint ai_runs_feature_check
  check (feature in ('profile_copy','profile_followup','pair_brief','conversation_prep'));
create or replace function public.reserve_ai_run(
  p_user uuid,p_feature text,p_source_hash text,p_request_id uuid,
  p_prompt_version text,p_model text
) returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare v_limit integer; v_id bigint; v_duplicate bigint;
begin
  if p_feature='profile_copy' then v_limit:=5;
  elsif p_feature='profile_followup' then v_limit:=5;
  elsif p_feature='pair_brief' then v_limit:=60;
  elsif p_feature='conversation_prep' then v_limit:=5;
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

create table public.conversation_preparations (
  owner_id uuid not null references public.profiles(id) on delete cascade,
  target_id uuid not null references public.profiles(id) on delete cascade,
  source_hash text not null check (source_hash ~ '^[0-9a-f]{64}$'),
  result jsonb not null check (octet_length(result::text) <= 12000),
  created_at timestamptz not null default now(),
  primary key (owner_id,target_id)
);
alter table public.conversation_preparations enable row level security;
-- A cache hit never grants access: Edge rechecks caller-scoped public profile
-- and source hash BEFORE reading this service-only table.
revoke all on public.conversation_preparations from public, anon, authenticated;
grant all on public.conversation_preparations to service_role;

create function public.clear_conversation_preparations() returns trigger
language plpgsql security definer set search_path=public,pg_temp as $$
begin
  delete from public.conversation_preparations where owner_id=new.id or target_id=new.id;
  return new;
end $$;
revoke all on function public.clear_conversation_preparations() from public,anon,authenticated;
create trigger clear_conversation_preparations_on_profile_change
after update of account_state,profile_story,intro,job,interests,topics,match_tags,details,evening_note,known_as,topic_note,match_note on public.profiles
for each row execute function public.clear_conversation_preparations();

select cron.schedule('expire-conversation-preparations','17 * * * *',
  $$delete from public.conversation_preparations where created_at < now()-interval '12 hours'$$);
