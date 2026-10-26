-- Verified gender must agree with existing profiles. Do not silently rewrite
-- matching history when a beta user's manually entered gender differs.
-- Keep the old implementation private so all Edge calls require provider gender.
revoke execute on function public.finish_carrier_identity(uuid,text,date,text,text) from service_role;

create function public.finish_carrier_identity(
  p_user uuid, p_id text, p_birth date, p_phone text, p_di text, p_gender public.gender
) returns public.profiles
language plpgsql security definer set search_path=public,extensions,pg_temp as $$
declare a public.identity_verification_attempts; p public.profiles;
begin
  select * into a from public.identity_verification_attempts where id=p_id for update;
  if not found or a.user_id is distinct from p_user then
    raise exception 'verification attempt expired' using errcode='P0002';
  end if;
  select * into p from public.profiles where id=p_user and account_state='active' for update;
  if not found then raise exception 'active profile not found' using errcode='P0002'; end if;
  if p_gender is null or p.gender is distinct from p_gender then
    raise exception 'identity gender mismatch' using errcode='22023';
  end if;
  if a.consumed_at is not null then
    if p.identity_verification_id=p_id and p.identity_verified_at is not null then return p; end if;
    raise exception 'verification attempt expired' using errcode='P0002';
  end if;
  if p_phone is null or p_birth is null or p_birth>(now() at time zone 'Asia/Seoul')::date then
    raise exception 'incomplete verified identity' using errcode='22023';
  end if;
  return public.finish_carrier_identity(p_user,p_id,p_birth,p_phone,p_di);
end $$;
revoke all on function public.finish_carrier_identity(uuid,text,date,text,text,public.gender)
  from public,anon,authenticated;
grant execute on function public.finish_carrier_identity(uuid,text,date,text,text,public.gender)
  to service_role;
