-- One profile snapshot evaluator serves both API readiness and transition events.
-- Policy activation is OFF initially, so existing rights are unchanged.
create function public.member_readiness_snapshot(p public.profiles) returns jsonb
  language plpgsql stable security definer set search_path = public, pg_temp as $$
declare blockers text[] := '{}';
begin
  if p.id is null or p.account_state <> 'active' or p.role <> 'member' then
    blockers := array_append(blockers,'account_inactive');
  end if;
  if p.paused_at is not null then blockers := array_append(blockers,'paused'); end if;
  if p.onboarding_step <> 7 or p.name is null then
    blockers := array_append(blockers,'profile_incomplete');
  end if;
  if p.email_verified_at is null then
    blockers := array_append(blockers,'work_email_unverified');
  end if;
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
end $$;
revoke all on function public.member_readiness_snapshot(public.profiles)
  from public, anon, authenticated;

create or replace function public.member_readiness(p_user uuid) returns jsonb
  language plpgsql stable security definer set search_path = public, pg_temp as $$
declare p public.profiles;
begin
  select * into p from public.profiles where id=p_user;
  if not found then
    return jsonb_build_object('ready',false,'blockers',array['account_inactive']);
  end if;
  return public.member_readiness_snapshot(p);
end $$;

create or replace view public.eligible_profiles with (security_invoker=true) as
 select id,gender,hub_id,company_email,email_verified_at,account_state,banned_reason,
        name,birth,job,photo_url,mbti,smoking,drinking,religion,headline,interests,
        match_tags,topics,onboarding_step,created_at,updated_at,intro,details,
        match_note,topic_note,terms_agreed_at,privacy_agreed_at,agreed_policy_version,
        feedback_emails,paused_at,role,photo_state,photo_reviewed_at,photo_reviewed_by,
        photo_reject_reason,photo_paths,phone_verified_at
   from public.profiles
  where role='member' and email_verified_at is not null and account_state='active'
    and onboarding_step=7 and terms_agreed_at is not null and privacy_agreed_at is not null
    and paused_at is null and name is not null and coalesce(cardinality(photo_paths),0)>=3
    and phone_verified_at is not null and photo_state='approved'
    and (not public.carrier_identity_required() or (
      identity_verified_at is not null and birth is not null
      and extract(year from age((now() at time zone 'Asia/Seoul')::date,birth))>=19
    )) and public.member_policy_current(id);

-- New paid orders are blocked while reconsent is due; ticket history,
-- refunds, support, and withdrawal are not touched.
create function public.guard_ticket_order_policy() returns trigger
  language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if auth.uid() = new.user_id and not public.member_policy_current(new.user_id) then
    raise exception 'policy_reconsent_required' using errcode='PT409';
  end if;
  return new;
end $$;
revoke all on function public.guard_ticket_order_policy() from public, anon, authenticated;
create trigger guard_ticket_order_policy before insert on public.ticket_orders
  for each row execute function public.guard_ticket_order_policy();

-- Preserve active meetings on the home screen, but provide a dedicated
-- reconsent path instead of sending members back through onboarding.
alter function public.home_state_v2() rename to home_state_v2_base;
revoke all on function public.home_state_v2_base() from public, anon, authenticated;
create function public.home_state_v2() returns jsonb
  language plpgsql volatile security definer set search_path = public, pg_temp as $$
declare v jsonb;
begin
  if auth.uid() is null then raise exception 'unauthenticated' using errcode='28000'; end if;
  v := public.home_state_v2_base();
  if v->>'primary_state'='profile_incomplete' and
     v->'readiness'->'blockers' ? 'policy_required' then
    v := jsonb_set(v,'{primary_state}','"policy_required"'::jsonb);
    v := jsonb_set(v,'{next_action}',jsonb_build_object('type','renew_policy','target_id',null));
    v := jsonb_set(v,'{notice}','"policy_reconsent"'::jsonb);
  end if;
  return v;
end $$;
revoke all on function public.home_state_v2() from public, anon;
grant execute on function public.home_state_v2() to authenticated;

alter table public.domain_events drop constraint domain_events_event_type_check;
alter table public.domain_events add constraint domain_events_event_type_check check (event_type in (
  'support_requested','support_answered','photo_submitted','photo_reviewed',
  'content_reported','content_report_resolved','no_show_reported','no_show_resolved',
  'payment_attention','payment_reconciled','meeting_confirmed','meeting_canceled',
  'ticket_issued','ticket_consumed','ticket_restored','intro_delivered','intro_opened',
  'intro_expired','member_became_ready','member_became_unready'
));

create function public.ops_project_member_readiness() returns trigger
  language plpgsql security definer set search_path = public, pg_temp as $$
declare v_old boolean; v_new boolean;
begin
  v_old := case when tg_op='INSERT' then false
    else (public.member_readiness_snapshot(old)->>'ready')::boolean end;
  v_new := (public.member_readiness_snapshot(new)->>'ready')::boolean;
  if v_old is distinct from v_new then
    perform public.ops_emit_domain_event(
      case when v_new then 'member_became_ready' else 'member_became_unready' end,
      'profile',new.id::text,new.id,
      concat('readiness:',new.id,':',gen_random_uuid()),
      jsonb_build_object('hub',new.hub_id,'gender',new.gender));
  end if;
  return new;
end $$;
revoke all on function public.ops_project_member_readiness() from public, anon, authenticated;
create trigger ops_project_member_readiness
 after insert or update of account_state,paused_at,onboarding_step,name,email_verified_at,
   phone_verified_at,identity_verified_at,birth,photo_paths,photo_state,
   terms_agreed_at,privacy_agreed_at,agreed_policy_version on public.profiles
 for each row execute function public.ops_project_member_readiness();
