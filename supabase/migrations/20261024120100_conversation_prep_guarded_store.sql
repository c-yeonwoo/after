-- Serialize an in-flight AI result with profile edits/withdrawal. The row
-- locks are held until commit, so an edit either invalidates this write first
-- or runs its purge trigger after this write. Never resurrect old quotations.
create function public.store_conversation_preparation(
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
  insert into public.conversation_preparations(owner_id,target_id,source_hash,result,created_at)
  values(p_owner,p_target,p_source_hash,p_result,clock_timestamp())
  on conflict(owner_id,target_id) do update set
    source_hash=excluded.source_hash,result=excluded.result,created_at=excluded.created_at;
  return true;
end $$;
revoke all on function public.store_conversation_preparation(uuid,uuid,timestamptz,timestamptz,text,jsonb) from public,anon,authenticated;
grant execute on function public.store_conversation_preparation(uuid,uuid,timestamptz,timestamptz,text,jsonb) to service_role;
