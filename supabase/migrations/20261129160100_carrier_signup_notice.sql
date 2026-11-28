-- Newly registered members must acknowledge the notice actually displayed.
-- Existing consent receipts and enforcement settings remain intact.
begin;
insert into public.policy_catalog(version,status,published_at,note)
values ('2026-11-29.1','published',now(),'휴대폰·카카오 본인확인 가입과 이메일 수집 범위 안내');
do $$ begin
  update public.policy_control
  set signup_version='2026-11-29.1', version=version+1, updated_at=now()
  where id and signup_version='2026-11-28.2' and required_reconsent_version is null;
  if not found then
    raise exception 'Review active policy configuration before publishing signup notice';
  end if;
end $$;
commit;
