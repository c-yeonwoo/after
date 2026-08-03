-- S3 — affinity_submitted 이벤트를 DB 트리거로 이관
--
-- 기존에는 클라이언트 submitAffinity() 안에서만 이 이벤트를 남겼다. 스모크
-- 테스트가 affinities 테이블에 직접 insert 하는 경로를 쓰면서 이 이벤트가
-- 한 번도 발화하지 않는다는 게 드러났다 — 클라이언트 경로가 바뀌거나
-- 우회되면 계측이 조용히 사라진다는 뜻. 다른 5개 이벤트(intro_opened 등)와
-- 같은 자리 — 값이 실제로 들어가는 지점(트리거) — 로 옮겨서, 어떤 클라이언트
-- 코드가 insert 하든 이벤트가 보장되게 한다.

create or replace function log_affinity_submitted() returns trigger
  language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if new.verdict = 'like' then
    insert into events (user_id, name, props)
    values (new.from_id, 'affinity_submitted', jsonb_build_object('to_id', new.to_id));
  end if;
  return new;
end $$;

create trigger affinities_log_submitted
  after insert on affinities
  for each row execute function log_affinity_submitted();
