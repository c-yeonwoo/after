-- One observation per member who selected a preference in their first attended-date review.
-- No review body, peer ID, profile answer or inferred preference is copied to analytics.
create table public.beta_second_intros (
  member_id uuid primary key references public.profiles(id) on delete cascade,
  feedback_id uuid not null unique references public.feedbacks(id) on delete cascade,
  reviewed_at timestamptz not null default clock_timestamp(),
  shown_at timestamptz,
  reflected boolean,
  check ((shown_at is null) = (reflected is null))
);
alter table public.beta_second_intros enable row level security;
revoke all on public.beta_second_intros from public, anon, authenticated;

-- The queue can contain three delivered cards although only its head is displayed.
-- Remember the first server response even if an operator later replaces that queue entry.
create table public.beta_male_card_views (
  reader_id uuid not null references public.profiles(id) on delete cascade,
  peer_id uuid not null references public.profiles(id) on delete cascade,
  primary key(reader_id,peer_id)
);
alter table public.beta_male_card_views enable row level security;
revoke all on public.beta_male_card_views from public,anon,authenticated;
create index beta_male_card_views_peer on public.beta_male_card_views(peer_id);
-- Older deliveries have no trustworthy first-view timestamp. Exclude them from prospective measurement.
insert into public.beta_male_card_views
select i.male_id,i.female_id from public.intros i join public.profiles m on m.id=i.male_id
join public.profiles f on f.id=i.female_id where m.account_state='active' and f.account_state='active'
union
select q.male_id,q.female_id from public.intro_queue q join public.profiles m on m.id=q.male_id
join public.profiles f on f.id=q.female_id where q.delivered_at is not null and m.account_state='active' and f.account_state='active';

create function public.start_beta_second_intro() returns trigger
language plpgsql security definer set search_path=public,pg_temp as $$
begin
  perform 1 from profiles where id=new.author_id and role='member' and account_state='active' for share;
  if not found then return new; end if;
  if not exists (select 1 from feedbacks f where f.author_id=new.author_id and f.met
                 and f.id<>new.id) then
    insert into beta_second_intros(member_id,feedback_id) values(new.author_id,new.id)
      on conflict(member_id) do nothing;
  end if;
  return new;
end $$;
revoke all on function public.start_beta_second_intro() from public,anon,authenticated;
-- submit_feedback_with_preference inserts the review, then sets its choice in the same transaction.
create trigger start_beta_second_intro after insert or update of next_preference on public.feedbacks
for each row when (new.met and new.next_preference is not null) execute function public.start_beta_second_intro();

create function public.erase_beta_second_intro() returns trigger
language plpgsql security definer set search_path=public,pg_temp as $$
begin
  delete from beta_second_intros where member_id=new.id;
  delete from beta_male_card_views where reader_id=new.id or peer_id=new.id;
  return new;
end $$;
revoke all on function public.erase_beta_second_intro() from public,anon,authenticated;
create trigger erase_beta_second_intro after update of account_state on public.profiles
for each row when (new.account_state='withdrawn' and old.account_state is distinct from new.account_state)
execute function public.erase_beta_second_intro();

-- All current member-facing introduction surfaces share this protected evidence builder.
-- Observe the actual returned explanation. A bulk delivery to a man's queue is not a view.
alter function public.intro_reason_evidence(uuid,text) rename to intro_reason_evidence_before_beta_followup;
create function public.intro_reason_evidence(p_peer uuid,p_curated text) returns jsonb
language plpgsql volatile security definer set search_path=public,pg_temp as $$
declare
  evidence jsonb := intro_reason_evidence_before_beta_followup(p_peer,p_curated);
  viewer uuid := auth.uid();
  first_review beta_second_intros;
  arrived timestamptz;
begin
  if evidence is null then return evidence; end if;
  if my_gender()='male' then
    if exists(select 1 from beta_male_card_views where reader_id=viewer and peer_id=p_peer) then return evidence; end if;
    perform id from profiles where id in(viewer,p_peer) and role='member' and account_state='active' order by id for share;
    if (select count(*) from profiles where id in(viewer,p_peer) and role='member' and account_state='active')<>2 then return evidence; end if;
    insert into beta_male_card_views values(viewer,p_peer) on conflict do nothing;
    if not found then return evidence; end if;
    arrived:=clock_timestamp();
  end if;
  select * into first_review from beta_second_intros where member_id=viewer and shown_at is null;
  if not found then return evidence; end if;
  if arrived is null then
    select first_shown_at into arrived from candidate_impressions where viewer_id=viewer and candidate_id=p_peer;
  end if;
  if arrived is null or arrived<=first_review.reviewed_at or exists (
      select 1 from feedbacks f join meetings m on m.id=f.meeting_id join intros i on i.id=m.intro_id where f.id=first_review.feedback_id
        and p_peer in(i.female_id,i.male_id)
    ) then return evidence; end if;

  update beta_second_intros set shown_at=clock_timestamp(), reflected=
    coalesce(evidence->>'priority_origin'='feedback',false) and first_review.feedback_id=(
      select f.id from feedbacks f where f.author_id=viewer and f.met order by f.created_at desc,f.id desc limit 1)
    where member_id=viewer and shown_at is null;
  return evidence;
end $$;
revoke all on function public.intro_reason_evidence(uuid,text) from public,anon,authenticated;
-- PostgREST must open a writable transaction for the first qualifying teaser read.
alter function public.intro_teaser_with_evidence() volatile;

-- Snapshot of distinct recipients, not possible pair count. An available schedule is
-- optional for introductions. Report the subset with an actionable slot separately.
create function public.beta_pool_snapshot(p_as_of timestamptz) returns jsonb
language sql stable set search_path=public,pg_temp as $$
  with dates as (
    select (p_as_of at time zone 'Asia/Seoul')::date as today,
           date_trunc('week',p_as_of at time zone 'Asia/Seoul')::date as monday
  ), members as materialized (
    select p.id,p.gender,member_area_ids(p.id) as areas,w.weekdays
    from eligible_profiles p left join meet_windows w on w.user_id=p.id and w.updated_at>p_as_of-interval '14 days'
    where p.hub_id<>'undecided'
  ), pairs as (
    select f.id as woman,m.id as man,a.verdict,
      exists(select 1 from dates d, generate_series(1,d.monday+6-d.today) days(n)
        where extract(isodow from d.today+days.n)::smallint=any(f.weekdays)
          and extract(isodow from d.today+days.n)::smallint=any(m.weekdays)
          -- Every supported window includes 20:00. Slots start tomorrow, per suggested_meeting_slots.
          and ((d.today+days.n)+time '20:00') at time zone 'Asia/Seoul'>p_as_of+interval '3 hours') as has_slot
    from members f join members m on m.gender='male' and f.areas && m.areas
    left join affinities a on a.from_id=f.id and a.to_id=m.id
    where f.gender='female' and not is_excluded(f.id,m.id)
      and (a.verdict is null or (a.verdict='like'
        and not exists(select 1 from intros i where i.male_id=m.id and (i.closed_at is null or i.female_id=f.id))
        and not exists(select 1 from intro_queue q where q.male_id=m.id and q.female_id=f.id
            and (q.opened_at is not null or q.expires_at<=p_as_of)))))
  select jsonb_build_object('week_start',d.monday,'week_end',d.monday+6,
    'women',count(distinct woman) filter(where verdict is null),
    'men',count(distinct man) filter(where verdict='like'),
    'women_with_slot',count(distinct woman) filter(where verdict is null and has_slot),
    'men_with_slot',count(distinct man) filter(where verdict='like' and has_slot))
  from dates d left join pairs on true group by d.monday
$$;
revoke all on function public.beta_pool_snapshot(timestamptz) from public,anon,authenticated;

alter function public.admin_invite_beta_observations() rename to admin_invite_beta_before_pool;
revoke all on function public.admin_invite_beta_before_pool() from public,anon,authenticated;
create function public.admin_invite_beta_observations() returns jsonb
language plpgsql stable security definer set search_path=public,pg_temp as $$
declare existing jsonb := admin_invite_beta_before_pool(); -- existing admin + MFA check
begin
  return existing || jsonb_build_object('pool', beta_pool_snapshot(now()), 'followup', (
    select jsonb_build_object('reviewed',count(*),'shown',count(shown_at),
      'reflected',count(*) filter(where reflected))
    from beta_second_intros));
end $$;
revoke all on function public.admin_invite_beta_observations() from public,anon;
grant execute on function public.admin_invite_beta_observations() to authenticated;
