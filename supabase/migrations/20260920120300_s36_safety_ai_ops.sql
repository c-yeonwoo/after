-- S36 — 노쇼 사람 검토 + AI/운영 품질 계측.
--
-- 영구 제명은 되돌리기 어려운 조치다. 기존 흐름은 피신고자가 24시간 동안
-- 답하지 않았다는 이유만으로 신고를 사실로 확정했다. 알림 누락·질병·접속 장애도
-- 모두 영구 제명으로 이어질 수 있으므로, 이제 응답과 무응답은 전부 운영자의
-- 판정 자료가 된다. 24시간은 자동 처벌 시점이 아니라 운영 검토 SLA다.

alter table no_show_reports
  add column accused_admitted boolean,
  add column responded_at timestamptz,
  add column review_requested_at timestamptz,
  add column resolution_note text;

comment on column no_show_reports.accused_admitted is
  '피신고자 응답. true=인정, false=부인, null=미응답. 어느 값도 자동 제재하지 않는다.';
comment on column no_show_reports.review_requested_at is
  '운영자 검토 큐에 들어간 시각. 응답 즉시 또는 24시간 무응답 때 기록한다.';
comment on column no_show_reports.resolution_note is
  '운영자 최종 판정 사유. 영구 이용 제한에는 사람의 근거가 반드시 남는다.';

create index no_show_reports_review_queue
  on no_show_reports (review_requested_at nulls last, confirm_by)
  where state = 'pending';

-- 인정·부인 모두 운영자 검토로 보낸다. 사용자가 실수로 누른 한 번의 탭도 바로
-- 영구 제명이 되지 않는다.
create or replace function respond_no_show(p_report_id uuid, p_admit boolean)
  returns no_show_reports
  language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_uid    uuid := auth.uid();
  v_report no_show_reports;
begin
  select * into v_report from no_show_reports
   where id = p_report_id
     and accused_id = v_uid
     and state = 'pending'
     and responded_at is null
   for update;
  if not found then
    raise exception 'report not pending for caller' using errcode = '42501';
  end if;

  update no_show_reports
     set accused_admitted = p_admit,
         responded_at = now(),
         review_requested_at = coalesce(review_requested_at, now())
   where id = p_report_id
  returning * into v_report;

  insert into events (user_id, name, props)
  values (v_uid, 'no_show_response_recorded',
          jsonb_build_object('report_id', p_report_id, 'admitted', p_admit));

  return v_report;
end $$;

revoke all on function respond_no_show(uuid, boolean) from public, anon;
grant execute on function respond_no_show(uuid, boolean) to authenticated;

-- 기한 만료는 제명이 아니라 검토 큐 승격이다. 이미 승격한 행은 다시 세지 않는다.
create or replace function expire_unanswered_no_show_reports() returns integer
  language plpgsql security definer set search_path = public, pg_temp as $$
declare v_count integer;
begin
  with escalated as (
    update no_show_reports
       set review_requested_at = now()
     where state = 'pending'
       and responded_at is null
       and review_requested_at is null
       and confirm_by < now()
    returning id, accused_id
  ), logged as (
    insert into events (user_id, name, props)
    select accused_id, 'no_show_review_requested', jsonb_build_object('report_id', id)
      from escalated
    returning 1
  )
  select count(*) into v_count from logged;

  return v_count;
end $$;

revoke all on function expire_unanswered_no_show_reports() from public, anon, authenticated;
grant execute on function expire_unanswered_no_show_reports() to service_role;

-- 확정 제재에는 원인을 명시한다. 이후 번복할 때 다른 이유의 정지를 잘못 풀지
-- 않도록 null 상태에 의존하지 않는다.
create or replace function apply_no_show_confirmed(p_report_id uuid) returns no_show_reports
  language plpgsql security definer set search_path = public, pg_temp as $$
declare v_report no_show_reports;
begin
  update no_show_reports set state = 'confirmed', resolved_at = now()
   where id = p_report_id and state = 'pending'
  returning * into v_report;
  if not found then
    raise exception 'report not pending' using errcode = 'P0002';
  end if;

  update profiles
     set account_state = 'banned',
         banned_reason = '노쇼 확인: ' || v_report.id::text
   where id = v_report.accused_id;

  insert into tickets (user_id, payment_id, price_krw, state, kind)
  values (v_report.reporter_id, 'noshow_reissue:' || v_report.id, 0, 'unused', 'meeting');

  insert into events (user_id, name, props)
  values (v_report.reporter_id, 'no_show_confirmed',
          jsonb_build_object('report_id', p_report_id, 'accused_id', v_report.accused_id));

  return v_report;
end $$;

revoke all on function apply_no_show_confirmed(uuid) from public, anon, authenticated;

-- 반환 열이 늘었으므로 기존 함수를 내리고 같은 이름으로 다시 만든다.
drop function admin_no_show_reports(report_state);

create function admin_no_show_reports(p_state report_state default null)
  returns table (
    id                  uuid,
    state               report_state,
    created_at          timestamptz,
    confirm_by          timestamptz,
    responded_at        timestamptz,
    review_requested_at timestamptz,
    accused_admitted    boolean,
    resolved_at         timestamptz,
    resolution_note     text,
    reporter_id         uuid,
    reporter_name       text,
    accused_id          uuid,
    accused_name        text,
    accused_state       account_state,
    meeting_id          uuid,
    scheduled_at        timestamptz,
    place_name          text,
    reporter_note       text,
    accused_note        text,
    compensated         boolean
  )
  language plpgsql stable security definer set search_path = public, pg_temp as $$
begin
  if not is_admin() then
    raise exception 'admin only' using errcode = '42501';
  end if;

  return query
  select r.id, r.state, r.created_at, r.confirm_by,
         r.responded_at, r.review_requested_at, r.accused_admitted,
         r.resolved_at, r.resolution_note,
         r.reporter_id, rp.name,
         r.accused_id, ap.name, ap.account_state,
         r.meeting_id, m.scheduled_at, m.place_name,
         (select f.body from feedbacks f
           where f.meeting_id = r.meeting_id and f.author_id = r.reporter_id
           order by f.created_at desc limit 1),
         (select f.body from feedbacks f
           where f.meeting_id = r.meeting_id and f.author_id = r.accused_id
           order by f.created_at desc limit 1),
         exists (select 1 from tickets t
                  where t.payment_id = 'noshow_reissue:' || r.id::text)
    from no_show_reports r
    join profiles rp on rp.id = r.reporter_id
    join profiles ap on ap.id = r.accused_id
    join meetings m  on m.id  = r.meeting_id
   where p_state is null or r.state = p_state
   order by (r.state = 'pending') desc,
            r.review_requested_at nulls last,
            r.confirm_by;
end $$;

comment on function admin_no_show_reports(report_state) is
  '노쇼 신고와 피신고자 응답·양쪽 후기를 함께 내는 사람 검토 큐.';

revoke all on function admin_no_show_reports(report_state) from public, anon;
grant execute on function admin_no_show_reports(report_state) to authenticated;

create or replace function admin_resolve_no_show(
  p_report_id uuid,
  p_upheld    boolean,
  p_note      text
) returns no_show_reports
  language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_uid    uuid := auth.uid();
  v_report no_show_reports;
begin
  if not is_admin() then
    raise exception 'admin only' using errcode = '42501';
  end if;
  if length(btrim(coalesce(p_note, ''))) = 0 then
    raise exception 'note required' using errcode = '22023';
  end if;

  select * into v_report from no_show_reports where id = p_report_id for update;
  if not found then
    raise exception 'report not found' using errcode = 'P0002';
  end if;

  if p_upheld then
    if v_report.state <> 'pending' then
      raise exception 'only pending reports can be upheld' using errcode = 'PT409';
    end if;
    v_report := apply_no_show_confirmed(p_report_id);
    update no_show_reports set resolution_note = btrim(p_note)
     where id = p_report_id returning * into v_report;
  else
    if v_report.state = 'dismissed' then
      raise exception 'already dismissed' using errcode = 'PT409';
    end if;

    update no_show_reports
       set state = 'dismissed', resolved_at = now(), resolution_note = btrim(p_note)
     where id = p_report_id
    returning * into v_report;

    update profiles set account_state = 'active', banned_reason = null
     where id = v_report.accused_id
       and account_state = 'banned'
       and (banned_reason is null or banned_reason = '노쇼 확인: ' || p_report_id::text);

    if found then
      insert into admin_actions (actor_id, kind, target_user, target_ref, note)
      values (v_uid, 'unban', v_report.accused_id, p_report_id,
              '노쇼 판정 번복 — ' || btrim(p_note));
    end if;
  end if;

  insert into admin_actions (actor_id, kind, target_user, target_ref, note)
  values (v_uid, 'resolve_no_show', v_report.accused_id, p_report_id,
          (case when p_upheld then '인정 — ' else '기각 — ' end) || btrim(p_note));

  return v_report;
end $$;

revoke all on function admin_resolve_no_show(uuid, boolean, text) from public, anon;
grant execute on function admin_resolve_no_show(uuid, boolean, text) to authenticated;

-- 모델에는 원문을 저장하지 않는다. 버전·성공 여부·지연·토큰만 남겨 품질과
-- 비용을 관리한다. 클라이언트는 이 표를 읽거나 쓸 수 없다.
create table ai_runs (
  id             bigint generated always as identity primary key,
  user_id        uuid references profiles(id) on delete set null,
  feature        text not null check (feature in ('profile_copy', 'pair_brief')),
  prompt_version text not null check (char_length(prompt_version) between 1 and 60),
  model          text not null check (char_length(model) between 1 and 80),
  status         text not null check (status in ('success', 'refused', 'invalid', 'error')),
  latency_ms     integer check (latency_ms is null or latency_ms >= 0),
  input_tokens   integer check (input_tokens is null or input_tokens >= 0),
  output_tokens  integer check (output_tokens is null or output_tokens >= 0),
  created_at     timestamptz not null default now()
);

create index ai_runs_user_quota on ai_runs (user_id, feature, created_at desc);
create index ai_runs_feature_time on ai_runs (feature, created_at desc);

alter table ai_runs enable row level security;
revoke all on ai_runs from public, anon, authenticated;
grant select, insert on ai_runs to service_role;

comment on table ai_runs is
  '원문·생성문 없이 AI 기능의 버전, 성공률, 지연, 토큰만 남기는 운영 계측.';

-- 숫자만 있고 갈 곳이 없는 대시보드가 되지 않도록, 안전·일정·알림·AI의
-- 즉시 조치가 필요한 항목을 한 RPC로 모은다.
create function admin_operational_health() returns jsonb
  language plpgsql stable security definer set search_path = public, pg_temp as $$
declare v jsonb;
begin
  if not is_admin() then
    raise exception 'admin only' using errcode = '42501';
  end if;

  select jsonb_build_object(
    'no_show', jsonb_build_object(
      'pending', (select count(*) from no_show_reports where state = 'pending'),
      'overdue', (select count(*) from no_show_reports
                   where state = 'pending' and confirm_by < now()),
      'oldest_hours', (select round(extract(epoch from (now() - min(created_at))) / 3600)
                         from no_show_reports where state = 'pending')
    ),
    'scheduling', jsonb_build_object(
      'awaiting_confirmation', (select count(*) from meetings
                                 where prefs_submitted_at is not null
                                   and confirmed_at is null
                                   and cancelled_at is null),
      'stale_confirmation', (select count(*) from meetings
                              where prefs_submitted_at < now() - interval '48 hours'
                                and confirmed_at is null
                                and cancelled_at is null)
    ),
    'notifications', jsonb_build_object(
      'pending', (select count(*) from notifications
                   where sent_at is null and attempts < 5),
      'failed', (select count(*) from notifications
                  where sent_at is null and attempts >= 5),
      'oldest_pending_minutes', (select round(extract(epoch from (now() - min(created_at))) / 60)
                                   from notifications
                                  where sent_at is null and attempts < 5)
    ),
    'ai', jsonb_build_object(
      'runs_24h', (select count(*) from ai_runs
                    where created_at >= now() - interval '24 hours'),
      'failures_24h', (select count(*) from ai_runs
                        where created_at >= now() - interval '24 hours'
                          and status <> 'success'),
      'profile_runs_24h', (select count(*) from ai_runs
                            where created_at >= now() - interval '24 hours'
                              and feature = 'profile_copy'),
      'brief_runs_24h', (select count(*) from ai_runs
                          where created_at >= now() - interval '24 hours'
                            and feature = 'pair_brief'),
      'p95_latency_ms', (select round(percentile_cont(0.95) within group (order by latency_ms))
                          from ai_runs
                         where created_at >= now() - interval '24 hours'
                           and latency_ms is not null)
    )
  ) into v;

  return v;
end $$;

revoke all on function admin_operational_health() from public, anon;
grant execute on function admin_operational_health() to authenticated;

