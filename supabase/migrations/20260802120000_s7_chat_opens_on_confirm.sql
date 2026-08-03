-- S7 — 대화는 "만남이 확정된 뒤" 열린다
--
-- 이전: 여성이 선호를 제출하는 순간 조율 채널이 열렸다.
--       → 세라는 질문만 던지고 빠지고, 날짜·장소 조율을 두 사람이 채팅으로 했다.
--
-- 이후: 선호 제출 → **세라가 남성에게 전달** → 남성이 날짜·장소 확정 → 그때 대화 오픈.
--       세라가 "둘의 의견을 조율하고 전달하는" 역할을 실제로 맡는다(D11).
--
-- 결과적으로 채널의 성격이 바뀐다:
--   coord   = 확정 이후의 일반 대화(세부 조정·인사). "조율"이라는 이름은 남기되
--             실제 조율은 세라가 중개하는 단계에서 끝나 있다.
--   private = 만남 전날 18시 이후 (P2, 변경 없음)
--
-- 주의: bool 컬럼을 만들지 않는다. 기존과 같이 타임스탬프에서 **파생**한다 —
-- 컬럼이면 누군가 켤 수 있고, 그게 진단에서 뚫렸던 방식이다.

create or replace function is_channel_open(p_meeting_id uuid, p_channel msg_channel)
  returns boolean language sql stable security definer set search_path = public, pg_temp as $$
  select case p_channel
    when 'coord'   then m.confirmed_at is not null
    when 'private' then m.private_opens_at is not null and now() >= m.private_opens_at
  end
    and m.cancelled_at is null
  from meetings m where m.id = p_meeting_id
$$;

comment on function is_channel_open is
  '조율 = 만남 확정 이후. 사적 = private_opens_at 이후. bool 컬럼을 두지 않는다.
   확정 전 날짜·장소 조율은 세라가 중개한다(선호 제출 → 전달 → 남성 확정).';
