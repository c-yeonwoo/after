-- Six non-reusable attribution slots. Holding a link grants no account access.
create table public.beta_wave_one_invites (
  gender public.gender not null,
  seat smallint not null check(seat between 1 and 3),
  code uuid not null unique default gen_random_uuid(),
  opened_at timestamptz,
  started_at timestamptz,
  member_id uuid unique references public.profiles(id) on delete set null,
  joined_at timestamptz,
  primary key(gender,seat)
);
alter table public.beta_wave_one_invites enable row level security;
revoke all on public.beta_wave_one_invites from public,anon,authenticated;
insert into public.beta_wave_one_invites(gender,seat)
  select g,n from unnest(array['female','male']::public.gender[]) g cross join generate_series(1,3) n;
alter table public.signup_sessions add column wave_invite uuid references public.beta_wave_one_invites(code);

create function public.open_wave_invite(p_code uuid) returns text
language plpgsql security definer set search_path=public,pg_temp as $$
declare slot beta_wave_one_invites;
begin
  update beta_wave_one_invites set opened_at=now() where code=p_code and opened_at is null;
  select * into slot from beta_wave_one_invites where code=p_code;
  if not found then return 'invalid'; end if;
  if slot.joined_at is null then return 'open'; end if;
  if auth.uid()=slot.member_id then return 'mine'; end if;
  return 'used';
end $$;

-- Bind the invitation to the same short-lived session used by email/carrier signup.
-- Multiple browsers may start. Only the first successful matching account takes the seat.
create function public.start_wave_signup(p_code uuid,p_token text default null) returns void
language plpgsql security definer set search_path=public,extensions,pg_temp as $$
declare s signup_sessions;
begin
  if p_token is not null then
    select * into s from signup_sessions where token_hash=encode(extensions.digest(p_token,'sha256'),'hex') for update;
    if not found or s.claimed_at is not null or s.expires_at<=now() then raise exception 'signup expired' using errcode='P0002'; end if;
    if s.wave_invite is not null and s.wave_invite<>p_code then raise exception 'different invite session' using errcode='PT409'; end if;
  end if;
  update beta_wave_one_invites set opened_at=coalesce(opened_at,now()),started_at=coalesce(started_at,now())
    where code=p_code and joined_at is null;
  if not found then raise exception 'invite unavailable' using errcode='PT409'; end if;
  if s.id is not null then update signup_sessions set wave_invite=p_code where id=s.id; end if;
end $$;

create function public.begin_wave_signup(p_code uuid,p_token text,p_policy_version text,p_manager_policy_version text default null) returns jsonb
language plpgsql security definer set search_path=public,pg_temp as $$
declare result jsonb;
begin
  result:=begin_signup_with_manager(p_token,p_policy_version,p_manager_policy_version);
  perform start_wave_signup(p_code,p_token);
  return result || jsonb_build_object('invited',true);
end $$;

-- Carrier callbacks use a fixed URL. Restore the invitation context from its bound session.
alter function public.signup_session_status(text) rename to signup_session_status_before_wave;
revoke all on function public.signup_session_status_before_wave(text) from public,anon,authenticated,service_role;
create function public.signup_session_status(p_token text) returns jsonb
language sql stable security definer set search_path=public,extensions,pg_temp as $$
  select signup_session_status_before_wave(p_token) || jsonb_build_object('invited',exists(
    select 1 from signup_sessions where token_hash=encode(extensions.digest(p_token,'sha256'),'hex') and wave_invite is not null
  ))
$$;
revoke all on function public.signup_session_status(text) from public;
grant execute on function public.signup_session_status(text) to anon,authenticated;

create function public.join_wave_invite(p_code uuid) returns void
language plpgsql security definer set search_path=public,pg_temp as $$
declare person profiles; slot beta_wave_one_invites;
begin
  select * into person from profiles where id=auth.uid() and account_state='active' and role='member' for update;
  if not found then raise exception 'active member required' using errcode='42501'; end if;
  select * into slot from beta_wave_one_invites where code=p_code for update;
  if not found then raise exception 'invite unavailable' using errcode='PT409'; end if;
  if slot.member_id=person.id then return; end if;
  if slot.joined_at is not null then raise exception 'invite unavailable' using errcode='PT409'; end if;
  if slot.gender<>person.gender then raise exception 'invite audience mismatch' using errcode='PT409'; end if;
  if exists(select 1 from beta_wave_one_invites where member_id=person.id) then
    raise exception 'already joined this wave' using errcode='PT409';
  end if;
  update beta_wave_one_invites set member_id=person.id,joined_at=now(),
    opened_at=coalesce(opened_at,now()),started_at=coalesce(started_at,now()) where code=p_code;
end $$;
revoke all on function public.open_wave_invite(uuid),public.start_wave_signup(uuid,text),
  public.begin_wave_signup(uuid,text,text,text),public.join_wave_invite(uuid) from public,anon,authenticated;
grant execute on function public.open_wave_invite(uuid),public.start_wave_signup(uuid,text),
  public.begin_wave_signup(uuid,text,text,text) to anon,authenticated;
grant execute on function public.join_wave_invite(uuid) to authenticated;

create function public.claim_signup_wave_invite() returns trigger
language plpgsql security definer set search_path=public,pg_temp as $$
begin
  if auth.uid() is distinct from new.claimed_by then raise exception 'signup owner mismatch' using errcode='42501'; end if;
  perform join_wave_invite(new.wave_invite);
  return new;
end $$;
revoke all on function public.claim_signup_wave_invite() from public,anon,authenticated;
create trigger claim_signup_wave_invite after update of claimed_by on public.signup_sessions
  for each row when (new.wave_invite is not null and old.claimed_by is null and new.claimed_by is not null)
  execute function public.claim_signup_wave_invite();

create function public.erase_wave_membership() returns trigger
language plpgsql security definer set search_path=public,pg_temp as $$
begin
  update beta_wave_one_invites set member_id=null where member_id=new.id;
  return new;
end $$;
revoke all on function public.erase_wave_membership() from public,anon,authenticated;
create trigger erase_wave_membership after update of account_state on public.profiles
  for each row when (new.account_state='withdrawn' and old.account_state is distinct from new.account_state)
  execute function public.erase_wave_membership();

-- Six rows only. Resolve progress from existing lifecycle facts without reading private review text.
create function public.wave_one_progress() returns jsonb
language sql stable set search_path=public,pg_temp as $$
  with slots as (
    select v.gender,v.seat,case when v.joined_at is null then v.code end as code,
      case
        when v.joined_at is null then case when v.started_at is not null then 'signup'
          when v.opened_at is not null then 'opened' else 'issued' end
        when p.id is null or p.account_state='withdrawn' then 'ended'
        when b.reflected is true then case when b.shown_at<v.joined_at then 'prior_reflected' else 'reflected' end
        when b.reflected is false then 'not_reflected'
        when p.account_state<>'active' or p.paused_at is not null then 'paused'
        when p.phone_verified_at is null or (carrier_identity_required() and p.identity_verified_at is null) then 'verification'
        when p.onboarding_step<>7 then 'profile'
        when p.photo_state='rejected' then 'revision'
        when p.photo_state='pending' then 'review'
        when not (member_readiness_snapshot(p)->>'ready')::boolean then 'requirements'
        when b.reviewed_at is not null then 'second_wait'
        when first_feedback.id is not null then case when first_feedback.next_preference is null then 'no_preference'
          else 'prior_unobserved' end
        when meeting.id is not null then case when meeting.confirmed_at is null then 'coordination'
          when meeting.scheduled_at>now() then 'scheduled' else 'feedback' end
        when exists(select 1 from feedbacks f where f.author_id=p.id and not f.met) then 'no_meeting'
        when exists(select 1 from candidate_impressions c where c.viewer_id=p.id)
          or exists(select 1 from domain_events d where d.event_type='intro_delivered' and d.subject_id=p.id)
          or exists(select 1 from intro_queue q where q.male_id=p.id and q.delivered_at is not null)
          or exists(select 1 from intros i where i.male_id=p.id) then 'first_intro'
        else 'first_wait'
      end as stage
    from beta_wave_one_invites v left join profiles p on p.id=v.member_id
    left join beta_second_intros b on b.member_id=p.id
    left join lateral (
      select f.id,f.next_preference from feedbacks f where f.author_id=p.id and f.met order by f.created_at,f.id limit 1
    ) first_feedback on true
    left join lateral (
      select m.id,m.confirmed_at,m.scheduled_at from intros i join meetings m on m.intro_id=i.id
      where p.id in(i.female_id,i.male_id) and m.cancelled_at is null
        and not exists(select 1 from feedbacks f where f.meeting_id=m.id and f.author_id=p.id)
      order by m.created_at desc,m.id limit 1
    ) meeting on true
  )
  select jsonb_agg(to_jsonb(s) order by (s.gender='male'),s.seat) from slots s
$$;
revoke all on function public.wave_one_progress() from public,anon,authenticated;
alter function public.admin_invite_beta_observations() rename to admin_invite_beta_before_wave;
revoke all on function public.admin_invite_beta_before_wave() from public,anon,authenticated;
create function public.admin_invite_beta_observations() returns jsonb
language plpgsql stable security definer set search_path=public,pg_temp as $$
declare previous jsonb:=admin_invite_beta_before_wave(); -- admin and MFA guard first
begin
  return previous || jsonb_build_object('wave_one',wave_one_progress());
end $$;
revoke all on function public.admin_invite_beta_observations() from public,anon;
grant execute on function public.admin_invite_beta_observations() to authenticated;
