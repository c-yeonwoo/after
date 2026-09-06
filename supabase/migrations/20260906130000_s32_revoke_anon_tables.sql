-- S32 — 비로그인에게 열려 있던 테이블 권한을 회수한다
--
-- ── 어떻게 발견했나 ──
--
-- s31 을 배포한 뒤 확인 삼아 비로그인으로 `preference_answers` 를 조회해 봤다.
-- **로컬은 401, 운영은 200 `[]`** 이었다. 같은 마이그레이션인데 응답이 다르면
-- 둘 중 하나는 내가 모르는 상태다.
--
-- 원인은 프로젝트 설정이다. `supabase/config.toml` 이 설명하는
-- `auto_expose_new_tables` 가 운영 프로젝트에서는 **켜져 있는 쪽(구 동작)** 이라,
-- public 스키마에 새로 만든 테이블이 Data API 롤에 자동으로 노출된다. 로컬은
-- 새 기본값이라 노출되지 않는다. 그래서 로컬에서는 영영 안 보이는 차이였다.
--
-- 운영에서 anon 으로 조회했을 때 200 이 뜬 테이블:
--   ticket_orders · content_reports · intro_queue · admin_actions ·
--   preference_answers
--
-- ── 지금 새고 있지는 않다 ──
--
-- 다섯 개 모두 RLS 가 켜져 있고 anon 용 정책이 없어서 0행이 나온다. 그래서
-- **오늘 유출된 것은 없다.** 문제는 방어선이 둘에서 하나로 줄어 있다는 것이다.
--
-- s27 이 app_settings 에 대해 같은 말을 이미 적어 뒀다: "RLS 정책은 보이는 행을
-- 거를 뿐이고, GRANT 가 없으면 정책을 통과해도 permission denied 다. 두 개는
-- 다른 장치이고 둘 다 있어야 한다." 그 규율이 새 테이블에는 적용되지 않았다.
--
-- 특히 `admin_actions` 가 그 목록에 있다. 운영자의 조작 이력이고, 언젠가 누가
-- 편의를 위해 느슨한 정책을 하나 붙이는 순간 비로그인에게 그대로 나간다.
--
-- ── anon 은 테이블이 하나도 필요 없다 ──
--
-- 이 서비스는 로그인 전에 아무 데이터도 읽지 않는다. 랜딩은 서버가 그리고,
-- 가입·로그인은 GoTrue 를 지난다. 그래서 예외 없이 전부 회수한다.

do $$
declare r record; v_count integer := 0;
begin
  for r in
    select c.relname
      from pg_class c join pg_namespace n on n.oid = c.relnamespace
     where n.nspname = 'public' and c.relkind in ('r', 'p', 'v', 'm')
  loop
    execute format('revoke all on public.%I from anon', r.relname);
    v_count := v_count + 1;
  end loop;
  raise notice 's32: public 의 %개 관계에서 anon 권한 회수', v_count;
end $$;

/*
  앞으로 만들 것까지 막는다. 위 do 블록은 지금 있는 것만 훑으므로, 기본 권한을
  바꾸지 않으면 **다음 테이블에서 같은 일이 또 벌어진다.** 실제로 그렇게 s31 이
  걸렸다.

  소유자별로 걸어야 한다 — postgres 가 만든 것과 supabase_admin 이 만든 것이
  섞여 있고, alter default privileges 는 만든 롤을 기준으로 적용된다.
*/
alter default privileges in schema public revoke all on tables from anon;
alter default privileges for role postgres in schema public revoke all on tables from anon;

comment on schema public is
  'anon 은 이 스키마의 테이블을 하나도 읽지 않는다. 로그인 전에 읽을 데이터가 없다(s32).';
