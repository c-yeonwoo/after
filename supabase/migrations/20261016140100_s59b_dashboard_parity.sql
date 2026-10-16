-- 운영 홈의 큐레이션 숫자는 실제 호감 풀과 동일한 자격/제외 조건을 사용한다.
create or replace function public.admin_dashboard()
  returns jsonb language plpgsql stable security definer
  set search_path = public, pg_temp as $$
declare v jsonb;
begin
  if not public.is_admin() then
    raise exception 'admin only' using errcode = '42501';
  end if;

  with pending_likes as (
    select a.to_id, a.from_id, a.created_at, f.id is not null as female_ready,
           m.id is not null as male_ready
      from public.affinities a
      left join public.eligible_profiles f on f.id = a.from_id and f.gender = 'female'
      left join public.eligible_profiles m on m.id = a.to_id and m.gender = 'male'
     where a.verdict = 'like'
       and not public.is_excluded(a.to_id, a.from_id)
       and not exists (select 1 from public.intro_queue q
                        where q.male_id = a.to_id and q.female_id = a.from_id)
       and not exists (select 1 from public.intros i
                        where i.male_id = a.to_id and i.female_id = a.from_id)
  )
  select jsonb_build_object(
    'payments_enabled', (select payments_enabled from public.app_settings where id),
    'members', jsonb_build_object(
      'female', (select count(*) from public.profiles where gender = 'female'
                  and account_state = 'active' and onboarding_step >= 7 and role <> 'admin'),
      'male', (select count(*) from public.profiles where gender = 'male'
                and account_state = 'active' and onboarding_step >= 7 and role <> 'admin'),
      'paused', (select count(*) from public.profiles where paused_at is not null
                  and account_state = 'active' and role <> 'admin'),
      'banned', (select count(*) from public.profiles where account_state = 'banned' and role <> 'admin')
    ),
    'flow', jsonb_build_object(
      'open_intros', (select count(*) from public.intros where closed_at is null),
      'active_meetings', (select count(*) from public.meetings
                           where cancelled_at is null and completed_at is null),
      'confirmed', (select count(*) from public.meetings
                      where confirmed_at is not null and cancelled_at is null and completed_at is null),
      'completed', (select count(*) from public.meetings where completed_at is not null),
      'queued_cards', (select count(*) from public.intro_queue where opened_at is null)
    ),
    'backlog', jsonb_build_object(
      'pending_reports', (select count(*) from public.content_reports where state = 'pending'),
      'pending_no_shows', (select count(*) from public.no_show_reports where state = 'pending'),
      'pending_photos', (select count(*) from public.profiles
                          where coalesce(cardinality(photo_paths), 0) > 0
                            and photo_state = 'pending' and role <> 'admin'),
      'pending_orders', (select count(*) from public.ticket_orders where state = 'pending'),
      'unmatched_likes', (select count(*) from pending_likes
                            where female_ready and male_ready),
      'blocked_likes', (select count(*) from pending_likes
                          where not female_ready or not male_ready),
      'starved_males', (select count(*) from public.eligible_profiles p
                          where p.gender = 'male'
                            and not exists (select 1 from public.intro_queue q
                                             where q.male_id = p.id and q.opened_at is null)),
      'oldest_like_hours', (select round(extract(epoch from (now() - min(created_at))) / 3600)
                              from pending_likes where female_ready and male_ready)
    ),
    'quality', jsonb_build_object(
      'intros_total', (select count(*) from public.intros),
      'intros_passed', (select count(*) from public.intros where outcome = 'passed'),
      'intros_used', (select count(*) from public.intros where outcome = 'ticket_used'),
      'cards_delivered', (select count(*) from public.intro_queue where delivered_at is not null),
      'cards_opened', (select count(*) from public.intro_queue where opened_at is not null),
      'cards_expired', (select count(*) from public.events where name = 'intro_queue_expired')
    )
  ) into v;
  return v;
end $$;
