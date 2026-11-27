-- A schedule alone is not evidence that a manager reviewed the profile.
alter table public.first_intro_checks
  alter column next_check_at drop not null,
  add column review_step text check(review_step in ('profile','preferences')),
  add column reviewed_at timestamptz,
  add check ((review_step is null) = (reviewed_at is null)),
  add check (next_check_at is not null or reviewed_at is not null);

create or replace function public.first_intro_wait(p profiles) returns jsonb
language plpgsql stable set search_path=public,pg_temp as $$
declare blockers jsonb; v_stage text; check_at timestamptz; checked_at timestamptz; step text;
begin
  if p.id is null or p.role<>'member' or p.account_state<>'active' or p.paused_at is not null or p.onboarding_step<>7
    or exists(select 1 from intros i where i.male_id=p.id)
    or exists(select 1 from intros i join meetings m on m.intro_id=i.id where i.female_id=p.id)
    or exists(select 1 from intro_queue q where q.male_id=p.id and q.delivered_at is not null)
    or exists(select 1 from domain_events d where d.subject_id=p.id and d.event_type='intro_delivered') then return null; end if;
  blockers:=member_readiness_snapshot(p)->'blockers';
  if blockers='["photos_pending"]'::jsonb then
    v_stage:='photo';
    -- Photo submission is authoritative. A case-level "started" event cannot
    -- attest to the current photo set when a member replaces just one photo.
    select o.next_check_at into check_at from ops_cases o where o.subject_id=p.id and o.case_type='photo_review'
      and o.status not in ('resolved','superseded') order by o.opened_at desc,o.id limit 1;
  elsif blockers<>'[]'::jsonb or member_meeting_hold(p.id) then return null;
  elsif p.gender='female' then
    if exists(select 1 from profiles m where profile_candidate_ready(m) and meeting_areas_overlap(p.id,m.id)
        and not is_excluded(p.id,m.id) and not exists(select 1 from affinities a where a.from_id=p.id and a.to_id=m.id)) then return null; end if;
    if exists(select 1 from affinities a join profiles m on m.id=a.to_id where a.from_id=p.id and a.verdict='like'
      and profile_candidate_ready(m) and meeting_areas_overlap(p.id,m.id) and not is_excluded(p.id,m.id)
      and not exists(select 1 from intros i where i.male_id=m.id and i.female_id=p.id and i.closed_at is not null)) then v_stage:='reply';
    elsif exists(select 1 from candidate_impressions where viewer_id=p.id) then return null;
    else v_stage:='supply'; end if;
  elsif exists(select 1 from affinities a join eligible_profiles f on f.id=a.from_id and f.gender='female'
    where a.to_id=p.id and a.verdict='like' and meeting_areas_overlap(p.id,f.id) and not is_excluded(p.id,f.id)) then v_stage:='curation';
  else v_stage:='supply'; end if;
  if v_stage<>'photo' then
    select c.next_check_at,c.review_step,c.reviewed_at into check_at,step,checked_at
      from first_intro_checks c where c.member_id=p.id
        -- Supply and curation are a single member-visible wait; an inbound like is private.
        and (c.stage='reply')=(v_stage='reply');
  end if;
  return jsonb_build_object('stage',v_stage,'next_check_at',check_at,'review_step',step,'reviewed_at',checked_at);
end $$;

create or replace function public.admin_set_first_intro_check_before_audit(p_member uuid,p_stage text,p_next timestamptz,p_previous timestamptz) returns void
language plpgsql security definer set search_path=public,pg_temp as $$
declare member profiles; w jsonb;
begin
  if not is_admin() or not admin_sensitive_auth_ok() then raise exception 'admin only' using errcode='42501'; end if;
  select * into member from profiles where id=p_member for update;
  w:=first_intro_wait(member);
  if w is null or w->>'stage' is distinct from p_stage or p_stage='photo'
     or (w->>'next_check_at')::timestamptz is distinct from p_previous then
    raise exception 'wait changed' using errcode='PT409'; end if;
  if p_next is not null and (p_next<=now() or p_next>now()+interval '30 days') then raise exception 'invalid next check' using errcode='22023'; end if;
  if p_next is null then
    update first_intro_checks set next_check_at=null
      where member_id=p_member and (stage='reply')=(p_stage='reply') and reviewed_at is not null;
    if not found then
      delete from first_intro_checks where member_id=p_member and (stage='reply')=(p_stage='reply');
    end if;
  else
    insert into first_intro_checks as c(member_id,stage,next_check_at,operator_id)
      values(p_member,p_stage,p_next,auth.uid())
      on conflict(member_id) do update set stage=excluded.stage,next_check_at=excluded.next_check_at,
        operator_id=excluded.operator_id,
        review_step=case when (c.stage='reply')=(excluded.stage='reply') then c.review_step end,
        reviewed_at=case when (c.stage='reply')=(excluded.stage='reply') then c.reviewed_at end;
  end if;
end $$;

-- The worklist and home read the same stage-scoped record. Old scheduling clients
-- can still move or clear a reminder without claiming a review took place.
create function public.admin_review_first_intro_wait(
  p_member uuid,p_stage text,p_step text,p_hours integer,p_previous timestamptz
) returns void language plpgsql security definer set search_path=public,pg_temp as $$
declare checked_at timestamptz:=clock_timestamp();
begin
  if not is_admin() or not admin_sensitive_auth_ok() then raise exception 'admin only' using errcode='42501'; end if;
  if p_stage is null or p_stage not in ('supply','curation') or p_step is null or
     p_step not in ('profile','preferences') or p_hours is null or p_hours not in (1,3,24) then
    raise exception 'invalid review' using errcode='22023';
  end if;
  -- Locks the member, checks the current stage and expected reminder, and writes one audit event.
  perform admin_set_first_intro_check(p_member,p_stage,checked_at+make_interval(hours=>p_hours),p_previous);
  update first_intro_checks set review_step=p_step,reviewed_at=checked_at where member_id=p_member;
end $$;
revoke all on function public.admin_review_first_intro_wait(uuid,text,text,integer,timestamptz) from public,anon;
grant execute on function public.admin_review_first_intro_wait(uuid,text,text,integer,timestamptz) to authenticated;
