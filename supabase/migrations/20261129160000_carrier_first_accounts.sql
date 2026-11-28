-- KCP is the only source of phone verification. GoTrue serves password
-- grants for those accounts and must not send its own signup/recovery SMS.
create function public.deny_auth_sms(event jsonb) returns jsonb
language sql set search_path='' as $$
  select '{"error":{"http_code":403,"message":"Use After carrier verification"}}'::jsonb
$$;
revoke all on function public.deny_auth_sms(jsonb) from public,anon,authenticated;
grant execute on function public.deny_auth_sms(jsonb) to supabase_auth_admin;

-- A phone or Kakao account can finish registration without a mailbox.
alter table public.profiles alter column company_email drop not null;

alter table public.signup_sessions
  add column account_attempts integer not null default 0,
  add column preview_only boolean not null default false,
  add column kakao_owner uuid;

create function public.bind_signup_login() returns trigger
language plpgsql security definer set search_path=public,pg_temp as $$
begin
  if exists(select 1 from auth.identities where user_id=auth.uid() and provider='kakao') then
    new.kakao_owner := auth.uid();
  end if;
  return new;
end $$;
revoke all on function public.bind_signup_login() from public,anon,authenticated;
create trigger bind_signup_login before insert on public.signup_sessions
  for each row execute function public.bind_signup_login();

-- Before public rollout, existing pending direct registrations were device previews.
update public.signup_sessions s set preview_only=true
  where not public.carrier_identity_required() and s.claimed_at is null and s.expires_at>now()
    and (s.verified_at is not null or exists(select 1 from public.signup_identity_attempts a
      join public.kcp_direct_registrations r on r.id=a.id where a.session_id=s.id));

create function public.start_preview_signup_identity(p_token text,p_id text) returns void
language plpgsql security definer set search_path=public,extensions,pg_temp as $$
begin
  perform public.start_signup_identity(p_token,p_id);
  update public.signup_sessions set preview_only=true
    where token_hash=encode(extensions.digest(p_token,'sha256'),'hex');
end $$;
revoke all on function public.start_preview_signup_identity(text,text) from public, anon, authenticated;
grant execute on function public.start_preview_signup_identity(text,text) to service_role;

-- Service-only lookup used before provisioning a phone credential. The browser
-- cannot supply a phone number, and device previews cannot create memberships.
create function public.signup_account_phone(p_token text) returns text
language plpgsql security definer set search_path=public,extensions,pg_temp as $$
declare v public.signup_sessions;
begin
  if not public.carrier_identity_required() then
    raise exception 'signup unavailable' using errcode='42501';
  end if;
  select * into v from public.signup_sessions
    where token_hash=encode(extensions.digest(p_token,'sha256'),'hex')
      and expires_at>now() and claimed_at is null for update;
  if not found or v.preview_only or v.kakao_owner is not null or v.verified_at is null or v.verified_phone is null
     or v.verified_di_hash is null then
    raise exception 'signup identity required' using errcode='42501';
  end if;
  if v.policy_version is distinct from (select signup_version from public.policy_control where id) then
    raise exception 'policy_version_mismatch' using errcode='PT409';
  end if;
  if exists (select 1 from public.profiles where phone=v.verified_phone)
     or exists (select 1 from public.carrier_identity_links where di_hash=v.verified_di_hash)
     or exists (select 1 from auth.users where phone=ltrim(v.verified_phone,'+')
       and (raw_app_meta_data->>'after_phone_signup') is distinct from 'true') then
    raise exception 'identity already in use' using errcode='23505';
  end if;
  if v.account_attempts>=5 then raise exception 'daily limit'; end if;
  update public.signup_sessions set account_attempts=account_attempts+1 where id=v.id;
  return v.verified_phone;
end $$;
revoke all on function public.signup_account_phone(text) from public, anon, authenticated;
grant execute on function public.signup_account_phone(text) to service_role;

create or replace function public.create_signup_profile(
  p_token text,p_hub_id text,p_gender public.gender default null
) returns public.profiles
  language plpgsql security definer set search_path = public, extensions, pg_temp as $$
declare v public.signup_sessions; p public.profiles; v_gender public.gender;
begin
  if auth.uid() is null then raise exception 'unauthenticated' using errcode='28000'; end if;
  select * into v from public.signup_sessions
    where token_hash=encode(extensions.digest(p_token,'sha256'),'hex') for update;
  if not found then raise exception 'signup expired' using errcode='P0002'; end if;
  if v.preview_only or (v.verified_at is not null and not public.carrier_identity_required()) then
    raise exception 'signup unavailable' using errcode='42501';
  end if;
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
  if v.verified_at is null then
    p := public.create_my_profile_base(v_gender,p_hub_id);
  else
    perform 1 from auth.users where id=auth.uid() for update;
    -- The service-issued phone account must have the exact number on the proof.
    -- A Kakao identity is recorded by Auth, independent of email consent at Kakao.
    if not exists (
      select 1 from auth.identities where user_id=auth.uid() and provider='kakao'
        and v.kakao_owner=auth.uid()
    ) and not exists (
      select 1 from auth.users where v.kakao_owner is null and id=auth.uid() and phone_confirmed_at is not null
        and phone=ltrim(v.verified_phone,'+')
        and raw_app_meta_data->>'after_phone_signup'='true'
    ) then
      raise exception 'verified login required' using errcode='42501';
    end if;
    if nullif(trim(p_hub_id),'') is null then
      raise exception 'hub required' using errcode='22023';
    end if;
    insert into public.profiles(id, gender, hub_id, company_email, email_verified_at)
      select id, v_gender, p_hub_id, nullif(lower(email),''), email_confirmed_at
        from auth.users where id=auth.uid()
      returning * into p;
  end if;
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

CREATE OR REPLACE FUNCTION public.member_readiness_snapshot(p profiles)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare blockers text[] := '{}';
begin
  if p.id is null or p.account_state <> 'active' or p.role <> 'member' then
    blockers := array_append(blockers,'account_inactive');
  end if;
  if p.paused_at is not null then blockers := array_append(blockers,'paused'); end if;
  if p.onboarding_step <> 7 or p.name is null then
    blockers := array_append(blockers,'profile_incomplete');
  end if;
  if p.email_verified_at is null and p.identity_verified_at is null then
    blockers := array_append(blockers,'email_unverified');
  end if;
  if p.hub_id='undecided' then blockers:=array_append(blockers,'meeting_area_required'); end if;
  if p.phone_verified_at is null then
    blockers := array_append(blockers,'phone_unverified');
  end if;
  if public.carrier_identity_required() and (
    p.identity_verified_at is null or p.birth is null or
    extract(year from age((now() at time zone 'Asia/Seoul')::date,p.birth)) < 19
  ) then blockers := array_append(blockers,'adult_unverified'); end if;
  if coalesce(cardinality(p.photo_paths),0) < 3 then
    blockers := array_append(blockers,'photos_missing');
  elsif p.photo_state='rejected' then
    blockers := array_append(blockers,'photos_rejected');
  elsif p.photo_state<>'approved' then
    blockers := array_append(blockers,'photos_pending');
  end if;
  if p.terms_agreed_at is null or p.privacy_agreed_at is null
     or not public.member_policy_current(p.id) then
    blockers := array_append(blockers,'policy_required');
  end if;
  return jsonb_build_object('ready',cardinality(blockers)=0,'blockers',blockers);
end $function$
;

create or replace view public.eligible_profiles with (security_invoker=true) as
 select id,gender,hub_id,company_email,email_verified_at,account_state,banned_reason,
        name,birth,job,photo_url,mbti,smoking,drinking,religion,headline,interests,
        match_tags,topics,onboarding_step,created_at,updated_at,intro,details,
        match_note,topic_note,terms_agreed_at,privacy_agreed_at,agreed_policy_version,
        feedback_emails,paused_at,role,photo_state,photo_reviewed_at,photo_reviewed_by,
        photo_reject_reason,photo_paths,phone_verified_at
   from public.profiles
  where role='member' and (email_verified_at is not null or identity_verified_at is not null) and account_state='active'
    and onboarding_step=7 and terms_agreed_at is not null and privacy_agreed_at is not null
    and paused_at is null and name is not null and coalesce(cardinality(photo_paths),0)>=3
    and phone_verified_at is not null and photo_state='approved'
    and (not public.carrier_identity_required() or (
      identity_verified_at is not null and birth is not null
      and extract(year from age((now() at time zone 'Asia/Seoul')::date,birth))>=19
    )) and public.member_policy_current(id) and not public.member_meeting_hold(id);
CREATE OR REPLACE FUNCTION public.profile_candidate_ready(p profiles)
 RETURNS boolean
 LANGUAGE sql
 STABLE
 SET search_path TO 'public', 'pg_temp'
AS $function$
  select not public.member_meeting_hold(p.id) and p.role = 'member' and p.gender = 'male'
     and p.hub_id<>'undecided' and public.member_policy_current(p.id)
     and (p.email_verified_at is not null or p.identity_verified_at is not null) and p.account_state = 'active'
     and p.onboarding_step = 7 and p.terms_agreed_at is not null
     and p.privacy_agreed_at is not null and p.paused_at is null
     and p.name is not null and coalesce(cardinality(p.photo_paths), 0) >= 3
     and p.phone_verified_at is not null and p.photo_state = 'approved'
     and (not carrier_identity_required() or (
       p.identity_verified_at is not null and p.birth is not null
       and extract(year from age((now() at time zone 'Asia/Seoul')::date, p.birth)) >= 19
     ))
$function$
;

-- Retain the withdrawn application record for its existing accounting obligations,
-- but remove the additional native credential that this signup path introduced.
create function public.erase_withdrawn_phone_login() returns trigger
language plpgsql security definer set search_path=public,pg_temp as $$
begin
  if exists(select 1 from auth.users where id=new.id and raw_app_meta_data->>'after_phone_signup'='true') then
    delete from auth.sessions where user_id=new.id;
    delete from auth.identities where user_id=new.id and provider='phone';
    update auth.users set phone=null,phone_confirmed_at=null,phone_change='',phone_change_token='',
      encrypted_password=null,raw_app_meta_data=raw_app_meta_data-'after_phone_signup'
      where id=new.id;
  end if;
  return new;
end $$;
revoke all on function public.erase_withdrawn_phone_login() from public,anon,authenticated;
create trigger erase_withdrawn_phone_login after update of account_state on public.profiles
  for each row when (new.account_state='withdrawn' and old.account_state is distinct from new.account_state)
  execute function public.erase_withdrawn_phone_login();

-- A tab can close after Auth provisioning but before the membership transaction.
-- The original signup capability is valid for one hour. Keep any live retry.
create or replace function public.purge_signup_sessions() returns void
language plpgsql security definer set search_path=public,pg_temp as $$
declare orphan uuid;
begin
  delete from public.signup_sessions where expires_at<=now();
  for orphan in select u.id from auth.users u
    where u.raw_app_meta_data->>'after_phone_signup'='true'
      and u.created_at<now()-interval '1 hour'
      and not exists(select 1 from public.profiles where id=u.id)
      and not exists(select 1 from public.signup_sessions
                     where verified_phone='+'||u.phone and expires_at>now() and claimed_at is null)
    for update of u skip locked
  loop
    -- Recheck after acquiring the same row lock used by profile creation.
    delete from auth.users u where u.id=orphan
      and not exists(select 1 from public.profiles where id=u.id)
      and not exists(select 1 from auth.identities where user_id=u.id and provider<>'phone');
  end loop;
end $$;
