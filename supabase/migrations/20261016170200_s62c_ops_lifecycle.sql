-- A completed charge/refund must not retain an unresolved attention flag.
create function public.ops_clear_settled_payment_attention() returns trigger
  language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if new.state in ('confirmed', 'canceled') and new.state is distinct from old.state then
    new.payment_attention := null;
  end if;
  return new;
end $$;
revoke all on function public.ops_clear_settled_payment_attention()
  from public, anon, authenticated;
create trigger ops_clear_settled_payment_attention
  before update of state on public.ticket_orders
  for each row execute function public.ops_clear_settled_payment_attention();

-- Deleted source rows cannot leave a permanent active task behind.
create function public.ops_project_source_delete() returns trigger
  language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_type text;
  v_source text;
begin
  case tg_table_name
    when 'support_requests' then v_type := 'support'; v_source := old.id::text;
    when 'content_reports' then v_type := 'content_report'; v_source := old.id::text;
    when 'no_show_reports' then v_type := 'no_show_report'; v_source := old.id::text;
    when 'ticket_orders' then v_type := 'payment_unknown'; v_source := old.order_id;
    when 'profiles' then v_type := 'photo_review'; v_source := old.id::text;
    else raise exception 'unsupported ops source table' using errcode = '22023';
  end case;
  perform public.ops_sync_case(v_type, v_source, null, 'deleted', false, 'normal');
  return old;
end $$;
revoke all on function public.ops_project_source_delete() from public, anon, authenticated;
create trigger ops_delete_support after delete on public.support_requests
  for each row execute function public.ops_project_source_delete();
create trigger ops_delete_content_report after delete on public.content_reports
  for each row execute function public.ops_project_source_delete();
create trigger ops_delete_no_show_report after delete on public.no_show_reports
  for each row execute function public.ops_project_source_delete();
create trigger ops_delete_payment after delete on public.ticket_orders
  for each row execute function public.ops_project_source_delete();
create trigger ops_delete_photo after delete on public.profiles
  for each row execute function public.ops_project_source_delete();

-- These records are operational projections, not legal evidence. A withdrawn
-- member must not remain identifiable in them. Money/report source tables
-- continue to follow their existing separately reviewed retention rules.
create function public.ops_purge_withdrawn_member() returns trigger
  language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_case public.ops_cases;
begin
  if old.account_state is distinct from 'withdrawn' and
     new.account_state = 'withdrawn' then
    delete from public.domain_events where subject_id = new.id;
    for v_case in select * from public.ops_cases
      where subject_id = new.id and case_type in ('support','photo_review')
      for update loop
      -- These are not transaction/safety evidence. Break their source link
      -- and redact operator notes while retaining aggregate task timing.
      update public.ops_case_events set note = null where case_id = v_case.id;
      update public.ops_cases
         set source_id = 'erased:' || gen_random_uuid()::text,
             subject_id = null, source_revision = 'erased',
             status = 'superseded', resolved_at = coalesce(resolved_at, now()),
             resolution_code = 'member_withdrawn', version = version + 1
       where id = v_case.id;
      if v_case.status not in ('resolved','superseded') then
        insert into public.ops_case_events
          (case_id, event_type, actor_type, from_status, to_status, reason_code)
        values (v_case.id, 'superseded', 'system', v_case.status,
                'superseded', 'member_withdrawn');
      end if;
    end loop;
    update public.ops_cases set subject_id = null
     where subject_id = new.id;
  end if;
  return new;
end $$;
revoke all on function public.ops_purge_withdrawn_member() from public, anon, authenticated;
create trigger ops_purge_withdrawn_member
  after update of account_state on public.profiles
  for each row execute function public.ops_purge_withdrawn_member();

create function public.ops_project_meeting_event() returns trigger
  language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_male uuid;
  v_female uuid;
begin
  if old.confirmed_at is null and new.confirmed_at is not null then
    select male_id, female_id into v_male, v_female from public.intros where id = new.intro_id;
    perform public.ops_emit_domain_event('meeting_confirmed', 'meeting', new.id::text,
      v_male, 'meeting:' || new.id || ':confirmed',
      jsonb_build_object('hub_id', (select hub_id from public.profiles where id = v_male)));
    perform public.ops_emit_domain_event('meeting_confirmed', 'meeting', new.id::text,
      v_female, 'meeting:' || new.id || ':confirmed:female');
  elsif old.cancelled_at is null and new.cancelled_at is not null then
    select male_id, female_id into v_male, v_female from public.intros where id = new.intro_id;
    perform public.ops_emit_domain_event('meeting_canceled', 'meeting', new.id::text,
      v_male, 'meeting:' || new.id || ':canceled');
    perform public.ops_emit_domain_event('meeting_canceled', 'meeting', new.id::text,
      v_female, 'meeting:' || new.id || ':canceled:female');
  end if;
  return new;
end $$;
revoke all on function public.ops_project_meeting_event() from public, anon, authenticated;
create trigger ops_project_meeting_event
  after update of confirmed_at, cancelled_at on public.meetings
  for each row execute function public.ops_project_meeting_event();

create function public.ops_project_ticket_event() returns trigger
  language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if tg_op = 'INSERT' then
    perform public.ops_emit_domain_event('ticket_issued', 'ticket', new.id::text,
      new.user_id, 'ticket:' || new.id || ':issued',
      jsonb_build_object('kind', new.kind::text, 'price_krw', new.price_krw));
  elsif old.state = 'unused' and new.state = 'used' then
    perform public.ops_emit_domain_event('ticket_consumed', 'ticket', new.id::text,
      new.user_id, 'ticket:' || new.id || ':used');
  end if;
  if tg_op = 'INSERT' and new.restored_from_ticket_id is not null then
    perform public.ops_emit_domain_event('ticket_restored', 'ticket', new.id::text,
      new.user_id, 'ticket:' || new.id || ':restored',
      jsonb_build_object('source_ticket_id', new.restored_from_ticket_id));
  end if;
  return new;
end $$;
revoke all on function public.ops_project_ticket_event() from public, anon, authenticated;
create trigger ops_project_ticket_event
  after insert or update of state on public.tickets
  for each row execute function public.ops_project_ticket_event();
