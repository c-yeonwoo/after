-- S15 — 아웃박스를 비우는 주체
--
-- 여기서 지켜야 하는 것 둘.
--
--   1) **아무나 발송을 트리거할 수 없다.** drain 함수는 Vault 에서 service_role
--      키를 꺼내 Edge Function 을 부른다. 로그인 사용자가 이걸 호출할 수 있으면
--      남의 알림 발송을 마음대로 돌릴 수 있고, 더 나쁘게는 호출 폭주로 발송
--      비용을 태울 수 있다.
--   2) **설정이 없는 환경에서 죽지 않는다.** 로컬에는 Vault 값이 없다. 여기서
--      예외가 나면 cron 이 5분마다 실패를 쌓아 진짜 고장과 구별이 안 된다.
--
-- 실제 HTTP 발송 자체는 여기서 검사하지 않는다 — pg_net 은 비동기로 큐에 넣고
-- 즉시 반환하므로 트랜잭션 안에서 결과를 볼 수 없다. 그 구간은 호스팅에서
-- net._http_response 로 확인했다.

begin;
select plan(8);

-- ─────────────── 권한 ───────────────

select ok(
  not has_function_privilege('anon', 'drain_notification_outbox()', 'execute'),
  'T1 anon 은 발송을 트리거할 수 없다'
);
select ok(
  not has_function_privilege('authenticated', 'drain_notification_outbox()', 'execute'),
  'T2 로그인 사용자도 트리거할 수 없다'
);
select ok(
  has_function_privilege('service_role', 'drain_notification_outbox()', 'execute'),
  'T3 service_role 은 트리거할 수 있다 (cron 이 이 역할로 돈다)'
);

-- 짝으로 검사한다 — 차단만 보면 "아무도 못 하는 함수"도 초록불이 된다.
select is(
  (select count(*)::int from pg_proc p
     join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = 'drain_notification_outbox'),
  1,
  'T4 함수가 실제로 존재한다'
);

-- ─────────────── 안전한 기본 동작 ───────────────

-- Vault 에 값이 없는 환경(로컬)에서 예외 없이 끝나야 한다.
select lives_ok(
  'select drain_notification_outbox()',
  'T5 Vault 미설정이어도 예외를 던지지 않는다'
);

-- ─────────────── search_path 고정 ───────────────
--
-- SECURITY DEFINER 함수가 search_path 를 고정하지 않으면, 호출자가 스키마를
-- 앞에 끼워 넣어 함수 안의 이름 해석을 가로챌 수 있다.
select ok(
  (select proconfig::text from pg_proc p
     join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = 'drain_notification_outbox')
    like '%search_path=public, pg_temp%',
  'T6 search_path 가 고정돼 있다'
);
select ok(
  (select prosecdef from pg_proc p
     join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = 'drain_notification_outbox'),
  'T7 SECURITY DEFINER 로 선언돼 있다'
);

-- ─────────────── 스케줄 ───────────────
--
-- 함수가 있어도 부르는 주체가 없으면 아웃박스는 그대로 쌓인다 — S15 가 고친
-- 문제 자체가 그것이었으므로 잡의 존재를 검사한다.
select is(
  (select count(*)::int from cron.job
    where jobname = 'drain_notification_outbox_5m' and active),
  1,
  'T8 5분 주기 cron 잡이 살아 있다'
);

select * from finish();
rollback;
