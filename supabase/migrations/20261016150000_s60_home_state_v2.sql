-- 온보딩 입력 완료와 새 소개 자격을 분리한다. 내부 함수는 임의 회원 조회를 막는다.
create function public.member_readiness(p_user uuid) returns jsonb
  language plpgsql stable security definer set search_path = public, pg_temp as $$
declare
  p public.profiles;
  blockers text[] := '{}';
begin
  select * into p from public.profiles where id = p_user;
  if not found then
    return jsonb_build_object('ready', false, 'blockers', array['account_inactive']);
  end if;

  if p.account_state <> 'active' or p.role <> 'member' then
    blockers := array_append(blockers, 'account_inactive');
  end if;
  if p.paused_at is not null then
    blockers := array_append(blockers, 'paused');
  end if;
  if p.onboarding_step <> 7 or p.name is null then
    blockers := array_append(blockers, 'profile_incomplete');
  end if;
  if p.email_verified_at is null then
    blockers := array_append(blockers, 'work_email_unverified');
  end if;
  if p.phone_verified_at is null then
    blockers := array_append(blockers, 'phone_unverified');
  end if;
  if public.carrier_identity_required() and (
    p.identity_verified_at is null or p.birth is null or
    extract(year from age((now() at time zone 'Asia/Seoul')::date, p.birth)) < 19
  ) then
    blockers := array_append(blockers, 'adult_unverified');
  end if;
  if coalesce(cardinality(p.photo_paths), 0) < 3 then
    blockers := array_append(blockers, 'photos_missing');
  elsif p.photo_state = 'rejected' then
    blockers := array_append(blockers, 'photos_rejected');
  elsif p.photo_state <> 'approved' then
    blockers := array_append(blockers, 'photos_pending');
  end if;
  if p.terms_agreed_at is null or p.privacy_agreed_at is null then
    blockers := array_append(blockers, 'policy_required');
  end if;

  return jsonb_build_object('ready', cardinality(blockers) = 0,
                            'blockers', blockers);
end $$;
revoke all on function public.member_readiness(uuid) from public, anon, authenticated;

create function public.my_readiness() returns jsonb
  language plpgsql stable security definer set search_path = public, pg_temp as $$
begin
  if auth.uid() is null then
    raise exception 'unauthenticated' using errcode = '28000';
  end if;
  return public.member_readiness(auth.uid()) || jsonb_build_object('as_of', now());
end $$;
revoke all on function public.my_readiness() from public, anon;
grant execute on function public.my_readiness() to authenticated;

-- v1은 기존 클라이언트 호환을 위해 유지한다. 이 함수는 소개 열람·차감을 하지 않는다.
create or replace function public.home_state_v2() returns jsonb
  language plpgsql volatile security definer set search_path = public, pg_temp as $$
declare
  h jsonb;
  r jsonb;
  p public.profiles;
  m public.meetings;
  v_state text;
  v_action text;
  v_target uuid;
  v_deadline timestamptz;
  v_intro_tix integer;
  v_meet_tix integer;
  v_request_count integer;
begin
  if auth.uid() is null then
    raise exception 'unauthenticated' using errcode = '28000';
  end if;
  select * into p from public.profiles where id = auth.uid();
  if not found then
    return jsonb_build_object('schema_version', 2, 'as_of', now(),
      'primary_state', 'account_unavailable', 'readiness', public.member_readiness(auth.uid()),
      'next_action', null, 'deadline_at', null);
  end if;
  if p.account_state <> 'active' or p.role <> 'member' then
    return jsonb_build_object('schema_version', 2, 'as_of', now(),
      'primary_state', 'account_unavailable', 'readiness', public.member_readiness(p.id),
      'next_action', null, 'deadline_at', null);
  end if;

  h := public.home_state();
  r := public.member_readiness(p.id);
  if p.gender = 'female' then
    select count(*) into v_request_count
      from public.meetings rm join public.intros ri on ri.id = rm.intro_id
     where ri.female_id = p.id and ri.closed_at is null
       and rm.prefs_submitted_at is null and rm.cancelled_at is null
       and rm.completed_at is null;
    h := h || jsonb_build_object('request_count', v_request_count);
  end if;
  if h->'meeting' is not null and h->'meeting' <> 'null'::jsonb then
    select * into m from public.meetings where id = (h #>> '{meeting,id}')::uuid;
    if m.completed_at is not null then
      -- v1은 완료된 확정 약속도 돌려줄 수 있다. 새 상태에서는 진행 중으로 보지 않는다.
      h := h || jsonb_build_object('meeting', null, 'candidate', null);
      m := null;
    end if;
  end if;

  if p.account_state <> 'active' then
    v_state := 'account_unavailable';
  elsif h->'pending_no_show' is not null and h->'pending_no_show' <> 'null'::jsonb
        and h #>> '{pending_no_show,responded_at}' is null then
    v_state := 'report_response_required'; v_action := 'respond_report';
    v_target := (h #>> '{pending_no_show,id}')::uuid;
  elsif m.id is not null and m.confirmed_at is not null then
    if m.completed_at is null and m.scheduled_at < now() then
      v_state := 'meeting_outcome_required'; v_action := 'view_meeting';
    else
      v_state := 'meeting_confirmed'; v_action := 'view_meeting';
    end if;
    v_target := m.id;
  elsif p.onboarding_step < 7 then
    v_state := 'profile_incomplete'; v_action := 'complete_profile';
  elsif r->'blockers' ? 'adult_unverified' then
    v_state := 'identity_required'; v_action := 'verify_identity';
  elsif r->'blockers' ? 'phone_unverified' then
    v_state := 'phone_required'; v_action := 'verify_phone';
  elsif r->'blockers' ? 'photos_missing' or r->'blockers' ? 'photos_rejected' then
    v_state := 'photos_required'; v_action := 'edit_photos';
  elsif r->'blockers' ? 'photos_pending' then
    v_state := 'photos_pending';
  elsif r->'blockers' ? 'work_email_unverified' or r->'blockers' ? 'policy_required' then
    v_state := 'profile_incomplete'; v_action := 'complete_profile';
  elsif m.id is not null and m.prefs_submitted_at is not null then
    v_state := case when p.gender = 'male' then 'schedule_selection' else 'schedule_waiting' end;
    v_action := case when p.gender = 'male' then 'select_slot' else 'view_meeting' end;
    v_target := m.id;
  elsif coalesce((h->>'request_count')::integer, 0) > 0 and p.gender = 'female' then
    v_state := 'request_received'; v_action := 'view_requests';
  elsif m.id is not null then
    v_state := 'request_waiting'; v_action := 'view_meeting'; v_target := m.id;
  elsif h->'candidate' is not null and h->'candidate' <> 'null'::jsonb then
    v_state := 'intro_available'; v_action := 'view_intro';
  elsif p.gender = 'male' and coalesce((h->>'queued_intros')::integer, 0) > 0 then
    v_state := 'intro_delivered'; v_action := 'view_intro';
  elsif p.paused_at is not null then
    v_state := 'paused'; v_action := 'resume_intros';
  else
    v_state := 'waiting';
  end if;

  if m.id is not null and m.confirmed_at is null and m.prefs_submitted_at is null then
    select t.used_at + interval '24 hours' into v_deadline
      from public.tickets t where t.id = m.ticket_id;
  end if;
  select count(*) filter (where kind = 'intro'), count(*) filter (where kind = 'meeting')
    into v_intro_tix, v_meet_tix from public.tickets
   where user_id = p.id and state = 'unused' and expires_at > now() and not refund_locked;

  return h || jsonb_build_object(
    'schema_version', 2, 'as_of', now(), 'primary_state', v_state,
    'readiness', r, 'next_action', case when v_action is null then null
      else jsonb_build_object('type', v_action, 'target_id', v_target) end,
    'deadline_at', v_deadline,
    'ticket_summary', jsonb_build_object('intro_available', v_intro_tix,
                                          'meeting_available', v_meet_tix),
    'intro_tickets', v_intro_tix, 'meeting_tickets', v_meet_tix
  );
end $$;
revoke all on function public.home_state_v2() from public, anon;
grant execute on function public.home_state_v2() to authenticated;
