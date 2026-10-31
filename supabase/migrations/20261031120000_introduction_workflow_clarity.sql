-- No feature flag, ticket, payment or visibility policy changes.
create function public.my_introduction_consent() returns bigint
language sql stable security definer set search_path='' as $$
  select revision from public.assistant_preferences where owner_id=auth.uid()
    and consented_at is not null and policy_version='manager-continuity-v2';
$$;
revoke all on function public.my_introduction_consent() from public,anon;
grant execute on function public.my_introduction_consent() to authenticated;

create function public.conversation_preparation_allowed(p_target uuid) returns boolean
language sql stable security definer set search_path='' as $$
  select auth.uid() is not null and public.member_introduction_access(auth.uid(),p_target)
    and exists(select 1 from public.meetings m join public.intros i on i.id=m.intro_id
      where m.confirmed_at is not null and m.cancelled_at is null
        and ((i.male_id=auth.uid() and i.female_id=p_target) or (i.female_id=auth.uid() and i.male_id=p_target)));
$$;
revoke all on function public.conversation_preparation_allowed(uuid) from public,anon;
grant execute on function public.conversation_preparation_allowed(uuid) to authenticated;

-- Invalidate explanation caches on consent changes, including withdraw/regrant.
create function public.clear_introduction_consent_cache() returns trigger
language plpgsql security definer set search_path='' as $$
begin
  delete from public.member_introductions where owner_id=new.owner_id;
  return new;
end $$;
revoke all on function public.clear_introduction_consent_cache() from public,anon,authenticated;
create trigger clear_introduction_on_consent_change after update of consented_at,policy_version,revision
  on public.assistant_preferences for each row execute function public.clear_introduction_consent_cache();

-- Serialize an in-flight AI result with profile edits/withdrawal. The row
-- locks are held until commit, so an edit either invalidates this write first
-- or runs its purge trigger after this write. Never resurrect old quotations.
create or replace function public.store_conversation_preparation(
  p_owner uuid, p_target uuid,
  p_owner_revision timestamptz, p_target_revision timestamptz,
  p_source_hash text, p_result jsonb
) returns boolean language plpgsql security definer set search_path='' as $$
begin
  if p_owner is null or p_target is null or p_owner=p_target then return false; end if;
  perform id from public.profiles where id in (p_owner,p_target) order by id for update;
  if not exists(select 1 from public.profiles where id=p_owner
      and account_state='active' and onboarding_step>=7 and updated_at=p_owner_revision)
    or not exists(select 1 from public.profiles where id=p_target
      and account_state='active' and onboarding_step>=7 and updated_at=p_target_revision)
  then return false; end if;
  -- Lock the eligible meeting until commit; cancellation cannot race this write.
  perform m.id from public.meetings m join public.intros i on i.id=m.intro_id
    where m.confirmed_at is not null and m.cancelled_at is null
      and ((i.male_id=p_owner and i.female_id=p_target) or (i.female_id=p_owner and i.male_id=p_target))
      and public.member_introduction_access(p_owner,p_target)
    order by m.id for share of m;
  if not found then return false; end if;
  if not coalesce((select assistant_introduction_enabled from public.app_settings where id),false) then return false; end if;
  insert into public.conversation_preparations(owner_id,target_id,source_hash,result,created_at)
  values(p_owner,p_target,p_source_hash,p_result,clock_timestamp())
  on conflict(owner_id,target_id) do update set
    source_hash=excluded.source_hash,result=excluded.result,created_at=excluded.created_at;
  return true;
end $$;
revoke all on function public.store_conversation_preparation(uuid,uuid,timestamptz,timestamptz,text,jsonb) from public,anon,authenticated;
grant execute on function public.store_conversation_preparation(uuid,uuid,timestamptz,timestamptz,text,jsonb) to service_role;

create or replace function public.read_member_introduction(
  p_owner uuid,p_target uuid,p_owner_revision timestamptz,p_target_revision timestamptz,p_source_hash text
) returns jsonb language plpgsql security definer set search_path='' as $$
declare cached public.member_introductions;
begin
  perform owner_id from public.assistant_preferences where owner_id=p_owner
    and consented_at is not null and policy_version='manager-continuity-v2' for share;
  if not found then return null; end if;
  if not coalesce((select assistant_introduction_enabled from public.app_settings where id),false)
    or p_owner=p_target then return null; end if;
  perform id from public.profiles where id in(p_owner,p_target) order by id for share;
  if not exists(select 1 from public.profiles where id=p_owner and account_state='active' and onboarding_step>=7 and updated_at=p_owner_revision)
    or not exists(select 1 from public.profiles where id=p_target and account_state='active' and onboarding_step>=7 and updated_at=p_target_revision)
    or not public.member_introduction_access(p_owner,p_target)
  then return null; end if;
  select * into cached from public.member_introductions
   where owner_id=p_owner and target_id=p_target and source_hash=p_source_hash
     and owner_revision=p_owner_revision and target_revision=p_target_revision and expires_at>clock_timestamp();
  if not found then return null; end if;
  return jsonb_build_object('result',cached.result,'expiresAt',cached.expires_at);
end $$;
revoke all on function public.read_member_introduction(uuid,uuid,timestamptz,timestamptz,text) from public,anon,authenticated;
grant execute on function public.read_member_introduction(uuid,uuid,timestamptz,timestamptz,text) to service_role;

create or replace function public.store_member_introduction(
  p_owner uuid,p_target uuid,p_owner_revision timestamptz,p_target_revision timestamptz,p_source_hash text,p_result jsonb
) returns jsonb language plpgsql security definer set search_path='' as $$
declare expiry timestamptz:=clock_timestamp()+interval '12 hours';
begin
  perform owner_id from public.assistant_preferences where owner_id=p_owner
    and consented_at is not null and policy_version='manager-continuity-v2' for share;
  if not found then return null; end if;
  if p_owner is null or p_target is null or p_owner=p_target or p_source_hash is null
    or p_source_hash !~ '^[0-9a-f]{64}$' or p_result is null
    or jsonb_typeof(p_result)<>'object' or octet_length(p_result::text)>18000
  then return null; end if;
  perform id from public.profiles where id in(p_owner,p_target) order by id for update;
  if not coalesce((select assistant_introduction_enabled from public.app_settings where id),false)
    or not exists(select 1 from public.profiles where id=p_owner and account_state='active' and onboarding_step>=7 and updated_at=p_owner_revision)
    or not exists(select 1 from public.profiles where id=p_target and account_state='active' and onboarding_step>=7 and updated_at=p_target_revision)
    or not public.member_introduction_access(p_owner,p_target)
  then return null; end if;
  insert into public.member_introductions(owner_id,target_id,owner_revision,target_revision,source_hash,result,created_at,expires_at)
  values(p_owner,p_target,p_owner_revision,p_target_revision,p_source_hash,p_result,clock_timestamp(),expiry)
  on conflict(owner_id,target_id) do update set owner_revision=excluded.owner_revision,target_revision=excluded.target_revision,
    source_hash=excluded.source_hash,result=excluded.result,created_at=excluded.created_at,expires_at=excluded.expires_at;
  return jsonb_build_object('expiresAt',expiry);
end $$;
revoke all on function public.store_member_introduction(uuid,uuid,timestamptz,timestamptz,text,jsonb) from public,anon,authenticated;
grant execute on function public.store_member_introduction(uuid,uuid,timestamptz,timestamptz,text,jsonb) to service_role;


-- A withdraw/regrant during a model call must not resurrect the previous revision.
create function public.store_member_introduction_for_consent(
  p_owner uuid,p_target uuid,p_owner_revision timestamptz,p_target_revision timestamptz,
  p_source_hash text,p_result jsonb,p_consent_revision bigint
) returns jsonb language plpgsql security definer set search_path='' as $$
begin
  perform owner_id from public.assistant_preferences where owner_id=p_owner
    and consented_at is not null and policy_version='manager-continuity-v2'
    and revision=p_consent_revision for share;
  if not found then return null; end if;
  return public.store_member_introduction(p_owner,p_target,p_owner_revision,p_target_revision,p_source_hash,p_result);
end $$;
revoke all on function public.store_member_introduction_for_consent(uuid,uuid,timestamptz,timestamptz,text,jsonb,bigint) from public,anon,authenticated;
grant execute on function public.store_member_introduction_for_consent(uuid,uuid,timestamptz,timestamptz,text,jsonb,bigint) to service_role;
