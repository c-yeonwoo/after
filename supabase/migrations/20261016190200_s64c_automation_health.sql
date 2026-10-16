-- Include the rule wake-up in the existing system view. Cron success is not
-- evidence that a reminder was delivered; the run and delivery ledgers remain separate.
create or replace function public.admin_system_overview() returns jsonb
  language plpgsql stable security definer set search_path = public, pg_temp as $$
declare v jsonb; v_job jsonb; v_mode text; v_paused boolean;
begin
  if not public.is_admin() then raise exception 'admin only' using errcode = '42501'; end if;
  v := jsonb_set(public.admin_system_overview_legacy(),
                 '{notifications}',public.admin_notification_health());
  select mode, paused_reason is not null into v_mode, v_paused from public.automation_rules
   where rule_key='meeting_request_reminder';
  select jsonb_build_object(
    'jobname','automation_reminder_tick', 'schedule',j.schedule,
    'active',coalesce(j.active,false), 'rule_mode',v_mode, 'rule_paused',v_paused,
    'last_status',r.status, 'last_started_at',r.start_time,
    'last_finished_at',r.end_time, 'last_message',left(r.return_message,500))
    into v_job
    from (select 1) seed
    left join cron.job j on j.jobname='automation_reminder_tick'
    left join lateral (
      select d.status,d.start_time,d.end_time,d.return_message
        from cron.job_run_details d where d.jobid=j.jobid
       order by d.start_time desc limit 1
    ) r on true;
  return jsonb_set(v,'{jobs}',coalesce(v->'jobs','[]'::jsonb) || jsonb_build_array(v_job));
end $$;
