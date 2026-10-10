-- S49 — 남성에게 "이번 소개는 이어지지 않았다, 티켓은 돌려드렸다" 를 알리는 종류
--
-- enum 값은 추가한 트랜잭션 안에서 쓸 수 없어서 파일을 나눈다(s28 → s28b 와 같은 이유).
-- 쓰는 쪽은 s49b.

alter type notification_kind add value if not exists 'meeting_released';
