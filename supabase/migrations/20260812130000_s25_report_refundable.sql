-- S25 — 신고 인정 시 실제로 환불되는지를 화면이 알게 한다
--
-- 출시 전 검증(docs/release-scenarios.md G6·G8)에서 나온 것.
--
-- 여성이 남성을 신고하고 운영자가 인정했는데 티켓이 환불되지 않았다. 서버는
-- 맞게 동작했다 — resolve_content_report 는 **신고자가 소유한 used 티켓**만
-- 돌려준다. 티켓은 항상 남성이 내므로 여성 신고자는 돌려받을 티켓이 없다.
--
-- 틀린 것은 화면이었다. 버튼 라벨을 `meeting_id` 유무로만 갈랐기 때문에
-- "인정 · 티켓 환불" 이라고 적힌 버튼을 눌러도 환불이 일어나지 않는다.
--
-- s16c 에서 같은 종류를 한 번 고쳤다 — 만남이 없는 신고에 환불을 약속하던 것.
-- 그때 조건을 절반만 옮겼다(meeting_id 만). 나머지 절반이 이것이다.
--
-- ── 조건을 서버에서 계산해 내려준다 ──
-- 화면이 "신고자가 남성이면" 으로 추측하면 규칙이 두 곳에 생긴다. 환불이
-- 일어나는 조건은 resolve_content_report 안에 있으므로, **같은 조건**을 목록에서
-- 그대로 계산해 boolean 하나로 낸다.

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
    resolve_note  text,
    -- 인정하면 **실제로** 환불이 일어나는가. resolve_content_report 의 조건과 같다.
    refundable    boolean
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
         act.note,
         /*
           resolve_content_report 가 환불 대상을 찾는 조건을 그대로 옮긴다.
           만남이 있고, 그 만남의 티켓이 **신고자 소유**이며, 아직 used 여야 한다.
           이미 환불된 티켓(자동 만료 등)이면 인정해도 환불은 없다.
         */
         exists (
           select 1
             from meetings mt
             join tickets t on t.id = mt.ticket_id
            where mt.id = r.meeting_id
              and t.user_id = r.reporter_id
              and t.state = 'used'
         )
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
  '신고 목록. refundable 은 인정 시 실제로 환불이 일어나는가 — 화면이 없는 '
  '환불을 약속하지 않도록 서버가 같은 조건으로 계산해 낸다.';

revoke all on function admin_reports(report_state)    from public, anon;
grant execute on function admin_reports(report_state) to authenticated;
