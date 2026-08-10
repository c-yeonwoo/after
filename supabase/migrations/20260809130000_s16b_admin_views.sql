-- S16b — 운영자 조회
--
-- 대시보드와 신고 목록을 서버 함수로 낸다. 클라이언트에서 테이블을 여러 번
-- 조인해 세면 RLS 를 통과시키느라 정책이 넓어지고, 넓어진 정책은 결국 사용자
-- 쪽에서도 열린다. 필요한 모양 그대로 서버에서 만들어 내보내는 편이 좁다.
--
-- 지표 선정 기준은 docs/admin-design.md 에 있다 — 일반 KPI(가입·활성)보다
-- **적체와 품질**이 먼저다. 소개 흐름 v2 에서 운영자가 병목이자 품질의 원천이
-- 되기 때문이다.

create or replace function admin_dashboard() returns jsonb
  language plpgsql stable security definer set search_path = public, pg_temp as $$
declare v jsonb;
begin
  if not is_admin() then
    raise exception 'admin only' using errcode = '42501';
  end if;

  select jsonb_build_object(
    -- ── 규모 ──
    'members', jsonb_build_object(
      'female', (select count(*) from profiles
                  where gender = 'female' and account_state = 'active' and onboarding_step >= 7),
      'male',   (select count(*) from profiles
                  where gender = 'male'   and account_state = 'active' and onboarding_step >= 7),
      'paused', (select count(*) from profiles
                  where paused_at is not null and account_state = 'active'),
      'banned', (select count(*) from profiles where account_state = 'banned')
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

    /*
      ── 적체 ──
      운영자가 밀리고 있는가. 소개 흐름 v2 에서 큐레이션이 필수 경로가 되면
      이 숫자가 곧 서비스 정지 여부다. 지금(v1)은 "아직 소개로 이어지지 않은
      호감"을 같은 뜻으로 센다.
    */
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

    /*
      ── 품질 ──
      열린 소개 중 얼마나 넘겨지는가. v2 에서 열람이 유료가 되면 이 값이
      "돈 받고 연 카드가 얼마나 버려지는가"가 되어 단위 경제 지표가 된다.
    */
    'quality', jsonb_build_object(
      'intros_total',  (select count(*) from intros),
      'intros_passed', (select count(*) from intros where outcome = 'passed'),
      'intros_used',   (select count(*) from intros where outcome = 'ticket_used')
    )
  ) into v;

  return v;
end $$;

comment on function admin_dashboard() is
  '운영자 대시보드 한 번에. 적체·품질을 규모보다 먼저 본다.';

/*
  신고 목록. 신고자·피신고자의 이름을 붙여 낸다 — id 만 주면 화면에서 프로필을
  다시 조회해야 하는데, 그러려면 운영자에게 profiles 를 넓게 열어야 한다.
*/
create or replace function admin_reports(p_state report_state default null)
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
    meeting_id    uuid
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
         r.meeting_id
    from content_reports r
    join profiles rp on rp.id = r.reporter_id
    join profiles ap on ap.id = r.accused_id
    left join messages m on m.id = r.message_id
   where p_state is null or r.state = p_state
   order by (r.state = 'pending') desc, r.created_at desc;
end $$;

comment on function admin_reports(report_state) is
  '신고 목록. 미처리를 항상 위에 둔다.';

revoke all on function admin_dashboard()             from public, anon;
revoke all on function admin_reports(report_state)   from public, anon;
grant execute on function admin_dashboard()          to authenticated;
grant execute on function admin_reports(report_state) to authenticated;
