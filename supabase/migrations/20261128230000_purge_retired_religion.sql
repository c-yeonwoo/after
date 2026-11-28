-- Delete only the historical structured answers. Keep the old-client write
-- guards and draft cleaner installed by 20261128220000.
begin;

drop trigger erase_withdrawn_religion on public.profiles;
drop function after_retired.erase_withdrawn_religion();
drop table after_retired.profile_religion restrict;

-- Publish the matching notice for new signups. Preserve existing receipts.
insert into public.policy_catalog(version,status,published_at,note)
values ('2026-11-28.2','published',now(),'기존 프로필의 종교 항목 삭제 완료');
do $$ begin
  update public.policy_control
     set signup_version='2026-11-28.2', version=version+1, updated_at=now()
   where id and signup_version='2026-11-28.1' and required_reconsent_version is null;
  if not found then
    raise exception 'Review active policy configuration before publishing signup notice';
  end if;
end $$;

commit;
