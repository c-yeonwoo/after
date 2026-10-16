-- Policy evidence is append-only and never inferred from a profile version bump.
-- Reconsent enforcement remains OFF until the operator completes legal review
-- and explicitly activates it with an AAL2 session.
create table public.policy_catalog (
  version text primary key check (char_length(version) between 4 and 40),
  status text not null check (status in ('draft','published')),
  published_at timestamptz,
  note text not null check (char_length(note) between 3 and 300),
  check ((status='published')=(published_at is not null))
);
insert into public.policy_catalog(version,status,published_at,note)
values ('2026-10-16.1','published',now(),'현재 앱 약관·개인정보 처리방침. 법률 검토 게이트는 별도.');
alter table public.policy_catalog enable row level security;
revoke all on public.policy_catalog from public, anon, authenticated;

create table public.policy_control (
  id boolean primary key default true check (id),
  signup_version text not null references public.policy_catalog(version),
  required_reconsent_version text references public.policy_catalog(version),
  reconsent_effective_at timestamptz,
  version integer not null default 1,
  updated_by uuid references public.profiles(id) on delete set null,
  updated_at timestamptz not null default now(),
  check ((required_reconsent_version is null)=(reconsent_effective_at is null))
);
insert into public.policy_control(id,signup_version) values(true,'2026-10-16.1');
alter table public.policy_control enable row level security;
revoke all on public.policy_control from public, anon, authenticated;

create table public.policy_consents (
  id bigint generated always as identity primary key,
  user_id uuid not null references public.profiles(id) on delete cascade,
  policy_version text not null,
  evidence_source text not null check (evidence_source in ('explicit','legacy')),
  accepted_at timestamptz not null,
  unique(user_id,policy_version,evidence_source)
);
create index policy_consents_user_time on public.policy_consents(user_id,accepted_at desc);
alter table public.policy_consents enable row level security;
revoke all on public.policy_consents from public, anon, authenticated;
-- Historical timestamps are preserved as historical evidence, not newly accepted.
insert into public.policy_consents(user_id,policy_version,evidence_source,accepted_at)
select id,agreed_policy_version,'legacy',greatest(terms_agreed_at,privacy_agreed_at)
  from public.profiles
 where terms_agreed_at is not null and privacy_agreed_at is not null
   and agreed_policy_version is not null;

create function public.member_policy_current(p_user uuid) returns boolean
  language sql stable security definer set search_path = public, pg_temp as $$
  select coalesce((
    select c.required_reconsent_version is null or c.reconsent_effective_at > now()
      or exists (select 1 from public.policy_consents e where e.user_id=p_user
                   and e.policy_version=c.required_reconsent_version
                   and e.evidence_source='explicit')
      from public.policy_control c where c.id
  ),false)
$$;
revoke all on function public.member_policy_current(uuid) from public, anon, authenticated;

create function public.my_policy_status() returns jsonb
  language plpgsql stable security definer set search_path = public, pg_temp as $$
declare c public.policy_control;
begin
  if auth.uid() is null then raise exception 'unauthenticated' using errcode='28000'; end if;
  select * into c from public.policy_control where id;
  return jsonb_build_object('signup_version',c.signup_version,
    'required_version',c.required_reconsent_version,
    'effective_at',c.reconsent_effective_at,
    'reconsent_required',not public.member_policy_current(auth.uid()) or not exists (
      select 1 from public.profiles p where p.id=auth.uid()
        and p.terms_agreed_at is not null and p.privacy_agreed_at is not null),
    'as_of',now());
end $$;
revoke all on function public.my_policy_status() from public, anon;
grant execute on function public.my_policy_status() to authenticated;

create or replace function public.record_consent(p_policy_version text) returns public.profiles
  language plpgsql security definer set search_path = public, pg_temp as $$
declare v_uid uuid := auth.uid(); v_profile public.profiles; v_before public.profiles;
  v_version text; v_inserted integer; v_was_ready boolean;
begin
  if v_uid is null then raise exception 'unauthenticated' using errcode='28000'; end if;
  select c.signup_version into v_version from public.policy_control c
    join public.policy_catalog p on p.version=c.signup_version and p.status='published'
   where c.id;
  if v_version is null or p_policy_version is distinct from v_version then
    raise exception 'policy_version_mismatch' using errcode='PT409';
  end if;
  select * into v_before from public.profiles where id=v_uid and account_state='active';
  if not found then
    raise exception 'inactive account' using errcode='42501';
  end if;
  v_was_ready := (public.member_readiness(v_uid)->>'ready')::boolean;
  insert into public.policy_consents(user_id,policy_version,evidence_source,accepted_at)
    values(v_uid,v_version,'explicit',now())
    on conflict(user_id,policy_version,evidence_source) do nothing;
  get diagnostics v_inserted = row_count;
  if v_inserted = 0 then
    select * into v_profile from public.profiles where id=v_uid;
    return v_profile;
  end if;
  update public.profiles set terms_agreed_at=now(), privacy_agreed_at=now(),
      agreed_policy_version=v_version where id=v_uid returning * into v_profile;
  if not v_was_ready and v_before.terms_agreed_at is not null
     and v_before.privacy_agreed_at is not null
     and (public.member_readiness(v_uid)->>'ready')::boolean then
    perform public.ops_emit_domain_event('member_became_ready','profile',v_uid::text,v_uid,
      concat('policy_ready:',v_uid,':',gen_random_uuid()),
      jsonb_build_object('hub',v_profile.hub_id,'gender',v_profile.gender));
  end if;
  insert into public.events(user_id,name,props)
    values(v_uid,'consent_recorded',jsonb_build_object('policy_version',v_version));
  return v_profile;
end $$;

-- A targeted admin-only activation. It does not silently change the text,
-- alter existing ticket rights, or let a normal settings toggle enforce policy.
create function public.admin_policy_preview() returns jsonb
  language plpgsql stable security definer set search_path = public, pg_temp as $$
declare c public.policy_control; v_count integer;
begin
  if not public.is_admin() then raise exception 'admin only' using errcode='42501'; end if;
  select * into c from public.policy_control where id;
  select count(*) into v_count from public.profiles p
   where p.account_state='active' and p.role='member' and not exists (
    select 1 from public.policy_consents e where e.user_id=p.id
      and e.policy_version=c.signup_version and e.evidence_source='explicit');
  return jsonb_build_object('signup_version',c.signup_version,
    'required_version',c.required_reconsent_version,
    'affected_active_members',v_count,'control_version',c.version,'as_of',now());
end $$;
revoke all on function public.admin_policy_preview() from public, anon;
grant execute on function public.admin_policy_preview() to authenticated;

create function public.admin_activate_policy_reconsent(
  p_expected_version integer,p_effective_at timestamptz,p_reason text,p_request_id uuid
) returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare c public.policy_control;
begin
  if not public.is_admin() then raise exception 'admin only' using errcode='42501'; end if;
  if coalesce(auth.jwt()->>'aal','') <> 'aal2' then
    raise exception 'AAL2 required' using errcode='42501';
  end if;
  if p_request_id is null or char_length(btrim(coalesce(p_reason,''))) not between 10 and 500
     or p_effective_at is null or p_effective_at < now()+interval '1 day'
     or p_effective_at > now()+interval '30 days' then
    raise exception 'invalid activation' using errcode='22023';
  end if;
  select * into c from public.policy_control where id for update;
  if c.version <> p_expected_version or c.required_reconsent_version is not null then
    raise exception 'stale_or_active_policy' using errcode='PT409';
  end if;
  update public.policy_control set required_reconsent_version=signup_version,
      reconsent_effective_at=p_effective_at,version=version+1,
      updated_by=auth.uid(),updated_at=now() where id;
  insert into public.admin_actions(actor_id,kind,request_id,note)
    values(auth.uid(),'policy_activation',p_request_id,
      concat('policy reconsent activation: ',c.signup_version,'; ',btrim(p_reason)));
  return public.admin_policy_preview();
end $$;
revoke all on function public.admin_activate_policy_reconsent(integer,timestamptz,text,uuid)
  from public, anon;
grant execute on function public.admin_activate_policy_reconsent(integer,timestamptz,text,uuid)
  to authenticated;

alter table public.admin_actions drop constraint admin_actions_kind_check;
alter table public.admin_actions add constraint admin_actions_kind_check check (kind = any (array[
  'resolve_report', 'ban', 'unban', 'refund', 'cancel_meeting', 'review_photo', 'set_queue',
  'resolve_no_show', 'set_payments', 'fulfill_order', 'reset_photo', 'retry_notification',
  'set_queue_reason', 'upsert_place', 'reconcile_payment', 'case_transition',
  'automation_rule', 'automation_approval', 'policy_activation'
]));
