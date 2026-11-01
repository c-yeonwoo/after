-- Beta closeout: private drafts, bounded provider spend, one confirmed meeting at a time.
create table public.onboarding_drafts (
 user_id uuid primary key references public.profiles(id) on delete cascade,
 data jsonb not null, revision integer not null default 1,
 updated_at timestamptz not null default now()
);
alter table public.onboarding_drafts enable row level security;
revoke all on public.onboarding_drafts from anon,authenticated;
create function public.my_onboarding_draft(p_owner uuid) returns jsonb
language plpgsql security definer set search_path=public,pg_temp as $$
begin
 if auth.uid() is null or auth.uid()<>p_owner then raise exception 'unauthenticated' using errcode='28000'; end if;
 return (select jsonb_build_object('data',d.data,'revision',d.revision,'updated_at',d.updated_at)
 from public.onboarding_drafts d join public.profiles p on p.id=d.user_id
 where d.user_id=auth.uid() and p.account_state='active' and p.onboarding_step<7);
end $$;
create function public.save_onboarding_draft(p_owner uuid,p_data jsonb,p_revision integer) returns integer
language plpgsql security definer set search_path=public,pg_temp as $$
declare r integer;
begin
 if auth.uid() is null or auth.uid()<>p_owner then raise exception 'wrong draft owner' using errcode='42501'; end if;
 perform 1 from public.profiles where id=auth.uid() and account_state='active' and onboarding_step<7 for update;
 if not found then raise exception 'draft unavailable' using errcode='42501'; end if;
 if p_revision is null or p_revision<0 or jsonb_typeof(p_data) is distinct from 'object' or octet_length(p_data::text)>16000
    or not coalesce(p_data->>'step'=any(array['2','15','11']),false)
    or jsonb_typeof(p_data->'basics') is distinct from 'object' then
   raise exception 'invalid draft' using errcode='22023'; end if;
 select revision into r from public.onboarding_drafts where user_id=auth.uid();
 if coalesce(r,0)<>p_revision then raise exception 'draft changed in another tab' using errcode='PT409'; end if;
 insert into public.onboarding_drafts(user_id,data) values(auth.uid(),p_data)
 on conflict(user_id) do update set data=excluded.data,revision=onboarding_drafts.revision+1,updated_at=now()
 returning revision into r;
 return r;
end $$;
create function public.clear_finished_onboarding_draft() returns trigger language plpgsql security definer set search_path=public,pg_temp as $$
begin
 if new.onboarding_step>=7 or new.account_state<>'active' then delete from public.onboarding_drafts where user_id=new.id; end if;
 return new;
end $$;
create trigger clear_finished_onboarding_draft after update of onboarding_step,account_state on public.profiles
 for each row execute function public.clear_finished_onboarding_draft();
revoke all on function public.clear_finished_onboarding_draft() from public,anon,authenticated;
revoke all on function public.my_onboarding_draft(uuid), public.save_onboarding_draft(uuid,jsonb,integer) from public,anon;
grant execute on function public.my_onboarding_draft(uuid), public.save_onboarding_draft(uuid,jsonb,integer) to authenticated;

-- Every HTTP attempt reserves before the provider sees it, including SDK retries.
-- Unknown/failed results retain their reservation. No content, user IDs or secrets here.
create table public.ai_budget_settings (
 id boolean primary key default true check(id), daily_krw integer not null default 3000 check(daily_krw between 0 and 3000),
 monthly_krw integer not null default 50000 check(monthly_krw between 0 and 50000)
);
insert into public.ai_budget_settings(id) values(true);
create table public.ai_budget_ledger (
 id uuid primary key, created_at timestamptz not null default clock_timestamp(),
 reserved_krw integer not null check(reserved_krw>0), charged_krw integer,
 model text not null, settled_at timestamptz,
 check(charged_krw is null or charged_krw between 0 and reserved_krw)
);
create index ai_budget_ledger_created on public.ai_budget_ledger(created_at);
alter table public.ai_budget_settings enable row level security;
alter table public.ai_budget_ledger enable row level security;
revoke all on public.ai_budget_settings,public.ai_budget_ledger from anon,authenticated;
create function public.reserve_ai_budget(p_id uuid,p_model text,p_krw integer) returns boolean
language plpgsql security definer set search_path=public,pg_temp as $$
declare s public.ai_budget_settings; d numeric; m numeric; stamp timestamptz;
begin
 if p_krw is null or p_krw<1 or p_krw>3000 or char_length(p_model)>100 then return false; end if;
 perform pg_advisory_xact_lock(hashtextextended('after-ai-global-budget',0));
 stamp:=clock_timestamp();
 select * into s from public.ai_budget_settings where id;
 if not found then return false; end if;
 select coalesce(sum(coalesce(charged_krw,reserved_krw)) filter(where created_at>=date_trunc('day',stamp at time zone 'Asia/Seoul') at time zone 'Asia/Seoul'),0),
 coalesce(sum(coalesce(charged_krw,reserved_krw)),0) into d,m from public.ai_budget_ledger
 where created_at>=date_trunc('month',stamp at time zone 'Asia/Seoul') at time zone 'Asia/Seoul';
 if d+p_krw>s.daily_krw or m+p_krw>s.monthly_krw then return false; end if;
 -- Reusing a request id cannot buy another provider call.
 insert into public.ai_budget_ledger(id,model,reserved_krw) values(p_id,p_model,p_krw) on conflict do nothing;
 return found;
end $$;
create function public.settle_ai_budget(p_id uuid,p_krw integer) returns void
language plpgsql security definer set search_path=public,pg_temp as $$
begin
 perform pg_advisory_xact_lock(hashtextextended('after-ai-global-budget',0));
 update public.ai_budget_ledger set charged_krw=p_krw,settled_at=clock_timestamp()
 where id=p_id and settled_at is null and p_krw between 0 and reserved_krw;
end $$;
revoke all on function public.reserve_ai_budget(uuid,text,integer),public.settle_ai_budget(uuid,integer) from public,anon,authenticated;
grant execute on function public.reserve_ai_budget(uuid,text,integer),public.settle_ai_budget(uuid,integer) to service_role;

-- Never fabricate attendance to release a queue. Ending an introduction is separate.
create function public.member_meeting_hold(p_user uuid) returns boolean
language sql stable security definer set search_path=public,pg_temp as $$
 select exists(select 1 from public.meetings m join public.intros i on i.id=m.intro_id
 where p_user in(i.male_id,i.female_id) and m.confirmed_at is not null and m.cancelled_at is null
 and (m.scheduled_at at time zone 'Asia/Seoul')::date >= (now() at time zone 'Asia/Seoul')::date)
$$;
revoke all on function public.member_meeting_hold(uuid) from public,anon,authenticated;
-- The invoker view calls this predicate; only a boolean is exposed, never appointment data.
grant execute on function public.member_meeting_hold(uuid) to authenticated;
create function public.guard_new_introduction_hold() returns trigger
language plpgsql security definer set search_path=public,pg_temp as $$
begin
 perform 1 from public.profiles where id in(new.male_id,new.female_id) order by id for update;
 if public.member_meeting_hold(new.male_id) or public.member_meeting_hold(new.female_id) then
 raise exception 'an appointment is still in progress' using errcode='PT409'; end if;
 return new;
end $$;
revoke all on function public.guard_new_introduction_hold() from public,anon,authenticated;
create trigger introduction_meeting_hold before insert on public.intros
for each row execute function public.guard_new_introduction_hold();

-- A card opened before another appointment was confirmed may still be visible.
-- Reject its request atomically, including any ticket consumption in the caller.
create function public.guard_new_meeting_hold() returns trigger
language plpgsql security definer set search_path=public,pg_temp as $$
declare m uuid; f uuid;
begin
 select male_id,female_id into m,f from public.intros where id=new.intro_id;
 perform 1 from public.profiles where id in(m,f) order by id for update;
 if public.member_meeting_hold(m) or public.member_meeting_hold(f) then
   raise exception 'an appointment is still in progress' using errcode='PT409';
 end if;
 return new;
end $$;
revoke all on function public.guard_new_meeting_hold() from public,anon,authenticated;
create trigger meeting_request_hold before insert on public.meetings
for each row execute function public.guard_new_meeting_hold();

create function public.release_past_meeting_introductions() returns integer
language plpgsql security definer set search_path=public,pg_temp as $$
declare n integer; u uuid;
begin
 update public.intros i set closed_at=now()
 where i.closed_at is null and exists(select 1 from public.meetings m where m.intro_id=i.id
 and m.confirmed_at is not null and m.cancelled_at is null
 and (m.scheduled_at at time zone 'Asia/Seoul')::date<(now() at time zone 'Asia/Seoul')::date)
 and not exists(select 1 from public.no_show_reports r join public.meetings m on m.id=r.meeting_id
 where m.intro_id=i.id and r.state='pending');
 get diagnostics n=row_count;
 for u in select distinct male_id from public.intro_queue where opened_at is null and delivered_at is null order by male_id limit 500 loop
   perform public.promote_intro_queue(u);
 end loop;
 return n;
end $$;
revoke all on function public.release_past_meeting_introductions() from public,anon,authenticated;
grant execute on function public.release_past_meeting_introductions() to service_role;
select cron.schedule('release_past_meeting_introductions_5m','*/5 * * * *',$$select public.release_past_meeting_introductions();$$);

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
    )) and public.member_policy_current(id) and not public.member_meeting_hold(id);
CREATE OR REPLACE FUNCTION public.profile_candidate_ready(p profiles)
 RETURNS boolean
 LANGUAGE sql
 STABLE
 SET search_path TO 'public', 'pg_temp'
AS $function$
  select not public.member_meeting_hold(p.id) and p.role = 'member' and p.gender = 'male'
     and p.hub_id<>'undecided' and public.member_policy_current(p.id)
     and p.email_verified_at is not null and p.account_state = 'active'
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
CREATE OR REPLACE FUNCTION public.next_candidate()
 RETURNS SETOF public_profiles
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_uid uuid := auth.uid();
  v_candidate uuid;
begin
  if v_uid is null or public.member_meeting_hold(v_uid) or public.my_gender() <> 'female'
     or not (public.member_readiness(v_uid)->>'ready')::boolean then
    return;
  end if;

  select ci.candidate_id into v_candidate
    from public.candidate_impressions ci
   where ci.viewer_id = v_uid
     and public.is_eligible_candidate(ci.candidate_id)
     and not exists (select 1 from public.affinities a
                      where a.from_id = v_uid and a.to_id = ci.candidate_id)
     and not public.is_excluded(v_uid, ci.candidate_id)
   order by ci.last_shown_at desc limit 1;

  if v_candidate is null then
    select p.id into v_candidate
      from public.profiles p
      left join lateral (
        select count(*)::integer as viewer_count, max(ci.last_shown_at) as last_shown_at
          from public.candidate_impressions ci where ci.candidate_id = p.id
      ) exposure on true
     where public.is_eligible_candidate(p.id)
       and not exists (select 1 from public.affinities a
                        where a.from_id = v_uid and a.to_id = p.id)
       and not public.is_excluded(v_uid, p.id)
     order by (p.hub_id=public.my_hub_id()) desc, exposure.viewer_count asc, exposure.last_shown_at asc nulls first,
              p.created_at asc, p.id asc
     for update of p skip locked limit 1;
    if v_candidate is not null then
      insert into public.candidate_impressions (viewer_id, candidate_id)
      values (v_uid, v_candidate)
      on conflict (viewer_id, candidate_id) do update
        set last_shown_at = now(),
            show_count = candidate_impressions.show_count + 1;
    end if;
  end if;
  return query select pp.* from public.public_profiles pp where pp.id = v_candidate;
end $function$
;
CREATE OR REPLACE FUNCTION public.next_openable_card(p_male uuid)
 RETURNS SETOF intro_queue
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
  select q.* from intro_queue q
   where not public.member_meeting_hold(p_male) and q.male_id = p_male
     and q.opened_at is null
     and public.meeting_areas_overlap(q.male_id,q.female_id)
     and q.delivered_at is not null
     and q.expires_at > now()
     and not is_excluded(p_male, q.female_id)
     and exists (select 1 from eligible_profiles e
                  where e.id = q.female_id and e.gender = 'female')
   order by q.position, q.created_at
   limit 1
$function$
;
CREATE OR REPLACE FUNCTION public.promote_intro_queue(p_male uuid)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare v_count integer;
begin
  if public.member_meeting_hold(p_male) or exists (select 1 from profiles where id = p_male and paused_at is not null) then
    return 0;
  end if;

  with top3 as (
    select q.id from intro_queue q
     where q.male_id = p_male and q.opened_at is null
     and public.meeting_areas_overlap(q.male_id,q.female_id)
       and exists (select 1 from eligible_profiles e
                    where e.id = q.female_id and e.gender = 'female')
     order by q.position, q.created_at
     limit 3
  )
  update intro_queue q
     set delivered_at = now(),
         expires_at   = now() + interval '3 weeks'
    from top3
   where q.id = top3.id and q.delivered_at is null;
  get diagnostics v_count = row_count;
  return v_count;
end $function$
;
CREATE OR REPLACE FUNCTION public.guard_meeting_confirmation()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_participants uuid[];
  v_member uuid;
  v_active integer;
begin
  if new.confirmed_at is null or (
    old.confirmed_at is not null and new.scheduled_at is not distinct from old.scheduled_at
    and new.place_id is not distinct from old.place_id
    and new.accepted_slot is not distinct from old.accepted_slot
  ) then
    return new;
  end if;
  -- 이미 확정된 약속의 실제 만남 후 기록/정정은 과거 시각일 수 있다.
  -- 회원이 호출하는 confirm_meeting 은 자체적으로 미래 시각만 받는다.
  if new.completed_at is not null or
     (old.confirmed_at is not null and new.scheduled_at <= now()) then
    return new;
  end if;
  if new.cancelled_at is not null or new.scheduled_at is null or new.scheduled_at <= now() then
    raise exception 'meeting slot is no longer available' using errcode = '22007';
  end if;

  select array[i.male_id, i.female_id] into v_participants
    from public.intros i where i.id = new.intro_id;
  if coalesce(cardinality(v_participants), 0) <> 2 then
    raise exception 'meeting participants missing' using errcode = '23503';
  end if;

  -- 두 회원을 항상 동일한 순서로 잠가, 다른 meeting 행에서 동시에 확정해도
  -- 뒤의 트랜잭션이 앞의 확정 결과를 본 뒤 충돌을 검사하게 한다.
  for v_member in select unnest(v_participants) order by 1 loop
    perform 1 from public.profiles where id = v_member for update;
  end loop;
  select count(*) into v_active from public.profiles
   where id = any(v_participants) and account_state = 'active';
  if v_active <> 2 then
    raise exception 'participant account is no longer active' using errcode = '42501';
  end if;

  if new.accepted_slot is not null and (
    new.proposed_slots is null or new.accepted_slot < 0 or
    new.accepted_slot >= coalesce(cardinality(new.proposed_slots), 0) or
    new.scheduled_at is distinct from new.proposed_slots[new.accepted_slot + 1]
  ) then
    raise exception 'proposed slot changed' using errcode = '22023';
  end if;
  if new.place_id is not null and not exists (
    select 1 from public.meet_places p join public.profiles member
      on member.id = v_participants[1]
     where p.id = new.place_id and p.active and p.hub_id=any(public.member_area_ids(v_participants[1]))
       and p.hub_id=any(public.member_area_ids(v_participants[2]))
  ) then
    raise exception 'place no longer available' using errcode = '22023';
  end if;

  if exists (
    select 1 from public.meetings m join public.intros i on i.id = m.intro_id
     where m.id <> new.id and m.confirmed_at is not null
       and m.cancelled_at is null
       and (m.scheduled_at at time zone 'Asia/Seoul')::date >= (now() at time zone 'Asia/Seoul')::date
       and (i.male_id = any(v_participants) or i.female_id = any(v_participants))
  ) then
    raise exception 'participant already has a meeting in progress' using errcode = '23505';
  end if;
  return new;
end $function$
;

alter function public.home_state_v2() rename to home_state_v2_before_beta_hold;
revoke all on function public.home_state_v2_before_beta_hold() from public,anon,authenticated;
create function public.home_state_v2() returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare v jsonb; until_at timestamptz;
begin
 v:=public.home_state_v2_before_beta_hold();
 select max((date_trunc('day',m.scheduled_at at time zone 'Asia/Seoul')+interval '1 day') at time zone 'Asia/Seoul') into until_at
 from public.meetings m join public.intros i on i.id=m.intro_id
 where auth.uid() in(i.male_id,i.female_id) and m.confirmed_at is not null and m.cancelled_at is null
 and (m.scheduled_at at time zone 'Asia/Seoul')::date >= (now() at time zone 'Asia/Seoul')::date;
 return v||jsonb_build_object('introduction_resume_at',until_at);
end $$;
revoke all on function public.home_state_v2() from public,anon;
grant execute on function public.home_state_v2() to authenticated;

create function public.admin_beta_readiness() returns jsonb
language plpgsql stable security definer set search_path=public,pg_temp as $$
declare s public.ai_budget_settings; d numeric; m numeric;
begin
 if not public.is_admin() then raise exception 'admin only' using errcode='42501'; end if;
 select * into s from public.ai_budget_settings where id;
 select coalesce(sum(coalesce(charged_krw,reserved_krw)) filter(where created_at>=date_trunc('day',now() at time zone 'Asia/Seoul') at time zone 'Asia/Seoul'),0),
 coalesce(sum(coalesce(charged_krw,reserved_krw)),0) into d,m from public.ai_budget_ledger
 where created_at>=date_trunc('month',now() at time zone 'Asia/Seoul') at time zone 'Asia/Seoul';
 return jsonb_build_object('daily_used_krw',d,'monthly_used_krw',m,'daily_limit_krw',s.daily_krw,'monthly_limit_krw',s.monthly_krw,
 'photo_overdue',(select count(*) from public.ops_cases where case_type='photo_review' and status not in('resolved','superseded') and opened_at<now()-interval '24 hours'),
 'contact_pending',(select count(*) from public.ops_cases where case_type='meeting_followup' and status not in('resolved','superseded')),
 'mfa_required',(select admin_mfa_required from public.app_settings where id));
end $$;
revoke all on function public.admin_beta_readiness() from public,anon;
grant execute on function public.admin_beta_readiness() to authenticated;

create or replace function home_state() returns jsonb
  language plpgsql volatile security definer set search_path = public, pg_temp as $$
declare
  v_uid       uuid := auth.uid();
  v_me        profiles;
  v_gender    gender;
  v_meeting   meetings;
  v_intro_id  uuid;
  v_cand_id   uuid;
  v_req_cnt   integer := 0;
  v_noshow    no_show_reports;
  v_cand      jsonb;
  v_queued    integer := 0;
  v_intro_tix integer := 0;
  v_meet_tix  integer := 0;
begin
  if v_uid is null then
    raise exception 'unauthenticated' using errcode = '28000';
  end if;

  select * into v_me from profiles where id = v_uid;
  if not found then
    return jsonb_build_object('me', null);
  end if;
  v_gender := v_me.gender;

  -- 확정된 만남이 최우선이다. 이게 있으면 홈은 그 카드만 보여준다.
  select m.* into v_meeting
    from meetings m join intros i on i.id = m.intro_id
   where v_uid in (i.male_id, i.female_id)
     and m.cancelled_at is null
     and m.confirmed_at is not null
     and (m.scheduled_at at time zone 'Asia/Seoul')::date >= (now() at time zone 'Asia/Seoul')::date
   order by m.created_at desc
   limit 1;

  if v_meeting.id is not null then
    select case when i.male_id = v_uid then i.female_id else i.male_id end
      into v_cand_id
      from intros i where i.id = v_meeting.intro_id;
  end if;

  if v_gender = 'male' then
    select i.id, i.female_id into v_intro_id, v_cand_id
      from intros i
     where i.male_id = v_uid and i.closed_at is null;

    if v_intro_id is not null and v_meeting.id is null then
      select m.* into v_meeting
        from meetings m
       where m.intro_id = v_intro_id and m.cancelled_at is null
        and (m.confirmed_at is null or (m.scheduled_at at time zone 'Asia/Seoul')::date >= (now() at time zone 'Asia/Seoul')::date);
    end if;

    if v_meeting.id is not null and v_meeting.confirmed_at is not null then
      select case when i.male_id = v_uid then i.female_id else i.male_id end
        into v_cand_id
        from intros i where i.id = v_meeting.intro_id;
    end if;

    /*
      "소개가 도착했습니다" 의 근거가 바뀐다. v1 은 호감이 있으면 곧 소개였지만
      이제는 **운영자가 세운 큐에 전송된 카드**가 있어야 한다.
    */
    select count(*) into v_queued from intro_queue q
     where male_id = v_uid and opened_at is null
       and delivered_at is not null and expires_at > now()
       and not public.member_meeting_hold(v_uid)
       and exists(select 1 from public.eligible_profiles e where e.id=q.female_id);
  else
    select count(*) into v_req_cnt
      from meetings m join intros i on i.id = m.intro_id
     where i.female_id = v_uid
       and i.closed_at is null
       and m.prefs_submitted_at is null
       and m.cancelled_at is null;

    if v_meeting.id is null then
      if v_req_cnt > 0 then
        select m.* into v_meeting
          from meetings m join intros i on i.id = m.intro_id
         where i.female_id = v_uid
           and i.closed_at is null
           and m.prefs_submitted_at is null
           and m.cancelled_at is null
         order by m.created_at
         limit 1;

        select i.male_id into v_cand_id
          from intros i where i.id = v_meeting.intro_id;
      else
        select nc.id into v_cand_id from next_candidate() nc;
      end if;
    end if;
  end if;

  select * into v_noshow
    from no_show_reports
   where accused_id = v_uid and state = 'pending'
   order by created_at
   limit 1;

  if v_cand_id is not null then
    select to_jsonb(pp) into v_cand from public_profiles pp where pp.id = v_cand_id;
  end if;

  -- 종류별 보유량. 열람 버튼이 "소개 티켓 1장을 사용합니다" 를 말하려면 필요하다.
  select coalesce(count(*) filter (where kind = 'intro'), 0),
         coalesce(count(*) filter (where kind = 'meeting'), 0)
    into v_intro_tix, v_meet_tix
    from tickets where user_id = v_uid and state = 'unused';

  return jsonb_build_object(
    'me',                   to_jsonb(v_me),
    'candidate',            v_cand,
    'meeting',              case when v_meeting.id is null then null else to_jsonb(v_meeting) end,
    'request_count',        v_req_cnt,
    'pending_no_show',      case when v_noshow.id is null then null else to_jsonb(v_noshow) end,
    'has_open_intro',       v_intro_id is not null,
    'queued_intros',        v_queued,
    'intro_tickets',        v_intro_tix,
    'meeting_tickets',      v_meet_tix
  );
end $$;
