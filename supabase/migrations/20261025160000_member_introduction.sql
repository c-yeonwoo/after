-- Member-facing explanation of two currently readable PUBLIC profiles.
-- No automatic introduction, decision, preference inference or publication.
alter table public.app_settings
  add column assistant_introduction_enabled boolean not null default false;

create table public.member_introductions (
  owner_id uuid not null references public.profiles(id) on delete cascade,
  target_id uuid not null references public.profiles(id) on delete cascade,
  owner_revision timestamptz not null,
  target_revision timestamptz not null,
  source_hash text not null check (source_hash ~ '^[0-9a-f]{64}$'),
  result jsonb not null check (jsonb_typeof(result)='object' and octet_length(result::text)<=18000),
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default (now()+interval '12 hours'),
  primary key(owner_id,target_id),
  check(owner_id<>target_id)
);
alter table public.member_introductions enable row level security;
revoke all on public.member_introductions from public,anon,authenticated;
grant all on public.member_introductions to service_role;

-- Reuse the canonical public_profiles visibility rules under the exact owner
-- identity. Never replicate the introduction/exclusion/carrier rules here.
-- This helper is service-only and always restores request claims before return.
create function public.member_introduction_access(p_owner uuid,p_target uuid)
returns boolean language plpgsql security definer set search_path='' as $$
declare
  old_sub text:=current_setting('request.jwt.claim.sub',true);
  old_claims text:=current_setting('request.jwt.claims',true);
  allowed boolean;
begin
  if p_owner is null or p_target is null or p_owner=p_target then return false; end if;
  perform set_config('request.jwt.claim.sub',p_owner::text,true);
  perform set_config('request.jwt.claims',jsonb_build_object('sub',p_owner,'role','authenticated')::text,true);
  select exists(select 1 from public.public_profiles pp where pp.id=p_target) into allowed;
  perform set_config('request.jwt.claim.sub',coalesce(old_sub,''),true);
  perform set_config('request.jwt.claims',coalesce(old_claims,''),true);
  return allowed;
exception when others then
  perform set_config('request.jwt.claim.sub',coalesce(old_sub,''),true);
  perform set_config('request.jwt.claims',coalesce(old_claims,''),true);
  raise;
end $$;
revoke all on function public.member_introduction_access(uuid,uuid) from public,anon,authenticated;
grant execute on function public.member_introduction_access(uuid,uuid) to service_role;

create function public.read_member_introduction(
  p_owner uuid,p_target uuid,p_owner_revision timestamptz,p_target_revision timestamptz,p_source_hash text
) returns jsonb language plpgsql security definer set search_path='' as $$
declare cached public.member_introductions;
begin
  if not coalesce((select assistant_introduction_enabled from public.app_settings where id),false)
    or p_owner=p_target then return null; end if;
  perform id from public.profiles where id in(p_owner,p_target) order by id for share;
  if not exists(select 1 from public.profiles where id=p_owner and account_state='active' and onboarding_step>=7 and updated_at=p_owner_revision)
    or not exists(select 1 from public.profiles where id=p_target and account_state='active' and onboarding_step>=7 and updated_at=p_target_revision)
    or not public.member_introduction_access(p_owner,p_target)
  then return null; end if;
  select * into cached from public.member_introductions
   where owner_id=p_owner and target_id=p_target and source_hash=p_source_hash
     and owner_revision=p_owner_revision and target_revision=p_target_revision and expires_at>clock_timestamp();
  if not found then return null; end if;
  return jsonb_build_object('result',cached.result,'expiresAt',cached.expires_at);
end $$;
revoke all on function public.read_member_introduction(uuid,uuid,timestamptz,timestamptz,text) from public,anon,authenticated;
grant execute on function public.read_member_introduction(uuid,uuid,timestamptz,timestamptz,text) to service_role;

create function public.store_member_introduction(
  p_owner uuid,p_target uuid,p_owner_revision timestamptz,p_target_revision timestamptz,p_source_hash text,p_result jsonb
) returns jsonb language plpgsql security definer set search_path='' as $$
declare expiry timestamptz:=clock_timestamp()+interval '12 hours';
begin
  if p_owner is null or p_target is null or p_owner=p_target or p_source_hash is null
    or p_source_hash !~ '^[0-9a-f]{64}$' or p_result is null
    or jsonb_typeof(p_result)<>'object' or octet_length(p_result::text)>18000
  then return null; end if;
  perform id from public.profiles where id in(p_owner,p_target) order by id for update;
  if not coalesce((select assistant_introduction_enabled from public.app_settings where id),false)
    or not exists(select 1 from public.profiles where id=p_owner and account_state='active' and onboarding_step>=7 and updated_at=p_owner_revision)
    or not exists(select 1 from public.profiles where id=p_target and account_state='active' and onboarding_step>=7 and updated_at=p_target_revision)
    or not public.member_introduction_access(p_owner,p_target)
  then return null; end if;
  insert into public.member_introductions(owner_id,target_id,owner_revision,target_revision,source_hash,result,created_at,expires_at)
  values(p_owner,p_target,p_owner_revision,p_target_revision,p_source_hash,p_result,clock_timestamp(),expiry)
  on conflict(owner_id,target_id) do update set owner_revision=excluded.owner_revision,target_revision=excluded.target_revision,
    source_hash=excluded.source_hash,result=excluded.result,created_at=excluded.created_at,expires_at=excluded.expires_at;
  return jsonb_build_object('expiresAt',expiry);
end $$;
revoke all on function public.store_member_introduction(uuid,uuid,timestamptz,timestamptz,text,jsonb) from public,anon,authenticated;
grant execute on function public.store_member_introduction(uuid,uuid,timestamptz,timestamptz,text,jsonb) to service_role;

create function public.clear_member_introductions() returns trigger
language plpgsql security definer set search_path='' as $$
begin
  delete from public.member_introductions where owner_id=new.id or target_id=new.id;
  return new;
end $$;
revoke all on function public.clear_member_introductions() from public,anon,authenticated;
create trigger clear_member_introductions_on_profile_change
after update on public.profiles for each row execute function public.clear_member_introductions();

select cron.schedule('expire-member-introductions','29 * * * *',
  $$delete from public.member_introductions where expires_at<now()$$);
