-- S10 — 후보 선정을 서버로
--
-- 진단에서 세 가지가 같은 곳에서 나왔다:
--   PERF-1 이미 평가한 상대를 제외할 때 ID 전체를 URL 쿼리에 넣었다
--          (`.not("id","in",(...))`). 평가 수에 비례해 URL 이 자라고 목록은
--          줄지 않는다. 실측으로 **평가 약 210건에서 HTTP 414**, 그 뒤로는
--          후보 조회가 영구히 죽는다(복구 경로 없음).
--   PERF-2 profiles 인덱스가 PK 뿐이라 Seq Scan + 행마다 is_excluded() 호출.
--   SEC-1  "훑어보는 피드 없음"(F3)이 제품 원칙인데, 실제로는 권역 남성 전원을
--          클라이언트로 내려보내고 UI 에서 한 명만 그렸다. 원칙이 UI 에만 있었다.
--
-- 셋의 원인이 하나다 — 선정을 클라이언트가 했다. 서버로 옮기면 URL 이 자라지
-- 않고, 인덱스를 쓸 수 있고, 한 명 이상은 아예 나가지 않는다.

/**
 * 여성이 지금 평가할 다음 남성 1명.
 *
 * public_profiles 와 같은 컬럼만 돌려준다 — 노출면을 두 곳으로 늘리지 않는다.
 * 자격 없는 호출(남성·미인증)은 조용히 0행이다. 예외를 던지면 "왜 없는지"를
 * 화면이 분기해야 하는데, 여기서 구분해야 할 상태가 아니다.
 */
create or replace function next_candidate()
  returns setof public_profiles
  language sql stable security definer set search_path = public, pg_temp as $$
  select pp.*
    from public_profiles pp
    join profiles p on p.id = pp.id
   where my_gender() = 'female'
     and p.gender            = 'male'
     and p.hub_id            = my_hub_id()
     and p.email_verified_at is not null
     and p.account_state     = 'active'
     and p.onboarding_step   = 7
     and p.terms_agreed_at   is not null
     and p.privacy_agreed_at is not null
     -- 이미 평가한 상대는 제외. 예전에는 이 목록이 URL 로 나갔다.
     and not exists (
       select 1 from affinities a
        where a.from_id = auth.uid() and a.to_id = p.id
     )
     and not is_excluded(auth.uid(), p.id)
     -- 오래 기다린 사람부터. 무작위로 두면 같은 사람이 계속 안 뽑힌다.
   order by p.created_at
   limit 1
$$;

comment on function next_candidate is
  '평가할 다음 남성 1명. 선정을 서버가 한다 — URL 길이 한계(414)와 전체 풀 노출을 함께 없앤다.';

revoke all on function next_candidate() from public, anon;
grant execute on function next_candidate() to authenticated;

-- 남은 후보 수. "이번이 마지막"인지 화면이 알 수 있어야 한다.
create or replace function remaining_candidates()
  returns integer
  language sql stable security definer set search_path = public, pg_temp as $$
  select count(*)::int
    from profiles p
   where my_gender() = 'female'
     and p.gender            = 'male'
     and p.hub_id            = my_hub_id()
     and p.email_verified_at is not null
     and p.account_state     = 'active'
     and p.onboarding_step   = 7
     and p.terms_agreed_at   is not null
     and p.privacy_agreed_at is not null
     and not exists (
       select 1 from affinities a
        where a.from_id = auth.uid() and a.to_id = p.id
     )
     and not is_excluded(auth.uid(), p.id)
$$;

revoke all on function remaining_candidates() from public, anon;
grant execute on function remaining_candidates() to authenticated;

-- 평가 이력 조회 경로. next_candidate 의 not exists 가 여기를 탄다.
create index if not exists affinities_by_author on affinities (from_id, to_id);
