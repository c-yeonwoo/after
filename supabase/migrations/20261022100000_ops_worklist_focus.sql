-- Add deadline views without changing the existing RPC used by older clients.
create function public.admin_ops_worklist(
  p_status text default null, p_type text default null,
  p_priority text default null, p_cursor jsonb default null,
  p_limit integer default 30, p_focus text default null
) returns jsonb
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare
  v_result jsonb;
  v_rank integer;
  v_due timestamptz;
  v_id uuid;
  v_tomorrow timestamptz := (date_trunc('day', now() at time zone 'Asia/Seoul')
    + interval '1 day') at time zone 'Asia/Seoul';
begin
  if not public.is_admin() then
    raise exception 'admin only' using errcode = '42501';
  end if;
  if p_limit is null or p_limit not between 1 and 50 or
     (p_focus is not null and p_focus not in ('overdue','today','followup')) or
     (p_status is not null and p_status not in
       ('open','in_progress','waiting','snoozed','resolved','superseded')) or
     (p_type is not null and p_type not in
       ('support','photo_review','content_report','no_show_report','payment_unknown',
        'notification_failure','meeting_followup','response_review')) or
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
    if v_rank is null or v_due is null or v_id is null then
      raise exception 'invalid worklist cursor' using errcode = '22023';
    end if;
  end if;
  with filtered as materialized (
    select c.id, c.case_type, c.source_id, c.subject_id, c.occurrence,
           c.priority, c.status, c.opened_at, c.due_at, c.next_check_at,
           c.version, p.name as subject_name, p.hub_id,
           case c.priority when 'critical' then 0 when 'high' then 1 else 2 end as rank
      from public.ops_cases c left join public.profiles p on p.id = c.subject_id
     where ((p_status is null and c.status not in ('resolved','superseded'))
            or c.status = p_status)
       and (p_type is null or c.case_type = p_type)
       and (p_priority is null or c.priority = p_priority)
       and (p_focus is null or (
         c.status not in ('resolved','superseded') and (
           (p_focus = 'overdue' and c.due_at < now()) or
           (p_focus = 'today' and c.due_at >= now() and c.due_at < v_tomorrow) or
           (p_focus = 'followup' and c.next_check_at <= now())
         )
       ))
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
    'next_cursor', case when exists (
      select 1 from filtered f, last_row l where (f.rank,f.due_at,f.id) > (l.rank,l.due_at,l.id)
    ) then (select jsonb_build_object('rank',rank,'due_at',due_at,'id',id) from last_row)
      else null end) into v_result;
  return v_result;
end $$;
revoke all on function public.admin_ops_worklist(text,text,text,jsonb,integer,text) from public, anon;
grant execute on function public.admin_ops_worklist(text,text,text,jsonb,integer,text) to authenticated;
