-- Queue rows are deleted on expiry, so record the transition before the
-- original row disappears. A client fetch is not called an impression.
create function public.ops_project_intro_queue_event() returns trigger
  language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if tg_op = 'INSERT' then
    if new.delivered_at is not null then
      perform public.ops_emit_domain_event('intro_delivered', 'intro_queue',
        new.id::text, new.male_id, 'intro_queue:' || new.id || ':delivered',
        jsonb_build_object('hub_id', (select hub_id from public.profiles
                                     where id = new.male_id)));
    end if;
  else
    if old.delivered_at is null and new.delivered_at is not null then
      perform public.ops_emit_domain_event('intro_delivered', 'intro_queue',
        new.id::text, new.male_id, 'intro_queue:' || new.id || ':delivered',
        jsonb_build_object('hub_id', (select hub_id from public.profiles
                                     where id = new.male_id)));
    end if;
    if old.opened_at is null and new.opened_at is not null then
      perform public.ops_emit_domain_event('intro_opened', 'intro_queue',
        new.id::text, new.male_id, 'intro_queue:' || new.id || ':opened');
    end if;
  end if;
  return new;
end $$;
revoke all on function public.ops_project_intro_queue_event()
  from public, anon, authenticated;
create trigger ops_project_intro_queue_event
  after insert or update of delivered_at, opened_at on public.intro_queue
  for each row execute function public.ops_project_intro_queue_event();

create function public.ops_project_intro_queue_expiry() returns trigger
  language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if old.opened_at is null and old.delivered_at is not null and
     old.expires_at <= now() then
    perform public.ops_emit_domain_event('intro_expired', 'intro_queue',
      old.id::text, old.male_id, 'intro_queue:' || old.id || ':expired');
  end if;
  return old;
end $$;
revoke all on function public.ops_project_intro_queue_expiry()
  from public, anon, authenticated;
create trigger ops_project_intro_queue_expiry
  before delete on public.intro_queue
  for each row execute function public.ops_project_intro_queue_expiry();
