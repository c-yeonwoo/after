-- S15 — 아웃박스를 비우는 주체.
--
-- S9 가 만든 알림 아웃박스에는 "쌓는 쪽"만 있었다. meetings_notify() 트리거와
-- enqueue_feedback_due() 가 행을 넣지만, 실제 발송을 하는 send-notifications
-- Edge Function 을 부르는 곳이 아무 데도 없었다. 로컬에서는 손으로 함수를
-- 호출해 검증했기 때문에 드러나지 않았고, 호스팅에 올려 cron 을 훑어보고 나서야
-- 보였다 — 잡 3개가 전부 SQL 함수만 부르고 있었다.
--
-- 호출 수단으로 pg_net 을 골랐다. 스케줄러가 이미 pg_cron 이라 같은 자리에 두면
-- "무엇이 언제 도는가"가 cron.job 한 군데에서 전부 보인다. 외부 스케줄러를 쓰면
-- 발송 주기만 다른 인프라로 흩어져서, 알림이 안 왔을 때 어디를 봐야 하는지가
-- 두 곳이 된다.
--
-- URL 과 키는 마이그레이션에 박지 않고 Vault 에서 읽는다. 로컬과 호스팅이 서로
-- 다른 값을 써야 하는데 마이그레이션 파일은 하나여야 하기 때문이다. 값을 넣는
-- 것은 배포 절차이지 스키마가 아니다.

create extension if not exists pg_net with schema extensions;

create or replace function drain_notification_outbox()
  returns void language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_url text;
  v_key text;
begin
  select decrypted_secret into v_url
    from vault.decrypted_secrets where name = 'edge_function_base_url';
  select decrypted_secret into v_key
    from vault.decrypted_secrets where name = 'service_role_key';

  -- 설정이 없는 환경(로컬 개발)에서는 돌지 않는다. 여기서 예외를 던지면 로컬
  -- cron 이 5분마다 실패를 쌓아 진짜 고장과 구별이 안 된다. 대신 notice 로
  -- 남겨서 "왜 안 도는지"는 로그에서 답이 나오게 한다.
  if v_url is null or v_key is null then
    raise notice 'drain_notification_outbox: vault 에 edge_function_base_url / service_role_key 가 없어 건너뜁니다';
    return;
  end if;

  -- 보낼 게 없으면 함수를 깨우지 않는다. 5분마다 빈 호출을 하면 Edge Function
  -- 호출 수만 늘고 하는 일이 없다. attempts 상한은 워커의 MAX_ATTEMPTS 와 같은
  -- 5 여야 한다 — 여기가 더 크면 워커가 포기한 행 때문에 영원히 깨운다.
  if not exists (
    select 1 from notifications where sent_at is null and attempts < 5
  ) then
    return;
  end if;

  -- 응답을 기다리지 않는다(pg_net 은 큐에 넣고 즉시 반환). 발송 성공·실패는
  -- 워커가 notifications.sent_at / last_error 에 남기므로, 여기서 결과를
  -- 되받아 또 기록하면 같은 사실을 두 군데서 관리하게 된다.
  perform net.http_post(
    url     := v_url || '/functions/v1/send-notifications',
    headers := jsonb_build_object(
      'Content-Type',  'application/json',
      'Authorization', 'Bearer ' || v_key
    ),
    body    := '{}'::jsonb,
    timeout_milliseconds := 30000
  );
end $$;

revoke all on function drain_notification_outbox() from public, anon, authenticated;
grant execute on function drain_notification_outbox() to service_role;

-- 5분. 알림이 "만남 요청이 도착했다" 류라 시간 단위로 늦으면 의미가 없고,
-- 분 단위보다 촘촘하게 할 이유도 없다(아웃박스가 비면 호출 자체를 건너뛴다).
select cron.schedule(
  'drain_notification_outbox_5m',
  '*/5 * * * *',
  $$ select drain_notification_outbox(); $$
);
