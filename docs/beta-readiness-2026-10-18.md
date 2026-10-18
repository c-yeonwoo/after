# AFT-21 AI 원자료 문맥 분리 검증

2026-10-18. 기준 `main` SHA `ca5e1f690ee4a0317822500e0009af7afc321c90`, 독립 worktree `codex/after-cycle-05298aee-engineering`.

## 결과와 사용자 가치

주관식 답변의 서버 원자료 `question`을 공개 질문 문장에서 버전 미상의 중립적 주제 표지로 바꿨다. 최근 한 장면, 구형 일반 답변, v2 이관 원문이 모두 같은 요청 형식으로 들어와도 AI가 실제 물은 질문이나 반복 습관을 임의로 확정하지 않도록 analyze/editor/verifier에 같은 문맥 규칙을 적용했다. 선택·추가 질문의 기존 질문 문맥과 공개 허용 `sourceIds` 필터는 유지한다. 공개 `STORY_QUESTIONS`, `section id`, `questionId`, `questionVersion`, 저장·승인 형식은 바꾸지 않았다.

프롬프트 버전을 `profile-story-v3-8`로 올렸다. `sourceHash` 입력에는 변경된 `material`과 버전이 모두 포함되므로 이전 생성물의 캐시 경로를 재사용하지 않는다. `profile_generation_versions`와 `reserve_ai_run`의 `source_hash`/`prompt_version` 기록 구조는 그대로다.

## 검증

| 항목 | 결과 |
| --- | --- |
| `npm run typecheck` | PASS |
| `npm run check:ai` | PASS, 147개 결정적 검사. 실제 `sources()`와 `publicStory()` 구현을 AST로 추출해 실행하고 새 장면, 구형 일반 답변, 실제 `migrateInterviewV2()` 이관, 선택지만 있는 입력, 부정·희망·빈도, 비공개 선택, 악성 명령 문자열·알 수 없는 키, 공개 질문 계약과 해시 분리를 확인 |
| `npm run lint` | PASS. 첫 실행의 새 검사 코드 형식 오류를 수정하고 재실행 |
| `git diff --check` | PASS |
| Edge 런타임 검사 | 미확인. 이 worktree에는 `deno` 실행 파일이 없다. 도구가 있는 QA 환경에서 `deno check supabase/functions/compose-profile-v3/index.ts` 실행 필요 |
| 실제 LLM 출력·실회원 품질 | 미확인. 유료 호출과 실회원 자료를 사용하지 않음. 모델이 문맥 지침을 실제로 따르는지는 독립 QA와 후속 사용자 검토 대상 |

기존 `docs/beta-readiness-2026-10.md`의 베타 게이트와 실호출 미완료 상태를 바꾸지 않는다. 이 문서는 해당 날짜의 AFT-21 코드 검증만 기록하며 운영 배포 성공을 뜻하지 않는다.

## 영향과 인계

- 변경 파일: `supabase/functions/compose-profile-v3/index.ts`, `supabase/functions/_shared/profile-voice.ts`, `scripts/check-ai-quality.ts`, 이 문서.
- 스키마/RLS/권한·클라이언트 요청·공개 질문·개인정보 정책 변경 없음. 합성 문장만 검사에 사용. 외부 메시지·운영 DB 쓰기·유료 API 호출 없음.
- 롤백: 컨트롤러가 이 작업의 변경만 되돌리고 기존 프롬프트 버전 및 서버 원자료 매핑을 복원한다. 이전 캐시/기록은 삭제하지 않는다. 복원 후 동일한 타입·AI·린트 검사와 QA 회귀를 다시 수행한다.
- PR·CI·배포 SHA: 아직 없음. 컨트롤러가 커밋과 작은 PR을 만들고 정확한 head SHA의 필수 CI를 확인한 뒤 독립 QA에 넘긴다. 작성자는 출시 QA 또는 머지를 승인하지 않는다.
