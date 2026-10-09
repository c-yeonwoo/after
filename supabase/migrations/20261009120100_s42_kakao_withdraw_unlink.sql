-- Remove Kakao Auth identity before account withdrawal so provider identity data
-- is erased even though the Auth user row is retained to prevent re-onboarding.

create or replace function public.unlink_my_kakao_identity()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_user_id uuid := auth.uid();
  deleted_count integer;
begin
  if current_user_id is null then
    raise exception 'unauthenticated' using errcode = '28000';
  end if;

  delete from auth.identities
   where user_id = current_user_id
     and provider = 'kakao';

  get diagnostics deleted_count = row_count;
  return deleted_count;
end;
$$;

revoke all on function public.unlink_my_kakao_identity() from public, anon;
grant execute on function public.unlink_my_kakao_identity() to authenticated, service_role;

comment on function public.unlink_my_kakao_identity() is
  'Removes the signed-in member’s Kakao identity, e.g. before account withdrawal.';
