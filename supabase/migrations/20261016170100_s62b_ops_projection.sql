-- Internal source projection. It stores only identifiers, status and due dates;
-- report/support text remains in its existing protected table.
create function public.ops_sync_case(
  p_type text, p_source_id text, p_subject uuid,
  p_revision text, p_open boolean, p_priority text
) returns uuid
  language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_case public.ops_cases;
  v_due interval;
begin
  if p_type not in ('support', 'photo_review', 'content_report',
                    'no_show_report', 'payment_unknown') or
     p_priority not in ('critical', 'high', 'normal') or
     p_source_id is null or char_length(p_source_id) not between 1 and 80 or
     p_revision is null then
    raise exception 'invalid ops source' using errcode = '22023';
  end if;
  if p_subject is not null and exists (
    select 1 from public.profiles where id = p_subject and account_state = 'withdrawn'
  ) then
    p_subject := null;
  end if;
  perform pg_advisory_xact_lock(hashtextextended(p_type || ':' || p_source_id, 0));
  select * into v_case from public.ops_cases
   where case_type = p_type and source_id = p_source_id
     and status not in ('resolved', 'superseded')
   for update;
  if p_open then
    if found then
      if v_case.source_revision is distinct from p_revision or
         v_case.priority is distinct from p_priority then
        update public.ops_cases
           set source_revision = p_revision, priority = p_priority,
               subject_id = p_subject, version = version + 1
         where id = v_case.id;
        insert into public.ops_case_events
          (case_id, event_type, actor_type, actor_id, from_status, to_status, reason_code)
        values (v_case.id, 'source_changed', 'system', null,
                v_case.status, v_case.status, 'source_changed');
      end if;
      return v_case.id;
    end if;
    v_due := case p_type
      when 'payment_unknown' then interval '1 hour'
      when 'content_report' then interval '24 hours'
      when 'no_show_report' then interval '24 hours'
      else interval '1 day' end;
    insert into public.ops_cases
      (case_type, source_id, subject_id, occurrence, priority, due_at, source_revision)
    values (p_type, p_source_id, p_subject,
            coalesce((select max(occurrence) + 1 from public.ops_cases
                      where case_type = p_type and source_id = p_source_id), 1),
            p_priority, now() + v_due, p_revision)
    returning * into v_case;
    insert into public.ops_case_events
      (case_id, event_type, actor_type, actor_id, to_status, reason_code)
    values (v_case.id, 'opened', 'system', null, 'open', 'source_open');
    return v_case.id;
  end if;
  if found then
    update public.ops_cases
       set status = 'resolved', resolved_at = now(),
           resolution_code = 'source_resolved', version = version + 1,
           source_revision = p_revision
     where id = v_case.id;
    insert into public.ops_case_events
      (case_id, event_type, actor_type, actor_id, from_status, to_status, reason_code)
    values (v_case.id, 'resolved', 'system', null,
            v_case.status, 'resolved', 'source_resolved');
    return v_case.id;
  end if;
  return null;
end $$;
revoke all on function public.ops_sync_case(text,text,uuid,text,boolean,text)
  from public, anon, authenticated;

create function public.ops_source_open(p_type text, p_source_id text) returns boolean
  language plpgsql stable security definer set search_path = public, pg_temp as $$
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
    else
      raise exception 'invalid ops source' using errcode = '22023';
  end case;
end $$;
revoke all on function public.ops_source_open(text,text) from public, anon, authenticated;

-- Trusted events are emitted only by database transitions; analytics clients
-- cannot synthesize them. No free-text or payment key enters props.
create function public.ops_emit_domain_event(
  p_type text, p_aggregate_type text, p_aggregate_id text,
  p_subject uuid, p_dedupe_key text, p_props jsonb default '{}'::jsonb
) returns void
  language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if p_subject is not null and exists (
    select 1 from public.profiles where id = p_subject and account_state = 'withdrawn'
  ) then
    return;
  end if;
  insert into public.domain_events
    (event_type, aggregate_type, aggregate_id, subject_id, dedupe_key, props)
  values (p_type, p_aggregate_type, p_aggregate_id, p_subject,
          p_dedupe_key, p_props)
  on conflict (dedupe_key) do nothing;
end $$;
revoke all on function public.ops_emit_domain_event(text,text,text,uuid,text,jsonb)
  from public, anon, authenticated;

create function public.ops_project_support() returns trigger
  language plpgsql security definer set search_path = public, pg_temp as $$
begin
  perform public.ops_sync_case('support', new.id::text, new.user_id,
    md5(new.status || ':' || coalesce(new.responded_at::text, '')),
    new.status = 'open' and exists (
      select 1 from public.profiles p where p.id = new.user_id
       and p.account_state <> 'withdrawn'),
    case when new.category = 'safety' then 'high' else 'normal' end);
  if tg_op = 'INSERT' then
    perform public.ops_emit_domain_event('support_requested', 'support', new.id::text,
      new.user_id, 'support:' || new.id || ':opened',
      jsonb_build_object('category', new.category));
  elsif old.status = 'open' and new.status = 'answered' then
    perform public.ops_emit_domain_event('support_answered', 'support', new.id::text,
      new.user_id, 'support:' || new.id || ':answered');
  end if;
  return new;
end $$;
revoke all on function public.ops_project_support() from public, anon, authenticated;
create trigger ops_project_support
  after insert or update of status, category on public.support_requests
  for each row execute function public.ops_project_support();

create function public.ops_project_photo() returns trigger
  language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if new.photo_url is not distinct from old.photo_url and
     new.photo_state is not distinct from old.photo_state and
     new.account_state is not distinct from old.account_state then
    return new;
  end if;
  perform public.ops_sync_case('photo_review', new.id::text, new.id,
    md5(coalesce(new.photo_url, '') || ':' || new.photo_state::text),
    new.photo_url is not null and new.photo_state = 'pending'
      and new.account_state = 'active', 'normal');
  if new.photo_url is distinct from old.photo_url and new.photo_url is not null then
    perform public.ops_emit_domain_event('photo_submitted', 'profile', new.id::text,
      new.id, 'photo:' || new.id || ':' || md5(new.photo_url));
  elsif old.photo_state = 'pending' and new.photo_state <> 'pending' then
    perform public.ops_emit_domain_event('photo_reviewed', 'profile', new.id::text,
      new.id, 'photo:' || new.id || ':' || md5(coalesce(new.photo_url, '')) ||
      ':' || new.photo_state::text,
      jsonb_build_object('result', new.photo_state::text));
  end if;
  return new;
end $$;
revoke all on function public.ops_project_photo() from public, anon, authenticated;
create trigger ops_project_photo
  after update of photo_url, photo_state, account_state on public.profiles
  for each row execute function public.ops_project_photo();

create function public.ops_project_content_report() returns trigger
  language plpgsql security definer set search_path = public, pg_temp as $$
begin
  perform public.ops_sync_case('content_report', new.id::text, new.accused_id,
    md5(new.state::text || ':' || coalesce(new.resolved_at::text, '')),
    new.state = 'pending', 'high');
  if tg_op = 'INSERT' then
    perform public.ops_emit_domain_event('content_reported', 'content_report',
      new.id::text, new.accused_id, 'content_report:' || new.id || ':opened');
  elsif old.state = 'pending' and new.state <> 'pending' then
    perform public.ops_emit_domain_event('content_report_resolved', 'content_report',
      new.id::text, new.accused_id, 'content_report:' || new.id || ':' || new.state::text,
      jsonb_build_object('result', new.state::text));
  end if;
  return new;
end $$;
revoke all on function public.ops_project_content_report() from public, anon, authenticated;
create trigger ops_project_content_report
  after insert or update of state on public.content_reports
  for each row execute function public.ops_project_content_report();

create function public.ops_project_no_show_report() returns trigger
  language plpgsql security definer set search_path = public, pg_temp as $$
begin
  perform public.ops_sync_case('no_show_report', new.id::text, new.accused_id,
    md5(new.state::text || ':' || coalesce(new.resolved_at::text, '')),
    new.state = 'pending', 'high');
  if tg_op = 'INSERT' then
    perform public.ops_emit_domain_event('no_show_reported', 'no_show_report',
      new.id::text, new.accused_id, 'no_show_report:' || new.id || ':opened');
  elsif old.state = 'pending' and new.state <> 'pending' then
    perform public.ops_emit_domain_event('no_show_resolved', 'no_show_report',
      new.id::text, new.accused_id, 'no_show_report:' || new.id || ':' || new.state::text,
      jsonb_build_object('result', new.state::text));
  end if;
  return new;
end $$;
revoke all on function public.ops_project_no_show_report() from public, anon, authenticated;
create trigger ops_project_no_show_report
  after insert or update of state on public.no_show_reports
  for each row execute function public.ops_project_no_show_report();

create function public.ops_project_payment() returns trigger
  language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if new.state is not distinct from old.state and
     new.payment_attention is not distinct from old.payment_attention then
    return new;
  end if;
  perform public.ops_sync_case('payment_unknown', new.order_id, new.user_id,
    md5(new.state || ':' || coalesce(new.payment_attention, '')),
    new.payment_required and
      (new.payment_attention is not null or new.state = 'canceling'), 'high');
  if new.payment_attention is not null and
     new.payment_attention is distinct from old.payment_attention then
    perform public.ops_emit_domain_event('payment_attention', 'ticket_order',
      new.order_id, new.user_id,
      'payment:' || new.order_id || ':' || new.payment_attention || ':' ||
      coalesce(new.provider_checked_at::text, new.created_at::text),
      jsonb_build_object('reason', new.payment_attention));
  elsif old.payment_attention is not null and new.payment_attention is null and
        new.state in ('confirmed', 'canceled') then
    perform public.ops_emit_domain_event('payment_reconciled', 'ticket_order',
      new.order_id, new.user_id, 'payment:' || new.order_id || ':' || new.state,
      jsonb_build_object('result', new.state));
  end if;
  return new;
end $$;
revoke all on function public.ops_project_payment() from public, anon, authenticated;
create trigger ops_project_payment
  after update of state, payment_attention on public.ticket_orders
  for each row execute function public.ops_project_payment();
