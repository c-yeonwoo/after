-- The event-based cohorts start now; historical signup time is never substituted
-- for a verified readiness timestamp. A zero sample is displayed as null rate.
create table public.metric_instrumentation (
  id boolean primary key default true check(id),
  readiness_started_at timestamptz not null default now()
);
insert into public.metric_instrumentation(id) values(true);
alter table public.metric_instrumentation enable row level security;
revoke all on public.metric_instrumentation from public, anon, authenticated;

create function public.admin_marketplace_health_v2(
  p_hub text default null,p_days integer default 14
) returns jsonb language plpgsql stable security definer set search_path = public, pg_temp as $$
declare v jsonb; v_started timestamptz;
begin
  if not public.is_admin() then raise exception 'admin only' using errcode='42501'; end if;
  if p_days is null or p_days not in (7,14,28) or
     (p_hub is not null and p_hub not in ('gangnam','pangyo','jongno','yeouido')) then
    raise exception 'invalid metric filter' using errcode='22023';
  end if;
  select readiness_started_at into v_started from public.metric_instrumentation where id;
  with ready_now as (
    select p.id,p.gender,p.hub_id from public.eligible_profiles p
     where p_hub is null or p.hub_id=p_hub
  ), pending_request as (
    select m.id,t.used_at,p.hub_id,
           extract(epoch from (now()-t.used_at))/3600.0 hours
      from public.meetings m join public.intros i on i.id=m.intro_id
      join public.tickets t on t.id=m.ticket_id
      join public.profiles p on p.id=i.female_id
     where m.prefs_submitted_at is null and m.confirmed_at is null
       and m.cancelled_at is null and m.completed_at is null
       and i.closed_at is null and t.used_at is not null
       and t.used_at+interval '24 hours'>now()
       and (p_hub is null or p.hub_id=p_hub)
  ), completed_response as (
    select extract(epoch from (m.prefs_submitted_at-t.used_at))/3600.0 hours
      from public.meetings m join public.intros i on i.id=m.intro_id
      join public.tickets t on t.id=m.ticket_id
      join public.profiles p on p.id=i.female_id
     where m.prefs_submitted_at>=now()-make_interval(days=>p_days)
       and t.used_at is not null and m.prefs_submitted_at>=t.used_at
       and (p_hub is null or p.hub_id=p_hub)
  ), delivery_cohort as (
    select e.aggregate_id,e.subject_id,e.occurred_at
      from public.domain_events e
     where e.event_type='intro_delivered'
       and e.occurred_at>=greatest(v_started,now()-make_interval(days=>p_days+7))
       and e.occurred_at<=now()-interval '7 days'
       and (p_hub is null or e.props->>'hub_id'=p_hub)
  ), opened_delivery as (
    select d.aggregate_id from delivery_cohort d
     where exists (select 1 from public.domain_events e
       where e.event_type='intro_opened' and e.aggregate_id=d.aggregate_id
         and e.occurred_at between d.occurred_at and d.occurred_at+interval '7 days')
  ), first_ready as (
    select distinct on (e.subject_id) e.subject_id,e.occurred_at,
           e.props->>'hub' hub,e.props->>'gender' gender
      from public.domain_events e
     where e.event_type='member_became_ready' and e.subject_id is not null
     order by e.subject_id,e.occurred_at
  ), ready_cohort as (
    select r.* from first_ready r
     where r.gender='male'
       and r.occurred_at>=greatest(v_started,now()-make_interval(days=>p_days+7))
       and r.occurred_at<=now()-interval '7 days'
       and (p_hub is null or r.hub=p_hub)
  ), first_intro as (
    select r.subject_id from ready_cohort r
     where exists (select 1 from public.domain_events e
       where e.subject_id=r.subject_id and e.event_type='intro_delivered'
         and e.occurred_at between r.occurred_at and r.occurred_at+interval '7 days')
  ), meeting_cohort as (
    select m.id,m.completed_by,m.completed_at,m.scheduled_at
      from public.meetings m join public.intros i on i.id=m.intro_id
      join public.profiles p on p.id=i.female_id
     where m.confirmed_at>=now()-make_interval(days=>p_days)
       and m.cancelled_at is null and (p_hub is null or p.hub_id=p_hub)
  )
  select jsonb_build_object(
    'as_of',now(),'filters',jsonb_build_object('hub',p_hub,'days',p_days),
    'coverage',jsonb_build_object('readiness_started_at',v_started,
      'historical_readiness_unknown',true,
      'withdrawn_event_history_removed',true),
    'ready_now',jsonb_build_object(
      'female',(select count(*) from ready_now where gender='female'),
      'male',(select count(*) from ready_now where gender='male')),
    'pending_request',jsonb_build_object(
      'count',(select count(*) from pending_request),
      'oldest_hours',(select round(max(hours)::numeric,1) from pending_request),
      'p50_hours',(select round(percentile_cont(0.5) within group(order by hours)::numeric,1)
                     from pending_request),
      'p90_hours',(select round(percentile_cont(0.9) within group(order by hours)::numeric,1)
                     from pending_request)),
    'completed_response',jsonb_build_object(
      'sample',(select count(*) from completed_response),
      'p50_hours',(select round(percentile_cont(0.5) within group(order by hours)::numeric,1)
                     from completed_response),
      'p90_hours',(select round(percentile_cont(0.9) within group(order by hours)::numeric,1)
                     from completed_response)),
    'intro_open_7d',jsonb_build_object(
      'denominator',(select count(*) from delivery_cohort),
      'numerator',(select count(*) from opened_delivery),
      'rate',case when (select count(*) from delivery_cohort)=0 then null
        else round((select count(*) from opened_delivery)::numeric/
                   (select count(*) from delivery_cohort),3) end),
    'first_intro_7d',jsonb_build_object(
      'denominator',(select count(*) from ready_cohort),
      'numerator',(select count(*) from first_intro),
      'rate',case when (select count(*) from ready_cohort)=0 then null
        else round((select count(*) from first_intro)::numeric/
                   (select count(*) from ready_cohort),3) end),
    'meeting_confirmation',jsonb_build_object(
      'confirmed',(select count(*) from meeting_cohort),
      'both_reported',(select count(*) from meeting_cohort where cardinality(completed_by)>=2
                         and scheduled_at<=now()),
      'one_reported',(select count(*) from meeting_cohort where cardinality(completed_by)=1
                        and scheduled_at<=now()),
      'not_reported',(select count(*) from meeting_cohort where cardinality(completed_by)=0
                        and scheduled_at<now()))
  ) into v;
  return v;
end $$;
revoke all on function public.admin_marketplace_health_v2(text,integer) from public, anon;
grant execute on function public.admin_marketplace_health_v2(text,integer) to authenticated;
