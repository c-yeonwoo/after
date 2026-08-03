-- S2 — 인터뷰 후속 답변 저장 컬럼
--
-- ProfileDraft 의 details(관심사별 후속 답변) · matchNote · topicNote 가
-- 온보딩 6·8단계 화면에는 입력받으면서도 completeOnboarding() 에 빠져 있었다 —
-- 화면을 실제로 연결하면서 발견. 저장 안 하면 ProfileDetail 의 "인터뷰" 섹션이
-- 항상 비어 보인다.

alter table profiles
  add column details    jsonb not null default '{}',
  add column match_note text,
  add column topic_note text;

comment on column profiles.details is
  '관심사별 후속 답변. { "퇴근 후 러닝": "양재천 5km" } 형태. ProfileDraft.details 대응.';

grant update (details, match_note, topic_note) on profiles to authenticated;
