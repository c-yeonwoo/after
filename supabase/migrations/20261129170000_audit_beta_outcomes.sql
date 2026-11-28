-- Anonymous visitors only need the sale switch, never the administrator or other settings.
create function public.public_payment_mode() returns boolean
language sql stable security definer set search_path = '' as $$
  select s.payments_enabled from public.app_settings s where s.id
$$;
revoke all on function public.public_payment_mode() from public;
grant execute on function public.public_payment_mode() to anon, authenticated;

-- Older mobile clients can insert feedback with a client-supplied created_at.
-- Keep legacy receipt time unknown. Stamp future inserts inside Postgres.
alter table public.feedbacks add column received_at timestamptz;
create function public.stamp_feedback_receipt() returns trigger
language plpgsql set search_path = '' as $$
begin
  if tg_op='INSERT' then new.received_at:=clock_timestamp();
  else new.received_at:=old.received_at; end if;
  return new;
end $$;
revoke all on function public.stamp_feedback_receipt() from public, anon, authenticated;
create trigger stamp_feedback_receipt before insert or update of received_at on public.feedbacks
for each row execute function public.stamp_feedback_receipt();

-- Observe actual eligibility at enrollment and readiness/policy changes. Never
-- backdate a pre-existing member to a possibly stale historical ready event.
alter table public.beta_wave_one_invites add column first_ready_at timestamptz;
create function public.observe_wave_readiness() returns trigger
language plpgsql security definer set search_path=public,pg_temp as $$
begin
  update beta_wave_one_invites v set first_ready_at=clock_timestamp() from profiles p
    where v.member_id=p.id and v.joined_at is not null and v.first_ready_at is null
      and (member_readiness_snapshot(p)->>'ready')::boolean;
  return null;
end $$;
revoke all on function public.observe_wave_readiness() from public,anon,authenticated;
create trigger observe_wave_join after update of member_id on public.beta_wave_one_invites
for each row when (new.member_id is not null) execute function public.observe_wave_readiness();
create trigger observe_wave_ready after insert on public.domain_events
for each row when (new.event_type='member_became_ready') execute function public.observe_wave_readiness();
-- Choosing a first meeting area can complete readiness without a legacy domain event.
create trigger observe_wave_area after update of hub_id on public.profiles
for each row when (old.hub_id is distinct from new.hub_id) execute function public.observe_wave_readiness();
create trigger observe_wave_identity_gate after update of identity_required on public.app_settings
for each statement execute function public.observe_wave_readiness();
create trigger observe_wave_policy_gate after update on public.policy_control
for each statement execute function public.observe_wave_readiness();

-- This is the first reliable observation for existing active seats.
update public.beta_wave_one_invites v set first_ready_at=now() from public.profiles p
where v.member_id=p.id and v.joined_at is not null and (public.member_readiness_snapshot(p)->>'ready')::boolean;

create function public.wave_one_attendance() returns jsonb
language sql stable set search_path = public, pg_temp as $$
  with clocks as (
    select member_id,case when member_id is not null then first_ready_at end as starts_at
    from beta_wave_one_invites where joined_at is not null
  ), matured as (
    select member_id,starts_at from clocks where starts_at+interval '14 days'<=now()
  ), attended as (
    select c.member_id,m.id as meeting_id from matured c
    join intros i on c.member_id in (i.female_id,i.male_id)
    join meetings m on m.intro_id=i.id and m.created_at>=c.starts_at and m.cancelled_at is null
    join feedbacks f on f.meeting_id=m.id and f.author_id=i.female_id and f.met and f.received_at is not null
    join feedbacks g on g.meeting_id=m.id and g.author_id=i.male_id and g.met and g.received_at is not null
    where m.scheduled_at>=c.starts_at and least(f.received_at,g.received_at)>=m.scheduled_at
      and greatest(f.received_at,g.received_at)<c.starts_at+interval '14 days'
  )
  select jsonb_build_object('matured',(select count(*) from matured),
    'observing',(select count(*) from clocks where starts_at+interval '14 days'>now()),
    'no_clock',(select count(*) from clocks where starts_at is null and member_id is not null),
    'unlinked',(select count(*) from clocks where member_id is null),
    'attendees',(select count(distinct member_id) from attended),
    'meetings',(select count(distinct meeting_id) from attended))
$$;
revoke all on function public.wave_one_attendance() from public,anon,authenticated;

create or replace function public.admin_invite_beta_observations() returns jsonb
language plpgsql stable security definer set search_path=public,pg_temp as $$
declare previous jsonb:=admin_invite_beta_before_wave(); -- enforces staff role and configured MFA
begin
  return previous || jsonb_build_object('wave_one',wave_one_progress(),'wave_attendance',wave_one_attendance());
end $$;
