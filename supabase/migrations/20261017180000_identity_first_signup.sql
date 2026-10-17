-- Consent precedes any signup information. A short-lived bearer capability
-- carries provider-verified identity across company-email authentication.
create table public.signup_sessions (
  id uuid primary key default gen_random_uuid(),
  token_hash text not null unique check (token_hash ~ '^[0-9a-f]{64}$'),
  policy_version text not null references public.policy_catalog(version),
  accepted_at timestamptz not null default now(),
  expires_at timestamptz not null default now() + interval '1 hour',
  ip_hash text not null,
  verified_at timestamptz,
  verified_gender public.gender,
  verified_birth date,
  verified_phone text,
  verified_di_hash text,
  verification_id text,
  claimed_by uuid references auth.users(id) on delete cascade,
  claimed_at timestamptz
);
create index signup_sessions_expiry on public.signup_sessions(expires_at);
create index signup_sessions_ip on public.signup_sessions(ip_hash, accepted_at);
alter table public.signup_sessions enable row level security;
revoke all on public.signup_sessions from public, anon, authenticated;
grant select, insert, update, delete on public.signup_sessions to service_role;

create table public.signup_identity_attempts (
  id text primary key check (id ~ '^av[0-9a-f]{32}$'),
  session_id uuid not null references public.signup_sessions(id) on delete cascade,
  created_at timestamptz not null default now(),
  consumed_at timestamptz
);
create index signup_identity_attempts_session on public.signup_identity_attempts(session_id);
alter table public.signup_identity_attempts enable row level security;
revoke all on public.signup_identity_attempts from public, anon, authenticated;
grant select, insert, update, delete on public.signup_identity_attempts to service_role;

create function public.begin_signup(p_token text, p_policy_version text) returns jsonb
  language plpgsql security definer set search_path = public, extensions, pg_temp as $$
declare v public.signup_sessions; v_ip text; v_headers jsonb; v_version text;
begin
  if p_token is null or p_token !~ '^[0-9a-f]{64}$' then
    raise exception 'invalid signup token' using errcode='22023';
  end if;
  select signup_version into v_version from public.policy_control where id;
  if p_policy_version is distinct from v_version then
    raise exception 'policy_version_mismatch' using errcode='PT409';
  end if;
  v_headers := coalesce(nullif(current_setting('request.headers',true),''),'{}')::jsonb;
  v_ip := encode(extensions.digest(coalesce(v_headers->>'x-forwarded-for','unknown'),'sha256'),'hex');
  perform pg_advisory_xact_lock(hashtextextended('signup:' || v_ip, 0));
  if (select count(*) from public.signup_sessions
       where ip_hash=v_ip and accepted_at>now()-interval '1 hour') >= 100 then
    raise exception 'signup rate limit' using errcode='P0001';
  end if;
  insert into public.signup_sessions(token_hash,policy_version,ip_hash)
    values(encode(extensions.digest(p_token,'sha256'),'hex'),v_version,v_ip)
    returning * into v;
  return jsonb_build_object('policyVersion',v.policy_version,'acceptedAt',v.accepted_at,
    'expiresAt',v.expires_at,'verified',false);
end $$;
revoke all on function public.begin_signup(text,text) from public;
grant execute on function public.begin_signup(text,text) to anon, authenticated;

create function public.signup_session_status(p_token text) returns jsonb
  language plpgsql stable security definer set search_path = public, extensions, pg_temp as $$
declare v public.signup_sessions;
begin
  select * into v from public.signup_sessions
    where token_hash=encode(extensions.digest(p_token,'sha256'),'hex');
  if not found or v.expires_at<=now() or v.claimed_at is not null then
    raise exception 'signup expired' using errcode='P0002';
  end if;
  if v.policy_version is distinct from (select signup_version from public.policy_control where id) then
    raise exception 'policy_version_mismatch' using errcode='PT409';
  end if;
  return jsonb_build_object('policyVersion',v.policy_version,'acceptedAt',v.accepted_at,
    'expiresAt',v.expires_at,'verified',v.verified_at is not null,
    'gender',v.verified_gender,'birth',v.verified_birth);
end $$;
revoke all on function public.signup_session_status(text) from public;
grant execute on function public.signup_session_status(text) to anon, authenticated;

create function public.start_signup_identity(p_token text, p_id text) returns void
  language plpgsql security definer set search_path = public, extensions, pg_temp as $$
declare v public.signup_sessions;
begin
  perform public.signup_session_status(p_token);
  select * into v from public.signup_sessions
    where token_hash=encode(extensions.digest(p_token,'sha256'),'hex') for update;
  if v.verified_at is not null then
    raise exception 'already verified' using errcode='P0001';
  end if;
  if (select count(*) from public.signup_identity_attempts where session_id=v.id) >= 5 then
    raise exception 'daily limit' using errcode='P0001';
  end if;
  insert into public.signup_identity_attempts(id,session_id) values(p_id,v.id);
end $$;
revoke all on function public.start_signup_identity(text,text) from public, anon, authenticated;
grant execute on function public.start_signup_identity(text,text) to service_role;

create function public.finish_signup_identity(
  p_token text, p_id text, p_gender public.gender, p_birth date, p_phone text, p_di text
) returns jsonb
  language plpgsql security definer set search_path = public, extensions, pg_temp as $$
declare v public.signup_sessions; a public.signup_identity_attempts; v_di text;
begin
  select * into v from public.signup_sessions
    where token_hash=encode(extensions.digest(p_token,'sha256'),'hex') for update;
  if not found or v.expires_at<=now() or v.claimed_at is not null then
    raise exception 'signup expired' using errcode='P0002';
  end if;
  select * into a from public.signup_identity_attempts where id=p_id for update;
  if not found or a.session_id<>v.id or a.created_at<now()-interval '15 minutes'
     or (a.consumed_at is not null and v.verification_id is distinct from p_id) then
    raise exception 'verification expired' using errcode='P0002';
  end if;
  if a.consumed_at is not null then return public.signup_session_status(p_token); end if;
  if v.verified_at is not null then raise exception 'already verified' using errcode='P0001'; end if;
  if p_birth is null or p_birth>(now() at time zone 'Asia/Seoul')::date
     or extract(year from age((now() at time zone 'Asia/Seoul')::date,p_birth))<19 then
    raise exception 'adult only' using errcode='22023';
  end if;
  if p_gender is null or p_phone is null or p_phone !~ '^\+82[0-9]{9,10}$'
     or nullif(btrim(p_di),'') is null then
    raise exception 'incomplete verified identity' using errcode='22023';
  end if;
  v_di := encode(extensions.digest(p_di,'sha256'),'hex');
  if exists(select 1 from public.carrier_identity_links where di_hash=v_di)
     or exists(select 1 from public.profiles where phone=p_phone) then
    raise exception 'identity already in use' using errcode='23505';
  end if;
  update public.signup_sessions set verified_at=now(),verified_gender=p_gender,
    verified_birth=p_birth,verified_phone=p_phone,verified_di_hash=v_di,verification_id=p_id
    where id=v.id;
  update public.signup_identity_attempts set consumed_at=now() where id=p_id;
  return public.signup_session_status(p_token);
end $$;
revoke all on function public.finish_signup_identity(text,text,public.gender,date,text,text)
  from public, anon, authenticated;
grant execute on function public.finish_signup_identity(text,text,public.gender,date,text,text)
  to service_role;

-- Old clients can use the old beta route while rollout is OFF. Once the
-- server gate is ON, it cannot bypass identity-first registration.
alter function public.create_my_profile(public.gender,text) rename to create_my_profile_base;
revoke all on function public.create_my_profile_base(public.gender,text)
  from public, anon, authenticated, service_role;
create function public.create_my_profile(p_gender public.gender,p_hub_id text) returns public.profiles
  language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if public.carrier_identity_required() then
    raise exception 'signup identity required' using errcode='42501';
  end if;
  return public.create_my_profile_base(p_gender,p_hub_id);
end $$;
revoke all on function public.create_my_profile(public.gender,text) from public, anon;
grant execute on function public.create_my_profile(public.gender,text) to authenticated;

create function public.create_signup_profile(
  p_token text,p_hub_id text,p_gender public.gender default null
) returns public.profiles
  language plpgsql security definer set search_path = public, extensions, pg_temp as $$
declare v public.signup_sessions; p public.profiles; v_gender public.gender;
begin
  if auth.uid() is null then raise exception 'unauthenticated' using errcode='28000'; end if;
  select * into v from public.signup_sessions
    where token_hash=encode(extensions.digest(p_token,'sha256'),'hex') for update;
  if not found then raise exception 'signup expired' using errcode='P0002'; end if;
  if v.claimed_by=auth.uid() then
    select * into p from public.profiles where id=auth.uid() and account_state='active';
    if found then return p; end if;
  end if;
  if v.claimed_at is not null or v.expires_at<=now() then
    raise exception 'signup expired' using errcode='P0002';
  end if;
  if v.policy_version is distinct from (select signup_version from public.policy_control where id) then
    raise exception 'policy_version_mismatch' using errcode='PT409';
  end if;
  if exists(select 1 from public.profiles where id=auth.uid()) then
    raise exception 'account already registered' using errcode='23505';
  end if;
  if public.carrier_identity_required() and v.verified_at is null then
    raise exception 'signup identity required' using errcode='42501';
  end if;
  v_gender := case when v.verified_at is not null then v.verified_gender else p_gender end;
  if v_gender is null then raise exception 'gender required' using errcode='22023'; end if;
  p := public.create_my_profile_base(v_gender,p_hub_id);
  if v.verified_at is not null then
    begin
      insert into public.carrier_identity_links(user_id,di_hash) values(p.id,v.verified_di_hash);
      update public.profiles set birth=v.verified_birth,phone=v.verified_phone,
        phone_verified_at=v.verified_at,identity_verified_at=v.verified_at,
        identity_verification_id=v.verification_id where id=p.id;
    exception when unique_violation then
      raise exception 'identity already in use' using errcode='23505';
    end;
  end if;
  insert into public.policy_consents(user_id,policy_version,evidence_source,accepted_at)
    values(p.id,v.policy_version,'explicit',v.accepted_at);
  update public.profiles set terms_agreed_at=v.accepted_at,privacy_agreed_at=v.accepted_at,
    agreed_policy_version=v.policy_version where id=p.id returning * into p;
  update public.signup_sessions set claimed_by=p.id,claimed_at=now(),verified_gender=null,
    verified_birth=null,verified_phone=null,verified_di_hash=null,ip_hash=''
    where id=v.id;
  insert into public.events(user_id,name,props) values(p.id,'consent_recorded',
    jsonb_build_object('policy_version',v.policy_version,'accepted_at',v.accepted_at));
  return p;
end $$;
revoke all on function public.create_signup_profile(text,text,public.gender) from public, anon;
grant execute on function public.create_signup_profile(text,text,public.gender) to authenticated;

create function public.purge_signup_sessions() returns void
  language sql security definer set search_path = public, pg_temp as $$
  delete from public.signup_sessions where expires_at<=now();
$$;
revoke all on function public.purge_signup_sessions() from public, anon, authenticated;
grant execute on function public.purge_signup_sessions() to service_role;
select cron.schedule('purge_signup_sessions_15m','*/15 * * * *',
  $$ select public.purge_signup_sessions(); $$);

insert into public.policy_catalog(version,status,published_at,note)
values('2026-10-17.2','published',now(),'가입 전 동의·통신사 본인확인 항목과 미완료 임시 정보의 파기 기한 반영');
update public.policy_control set signup_version='2026-10-17.2',version=version+1,updated_at=now()
  where id and required_reconsent_version is null;
do $$ begin
  if (select signup_version from public.policy_control where id) is distinct from '2026-10-17.2' then
    raise exception 'policy signup version not updated; review active reconsent before deploy';
  end if;
end $$;
