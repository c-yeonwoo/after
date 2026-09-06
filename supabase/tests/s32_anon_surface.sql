-- S32 — 비로그인에게 열린 표면은 없다
--
-- 이 검사가 있는 이유는 s28 의 함수 검사와 같다. 한 자리를 고치는 것으로는
-- 부족하고, **표면 전체를 0으로 고정해야** 다음에 누가 잊어도 여기서 걸린다.
--
-- 실제로 두 번 걸렸다. s19 는 함수에서 revoke 를 잊었고(issue_ticket), s31 은
-- 테이블에서 잊었다 — 정확히는 잊은 게 아니라 **운영 프로젝트가 새 테이블을
-- 자동 노출하는 설정이라 로컬에서는 보이지 않았다.** 로컬에서 안 보이는 차이는
-- 검사로만 잡을 수 있다.

begin;
select plan(3);

select is_empty(
  $$ select c.relname::text
       from pg_class c join pg_namespace n on n.oid = c.relnamespace
      where n.nspname = 'public'
        and c.relkind in ('r','p','v','m')
        and (has_table_privilege('anon', c.oid, 'SELECT')
          or has_table_privilege('anon', c.oid, 'INSERT')
          or has_table_privilege('anon', c.oid, 'UPDATE')
          or has_table_privilege('anon', c.oid, 'DELETE')) $$,
  'T1 anon 이 읽거나 쓸 수 있는 public 테이블·뷰가 하나도 없다'
);

/*
  s28 이 세운 것을 여기서도 지킨다 — 파일이 갈라져 있으면 한쪽만 보고
  "통과했다" 고 넘어가게 된다.
*/
select is_empty(
  $$ select p.proname::text
       from pg_proc p join pg_namespace n on n.oid = p.pronamespace
      where n.nspname = 'public' and p.prokind = 'f' and p.prosecdef
        and has_function_privilege('anon', p.oid, 'EXECUTE') $$,
  'T2 anon 이 실행할 수 있는 SECURITY DEFINER 함수가 없다'
);

/*
  취향 겹침은 로그인 사용자에게도 닫혀 있어야 한다. 답을 못 읽어도 "몇 개
  맞는지" 를 알면 상대의 답이 대부분 복원된다.
*/
select ok(
  not has_function_privilege('authenticated',
    'preference_agreement(uuid,uuid)'::regprocedure, 'EXECUTE'),
  'T3 취향 겹침 계산은 로그인 사용자에게도 닫혀 있다'
);

select * from finish();
rollback;
