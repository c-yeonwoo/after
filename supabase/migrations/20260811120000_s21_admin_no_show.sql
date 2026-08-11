-- S21 — 노쇼 신고 운영자 개입
--
-- docs/admin-design.md §0 이 처음부터 적어둔 구멍이다:
--   "노쇼 신고 검토 | 자동 판정(인정/무응답)만 있다. **다툼이 생기면 손댈 수 없다**"
--
-- 대시보드는 backlog.pending_no_shows 를 세지만 운영자가 볼 화면도, 뒤집을
-- 수단도 없었다. 숫자만 있고 갈 곳이 없는 지표였다.
--
-- s4 의 원칙은 그대로 둔다: **단일 미검증 신고로 즉시 제명하지 않는다.** 확정은
-- 상대의 인정 또는 무응답으로만 일어난다. 운영자는 그 뒤에 오는 **다툼**을
-- 판정한다 — 자동 판정을 앞지르지 않고, 잘못된 결과를 되돌린다.

-- ─────────────────── 목록 ───────────────────

/*
  신고 사유는 별도 컬럼이 없다(s4 의 결정) — feedbacks.body 에 자유 텍스트로
  남는다. 운영자가 판정하려면 그 글이 필요하므로 같은 meeting 의 양쪽 후기를
  함께 낸다. 신고자 글만 보여주면 한쪽 말만 듣고 판정하게 된다.
*/
create function admin_no_show_reports(p_state report_state default null)
  returns table (
    id              uuid,
    state           report_state,
    created_at      timestamptz,
    confirm_by      timestamptz,
    resolved_at     timestamptz,
    reporter_id     uuid,
    reporter_name   text,
    accused_id      uuid,
    accused_name    text,
    accused_state   account_state,
    meeting_id      uuid,
    scheduled_at    timestamptz,
    place_name      text,
    reporter_note   text,
    accused_note    text,
    -- 확정으로 재발급된 보상 티켓이 실제로 있는지. 뒤집을 때 판단 재료다.
    compensated     boolean
  )
  language plpgsql stable security definer set search_path = public, pg_temp as $$
begin
  if not is_admin() then
    raise exception 'admin only' using errcode = '42501';
  end if;

  return query
  select r.id, r.state, r.created_at, r.confirm_by, r.resolved_at,
         r.reporter_id, rp.name,
         r.accused_id,  ap.name, ap.account_state,
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
   -- 미처리를 위에 둔다. 그 다음은 확인 기한이 임박한 순 — 무응답으로 자동
   -- 확정되기 전에 운영자가 볼 기회를 준다.
   order by (r.state = 'pending') desc, r.confirm_by;
end $$;

comment on function admin_no_show_reports(report_state) is
  '노쇼 신고 목록. 양쪽 후기를 함께 낸다 — 한쪽 말만 듣고 판정하지 않도록.';

-- ─────────────────── 운영자 판정 ───────────────────

-- 개입 종류 하나 추가.
alter table admin_actions drop constraint if exists admin_actions_kind_check;
alter table admin_actions add constraint admin_actions_kind_check check (
  kind in ('resolve_report', 'ban', 'unban', 'refund', 'cancel_meeting',
           'review_photo', 'set_queue', 'resolve_no_show')
);

/*
  운영자 판정. 세 경우를 다룬다.

    ① pending → confirmed : 상대가 답을 미루는 동안 운영자가 확정한다.
       s4 의 apply_no_show_confirmed 를 그대로 쓴다 — 제명과 보상 재발급 규칙이
       한 곳에만 있어야 한다.
    ② pending → dismissed : 근거가 부족하다. 아무 효과 없이 닫는다.
    ③ confirmed → dismissed : **다툼의 결과를 되돌린다.** 제명을 푼다.

  ── 보상 티켓은 회수하지 않는다 ──
  ③ 에서 피해자에게 이미 나간 0원 티켓을 빼앗지 않는다. 그 사람은 그동안 그걸
  쓸 수 있었고(이미 썼을 수도 있다), 운영자의 사후 판단으로 사용자 손에서 돈을
  빼는 것이 잘못된 제명을 유지하는 것보다 낫다고 볼 수 없다. 대신 보상 여부를
  목록에 내보내 운영자가 그 사실을 알고 판단하게 한다.

  dismissed → confirmed 는 허용하지 않는다. 한 번 "근거 없음" 으로 닫은 건을
  다시 제명으로 되돌리려면 새 신고가 접수되는 편이 옳다 — 같은 신고를 두 번
  판정할 수 있으면 판정이 언제 끝났는지 아무도 모른다.
*/
create function admin_resolve_no_show(
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
      -- 이미 판정된 건이다. 정상적인 경합이므로 409(s16c 와 같은 규약).
      raise exception 'only pending reports can be upheld' using errcode = 'PT409';
    end if;
    -- 제명·보상 규칙은 s4 에 한 곳만 둔다.
    v_report := apply_no_show_confirmed(p_report_id);
  else
    if v_report.state = 'dismissed' then
      raise exception 'already dismissed' using errcode = 'PT409';
    end if;

    update no_show_reports set state = 'dismissed', resolved_at = now()
     where id = p_report_id
    returning * into v_report;

    /*
      노쇼 확정으로 정지된 건만 되돌린다. banned_reason 이 비어 있으면
      apply_no_show_confirmed 가 건 것이다 — 그 함수는 사유를 쓰지 않고,
      운영자 정지(admin_set_account_state)와 신고 인정(resolve_content_report)은
      반드시 사유를 남긴다. 다른 사유로 정지된 사람을 노쇼 기각이 풀어주면 안 된다.

      **조건을 UPDATE 와 로그에 똑같이 걸어야 한다.** 처음엔 exists 로 "정지됨"
      만 확인하고 UPDATE 에만 banned_reason 조건을 뒀는데, 그러면 다른 사유로
      정지된 사람에게 0건 UPDATE 가 나가고 해제 기록만 남는다 — 하지 않은 일이
      감사 로그에 적힌다.
    */
    update profiles set account_state = 'active', banned_reason = null
     where id = v_report.accused_id
       and account_state = 'banned'
       and banned_reason is null;

    if found then
      insert into admin_actions (actor_id, kind, target_user, target_ref, note)
      values (v_uid, 'unban', v_report.accused_id, p_report_id,
              '노쇼 판정 번복 — ' || p_note);
    end if;
  end if;

  insert into admin_actions (actor_id, kind, target_user, target_ref, note)
  values (v_uid, 'resolve_no_show', v_report.accused_id, p_report_id,
          (case when p_upheld then '인정 — ' else '기각 — ' end) || p_note);

  return v_report;
end $$;

comment on function admin_resolve_no_show(uuid, boolean, text) is
  '노쇼 신고 판정. 확정을 뒤집으면 제명을 풀지만 보상 티켓은 회수하지 않는다.';

-- ─────────────────── 권한 ───────────────────

revoke all on function admin_no_show_reports(report_state)      from public, anon;
revoke all on function admin_resolve_no_show(uuid, boolean, text) from public, anon;
grant execute on function admin_no_show_reports(report_state)     to authenticated;
grant execute on function admin_resolve_no_show(uuid, boolean, text) to authenticated;
