-- One optional reaction per reader and introduction pair. Never store the explanation or profile text.
create table public.intro_reason_reactions (
  reader_id uuid not null references public.profiles(id) on delete cascade,
  peer_id uuid not null references public.profiles(id) on delete cascade,
  resonated boolean not null,
  created_at timestamptz not null default now(),
  primary key(reader_id,peer_id),
  check(reader_id<>peer_id)
);
alter table public.intro_reason_reactions enable row level security;
revoke all on public.intro_reason_reactions from public,anon,authenticated;
create index intro_reason_reactions_time on public.intro_reason_reactions(created_at);
create index intro_reason_reactions_peer on public.intro_reason_reactions(peer_id);

create function public.erase_intro_reactions() returns trigger language plpgsql security definer
set search_path=public,pg_temp as $$
begin
  delete from intro_reason_reactions where reader_id=new.id or peer_id=new.id;
  return new;
end $$;
revoke all on function public.erase_intro_reactions() from public,anon,authenticated;
create trigger erase_intro_reactions after update of account_state on public.profiles
for each row when (new.account_state='withdrawn' and old.account_state is distinct from new.account_state)
execute function public.erase_intro_reactions();

-- Use the displayed card's existing reference. In particular a locked teaser never returns the woman's ID.
create function public.intro_reaction_cards() returns table(ref uuid,peer uuid)
language sql stable set search_path=public,pg_temp as $$
  (select c.candidate_id,c.candidate_id from candidate_impressions c
   where my_gender()='female' and c.viewer_id=auth.uid() and is_eligible_candidate(c.candidate_id)
     and (member_readiness(auth.uid())->>'ready')::boolean and not member_meeting_hold(auth.uid())
     and not is_excluded(auth.uid(),c.candidate_id)
     and not exists(select 1 from affinities a where a.from_id=c.viewer_id and a.to_id=c.candidate_id)
   order by c.last_shown_at desc limit 1)
  union all
  select i.id,i.female_id from intros i where my_gender()='male' and i.male_id=auth.uid()
    and i.closed_at is null and not is_excluded(i.male_id,i.female_id)
    and not exists(select 1 from meetings m where m.intro_id=i.id and m.cancelled_at is null)
  union all
  select q.id,q.female_id from next_openable_card(auth.uid()) q where my_gender()='male'
    and (member_readiness(auth.uid())->>'ready')::boolean
    and not exists(select 1 from intros i where i.male_id=auth.uid() and i.closed_at is null)
$$;
revoke all on function public.intro_reaction_cards() from public,anon,authenticated;

alter function public.intro_reason_evidence(uuid,text) rename to intro_reason_evidence_before_reaction;
create function public.intro_reason_evidence(p_peer uuid,p_curated text) returns jsonb
language sql stable set search_path=public,pg_temp as $$
  select intro_reason_evidence_before_reaction(p_peer,p_curated) || coalesce((
    select jsonb_build_object('reaction_ref',c.ref,'resonated',r.resonated)
    from intro_reaction_cards() c left join intro_reason_reactions r
      on r.reader_id=auth.uid() and r.peer_id=c.peer where c.peer=p_peer limit 1
  ),'{}'::jsonb)
$$;
revoke all on function public.intro_reason_evidence(uuid,text) from public,anon,authenticated;

-- A separate statement makes a just-created female impression visible to the stable evidence reader.
create or replace function public.next_candidate_with_evidence() returns jsonb
language plpgsql volatile security definer set search_path=public,pg_temp as $$
declare candidate public.public_profiles;
begin
  select * into candidate from next_candidate();
  if candidate.id is null then return null; end if;
  return to_jsonb(candidate) || jsonb_build_object('evidence',intro_reason_evidence(candidate.id,null));
end $$;

create function public.rate_intro_reason(p_ref uuid,p_resonated boolean) returns void
language plpgsql security definer set search_path=public,pg_temp as $$
declare reader uuid:=auth.uid(); target uuid;
begin
  if p_resonated is null then raise exception 'rating required' using errcode='22023'; end if;
  select c.peer into target from intro_reaction_cards() c where c.ref=p_ref;
  if target is null then raise exception 'card unavailable' using errcode='42501'; end if;
  -- Hold both accounts across the write so a withdrawal cannot race its cleanup.
  perform id from profiles where id in(reader,target) and account_state='active' and role='member' order by id for share;
  if (select count(*) from profiles where id in(reader,target) and account_state='active' and role='member')<>2 then
    raise exception 'card unavailable' using errcode='42501';
  end if;
  insert into intro_reason_reactions(reader_id,peer_id,resonated) values(reader,target,p_resonated)
    on conflict(reader_id,peer_id) do update set resonated=excluded.resonated;
end $$;
revoke all on function public.rate_intro_reason(uuid,boolean) from public,anon;
grant execute on function public.rate_intro_reason(uuid,boolean) to authenticated;

create function public.my_intro_reason_reaction(p_ref uuid) returns boolean
language sql stable security definer set search_path=public,pg_temp as $$
  select r.resonated from intro_reaction_cards() c
  join intro_reason_reactions r on r.reader_id=auth.uid() and r.peer_id=c.peer
  where c.ref=p_ref
$$;
revoke all on function public.my_intro_reason_reaction(uuid) from public,anon;
grant execute on function public.my_intro_reason_reaction(uuid) to authenticated;

-- Extend the existing staff audit trail for two actions that had no durable history.
alter table public.admin_actions drop constraint admin_actions_kind_check;
alter table public.admin_actions add constraint admin_actions_kind_check check(kind=any(array[
  'resolve_report','ban','unban','refund','cancel_meeting','review_photo','set_queue',
  'resolve_no_show','set_payments','fulfill_order','reset_photo','retry_notification',
  'set_queue_reason','upsert_place','reconcile_payment','case_transition',
  'automation_rule','automation_approval','policy_activation','admin_security','first_intro_check','beta_manual'
]));
alter function public.admin_set_first_intro_check(uuid,text,timestamptz,timestamptz) rename to admin_set_first_intro_check_before_audit;
revoke all on function public.admin_set_first_intro_check_before_audit(uuid,text,timestamptz,timestamptz) from public,anon,authenticated;
create function public.admin_set_first_intro_check(p_member uuid,p_stage text,p_next timestamptz,p_previous timestamptz) returns void
language plpgsql security definer set search_path=public,pg_temp as $$
begin
  perform admin_set_first_intro_check_before_audit(p_member,p_stage,p_next,p_previous);
  if p_next is distinct from p_previous then
    insert into admin_actions(actor_id,kind,target_user,note) values(auth.uid(),'first_intro_check',p_member,p_stage);
  end if;
end $$;
revoke all on function public.admin_set_first_intro_check(uuid,text,timestamptz,timestamptz) from public,anon;
grant execute on function public.admin_set_first_intro_check(uuid,text,timestamptz,timestamptz) to authenticated;

create function public.admin_log_beta_help(p_stage text,p_request uuid) returns void
language plpgsql security definer set search_path=public,pg_temp as $$
begin
  if not is_admin() or not admin_sensitive_auth_ok() then raise exception 'admin only' using errcode='42501'; end if;
  if p_stage is null or p_stage not in('profile','intro','meeting','feedback','support') or p_request is null then
    raise exception 'invalid observation' using errcode='22023'; end if;
  insert into admin_actions(id,actor_id,kind,note) values(p_request,auth.uid(),'beta_manual',p_stage)
    on conflict(id) do nothing;
  if not found and not exists(select 1 from admin_actions where id=p_request and actor_id=auth.uid() and kind='beta_manual' and note=p_stage) then
    raise exception 'request changed' using errcode='PT409'; end if;
end $$;
revoke all on function public.admin_log_beta_help(text,uuid) from public,anon;
grant execute on function public.admin_log_beta_help(text,uuid) to authenticated;

-- Keep the original server clock across later profile edits, reactivation and stale client analytics.
alter table public.domain_events drop constraint domain_events_event_type_check;
alter table public.domain_events add constraint domain_events_event_type_check check(event_type in (
  'support_requested','support_answered','photo_submitted','photo_reviewed','content_reported',
  'content_report_resolved','no_show_reported','no_show_resolved','payment_attention','payment_reconciled',
  'meeting_confirmed','meeting_canceled','ticket_issued','ticket_consumed','ticket_restored','intro_delivered',
  'intro_opened','intro_expired','member_became_ready','member_became_unready','meeting_attendance_confirmed',
  'meeting_response_warning','member_profile_completed'
));
create function public.observe_first_profile_completion() returns trigger
language plpgsql security definer set search_path=public,pg_temp as $$
begin
  if tg_op='INSERT' or old.onboarding_step is distinct from new.onboarding_step then
    perform ops_emit_domain_event('member_profile_completed','profile',new.id::text,new.id,
      'profile:'||new.id||':first_complete');
  end if;
  return new;
end $$;
revoke all on function public.observe_first_profile_completion() from public,anon,authenticated;
create trigger observe_first_profile_completion after insert or update of onboarding_step on public.profiles
for each row when (new.onboarding_step=7 and new.role='member' and new.account_state='active')
execute function public.observe_first_profile_completion();

-- Capture available legacy observations only once. A missing or out-of-order clock stays missing.
insert into public.domain_events(event_type,aggregate_type,aggregate_id,subject_id,occurred_at,dedupe_key,props)
select 'member_profile_completed','profile',p.id::text,p.id,min(e.created_at),
  'profile:'||p.id||':first_complete','{"source":"legacy_observation"}'::jsonb
from public.profiles p join public.events e on e.user_id=p.id and e.name='profile_completed'
where p.role='member' and p.account_state='active' and p.onboarding_step=7
  and e.created_at between p.created_at and now()
  and not exists(select 1 from public.domain_events d where d.subject_id=p.id
    and d.event_type='member_became_ready' and d.occurred_at<e.created_at)
group by p.id on conflict(dedupe_key) do nothing;

create function public.admin_invite_beta_observations() returns jsonb
language plpgsql stable security definer set search_path=public,pg_temp as $$
declare since_at timestamptz:=now()-interval '30 days';
begin
  if not is_admin() or not admin_sensitive_auth_ok() then raise exception 'admin only' using errcode='42501'; end if;
  return (
    with completed as (
      select subject_id as user_id,min(occurred_at) at from domain_events where event_type='member_profile_completed' group by subject_id
    ), ready as (
      select subject_id,min(occurred_at) at from domain_events where event_type='member_became_ready' group by subject_id
    ), arrivals as (
      select viewer_id member_id,min(first_shown_at) at from candidate_impressions group by viewer_id
      union all
      select subject_id,min(occurred_at) from domain_events where event_type='intro_delivered' group by subject_id
    ), cohorts as (
      select p.gender,p.paused_at,c.at as completed_at,r.at as ready_at,a.at as arrived_at,
        member_readiness_snapshot(p)->>'ready'='true' as currently_ready
      from profiles p left join completed c on c.user_id=p.id left join ready r on r.subject_id=p.id
      left join arrivals a on a.member_id=p.id
      where p.role='member' and p.account_state='active' and (c.at is not null or r.at is not null)
    ), waits as (
      select g.gender,percentile_cont(.5) within group(order by extract(epoch from c.arrived_at-c.completed_at))
          filter(where c.completed_at>=since_at and c.arrived_at>=c.completed_at) total_seconds,
        count(*) filter(where c.completed_at>=since_at and c.arrived_at>=c.completed_at) total_n,
        count(*) filter(where c.arrived_at is null and c.paused_at is null and c.currently_ready) waiting,
        max(extract(epoch from now()-c.ready_at)) filter(where c.arrived_at is null and c.paused_at is null and c.currently_ready) oldest_seconds,
        percentile_cont(.5) within group(order by extract(epoch from c.ready_at-c.completed_at))
          filter(where c.completed_at>=since_at and c.ready_at>=c.completed_at) review_seconds,
        count(*) filter(where c.completed_at>=since_at and c.ready_at>=c.completed_at) review_n,
        percentile_cont(.5) within group(order by extract(epoch from c.arrived_at-c.ready_at))
          filter(where c.ready_at>=since_at and c.arrived_at>=c.ready_at) intro_seconds,
        count(*) filter(where c.ready_at>=since_at and c.arrived_at>=c.ready_at) intro_n
      from (values('female'),('male')) g(gender) left join cohorts c on c.gender::text=g.gender group by g.gender
    ), actions as (
      select case when a.kind='beta_manual' then a.note
        when a.kind in('set_queue','set_queue_reason','first_intro_check') then 'intro'
        when a.kind in('review_photo','reset_photo') then 'profile'
        when a.kind in('cancel_meeting','resolve_no_show') or c.case_type in('meeting_followup','response_review','no_show_report') then 'meeting'
        when c.case_type='photo_review' then 'profile'
        else 'support' end stage, a.kind='beta_manual' as manual
      from admin_actions a left join ops_cases c on c.id=a.case_id where a.created_at>=since_at and
        a.kind in('beta_manual','set_queue','set_queue_reason','first_intro_check','review_photo','reset_photo',
          'case_transition','cancel_meeting','resolve_report','resolve_no_show','refund','fulfill_order','reconcile_payment','retry_notification','ban','unban')
      union all select 'support',false from support_requests where responded_by is not null and responded_at>=since_at
    ), grouped as (
      select stage,count(*) filter(where not manual) logged,count(*) filter(where manual) manual from actions group by stage
    )
    select jsonb_build_object('waits',(select jsonb_object_agg(gender,to_jsonb(w)-'gender') from waits w),
      'reactions',(select jsonb_build_object('yes',count(*) filter(where resonated),'total',count(*)) from intro_reason_reactions where created_at>=since_at),
      'actions',coalesce((select jsonb_object_agg(stage,to_jsonb(g)-'stage') from grouped g),'{}'::jsonb))
  );
end $$;
revoke all on function public.admin_invite_beta_observations() from public,anon;
grant execute on function public.admin_invite_beta_observations() to authenticated;
