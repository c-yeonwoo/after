-- S29 — 탈퇴 시 실제로 파기한다 (약관과 코드를 일치시킨다)
--
-- 개인정보처리방침 §4 는 "회원 탈퇴 시 프로필과 **대화 내용을** 지체 없이
-- 파기합니다" 라고 공개돼 있다. 그런데 withdraw_account() 가 지우던 것은
-- profiles 의 신원 컬럼 15개와 미발송 알림뿐이었다.
--
--   남아 있던 것:  messages(대화 본체) · feedbacks(상대에 대한 자유서술) ·
--                  affinities · content_reports.detail · Storage 의 사진 파일
--
-- 공개된 법정 고지와 코드가 다른 상태다. 이 제품은 **회사 메일 = 신원**이라
-- 일반 앱보다 이 불일치의 값이 비싸다. 게다가 만남 조율 대화(messages)에는
-- 이름·전화번호·장소가 자주 들어간다.
--
-- ── 무엇을 남기는가, 그리고 왜 ──
--
-- s14 주석이 이미 옳은 구분을 세워 뒀다: "거래 기록(tickets·ticket_orders·
-- meetings·events)은 남긴다 — 전자상거래법상 보존 의무". 그 구분에 messages 와
-- feedbacks 가 어느 쪽인지만 정해지지 않았을 뿐이다. 여기서 정한다.
--
--   지운다   내가 쓴 것 중 상대에 대한 서술 — 내 메시지 · 내 피드백 · 내 호감/패스
--   남긴다   거래의 뼈대(티켓·주문·만남·이벤트) · 상대가 쓴 것 · intro_exclusions
--
-- intro_exclusions 를 남기는 이유가 중요하다. 그건 나에 대한 기록이 아니라
-- **남는 사람을 지키는 기록**이다 — 누군가 나를 차단했다면, 내가 탈퇴했다가
-- 돌아와도 그 사람 앞에 다시 서지 않아야 한다. 게다가 uuid 쌍뿐이라 그 자체로
-- 신원을 담지 않는다.
--
-- 예외가 하나 있다: **아직 판정되지 않은 신고의 근거 메시지.** 지우면 신고당한
-- 쪽을 판정할 근거가 사라진다(content_reports.message_id 는 on delete set null).
-- 신고를 남기고 증거를 지우는 것은 신고한 사람에게 불리하다. 그래서 pending
-- 신고가 걸린 메시지만 남기고, 그 사실을 방침에도 적는다.
--
-- ── Storage 는 여기서 못 지운다 ──
-- SQL 에서 storage.objects 행을 지워도 백엔드의 파일 자체는 남는다. 파일 삭제는
-- Storage API 를 통해야 하고, 탈퇴는 **본인이 로그인한 상태에서** 시작하므로
-- 클라이언트가 자기 photos_delete_own 정책으로 직접 지우는 것이 가장 확실하다.
-- src/lib/api.ts 의 withdrawAccount() 가 이 RPC 를 부르기 전에 파일을 지운다.

create or replace function withdraw_account(p_reason text default null) returns void
  language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_uid uuid := auth.uid();
  r     record;
begin
  if v_uid is null then
    raise exception 'unauthenticated' using errcode = '28000';
  end if;

  -- 1) 아직 완료되지 않은 약속 정리 + 상대 티켓 환불
  for r in
    select m.id as meeting_id, m.ticket_id, m.intro_id
      from meetings m join intros i on i.id = m.intro_id
     where v_uid in (i.male_id, i.female_id)
       and m.cancelled_at is null
       and m.completed_at is null
  loop
    update meetings
       set cancelled_at = now(), cancel_reason = 'counterpart_withdrawn'
     where id = r.meeting_id;
    -- 이미 환불된 티켓이면 refund_ticket 이 예외를 던지므로 상태를 먼저 본다.
    if exists (select 1 from tickets where id = r.ticket_id and state = 'used') then
      perform refund_ticket(r.ticket_id, 'counterpart_withdrawn');
    end if;
  end loop;

  -- 2) 열려 있는 소개를 닫는다. 'passed' 가 아니라 'withdrawn' 이다.
  --    'passed' 로 닫으면 intro_exclusions 에 영구 배제가 기록되어, 남는 사람이
  --    "거절당했다"는 기록을 갖게 된다. 탈퇴는 거절이 아니다.
  update intros
     set closed_at = now(), outcome = 'withdrawn'
   where v_uid in (male_id, female_id)
     and closed_at is null;

  -- 3) 아직 열리지 않은 큐 카드에서 내가 빠진다. 남는 남성의 줄을 다시 채운다.
  for r in
    delete from intro_queue q
     where q.opened_at is null and (q.male_id = v_uid or q.female_id = v_uid)
    returning q.male_id
  loop
    if r.male_id <> v_uid then
      perform promote_intro_queue(r.male_id);
    end if;
  end loop;

  -- 4) 내가 쓴 것을 지운다.
  --
  --    메시지: 상대가 쓴 메시지는 상대의 기록이라 남긴다. 대화방에는 상대의
  --    말만 남는데, 그게 "내 말이 남의 화면에 영구히 남는 것" 보다 낫다.
  --    다만 판정 대기 중인 신고의 근거는 예외다(위 주석).
  delete from messages m
   where m.sender_id = v_uid
     and not exists (
       select 1 from content_reports cr
        where cr.message_id = m.id and cr.state = 'pending');

  delete from feedbacks  where author_id = v_uid;
  delete from affinities where from_id = v_uid or to_id = v_uid;

  --    내가 낸 신고의 본문은 자유서술이라 신원이 드러날 수 있다. 판정이 끝난
  --    건은 본문을 지우고 행은 남긴다 — 피신고자에 대한 누적 이력이라
  --    행까지 지우면 상습 신고 대상이 초기화된다.
  update content_reports
     set detail = '[탈퇴한 회원의 신고]'
   where reporter_id = v_uid and state <> 'pending';

  -- 보내지 못한 알림은 지운다 — 없는 사람에게 메일을 보낼 이유가 없다.
  delete from notifications where user_id = v_uid and sent_at is null;

  -- 5) 신원 정보 삭제. company_email 은 not null 이라 비울 수 없어 익명화한다 —
  --    이 값이 남으면 어느 회사의 누구였는지 특정된다.
  --    email_verified_at·onboarding_step 도 함께 되돌린다. 남겨 두면 되살아난
  --    계정이 '인증된 7단계 회원'으로 자격 검사를 통과한다(S28b 참조).
  update profiles
     set name          = null,
         birth         = null,
         job           = null,
         photo_url     = null,
         mbti          = null,
         smoking       = null,
         drinking      = null,
         religion      = null,
         headline      = null,
         intro         = null,
         details       = '{}'::jsonb,   -- not null 컬럼이라 비우지 못한다
         match_note    = null,
         topic_note    = null,
         interests     = '{}',
         match_tags    = '{}',
         topics        = '{}',
         email_verified_at = null,
         company_email = 'withdrawn+' || v_uid::text || '@invalid',
         account_state = 'withdrawn',
         banned_reason = p_reason
   where id = v_uid;

  insert into events (user_id, name, props)
  values (v_uid, 'account_withdrawn', jsonb_build_object('reason', p_reason));
end $$;

revoke all on function withdraw_account(text) from public, anon;
grant execute on function withdraw_account(text) to authenticated;

comment on function withdraw_account is
  '탈퇴. 진행 중 약속을 취소·환불하고, 내가 쓴 메시지·피드백·호감과 신원 정보를 파기한다. 거래 기록과 배제 기록은 남긴다.';
