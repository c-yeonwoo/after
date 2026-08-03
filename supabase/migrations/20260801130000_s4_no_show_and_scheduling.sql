-- S4 — 노쇼 확인·제명 전이(P4) + 스케줄 잡(pg_cron)
--
-- PRD §미해결이었던 두 가지를 채운다:
--   1) no_show_reports 는 테이블만 있고 신고→확인→제명 전이 로직이 없었다.
--   2) expire_unanswered_meetings() 는 P3(24h 무응답 환불) 로직 자체는 있었지만
--      아무도 주기적으로 호출하지 않았다 — 함수가 옳아도 부르는 사람이 없으면
--      죽은 코드다(버그 3·4·5·7과 같은 계열).
--
-- 판정 절차(D13·P4, 사용자 확정): 신고 접수 → 상대에게 확인 요청(24시간) →
-- 상대가 인정하거나 무응답이면 확정(피해자 티켓 재발급 + 노쇼자 영구제명).
-- 상대가 다투면(= 응답으로 부인) 기각한다. 단일 미검증 신고로 즉시 제명하지
-- 않는다는 원칙을 지키기 위해, "확정"은 반드시 상대의 인정 또는 무응답을
-- 거쳐야만 일어난다 — 신고 그 자체로는 아무 효과가 없다.

create extension if not exists pg_cron with schema extensions;

-- ─────────────── 신고 접수 ───────────────
-- 피고발자는 서버가 meeting 참가자 관계에서 유도한다(클라이언트가 상대를
-- 직접 지정하지 않는다). 신고 사유는 feedbacks.body(같은 meeting_id)에 이미
-- 자유 텍스트로 남길 수 있으므로 별도 컬럼을 두지 않는다.
create or replace function report_no_show(p_meeting_id uuid) returns no_show_reports
  language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_uid     uuid := auth.uid();
  v_male    uuid;
  v_female  uuid;
  v_accused uuid;
  v_meeting meetings;
  v_report  no_show_reports;
begin
  if v_uid is null then
    raise exception 'unauthenticated' using errcode = '28000';
  end if;

  select i.male_id, i.female_id into v_male, v_female
    from meetings m join intros i on i.id = m.intro_id
   where m.id = p_meeting_id;
  if not found then
    raise exception 'meeting not found' using errcode = '42501';
  end if;
  if v_uid <> v_male and v_uid <> v_female then
    raise exception 'not a participant' using errcode = '42501';
  end if;

  select * into v_meeting from meetings where id = p_meeting_id;
  if v_meeting.confirmed_at is null then
    raise exception 'meeting was never confirmed' using errcode = '42501';
  end if;

  v_accused := case when v_uid = v_male then v_female else v_male end;

  insert into no_show_reports (meeting_id, reporter_id, accused_id, confirm_by)
  values (p_meeting_id, v_uid, v_accused, now() + interval '24 hours')
  returning * into v_report;

  insert into events (user_id, name, props)
  values (v_uid, 'no_show_reported',
          jsonb_build_object('meeting_id', p_meeting_id, 'report_id', v_report.id));

  return v_report;
end $$;

-- ─────────────── 제명 확정 처리 (공통) ───────────────
-- respond_no_show(인정)와 스케줄 스윕(무응답 만료) 양쪽에서 부른다.
-- 클라이언트에 직접 노출하지 않는다 — 신고 하나만으로 이 경로에 닿을 방법이
-- 없어야 "단일 미검증 신고로 즉시 제명하지 않는다"는 원칙이 지켜진다.
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

  update profiles set account_state = 'banned' where id = v_report.accused_id;

  -- 피해자(신고자) 티켓 재발급. 실제 결제가 아니므로 price_krw = 0.
  insert into tickets (user_id, payment_id, price_krw, state)
  values (v_report.reporter_id, 'noshow_reissue:' || v_report.id, 0, 'unused');

  insert into events (user_id, name, props)
  values (v_report.reporter_id, 'no_show_confirmed',
          jsonb_build_object('report_id', p_report_id, 'accused_id', v_report.accused_id));

  return v_report;
end $$;

-- ─────────────── 상대 응답 ───────────────
-- p_admit = true  → 인정 → 즉시 확정(제명 + 재발급)
-- p_admit = false → 부인 → 기각(dismissed). 판정은 여기서 끝난다 — 재신고를
--                   막지는 않지만(unique 제약이 reporter_id 단위라 재신고 자체는
--                   불가), 별도 이의제기 절차는 이번 범위 밖이다.
create or replace function respond_no_show(p_report_id uuid, p_admit boolean)
  returns no_show_reports
  language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_uid    uuid := auth.uid();
  v_report no_show_reports;
begin
  select * into v_report from no_show_reports
   where id = p_report_id and accused_id = v_uid and state = 'pending'
   for update;
  if not found then
    raise exception 'report not pending for caller' using errcode = '42501';
  end if;

  if p_admit then
    return apply_no_show_confirmed(p_report_id);
  end if;

  update no_show_reports set state = 'dismissed', resolved_at = now()
   where id = p_report_id
  returning * into v_report;

  insert into events (user_id, name, props)
  values (v_uid, 'no_show_dismissed', jsonb_build_object('report_id', p_report_id));

  return v_report;
end $$;

-- ─────────────── P4 스윕: 확인 기한 만료 → 자동 확정 ───────────────
create or replace function expire_unanswered_no_show_reports() returns integer
  language plpgsql security definer set search_path = public, pg_temp as $$
declare v_count integer := 0; r record;
begin
  for r in select id from no_show_reports where state = 'pending' and confirm_by < now()
  loop
    perform apply_no_show_confirmed(r.id);
    v_count := v_count + 1;
  end loop;
  return v_count;
end $$;

-- ─────────────────────────── 권한 ───────────────────────────
-- 새로 만든 함수는 기본적으로 PUBLIC에 EXECUTE가 열려 있다(테이블과 달리
-- 함수는 생성 시 PUBLIC GRANT가 기본값) — 명시적으로 걷어내지 않으면
-- s1_functions.sql의 "revoke ... from public"이 이후 마이그레이션에는
-- 적용되지 않는다는 뜻이다. 여기서 새 함수 4개에 대해 같은 걷어내기를 반복한다.
revoke execute on function report_no_show(uuid)                    from public, anon, authenticated;
revoke execute on function apply_no_show_confirmed(uuid)           from public, anon, authenticated;
revoke execute on function respond_no_show(uuid, boolean)          from public, anon, authenticated;
revoke execute on function expire_unanswered_no_show_reports()     from public, anon, authenticated;

grant execute on function report_no_show(uuid)                     to authenticated;
grant execute on function respond_no_show(uuid, boolean)           to authenticated;
grant execute on function expire_unanswered_no_show_reports()      to service_role;
-- apply_no_show_confirmed 는 어떤 롤에도 재부여하지 않는다. respond_no_show()·
-- expire_unanswered_no_show_reports() 안에서만 불리며, 둘 다 postgres 소유
-- SECURITY DEFINER라 서로 호출하는 데 별도 EXECUTE 권한이 필요 없다.

-- expire_unanswered_meetings() 는 S1에서 이미 만들었지만 지금까지 아무도
-- 주기적으로 부르지 않았다. service_role 실행 권한은 이미 있다.

-- ─────────────────────── pg_cron 스케줄 ───────────────────────
-- 로컬 개발 단계 기준 15분 간격. 실제 배포(Cloudflare 등 별도 인프라)로
-- 옮길 때는 이 두 잡을 그쪽 스케줄러로 이관하고 여기서는 unschedule 한다 —
-- 지금은 pg_cron이 유일하게 바로 검증 가능한 스케줄러라 이걸 쓴다.
select cron.schedule(
  'expire_unanswered_meetings_15m',
  '*/15 * * * *',
  $$ select expire_unanswered_meetings(); $$
);

select cron.schedule(
  'expire_unanswered_no_show_reports_15m',
  '*/15 * * * *',
  $$ select expire_unanswered_no_show_reports(); $$
);
