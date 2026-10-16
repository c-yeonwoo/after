-- One authoritative projection for push outcome; sent_at is legacy dispatch
-- completion and read_at is an independent in-app user action.
create function public.admin_notification_health() returns jsonb
  language plpgsql stable security definer set search_path = public, pg_temp as $$
declare v jsonb;
begin
  if not public.is_admin() then
    raise exception 'admin only' using errcode = '42501';
  end if;
  select jsonb_build_object(
    'as_of', now(),
    'pending', (select count(*) from public.notifications
                 where dispatch_state in ('pending','retry','running')),
    'failed', (select count(*) from public.notifications where dispatch_state = 'failed'),
    'unknown', (select count(*) from public.notifications where dispatch_state = 'unknown'),
    'unavailable_24h', (select count(*) from public.notifications
                         where dispatch_state = 'unavailable'
                           and sent_at >= now() - interval '24 hours'),
    'submitted_24h', (select count(distinct notification_id)
                       from public.notification_deliveries
                      where channel = 'push' and status = 'submitted'
                        and submitted_at >= now() - interval '24 hours'),
    'legacy_unverified', (select count(*) from public.notifications
                          where dispatch_state = 'legacy_unverified'),
    'in_app_available_24h', (select count(*) from public.notification_deliveries d
                             join public.notifications n on n.id = d.notification_id
                             where d.channel = 'in_app'
                               and n.created_at >= now() - interval '24 hours'),
    'in_app_read_24h', (select count(*) from public.notification_deliveries d
                        join public.notifications n on n.id = d.notification_id
                        where d.channel = 'in_app' and n.read_at is not null
                          and n.created_at >= now() - interval '24 hours'),
    'oldest_pending_minutes', (select round(extract(epoch from (now() - min(created_at))) / 60)
                                from public.notifications
                               where dispatch_state in ('pending','retry','running')),
    'failed_rows', coalesce((
      select jsonb_agg(to_jsonb(x) order by x.created_at) from (
        select n.id,n.user_id,p.name as user_name,n.kind::text as kind,
               n.attempts,n.last_error,n.created_at
          from public.notifications n left join public.profiles p on p.id = n.user_id
         where n.dispatch_state = 'failed'
         order by n.created_at limit 30
      ) x
    ), '[]'::jsonb),
    'unknown_rows', coalesce((
      select jsonb_agg(to_jsonb(x) order by x.created_at) from (
        select n.id,n.user_id,p.name as user_name,n.kind::text as kind,
               n.attempts,n.last_error,n.created_at
          from public.notifications n left join public.profiles p on p.id = n.user_id
         where n.dispatch_state = 'unknown'
         order by n.created_at limit 30
      ) x
    ), '[]'::jsonb)
  ) into v;
  return v;
end $$;
revoke all on function public.admin_notification_health() from public, anon;
grant execute on function public.admin_notification_health() to authenticated;
