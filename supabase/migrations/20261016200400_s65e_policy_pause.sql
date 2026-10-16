-- Emergency pause for a scheduled or active reconsent rollout. It does not
-- delete consent evidence or existing account rights.
create function public.admin_pause_policy_reconsent(
  p_expected_version integer,p_reason text,p_request_id uuid
) returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare c public.policy_control;
begin
  if not public.is_admin() then raise exception 'admin only' using errcode='42501'; end if;
  if coalesce(auth.jwt()->>'aal','') <> 'aal2' then
    raise exception 'AAL2 required' using errcode='42501';
  end if;
  if p_request_id is null or char_length(btrim(coalesce(p_reason,''))) not between 10 and 500 then
    raise exception 'reason required' using errcode='22023';
  end if;
  select * into c from public.policy_control where id for update;
  if c.version <> p_expected_version or c.required_reconsent_version is null then
    raise exception 'stale_or_inactive_policy' using errcode='PT409';
  end if;
  update public.policy_control set required_reconsent_version=null,
      reconsent_effective_at=null,version=version+1,
      updated_by=auth.uid(),updated_at=now() where id;
  insert into public.admin_actions(actor_id,kind,request_id,note)
    values(auth.uid(),'policy_activation',p_request_id,
      concat('policy reconsent paused: ',c.required_reconsent_version,'; ',btrim(p_reason)));
  return public.admin_policy_preview();
end $$;
revoke all on function public.admin_pause_policy_reconsent(integer,text,uuid)
  from public, anon;
grant execute on function public.admin_pause_policy_reconsent(integer,text,uuid)
  to authenticated;
