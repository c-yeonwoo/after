-- Remove only the Kakao sign-in identity when the Kakao account is unlinked.
-- After's company-email identity and profile remain intact.

create or replace function public.unlink_kakao_identity_by_provider_id(p_provider_id text)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  deleted_count integer;
begin
  if p_provider_id is null or p_provider_id !~ '^\d{1,32}$' then
    return 0;
  end if;

  delete from auth.identities
   where provider = 'kakao'
     and provider_id = p_provider_id;

  get diagnostics deleted_count = row_count;
  return deleted_count;
end;
$$;

revoke all on function public.unlink_kakao_identity_by_provider_id(text) from public, anon, authenticated;
grant execute on function public.unlink_kakao_identity_by_provider_id(text) to service_role;

comment on function public.unlink_kakao_identity_by_provider_id(text) is
  'Kakao unlink webhook cleanup. Removes the Kakao Auth identity but preserves the After account.';
