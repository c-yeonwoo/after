-- S26 — 큐 만료 건수를 실제 카드 수로 센다
--
-- 출시 전 검증(docs/release-scenarios.md G2)에서 나온 것.
--
-- expire_intro_queue 는 남성별로 돌면서 `v_count := v_count + 1` 한다. 그래서
-- 반환값이 **만료된 카드 수가 아니라 만료가 일어난 남성 수**다. 한 사람의
-- 카드 3장이 같은 밤에 만료되면 1 이라고 답한다.
--
-- 이 숫자는 pg_cron 로그에 남는 유일한 신호다 — 새벽에 무엇이 얼마나 만료됐는지
-- 확인할 방법이 이것뿐이라, 3을 1로 적으면 나중에 지표를 볼 때 조용히 틀린다.
--
-- 함수 이름·인자·용도는 그대로다. 세는 대상만 카드로 바꾼다.

create or replace function expire_intro_queue()
  returns integer
  language plpgsql security definer set search_path = public, pg_temp as $$
declare v_count integer := 0; v_gone integer; r record;
begin
  for r in
    select distinct male_id from intro_queue
     where opened_at is null and delivered_at is not null and expires_at <= now()
  loop
    with gone as (
      delete from intro_queue
       where male_id = r.male_id
         and opened_at is null and delivered_at is not null and expires_at <= now()
      returning female_id, curated_by
    ),
    logged as (
      insert into events (user_id, name, props)
      select r.male_id, 'intro_queue_expired',
             jsonb_build_object('female_id', female_id, 'curated_by', curated_by)
        from gone
      returning 1
    )
    -- 지운 카드 수를 그대로 받는다. 이벤트는 카드마다 하나이므로 같은 수다.
    select count(*) into v_gone from logged;

    v_count := v_count + v_gone;

    perform promote_intro_queue(r.male_id);
  end loop;
  return v_count;
end $$;

comment on function expire_intro_queue() is
  '3주가 지난 미열람 소개 카드를 만료시키고 대기자를 승격한다. 반환값은 '
  '만료된 카드 수 — 남성 수가 아니다(s26).';

revoke all on function expire_intro_queue()    from public, anon;
grant execute on function expire_intro_queue() to service_role;
