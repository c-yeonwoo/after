-- Surface terminal or unknown delivery outcomes without treating an in-app row
-- as proof of APNs submission. Temporary retries stay in the system view.
alter table public.ops_cases drop constraint ops_cases_case_type_check;
alter table public.ops_cases add constraint ops_cases_case_type_check
  check (case_type in (
    'support','photo_review','content_report','no_show_report','payment_unknown',
    'notification_failure'
  ));

create or replace function public.ops_sync_case(
  p_type text, p_source_id text, p_subject uuid,
  p_revision text, p_open boolean, p_priority text
) returns uuid
  language plpgsql security definer set search_path = public, pg_temp as $$
declare v_case public.ops_cases; v_due interval;
begin
  if p_type not in ('support','photo_review','content_report','no_show_report',
                    'payment_unknown','notification_failure') or
     p_priority not in ('critical','high','normal') or
     p_source_id is null or char_length(p_source_id) not between 1 and 80 or
     p_revision is null then
    raise exception 'invalid ops source' using errcode = '22023';
  end if;
  if p_subject is not null and exists (
    select 1 from public.profiles where id = p_subject and account_state = 'withdrawn'
  ) then p_subject := null; end if;
  perform pg_advisory_xact_lock(hashtextextended(p_type || ':' || p_source_id, 0));
  select * into v_case from public.ops_cases
   where case_type = p_type and source_id = p_source_id
     and status not in ('resolved','superseded') for update;
  if p_open then
    if found then
      if v_case.source_revision is distinct from p_revision or
         v_case.priority is distinct from p_priority then
        update public.ops_cases
           set source_revision = p_revision, priority = p_priority,
               subject_id = p_subject, version = version + 1
         where id = v_case.id;
        insert into public.ops_case_events
          (case_id,event_type,actor_type,actor_id,from_status,to_status,reason_code)
        values (v_case.id,'source_changed','system',null,
                v_case.status,v_case.status,'source_changed');
      end if;
      return v_case.id;
    end if;
    v_due := case p_type
      when 'payment_unknown' then interval '1 hour'
      when 'notification_failure' then interval '1 hour'
      when 'content_report' then interval '24 hours'
      when 'no_show_report' then interval '24 hours'
      else interval '1 day' end;
    insert into public.ops_cases
      (case_type,source_id,subject_id,occurrence,priority,due_at,source_revision)
    values (p_type,p_source_id,p_subject,
            coalesce((select max(occurrence) + 1 from public.ops_cases
                      where case_type = p_type and source_id = p_source_id),1),
            p_priority,now() + v_due,p_revision)
    returning * into v_case;
    insert into public.ops_case_events
      (case_id,event_type,actor_type,actor_id,to_status,reason_code)
    values (v_case.id,'opened','system',null,'open','source_open');
    return v_case.id;
  end if;
  if found then
    update public.ops_cases
       set status = 'resolved', resolved_at = now(),
           resolution_code = 'source_resolved', version = version + 1,
           source_revision = p_revision
     where id = v_case.id;
    insert into public.ops_case_events
      (case_id,event_type,actor_type,actor_id,from_status,to_status,reason_code)
    values (v_case.id,'resolved','system',null,
            v_case.status,'resolved','source_resolved');
    return v_case.id;
  end if;
  return null;
end $$;
revoke all on function public.ops_sync_case(text,text,uuid,text,boolean,text)
  from public, anon, authenticated;

create or replace function public.ops_source_open(p_type text, p_source_id text)
returns boolean language plpgsql stable security definer set search_path = public, pg_temp as $$
begin
  case p_type
    when 'support' then
      return exists (select 1 from public.support_requests s
                     join public.profiles p on p.id = s.user_id
                     where s.id::text = p_source_id and s.status = 'open'
                       and p.account_state <> 'withdrawn');
    when 'photo_review' then
      return exists (select 1 from public.profiles
                     where id::text = p_source_id and photo_url is not null
                       and photo_state = 'pending' and account_state = 'active');
    when 'content_report' then
      return exists (select 1 from public.content_reports
                     where id::text = p_source_id and state = 'pending');
    when 'no_show_report' then
      return exists (select 1 from public.no_show_reports
                     where id::text = p_source_id and state = 'pending');
    when 'payment_unknown' then
      return exists (select 1 from public.ticket_orders
                     where order_id = p_source_id and payment_required
                       and (payment_attention is not null or state = 'canceling'));
    when 'notification_failure' then
      return exists (select 1 from public.notifications
                     where id::text = p_source_id and dispatch_state not in
                       ('submitted','unavailable','skipped'));
    else
      raise exception 'invalid ops source' using errcode = '22023';
  end case;
end $$;
revoke all on function public.ops_source_open(text,text) from public, anon, authenticated;

create function public.ops_project_notification_dispatch() returns trigger
  language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if new.dispatch_state in ('failed','unknown') then
    perform public.ops_sync_case(
      'notification_failure', new.id::text, new.user_id,
      new.dispatch_state || ':' || new.attempts::text, true,
      case when new.dispatch_state = 'unknown' then 'high' else 'normal' end
    );
  elsif new.dispatch_state in ('submitted','unavailable','skipped') and
        old.dispatch_state in ('failed','unknown','retry','pending','running') then
    perform public.ops_sync_case('notification_failure', new.id::text, new.user_id,
                                 new.dispatch_state, false, 'normal');
  end if;
  return new;
end $$;
create trigger notifications_ops_dispatch after update of dispatch_state on public.notifications
  for each row when (old.dispatch_state is distinct from new.dispatch_state)
  execute function public.ops_project_notification_dispatch();
revoke all on function public.ops_project_notification_dispatch()
  from public, anon, authenticated;

-- Current unresolved failures are operational work, but historical successful
-- sent_at rows remain "legacy_unverified" and are not retroactively credited.
do $$ declare v_row public.notifications;
begin
  for v_row in select * from public.notifications
    where dispatch_state = 'failed' and kind::text <> 'notification_email_verify'
  loop
    perform public.ops_sync_case('notification_failure', v_row.id::text, v_row.user_id,
                                  'failed:' || v_row.attempts::text, true, 'normal');
  end loop;
end $$;

-- Admin backfill/retry is explicit; unknown APNs results cannot be safely replayed.
create or replace function public.admin_retry_notifications(p_ids uuid[], p_note text)
returns integer language plpgsql security definer set search_path = public, pg_temp as $$
declare v_count integer;
begin
  if not public.is_admin() then
    raise exception 'admin only' using errcode = '42501';
  end if;
  if coalesce(cardinality(p_ids),0) = 0 or cardinality(p_ids) > 30 or
     char_length(btrim(coalesce(p_note,''))) not between 3 and 500 then
    raise exception 'ids and reason required' using errcode = '22023';
  end if;
  with retried as (
    update public.notifications n
       set dispatch_state = 'pending', next_attempt_at = now(),
           attempts = 0, last_error = null
     where n.id = any(p_ids) and n.sent_at is null and n.dispatch_state = 'failed'
    returning n.id,n.user_id
  ), logged as (
    insert into public.admin_actions (actor_id,kind,target_user,target_ref,note)
    select auth.uid(),'retry_notification',r.user_id,r.id,btrim(p_note)
      from retried r returning 1
  ) select count(*) into v_count from logged;
  return v_count;
end $$;
revoke all on function public.admin_retry_notifications(uuid[],text) from public, anon;
grant execute on function public.admin_retry_notifications(uuid[],text) to authenticated;
