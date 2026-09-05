-- S28 — 소개가 끝나는 방식 두 가지를 어휘에 추가한다
--
-- 이 파일에는 `alter type ... add value` 만 있다. 새 enum 값은 **그 값을 추가한
-- 트랜잭션 안에서는 쓸 수 없다** — 같은 파일에 이어서 함수를 고치면
-- "unsafe use of new value of enum type" 로 거절된다. 그래서 파일을 나눈다
-- (마이그레이션 파일 하나 = 트랜잭션 하나).
--
--   blocked   차단으로 끊긴 소개. 지금까지 block_user() 는 만남만 끊고 소개는
--             열어 둔 채였다 — 차단한 상대가 홈에 계속 남고, 불변식 2(동시 1건)에
--             자리를 차지해 **다음 소개를 받지도 못했다.**
--   declined  여성이 만남 요청을 명시적으로 거절한 것. 지금까지 여성에게는
--             거절 수단이 아예 없어서 '24시간 방치'가 유일한 거절 방법이었고,
--             그동안 남성의 만남 티켓 30,000원도 함께 묶여 있었다.
--
-- 'expired'(무응답 만료)와 구분해서 남긴다. 둘을 합치면 "거절당한 것"과
-- "답을 못 받은 것"이 한 숫자가 되어, 여성 응답률을 영영 못 본다.

alter type intro_outcome add value if not exists 'blocked';
alter type intro_outcome add value if not exists 'declined';
