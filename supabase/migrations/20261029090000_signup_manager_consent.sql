-- Collect optional manager consent before identity-first signup. This records a
-- choice only: no feature flag changes and no AI call on signup or on page load.
alter table public.signup_sessions add column manager_policy_version text
  check (manager_policy_version is null or manager_policy_version='manager-continuity-v2');

create function public.begin_signup_with_manager(p_token text,p_policy_version text,p_manager_policy_version text default null) returns jsonb
language plpgsql security definer set search_path=public,extensions,pg_temp as $$
declare result jsonb;
begin
  if p_manager_policy_version is not null and p_manager_policy_version<>'manager-continuity-v2' then
    raise exception 'policy changed' using errcode='PT409';
  end if;
  result:=public.begin_signup(p_token,p_policy_version);
  update signup_sessions set manager_policy_version=p_manager_policy_version
    where token_hash=encode(extensions.digest(p_token,'sha256'),'hex');
  return result || jsonb_build_object('managerConsented',p_manager_policy_version is not null);
end $$;
revoke all on function public.begin_signup_with_manager(text,text,text) from public;
grant execute on function public.begin_signup_with_manager(text,text,text) to anon,authenticated;

alter function public.signup_session_status(text) rename to signup_session_status_before_manager;
revoke all on function public.signup_session_status_before_manager(text) from public,anon,authenticated,service_role;
create function public.signup_session_status(p_token text) returns jsonb
language plpgsql stable security definer set search_path=public,extensions,pg_temp as $$
declare result jsonb;
begin
  result:=public.signup_session_status_before_manager(p_token);
  return result || jsonb_build_object('managerConsented',coalesce((select manager_policy_version='manager-continuity-v2'
    from signup_sessions where token_hash=encode(extensions.digest(p_token,'sha256'),'hex')),false));
end $$;
revoke all on function public.signup_session_status(text) from public;
grant execute on function public.signup_session_status(text) to anon,authenticated;

-- The profile exists when the verified bearer session is consumed. No user id
-- from the browser is accepted; failed profile creation rolls consent back too.
create function public.claim_signup_manager_consent() returns trigger
language plpgsql security definer set search_path=public,pg_temp as $$
begin
  if old.claimed_by is null and new.claimed_by is not null
    and new.manager_policy_version='manager-continuity-v2' then
    insert into assistant_preferences(owner_id,consented_at,policy_version)
      values(new.claimed_by,new.accepted_at,new.manager_policy_version)
      on conflict(owner_id) do nothing;
  end if;
  return new;
end $$;
revoke all on function public.claim_signup_manager_consent() from public,anon,authenticated;
create trigger signup_manager_consent after update of claimed_by on public.signup_sessions
  for each row execute function public.claim_signup_manager_consent();

-- Authenticated, incomplete legacy signups can make the same explicit choice.
-- Existing completed members use the versioned renewal RPC, which also fences
-- in-flight answers and handles the previous archive retention policy.
create function public.record_manager_signup_consent(p_policy_version text) returns void
language plpgsql security definer set search_path=public,pg_temp as $$
begin
  if auth.uid() is null or not exists(select 1 from profiles where id=auth.uid()
      and account_state='active' and onboarding_step<7
      and terms_agreed_at is not null and privacy_agreed_at is not null) then
    raise exception 'signup unavailable' using errcode='42501';
  end if;
  if p_policy_version is distinct from 'manager-continuity-v2' then
    raise exception 'policy changed' using errcode='PT409';
  end if;
  insert into assistant_preferences(owner_id,consented_at,policy_version)
    values(auth.uid(),now(),p_policy_version) on conflict(owner_id) do update
    set consented_at=excluded.consented_at,policy_version=excluded.policy_version,revision=assistant_preferences.revision+1;
end $$;
revoke all on function public.record_manager_signup_consent(text) from public,anon;
grant execute on function public.record_manager_signup_consent(text) to authenticated;
