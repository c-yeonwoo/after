-- Observability is metadata only: operators do not receive private counseling,
-- memories, draft payloads, partner profiles, or prompt text.
create function public.admin_assistant_health() returns jsonb
language plpgsql stable security definer set search_path=public,pg_temp as $$
begin
  if not is_admin() or not admin_sensitive_auth_ok() then raise exception 'admin authentication required' using errcode='42501'; end if;
  return jsonb_build_object(
    'asOf',now(),
    'flags',(select jsonb_build_object('chat',assistant_chat_enabled,'memory',assistant_memory_enabled,'schedule',assistant_schedule_enabled) from app_settings where id),
    'turnsPending',(select count(*) from assistant_turns where state='pending' and created_at>=now()-interval '2 minutes'),
    'turnsStalled',(select count(*) from assistant_turns where state='pending' and created_at<now()-interval '2 minutes' and expires_at>now()),
    'actionsAwaiting',(select count(*) from assistant_actions where state='awaiting_approval' and expires_at>now()),
    'actionsExpired',(select count(*) from assistant_actions where state='awaiting_approval' and expires_at<=now() and created_at>now()-interval '24 hours'),
    'actionsSucceeded',(select count(*) from assistant_actions where state='succeeded' and executed_at>now()-interval '24 hours'),
    'runs24h',coalesce((select jsonb_agg(to_jsonb(q)) from (
      select feature,status,count(*) as count,sum(input_tokens) as input_tokens,sum(output_tokens) as output_tokens
      from ai_runs where feature in ('assistant_chat','conversation_prep') and created_at>now()-interval '24 hours'
      group by feature,status) q),'[]'::jsonb),
    'cleanup',coalesce((select jsonb_agg(jsonb_build_object('name',j.jobname,'active',j.active,'lastStatus',r.status,'lastFinished',r.end_time))
      from cron.job j left join lateral (select status,end_time from cron.job_run_details where jobid=j.jobid order by start_time desc limit 1) r on true
      where j.jobname in ('expire-private-assistant','expire-assistant-actions')),'[]'::jsonb));
end $$;
revoke all on function public.admin_assistant_health() from public,anon;
grant execute on function public.admin_assistant_health() to authenticated;
notify pgrst, 'reload schema';
