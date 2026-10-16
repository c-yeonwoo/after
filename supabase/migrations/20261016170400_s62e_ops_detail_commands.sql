create function public.admin_ops_case_detail(p_case_id uuid) returns jsonb
  language plpgsql stable security definer set search_path = public, pg_temp as $$
declare
  v_case public.ops_cases;
  v_events jsonb;
  v_source_open boolean;
begin
  if not public.is_admin() then
    raise exception 'admin only' using errcode = '42501';
  end if;
  select * into v_case from public.ops_cases where id = p_case_id;
  if not found then
    raise exception 'case not found' using errcode = 'P0002';
  end if;
  v_source_open := public.ops_source_open(v_case.case_type, v_case.source_id);
  select coalesce(jsonb_agg(jsonb_build_object(
      'id', e.id, 'event_type', e.event_type, 'actor_type', e.actor_type,
      'actor_id', e.actor_id, 'from_status', e.from_status,
      'to_status', e.to_status, 'reason_code', e.reason_code,
      'note', e.note, 'created_at', e.created_at
    ) order by e.created_at, e.id), '[]'::jsonb)
    into v_events from public.ops_case_events e where e.case_id = p_case_id;
  return jsonb_build_object(
    'case', to_jsonb(v_case), 'source_open', v_source_open,
    'events', v_events,
    'allowed_actions', case
      when v_case.status in ('resolved','superseded') then '[]'::jsonb
      when not v_source_open then '["resolve"]'::jsonb
      when v_case.status = 'open' then '["start","wait","snooze"]'::jsonb
      when v_case.status = 'in_progress' then '["wait","snooze","reopen"]'::jsonb
      else '["start","reopen"]'::jsonb end);
end $$;
revoke all on function public.admin_ops_case_detail(uuid) from public, anon;
grant execute on function public.admin_ops_case_detail(uuid) to authenticated;

create function public.admin_transition_case(
  p_case_id uuid, p_action text, p_expected_version integer,
  p_reason text, p_request_id uuid, p_next_check_at timestamptz default null
) returns public.ops_cases
  language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_case public.ops_cases;
  v_next text;
  v_event text;
  v_old text;
begin
  if not public.is_admin() then
    raise exception 'admin only' using errcode = '42501';
  end if;
  if p_request_id is null or p_action not in
     ('start','wait','snooze','reopen','resolve') or
     char_length(btrim(coalesce(p_reason, ''))) not between 3 and 500 then
    raise exception 'action, request ID and reason required' using errcode = '22023';
  end if;
  select * into v_case from public.ops_cases where id = p_case_id for update;
  if not found then
    raise exception 'case not found' using errcode = 'P0002';
  end if;
  if exists (select 1 from public.ops_case_events
              where request_id = p_request_id and case_id = p_case_id) then
    return v_case;
  end if;
  if exists (select 1 from public.ops_case_events
              where request_id = p_request_id and case_id <> p_case_id) then
    raise exception 'request ID belongs to a different case' using errcode = 'PT409';
  end if;
  if v_case.version <> p_expected_version then
    raise exception 'stale_version' using errcode = 'PT409';
  end if;
  if v_case.status in ('resolved','superseded') then
    raise exception 'already_resolved' using errcode = 'PT409';
  end if;
  v_next := case p_action
    when 'start' then 'in_progress'
    when 'wait' then 'waiting'
    when 'snooze' then 'snoozed'
    when 'reopen' then 'open'
    else 'resolved' end;
  v_event := case p_action when 'start' then 'started'
    when 'wait' then 'waiting' when 'snooze' then 'snoozed'
    when 'reopen' then 'reopened' else 'resolved' end;
  if v_case.status = v_next then
    raise exception 'case already in requested state' using errcode = 'PT409';
  end if;
  if p_action in ('wait','snooze') and
     (p_next_check_at is null or p_next_check_at <= now() or
      p_next_check_at > now() + interval '30 days') then
    raise exception 'next check must be in the next 30 days' using errcode = '22023';
  end if;
  if p_action = 'resolve' and
     public.ops_source_open(v_case.case_type, v_case.source_id) then
    raise exception 'source is still open' using errcode = 'PT409';
  end if;
  v_old := v_case.status;
  update public.ops_cases
     set status = v_next, version = version + 1,
         next_check_at = case when p_action in ('wait','snooze')
                              then p_next_check_at else null end,
         resolved_at = case when p_action = 'resolve' then now() else null end,
         resolution_code = case when p_action = 'resolve'
                                then 'source_verified_closed' else null end
   where id = p_case_id returning * into v_case;
  insert into public.ops_case_events
    (case_id, event_type, actor_type, actor_id, from_status, to_status,
     reason_code, note, request_id)
  values (p_case_id, v_event, 'admin', auth.uid(), v_old,
          v_next, 'operator_action', btrim(p_reason), p_request_id);
  insert into public.admin_actions
    (actor_id, kind, target_user, target_ref, case_id, request_id, note)
  values (auth.uid(), 'case_transition', v_case.subject_id, p_case_id,
          p_case_id, p_request_id,
          '작업 ' || p_action || ' — ' || btrim(p_reason));
  return v_case;
end $$;
revoke all on function public.admin_transition_case(
  uuid,text,integer,text,uuid,timestamptz) from public, anon;
grant execute on function public.admin_transition_case(
  uuid,text,integer,text,uuid,timestamptz) to authenticated;

create function public.admin_member_timeline(
  p_user_id uuid, p_cursor jsonb default null, p_limit integer default 30
) returns jsonb
  language plpgsql stable security definer set search_path = public, pg_temp as $$
declare
  v_at timestamptz;
  v_id text;
  v_result jsonb;
begin
  if not public.is_admin() then
    raise exception 'admin only' using errcode = '42501';
  end if;
  if p_limit not between 1 and 50 then
    raise exception 'invalid timeline limit' using errcode = '22023';
  end if;
  if p_cursor is not null then
    if jsonb_typeof(p_cursor) <> 'object' or
       not (p_cursor ? 'at' and p_cursor ? 'id') then
      raise exception 'invalid timeline cursor' using errcode = '22023';
    end if;
    v_at := (p_cursor->>'at')::timestamptz;
    v_id := p_cursor->>'id';
  end if;
  with entries as materialized (
    select 'domain:' || e.id as id, e.occurred_at as at,
           e.event_type as kind, e.aggregate_type as object_type,
           e.aggregate_id as object_id, e.props as details
      from public.domain_events e where e.subject_id = p_user_id
    union all
    select 'admin:' || a.id as id, a.created_at as at,
           a.kind as kind, 'admin_action' as object_type,
           coalesce(a.case_id::text, a.target_ref::text, a.id::text) as object_id,
           jsonb_build_object('note', a.note) as details
      from public.admin_actions a where a.target_user = p_user_id
    union all
    select 'case:' || e.id as id, e.created_at as at,
           e.event_type as kind, 'ops_case' as object_type,
           e.case_id::text as object_id,
           jsonb_build_object('reason_code', e.reason_code, 'note', e.note) as details
      from public.ops_case_events e
      join public.ops_cases c on c.id = e.case_id
     where c.subject_id = p_user_id
  ), page as (
    select * from entries
     where p_cursor is null or (at, id) < (v_at, v_id)
     order by at desc, id desc limit p_limit
  ), last_row as (
    select at, id from page order by at, id limit 1
  )
  select jsonb_build_object(
    'as_of', now(),
    'items', coalesce((select jsonb_agg(to_jsonb(p) order by p.at desc, p.id desc)
                       from page p), '[]'::jsonb),
    'next_cursor', case when (select count(*) from page) = p_limit
      then (select jsonb_build_object('at', at, 'id', id) from last_row)
      else null end)
    into v_result;
  return v_result;
end $$;
revoke all on function public.admin_member_timeline(uuid,jsonb,integer)
  from public, anon;
grant execute on function public.admin_member_timeline(uuid,jsonb,integer)
  to authenticated;
