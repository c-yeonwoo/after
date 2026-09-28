-- S39 — 1인 운영자를 위한 시스템 운영 콘솔
--
-- 대시보드에 실패 개수만 보이던 알림과 AI를 실제로 조치·진단할 수 있게 한다.
-- 원문이나 프로필 비공개 데이터는 노출하지 않고, 알림 재시도는 사유를 남긴다.

alter table admin_actions drop constraint if exists admin_actions_kind_check;
alter table admin_actions add constraint admin_actions_kind_check check (
  kind in ('resolve_report', 'ban', 'unban', 'refund', 'cancel_meeting',
           'review_photo', 'set_queue', 'resolve_no_show', 'set_payments',
           'fulfill_order', 'reset_photo', 'retry_notification')
);

create function admin_system_overview() returns jsonb
  language plpgsql stable security definer set search_path = public, pg_temp as $$
declare v jsonb;
begin
  if not is_admin() then
    raise exception 'admin only' using errcode = '42501';
  end if;

  select jsonb_build_object(
    'notifications', jsonb_build_object(
      'pending', (select count(*) from notifications
                   where sent_at is null and attempts < 5),
      'failed', (select count(*) from notifications
                  where sent_at is null and attempts >= 5),
      'oldest_pending_minutes', (
        select round(extract(epoch from (now() - min(created_at))) / 60)
          from notifications where sent_at is null and attempts < 5
      ),
      'failed_rows', coalesce((
        select jsonb_agg(to_jsonb(x) order by x.created_at)
          from (
            select n.id, n.user_id, p.name as user_name,
                   p.notification_email, n.kind::text as kind,
                   n.attempts, left(n.last_error, 500) as last_error, n.created_at
              from notifications n
              join profiles p on p.id = n.user_id
             where n.sent_at is null and n.attempts >= 5
             order by n.created_at
             limit 30
          ) x
      ), '[]'::jsonb)
    ),
    'jobs', coalesce((
      with important(jobname, sort_order) as (values
        ('drain_notification_outbox_5m', 1),
        ('expire_unanswered_meetings_15m', 2),
        ('expire_unanswered_no_show_reports_15m', 3),
        ('expire_intro_queue_15m', 4),
        ('enqueue_feedback_due_hourly', 5)
      )
      select jsonb_agg(jsonb_build_object(
        'jobname', i.jobname,
        'schedule', j.schedule,
        'active', coalesce(j.active, false),
        'last_status', r.status,
        'last_started_at', r.start_time,
        'last_finished_at', r.end_time,
        'last_message', left(r.return_message, 500)
      ) order by i.sort_order)
        from important i
        left join cron.job j on j.jobname = i.jobname
        left join lateral (
          select d.status, d.start_time, d.end_time, d.return_message
            from cron.job_run_details d
           where d.jobid = j.jobid
           order by d.runid desc
           limit 1
        ) r on true
    ), '[]'::jsonb),
    'ai', coalesce((
      select jsonb_agg(to_jsonb(x) order by x.created_at desc)
        from (
          select a.id, a.user_id, p.name as user_name, a.feature,
                 a.prompt_version, a.model, a.status, a.latency_ms,
                 a.input_tokens, a.output_tokens, a.created_at
            from ai_runs a
            left join profiles p on p.id = a.user_id
           order by a.created_at desc
           limit 20
        ) x
    ), '[]'::jsonb),
    'activity', coalesce((
      select jsonb_agg(to_jsonb(x) order by x.created_at desc)
        from (
          select a.id, a.kind, a.target_user, a.target_ref, a.note, a.created_at,
                 actor.name as actor_name, target.name as target_name
            from admin_actions a
            left join profiles actor on actor.id = a.actor_id
            left join profiles target on target.id = a.target_user
           order by a.created_at desc
           limit 40
        ) x
    ), '[]'::jsonb)
  ) into v;

  return v;
end $$;

comment on function admin_system_overview() is
  '실패 알림, 핵심 cron, AI 계측, 최근 운영자 조작을 한 화면에 모은 운영자 전용 조회.';

revoke all on function admin_system_overview() from public, anon;
grant execute on function admin_system_overview() to authenticated;

create function admin_retry_notifications(p_ids uuid[], p_note text) returns integer
  language plpgsql security definer set search_path = public, pg_temp as $$
declare v_count integer;
begin
  if not is_admin() then
    raise exception 'admin only' using errcode = '42501';
  end if;
  if coalesce(cardinality(p_ids), 0) = 0 then
    raise exception 'notification ids required' using errcode = '22023';
  end if;
  if length(btrim(coalesce(p_note, ''))) = 0 then
    raise exception 'note required' using errcode = '22023';
  end if;

  with retried as (
    update notifications n
       set attempts = 0, last_error = null
     where n.id = any(p_ids)
       and n.sent_at is null
       and n.attempts >= 5
    returning n.id, n.user_id
  ), logged as (
    insert into admin_actions (actor_id, kind, target_user, target_ref, note)
    select auth.uid(), 'retry_notification', r.user_id, r.id, btrim(p_note)
      from retried r
    returning 1
  )
  select count(*) into v_count from logged;

  return v_count;
end $$;

comment on function admin_retry_notifications(uuid[], text) is
  '최종 실패한 알림을 아웃박스 재시도 대상으로 되돌리고 건별 감사 기록을 남긴다.';

revoke all on function admin_retry_notifications(uuid[], text) from public, anon;
grant execute on function admin_retry_notifications(uuid[], text) to authenticated;
