-- The public policy now discloses the optional meet window and the direct
-- beta flow. New consent records must reference that text. Existing member
-- reconsent remains OFF pending the separate legal/operator activation gate.
insert into public.policy_catalog(version, status, published_at, note)
values (
  '2026-10-17.1',
  'published',
  now(),
  '선택 만남 가능 시간 처리와 무료 베타 직접 소개·요청 흐름 반영; 기존 회원 재동의 적용은 별도 결정'
);

update public.policy_control
   set signup_version = '2026-10-17.1', version = version + 1, updated_at = now()
 where id = true and required_reconsent_version is null;

do $$
begin
  if (select signup_version from public.policy_control where id) is distinct from '2026-10-17.1' then
    raise exception 'policy signup version not updated; review active reconsent before deploy';
  end if;
end $$;
