-- S2 — profiles.intro 컬럼 추가
--
-- 온보딩 마지막 단계는 짧은 한 줄 소개(headline)와 별개로 긴 소개글(intro, textarea
-- 9줄)을 받는다. ProfileDetail 컴포넌트도 headline/intro 를 별개 필드로 렌더한다.
-- S1 스키마에는 headline 만 있었다 — 화면을 실제로 연결하면서 발견했다.

alter table profiles add column intro text;

comment on column profiles.intro is
  '온보딩 마지막 단계의 긴 소개글 (자유 서술). headline(한 줄 소개)과 별개.';

-- 컬럼 UPDATE 권한 화이트리스트에도 추가해야 클라이언트가 저장할 수 있다.
grant update (intro) on profiles to authenticated;
