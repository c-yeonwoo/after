-- Newly registered members must acknowledge the notice actually displayed.
-- Existing consent receipts and enforcement settings remain intact.
begin;
insert into public.policy_catalog(version,status,published_at,note)
values ('2026-11-28.1','published',now(),'종교 항목 수집·노출 종료 및 무료 베타 인증 범위 안내');
do $$ begin
  update public.policy_control
  set signup_version='2026-11-28.1', version=version+1, updated_at=now()
  where id and signup_version='2026-10-31.1' and required_reconsent_version is null;
  if not found then
    raise exception 'Review active policy configuration before publishing signup notice';
  end if;
end $$;
commit;
