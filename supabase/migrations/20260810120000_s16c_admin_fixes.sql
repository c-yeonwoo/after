-- S16c — 운영 화면 QA 에서 나온 세 가지를 고친다.
--
-- 1) 회원 수에 운영자가 섞였다.
-- 2) 처리 사유를 필수로 받아두고 화면에 돌려주지 않았다.
-- 3) 경합으로 막힌 재처리가 HTTP 500 으로 나갔다.

-- ─────────────────── 1. 회원 수에서 운영자 제외 ───────────────────

/*
  운영자는 회원이 아니다.

  시드는 운영자 프로필에 onboarding_step = 7 을 넣는다(GoTrue 가 온보딩 미완료
  계정을 다루는 경로를 타지 않게). 그래서 여기 필터에 그대로 걸려 규모 지표가
  운영자 수만큼 부풀었다. 배포마다 운영자는 최소 한 명이라 **항상** 틀린다.

  paused·banned 도 같이 제외한다. 네 숫자가 같은 모집단을 세지 않으면
  "활성 - 쉬는 중" 같은 뺄셈이 조용히 어긋난다.
*/
create or replace function admin_dashboard() returns jsonb
  language plpgsql stable security definer set search_path = public, pg_temp as $$
declare v jsonb;
begin
  if not is_admin() then
    raise exception 'admin only' using errcode = '42501';
  end if;

  select jsonb_build_object(
    -- ── 규모 ── (운영자 제외 — role 은 not null 이라 <> 로 충분하다)
    'members', jsonb_build_object(
      'female', (select count(*) from profiles
                  where gender = 'female' and account_state = 'active'
                    and onboarding_step >= 7 and role <> 'admin'),
      'male',   (select count(*) from profiles
                  where gender = 'male'   and account_state = 'active'
                    and onboarding_step >= 7 and role <> 'admin'),
      'paused', (select count(*) from profiles
                  where paused_at is not null and account_state = 'active'
                    and role <> 'admin'),
      'banned', (select count(*) from profiles
                  where account_state = 'banned' and role <> 'admin')
    ),

    -- ── 진행 ──
    'flow', jsonb_build_object(
      'open_intros',      (select count(*) from intros  where closed_at is null),
      'active_meetings',  (select count(*) from meetings
                            where cancelled_at is null and completed_at is null),
      'confirmed',        (select count(*) from meetings
                            where confirmed_at is not null
                              and cancelled_at is null and completed_at is null),
      'completed',        (select count(*) from meetings where completed_at is not null)
    ),

    -- ── 적체 ──
    'backlog', jsonb_build_object(
      'pending_reports',   (select count(*) from content_reports where state = 'pending'),
      'pending_no_shows',  (select count(*) from no_show_reports where state = 'pending'),
      'unmatched_likes',   (select count(*) from affinities a
                             where a.verdict = 'like'
                               and not exists (select 1 from intros i
                                                where i.male_id = a.to_id
                                                  and i.female_id = a.from_id)),
      'oldest_like_hours', (select round(extract(epoch from (now() - min(a.created_at))) / 3600)
                              from affinities a
                             where a.verdict = 'like'
                               and not exists (select 1 from intros i
                                                where i.male_id = a.to_id
                                                  and i.female_id = a.from_id))
    ),

    -- ── 품질 ──
    'quality', jsonb_build_object(
      'intros_total',  (select count(*) from intros),
      'intros_passed', (select count(*) from intros where outcome = 'passed'),
      'intros_used',   (select count(*) from intros where outcome = 'ticket_used')
    )
  ) into v;

  return v;
end $$;

comment on function admin_dashboard() is
  '운영자 대시보드 한 번에. 적체·품질을 규모보다 먼저 본다. 규모에서 운영자는 뺀다.';

-- ─────────────────── 2. 처리 사유를 목록에 돌려준다 ───────────────────

/*
  admin_actions.note 를 not null 로 강제한 이유는 "왜 그렇게 처리했는지" 를
  남기려는 것이었는데, 정작 화면에 내려주지 않아 DB 를 직접 봐야 알 수 있었다.
  강제만 하고 보여주지 않으면 기록의 목적이 사라진다.

  반환 컬럼이 늘어나므로 create or replace 로는 안 된다("cannot change return
  type of existing function") — drop 후 다시 만든다. 권한도 다시 준다.

  한 신고에 처리 기록은 하나지만, 뒤에 보정 기록이 붙어도 최신 것이 보이도록
  order by ... limit 1 로 못박는다.
*/
drop function if exists admin_reports(report_state);

create function admin_reports(p_state report_state default null)
  returns table (
    id            uuid,
    kind          report_kind,
    state         report_state,
    detail        text,
    created_at    timestamptz,
    resolved_at   timestamptz,
    reporter_id   uuid,
    reporter_name text,
    accused_id    uuid,
    accused_name  text,
    accused_state account_state,
    message_body  text,
    meeting_id    uuid,
    resolve_note  text
  )
  language plpgsql stable security definer set search_path = public, pg_temp as $$
begin
  if not is_admin() then
    raise exception 'admin only' using errcode = '42501';
  end if;

  return query
  select r.id, r.kind, r.state, r.detail, r.created_at, r.resolved_at,
         r.reporter_id, rp.name,
         r.accused_id,  ap.name, ap.account_state,
         m.body,
         r.meeting_id,
         act.note
    from content_reports r
    join profiles rp on rp.id = r.reporter_id
    join profiles ap on ap.id = r.accused_id
    left join messages m on m.id = r.message_id
    left join lateral (
      select a.note
        from admin_actions a
       where a.target_ref = r.id and a.kind = 'resolve_report'
       order by a.created_at desc
       limit 1
    ) act on true
   where p_state is null or r.state = p_state
   order by (r.state = 'pending') desc, r.created_at desc;
end $$;

comment on function admin_reports(report_state) is
  '신고 목록. 미처리를 항상 위에 둔다. 처리된 건은 운영자가 남긴 사유를 함께 낸다.';

revoke all on function admin_reports(report_state)    from public, anon;
grant execute on function admin_reports(report_state) to authenticated;

-- ─────────────────── 3. 재처리 경합을 409 로 ───────────────────

/*
  이미 처리된 신고를 또 처리하려는 것은 정상적인 경합이다 — 운영자 둘이 같은
  목록을 보고 있으면 반드시 일어난다. 그런데 P0002 는 PostgREST 에서 500 으로
  나가서 로그상 서버 장애처럼 보였다.

  PostgREST 는 SQLSTATE 'PTxxx' 를 HTTP xxx 로 옮긴다. 409 로 내보내
  "네 요청이 늦었다" 를 상태 코드로 말한다. 나머지 동작은 그대로다.
*/
create or replace function resolve_content_report(
  p_report_id uuid,
  p_upheld    boolean,
  p_note      text,
  p_ban       boolean default false
) returns content_reports
  language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_uid    uuid := auth.uid();
  v_report content_reports;
  v_ticket uuid;
begin
  if not is_admin() then
    raise exception 'admin only' using errcode = '42501';
  end if;
  if length(btrim(coalesce(p_note, ''))) = 0 then
    raise exception 'note required' using errcode = '22023';
  end if;

  update content_reports
     set state       = (case when p_upheld then 'confirmed' else 'dismissed' end)::report_state,
         resolved_at = now(),
         resolved_by = v_uid
   where id = p_report_id and state = 'pending'
  returning * into v_report;
  if not found then
    -- PT409 → HTTP 409. 다른 운영자가 먼저 처리했다는 뜻이다.
    raise exception 'report not found or already resolved' using errcode = 'PT409';
  end if;

  if p_upheld then
    -- 신고자가 쓴 티켓을 돌려준다. 만남이 없었으면 돌려줄 것도 없다.
    -- 이미 환불된 티켓(자동 만료 등)은 state = 'used' 조건에서 걸러진다.
    if v_report.meeting_id is not null then
      select m.ticket_id into v_ticket
        from meetings m
       where m.id = v_report.meeting_id
         and exists (select 1 from tickets t
                      where t.id = m.ticket_id
                        and t.user_id = v_report.reporter_id
                        and t.state = 'used');
      if v_ticket is not null then
        perform refund_ticket(v_ticket, 'report_upheld');
      end if;
    end if;

    if p_ban then
      update profiles
         set account_state = 'banned', banned_reason = p_note
       where id = v_report.accused_id;
    end if;
  end if;

  insert into admin_actions (actor_id, kind, target_user, target_ref, note)
  values (v_uid, 'resolve_report', v_report.accused_id, v_report.id, p_note);

  return v_report;
end $$;

comment on function resolve_content_report(uuid, boolean, text, boolean) is
  '운영자 판정. 인정하면 신고자 티켓을 환불한다. 사유(note)는 필수다. '
  '이미 처리된 건은 409 로 거절한다.';
