-- Enrollment is done by the account owner through Supabase Auth. Do not enable
-- enforcement during deployment; require a verified owner session and explicit
-- recovery acknowledgement before the operator can change this setting.
alter table public.admin_actions drop constraint admin_actions_kind_check;
alter table public.admin_actions add constraint admin_actions_kind_check check(kind=any(array[
  'resolve_report','ban','unban','refund','cancel_meeting','review_photo','set_queue',
  'resolve_no_show','set_payments','fulfill_order','reset_photo','retry_notification',
  'set_queue_reason','upsert_place','reconcile_payment','case_transition',
  'automation_rule','automation_approval','policy_activation','admin_security'
]));

create function public.admin_set_mfa_requirement(p_required boolean,p_expected_required boolean,
  p_recovery_confirmed boolean,p_request_id uuid) returns boolean
  language plpgsql security definer set search_path=public,pg_temp as $$
declare current_required boolean; previous public.admin_actions; description text;
begin
  if not public.is_admin() or coalesce(auth.jwt()->>'aal','')<>'aal2' or
     not exists(select 1 from auth.mfa_factors where user_id=auth.uid() and status='verified') then
    raise exception 'verified admin MFA session required' using errcode='42501'; end if;
  if p_required is null or p_expected_required is null or p_request_id is null then
    raise exception 'explicit setting and request required' using errcode='22023'; end if;
  if p_required and p_recovery_confirmed is distinct from true then
    raise exception 'confirm recovery before enforcement' using errcode='22023'; end if;
  description:=case when p_required then '관리자 MFA 강제 켜기 · 복구수단 직접 확인'
    else '관리자 MFA 강제 끄기 · 인증된 운영자 요청' end;
  select admin_mfa_required into current_required from public.app_settings where id for update;
  select * into previous from public.admin_actions where request_id=p_request_id;
  if found then
    if previous.actor_id<>auth.uid() or previous.kind<>'admin_security' or previous.note<>description then
      raise exception 'request ID conflict' using errcode='PT409'; end if;
    return current_required;
  end if;
  if current_required is distinct from p_expected_required then
    raise exception 'stale_version' using errcode='PT409'; end if;
  update public.app_settings set admin_mfa_required=p_required,updated_at=now(),updated_by=auth.uid() where id;
  insert into public.admin_actions(actor_id,kind,request_id,note)
    values(auth.uid(),'admin_security',p_request_id,description);
  return p_required;
end $$;
revoke all on function public.admin_set_mfa_requirement(boolean,boolean,boolean,uuid) from public,anon;
grant execute on function public.admin_set_mfa_requirement(boolean,boolean,boolean,uuid) to authenticated;
