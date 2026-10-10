-- S52 — 소개장 인터뷰 답변 (2026-10-10)
--
-- 가입의 프로필 단계를 칩 고르기에서 "소개장을 쓰기 위한 짧은 인터뷰"로 바꾼다.
-- 질문 네 개 중 두 개는 이미 담을 자리가 있다:
--   ③ 처음 만나면 나누고 싶은 이야기 → topic_note (예전 "대화 주제 직접 적기")
--   ④ 함께라면 편한 사람             → match_note (예전 "잘 맞았던 사람 덧붙임")
-- 나머지 두 개만 새 컬럼이다:
--   ① 퇴근하고 요즘 가장 기다려지는 시간 → evening_note
--   ② 주변에서 나를 어떤 사람이라고 하는지 → known_as
--
-- 길이 상한은 기존 메모(s8)와 같은 300자다. 소개장 재료이지 에세이가 아니다.

alter table profiles
  add column if not exists evening_note text
  check (evening_note is null or char_length(evening_note) <= 300);
alter table profiles
  add column if not exists known_as text
  check (known_as is null or char_length(known_as) <= 300);

comment on column profiles.evening_note is '인터뷰 ① 퇴근하고 요즘 가장 기다려지는 시간(본인 문장).';
comment on column profiles.known_as is '인터뷰 ② 주변에서 나를 어떤 사람이라고 하는지(본인 문장).';

-- 본인 행만 고칠 수 있는 기존 RLS 위에서, 쓰기 권한은 컬럼 단위로 연다(s1·s2 와 같은 방식).
grant update (evening_note, known_as) on profiles to authenticated;
