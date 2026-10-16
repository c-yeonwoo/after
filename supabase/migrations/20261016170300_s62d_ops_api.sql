create function public.ops_current_sources()
returns table(case_type text, source_id text, subject_id uuid,
              source_revision text, priority text)
language sql stable security definer set search_path = public, pg_temp as $$
  select 'support', s.id::text, s.user_id,
         md5(s.status || ':' || coalesce(s.responded_at::text, '')),
         case when s.category = 'safety' then 'high' else 'normal' end
    from public.support_requests s join public.profiles p on p.id = s.user_id
   where s.status = 'open' and p.account_state <> 'withdrawn'
  union all
  select 'photo_review', p.id::text, p.id,
         md5(coalesce(p.photo_url, '') || ':' || p.photo_state::text), 'normal'
    from public.profiles p
   where p.photo_url is not null and p.photo_state = 'pending'
     and p.account_state = 'active'
  union all
  select 'content_report', r.id::text, r.accused_id,
         md5(r.state::text || ':' || coalesce(r.resolved_at::text, '')), 'high'
    from public.content_reports r where r.state = 'pending'
  union all
  select 'no_show_report', r.id::text, r.accused_id,
         md5(r.state::text || ':' || coalesce(r.resolved_at::text, '')), 'high'
    from public.no_show_reports r where r.state = 'pending'
  union all
  select 'payment_unknown', o.order_id, o.user_id,
         md5(o.state || ':' || coalesce(o.payment_attention, '')), 'high'
    from public.ticket_orders o
   where o.payment_required and
     (o.payment_attention is not null or o.state = 'canceling')
$$;
revoke all on function public.ops_current_sources() from public, anon, authenticated;

create function public.admin_preview_ops_backfill() returns jsonb
  language plpgsql stable security definer set search_path = public, pg_temp as $$
declare v_result jsonb;
begin
  if not public.is_admin() then
    raise exception 'admin only' using errcode = '42501';
  end if;
  with candidates as (
    select s.case_type, s.source_id,
           c.id is null as missing
      from public.ops_current_sources() s
      left join public.ops_cases c
        on c.case_type = s.case_type and c.source_id = s.source_id
       and c.status not in ('resolved', 'superseded')
  ), by_type as (
    select case_type, count(*) as current_count,
           count(*) filter (where missing) as missing_count
      from candidates group by case_type
  )
  select jsonb_build_object(
    'as_of', now(),
    'current_total', coalesce((select sum(current_count) from by_type), 0),
    'missing_total', coalesce((select sum(missing_count) from by_type), 0),
    'by_type', coalesce((select jsonb_agg(to_jsonb(b) order by b.case_type)
                         from by_type b), '[]'::jsonb))
    into v_result;
  return v_result;
end $$;
revoke all on function public.admin_preview_ops_backfill() from public, anon;
grant execute on function public.admin_preview_ops_backfill() to authenticated;

create function public.admin_apply_ops_backfill(
  p_expected_missing integer, p_note text
) returns integer
  language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_missing integer;
  v_added integer := 0;
  v_candidates jsonb;
  v_case_id uuid;
  v_source_at timestamptz;
  r record;
begin
  if not public.is_admin() then
    raise exception 'admin only' using errcode = '42501';
  end if;
  if p_expected_missing is null or p_expected_missing < 0 or
     char_length(btrim(coalesce(p_note, ''))) not between 3 and 500 then
    raise exception 'expected count and reason required' using errcode = '22023';
  end if;
  select coalesce(jsonb_agg(to_jsonb(s)), '[]'::jsonb)
    into v_candidates
    from public.ops_current_sources() s
   where not exists (
     select 1 from public.ops_cases c
      where c.case_type = s.case_type and c.source_id = s.source_id
        and c.status not in ('resolved', 'superseded')
   );
  v_missing := jsonb_array_length(v_candidates);
  if v_missing <> p_expected_missing then
    raise exception 'backfill preview is stale' using errcode = 'PT409';
  end if;
  for r in select * from jsonb_to_recordset(v_candidates)
    as x(case_type text, source_id text, subject_id uuid,
         source_revision text, priority text) loop
    -- Recheck immediately before applying; a concurrent user action may have
    -- resolved a source after the preview.
    if public.ops_source_open(r.case_type, r.source_id) then
      v_case_id := public.ops_sync_case(r.case_type, r.source_id, r.subject_id,
        r.source_revision, true, r.priority);
      -- Historical open work keeps its known source age. Photo submission
      -- and payment-unknown onset were not recorded in old rows, so those
      -- remain explicitly measured from the backfill, not guessed.
      v_source_at := null;
      case r.case_type
        when 'support' then
          select created_at into v_source_at from public.support_requests
           where id::text = r.source_id;
        when 'content_report' then
          select created_at into v_source_at from public.content_reports
           where id::text = r.source_id;
        when 'no_show_report' then
          select created_at into v_source_at from public.no_show_reports
           where id::text = r.source_id;
        else null;
      end case;
      if v_source_at is not null then
        update public.ops_cases
           set opened_at = v_source_at,
               due_at = v_source_at + case r.case_type
                 when 'support' then interval '1 day'
                 else interval '24 hours' end
         where id = v_case_id and occurrence = 1 and opened_at = now();
      end if;
      v_added := v_added + 1;
    end if;
  end loop;
  insert into public.admin_actions(actor_id, kind, note)
  values (auth.uid(), 'case_transition',
          '작업함 현재 건 적재: 예상 누락 ' || p_expected_missing || '건 — ' || btrim(p_note));
  return v_added;
end $$;
revoke all on function public.admin_apply_ops_backfill(integer,text) from public, anon;
grant execute on function public.admin_apply_ops_backfill(integer,text) to authenticated;

create function public.admin_ops_overview(p_hub text default null) returns jsonb
  language plpgsql stable security definer set search_path = public, pg_temp as $$
declare v_result jsonb;
begin
  if not public.is_admin() then
    raise exception 'admin only' using errcode = '42501';
  end if;
  with active as (
    select c.* from public.ops_cases c
    left join public.profiles p on p.id = c.subject_id
    where c.status not in ('resolved', 'superseded')
      and (p_hub is null or p.hub_id = p_hub)
  )
  select jsonb_build_object(
    'as_of', now(), 'total', count(*),
    'critical', count(*) filter (where priority = 'critical'),
    'high', count(*) filter (where priority = 'high'),
    'overdue', count(*) filter (where due_at < now()),
    'due_today', count(*) filter (where due_at >= now() and
      due_at < (date_trunc('day', now() at time zone 'Asia/Seoul') + interval '1 day')
               at time zone 'Asia/Seoul'),
    'waiting', count(*) filter (where status in ('waiting','snoozed')),
    'by_type', coalesce((select jsonb_object_agg(case_type, n)
                         from (select case_type, count(*) n from active
                               group by case_type) x), '{}'::jsonb))
    into v_result from active;
  return v_result;
end $$;
revoke all on function public.admin_ops_overview(text) from public, anon;
grant execute on function public.admin_ops_overview(text) to authenticated;

create function public.admin_ops_cases(
  p_status text default null, p_type text default null,
  p_priority text default null, p_cursor jsonb default null,
  p_limit integer default 30, p_hub text default null
) returns jsonb
  language plpgsql stable security definer set search_path = public, pg_temp as $$
declare
  v_result jsonb;
  v_rank integer;
  v_due timestamptz;
  v_id uuid;
begin
  if not public.is_admin() then
    raise exception 'admin only' using errcode = '42501';
  end if;
  if p_limit not between 1 and 50 or
     (p_status is not null and p_status not in
       ('open','in_progress','waiting','snoozed','resolved','superseded')) or
     (p_type is not null and p_type not in
       ('support','photo_review','content_report','no_show_report','payment_unknown')) or
     (p_priority is not null and p_priority not in ('critical','high','normal')) then
    raise exception 'invalid worklist filter' using errcode = '22023';
  end if;
  if p_cursor is not null then
    if jsonb_typeof(p_cursor) <> 'object' or
       not (p_cursor ? 'rank' and p_cursor ? 'due_at' and p_cursor ? 'id') then
      raise exception 'invalid worklist cursor' using errcode = '22023';
    end if;
    v_rank := (p_cursor->>'rank')::integer;
    v_due := (p_cursor->>'due_at')::timestamptz;
    v_id := (p_cursor->>'id')::uuid;
  end if;
  with filtered as materialized (
    select c.id, c.case_type, c.source_id, c.subject_id, c.occurrence,
           c.priority, c.status, c.opened_at, c.due_at, c.next_check_at,
           c.version, p.name as subject_name, p.hub_id,
           case c.priority when 'critical' then 0 when 'high' then 1 else 2 end as rank
      from public.ops_cases c left join public.profiles p on p.id = c.subject_id
     where (p_status is null and c.status not in ('resolved','superseded')
            or c.status = p_status)
       and (p_type is null or c.case_type = p_type)
       and (p_priority is null or c.priority = p_priority)
       and (p_hub is null or p.hub_id = p_hub)
  ), page as (
    select * from filtered
     where p_cursor is null or (rank, due_at, id) > (v_rank, v_due, v_id)
     order by rank, due_at, id limit p_limit
  ), last_row as (
    select rank, due_at, id from page order by rank desc, due_at desc, id desc limit 1
  )
  select jsonb_build_object(
    'as_of', now(), 'total', (select count(*) from filtered),
    'items', coalesce((select jsonb_agg(to_jsonb(p) - 'rank'
                           order by p.rank, p.due_at, p.id) from page p), '[]'::jsonb),
    'next_cursor', case when (select count(*) from page) = p_limit
      then (select jsonb_build_object('rank', rank, 'due_at', due_at, 'id', id)
              from last_row) else null end)
    into v_result;
  return v_result;
end $$;
revoke all on function public.admin_ops_cases(text,text,text,jsonb,integer,text)
  from public, anon;
grant execute on function public.admin_ops_cases(text,text,text,jsonb,integer,text)
  to authenticated;
