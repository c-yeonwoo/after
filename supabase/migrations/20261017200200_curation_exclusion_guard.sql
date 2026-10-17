-- A stale operator screen must not requeue a pair that has since passed,
-- declined, blocked or otherwise become permanently excluded.
alter function public.admin_set_queue(uuid,uuid[],text) rename to admin_set_queue_before_cycle_qa;
revoke all on function public.admin_set_queue_before_cycle_qa(uuid,uuid[],text) from public,anon,authenticated;
create function public.admin_set_queue(p_male uuid,p_female_ids uuid[],p_note text) returns integer
  language plpgsql security definer set search_path=public,pg_temp as $$
begin
  if not public.is_admin() then raise exception 'admin only' using errcode='42501'; end if;
  if exists(select 1 from unnest(p_female_ids) f(id) where public.is_excluded(p_male,f.id)) then
    raise exception 'candidate excluded; refresh queue' using errcode='PT409';
  end if;
  return public.admin_set_queue_before_cycle_qa(p_male,p_female_ids,p_note);
end $$;
revoke all on function public.admin_set_queue(uuid,uuid[],text) from public,anon;
grant execute on function public.admin_set_queue(uuid,uuid[],text) to authenticated;
