# 개인 세션 기반 QA — 2026-10-26

## 범위와 격리

현재 API 기반 상담의 신뢰성 첫 이정표와 오픈 모델 연구 평가 도구를 확인했다. 기존 수동 테스트 회원·로컬 DB는 초기화하지 않았다. 별도 로컬 Supabase `after-session-qa-20261026`에 전체 migration을 적용해 합성 계정만 사용했다. 운영 플래그, 회원 데이터, 결제, 외부 발송은 변경하지 않았다. 유료 모델·이미지 API 호출은 0회다.

## 검증표

| 검증                               | 결과       | 근거                                                                                                                   |
| ---------------------------------- | ---------- | ---------------------------------------------------------------------------------------------------------------------- |
| 타입·lint·기존 순수 로직·대비·빌드 | 통과       | `npm run check`                                                                                                        |
| DB 전체 회귀                       | 통과       | 72개 파일, 1,111 assertions; 신규 s114 45개 포함                                                                       |
| 세션 경계                          | 통과       | 계정별 격리, 동일 세션/재시도, 기록 삭제·동의 철회·기억 정정·만료, 늦은 응답 차단                                      |
| 상담 통합 Chromium/WebKit          | 통과       | `test-assistant-private.mjs`; 동의, 홈/전체 대화, 재접속, pagination, 기억 승인·수정·삭제, 실패 복구, 모바일·다크 화면 |
| 고정 안내와 과거 대상              | 통과       | 비동의 FAQ·동의 대화·남성 요청 대기 18개 viewport/theme 조합; Edge/저장 호출 0, 가로 넘침·심각 접근성 오류 0           |
| 한국어 분류                        | 통과       | 일상 문장 속 ‘얼마’, 명시적 변경 부정, 사진/소개글/기본정보/복합 요청, 후기와 무단 실행 경계                           |
| 모델 문맥 출처                     | 통과(구조) | `check-assistant-context.ts`; 사용자 발언과 AI 제안 구분, 승인 기억 표시, 허용 필드만 전달                             |
| 오픈 모델 연구 도구                | 통과(도구) | 13개 Node 테스트. 예시 CLI는 사람 평가·실제 모델 증거가 없어 의도대로 `blocked`                                        |

새 세션 컬럼은 기존 RPC 인자를 바꾸지 않는 additive 변경이다. 이전 배포와의 응답 호환성을 유지하며 프런트가 세션 ID를 소유권 선택자로 보내지 않는다. 개인 기록의 DB/RPC 보관과 실제 LLM 문맥의 최근 6건 제한은 서로 다르다.

## 독립 리뷰에서 고친 점

소개글 수정 의도가 `edit_story`로 분리된 뒤, 상담 OFF·프로필 수정 ON 조합에서 요청 원문이 다음 화면에 전달되지 않는 회귀를 발견했다. 해당 경로를 복원하고 일반적인 ‘프로필 수정’은 수정 대상을 먼저 고르도록 했다.

수정 후 실제 편집기까지 이동하는 `legacy-story` 브라우저 회귀(390px 라이트)를 추가 실행했다. 원문 보존·동의 전 생성 차단을 통과했고, Edge/저장 요청과 심각 접근성 오류는 0건이다. 최종 독립 코드 리뷰는 잔여 지적 없이 승인됐다.

## 미확인·후속

- 새 프롬프트의 실제 LLM 한국어 품질과 장기간 사용자 만족도는 이 비유료 테스트로 검증하지 않았다. 구조 검사 통과를 의미적 품질 보장으로 표시하지 않는다.
- 실기기 키보드·스크린리더·앱 백그라운드 복귀는 이번 데스크톱 브라우저 실행의 범위 밖이다.
- 과거 말풍선의 정확한 업무/상대 고정 참조는 후속이다. 현재는 과거 메시지를 새 상대에 재연결하지 않고 일반 목록으로 안내한다.
- 상대 접근 재검사 경합, provider 실패/비용 정산 통일, 전역 예산 예약, 추가 동의/고지 검토는 V2 로드맵 B의 잔여 범위다.
- 연구 사례 6개는 직접 작성한 개발 fixture다. 오픈 모델 실행·학습·독립 holdout·블라인드 품질 비교·실측 비용 비교는 아직 하지 않았다.
- 구형 `eclps.kr` 도메인 때문에 이전 배포가 부분 실패한 상태는 별도 유지 여부 결정이 필요하다. 이 QA 통과만으로 운영 배포 완료나 비서 활성화를 선언하지 않는다.

## 재현

```sh
npm run check
npx supabase test db --workdir <isolated-local-project>
AFTER_SUPABASE_WORKDIR=<isolated-local-project> npm run test:assistant-private
AFTER_SUPABASE_WORKDIR=<isolated-local-project> AFTER_TEST_BROWSER=webkit npm run test:assistant-private
AFTER_CONCIERGE_BASE=http://127.0.0.1:5198 AFTER_CONCIERGE_SCREENS=assistant-no-consent,assistant-chat,intro-pending node scripts/test-concierge-surfaces.mjs
npm run check:research
```

브라우저 private 검사 전 격리 프로젝트의 `assistant-chat` Edge를 API 키 없이 실행한다. `AFTER_LOCAL_AI_CONFIRM`은 설정하지 않는다. 테스트가 사용하는 설정은 격리 DB에만 일시 적용하고 종료 시 원래 값으로 복구한다.
