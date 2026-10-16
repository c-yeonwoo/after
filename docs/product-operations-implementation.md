# 애프터 제품과 운영 개편 기술 설계 및 구현 계획

2026-10-16 · **설계안, 코드 구현 전** · 기준 `ae77e1e`

관련 문서: [제품 설계](./product-operations-design.md), [운영 콘솔](./operations-console-spec.md).

## 1. 아키텍처 결정

TanStack Start/React, Supabase Postgres/RPC/Edge Functions, 기존 cron·notifications와 웹 전용 어드민을 유지한다. 새 운영 시스템을 별도 백엔드로 만들지 않는다. 외부 워크플로 도구는 홍보 콘텐츠 같은 비핵심 업무에만 사용하고, 매칭·티켓·제재의 상태를 소유하지 않는다.

```text
회원 UI / 어드민
    ↓ 인증된 요청, 요청 ID, 기대 버전
권한 확인 + 도메인 RPC
    ↓ 한 DB 트랜잭션
원본 상태 + 감사 기록 + 신뢰 가능한 도메인 이벤트 + 발송 요청
    ├→ 운영 조회 RPC → 홈 / 작업함 / 회원 상세 / 지표
    └→ 예약 워커 → 원본 상태 재확인 → 외부 호출 → 결과 기록
                    └ 실패/불명/기한 초과 → 운영 작업 생성
```

거래·소개 상태는 기존 테이블이 권위다. 작업 상태·대시보드 숫자를 바꿔 도메인 문제를 해결하지 않는다. 사용자 분석용 `events`와 돈·권한의 근거를 분리하고, 클라이언트가 신뢰 이벤트를 삽입할 수 없게 한다.

### 권한

새 운영 테이블은 기본 직접 접근 금지, RLS 활성화, `anon/authenticated` grants 명시 회수. 필요한 RPC만 grant하고 함수 내부에서 admin 검사. `SECURITY DEFINER`에는 고정 search_path와 명시적 스키마를 적용한다. `service_role`은 서버 전용이며 임의 대상 ID만으로 권한을 대신하지 않는다. 이는 Supabase의 [RLS](https://supabase.com/docs/guides/database/postgres/row-level-security) 및 [함수 권한](https://supabase.com/docs/guides/database/functions) 원칙에 따른다.

운영자 MFA는 역할 검사와 별도다. 민감 조치 시 서버에서 강화 인증 상태를 확인한다. 역할 변경·결제 켜기·제재·고객정보 내보내기는 강화 인증 없으면 거절한다. 1인 운영자 복구 수단 검증 후 강제한다. 권한 종류를 세분화하는 다인 조직 RBAC는 P2로 미룬다.

## 2. 상태와 자격의 단일 기준

### 2.1 소개 자격

새 내부 함수 `member_readiness(p_user)`는 호출자 기반 `my_hub_id()`와 분리하여 다음 이유 코드를 반환한다.

`account_inactive`, `paused`, `profile_incomplete`, `work_email_unverified`, `phone_unverified`, `adult_unverified`, `photos_missing`, `photos_pending`, `photos_rejected`, `policy_required`.

회원 자신의 조회 RPC는 자기 이유만 공개한다. 관리자 조회는 allowlist 항목만 반환한다. 내부 함수는 Data API에서 일반 회원이 임의 ID로 호출할 수 없게 한다. 후보 선택은 준비 상태에 동일 권역·관계별 호감·제외·활성 소개 조건을 더한 `pair_eligibility`를 사용한다. 남성 후보 노출용의 현재 `profile_candidate_ready()`를 여성 판정에 그대로 재사용하지 않는다.

자격은 “필수 입력 있음”, “확인된 사실”, “참여 가능 계정”을 구분한다. 기존 `onboarding_step`은 호환 유지하되 step만으로 통과시키지 않는다. `eligible_profiles`, `next_candidate`, `admin_like_pool`, 큐레이션 집계, `open_intro`, 신규 약속 생성 및 지표를 같은 기준으로 대조한다. 클라이언트의 홈 문구만 고치고 DB 권한을 그대로 두는 구현은 금지한다.

### 2.2 사용자 상태 응답

`home_state_v2()`의 제안 반환 계약:

| 필드                                | 의미                                           |
| ----------------------------------- | ---------------------------------------------- |
| `schema_version`, `as_of`           | 응답 형식과 서버 기준시각                      |
| `primary_state`                     | 화면의 주 상태. 기존 원본 컬럼에서 파생        |
| `readiness`                         | 자기 자격 상태·이유 코드                       |
| `next_action`                       | 허용된 행동 enum과 대상 ID; 임의 HTML/URL 금지 |
| `deadline_at`                       | 실제 서버 기한, 없으면 null                    |
| `intro`, `meeting`, `request_count` | 해당 권한 범위의 필요한 데이터                 |
| `ticket_summary`                    | 만료·취소 잠금을 제외한 가용 티켓, 정책 참조   |
| `notice`                            | 재동의/장애 등의 구조화된 안내 코드            |

화면은 상태를 다시 추론하지 않고 코드→짧은 문구/컴포넌트를 매핑한다. 다만 이미 받은 데이터에 대한 카운트다운 표시는 클라이언트가 할 수 있고, 행동 가능 여부는 실행 시 서버에서 다시 검사한다. 서버 시각 보정과 기한 도달 재조회로 기기 시계 오차를 줄인다.

## 3. 핵심 불변식

| ID  | 항상 성립할 조건                                                       | 검증 위치                          |
| --- | ---------------------------------------------------------------------- | ---------------------------------- |
| I01 | 가입 완료와 소개 자격을 혼동하지 않음                                  | readiness + 모든 입구 RPC          |
| I02 | 차단·탈퇴·휴식·부적격 회원은 새 소개/노출에 들어가지 않음              | 후보/큐/열람 시점 재검증           |
| I03 | 남성 소개는 유효한 여성 호감·운영자 검토 경로를 거침                   | 큐 저장 및 열람 RPC                |
| I04 | 조회·재시도 때문에 티켓이 추가 차감되지 않음                           | 원자 차감, 요청 ID, 기존 결과 반환 |
| I05 | 주문 확정과 수량만큼 발급은 원자적, 취소 예약 티켓은 사용 불가         | 기존 s43 보존·확장 테스트          |
| I06 | 만남 불발 반환은 같은 사유의 같은 원 티켓당 중복 발급 안 함            | 반환 계보 unique + 트랜잭션        |
| I07 | 반환 티켓은 원 만료일과 기존 무료 예외를 유지                          | 서버 정책 및 티켓 화면             |
| I08 | 약속 수락 시 슬롯 유효성·양측 일정 충돌·자격을 재확인                  | 관련 회원 일정 잠금 후 수락        |
| I09 | 변경/취소/차단 이후 지난 상태의 알림을 새로 보내지 않음                | 전송 직전 상태 검사                |
| I10 | 자동화 실패나 원본 미확인을 정상/0건으로 표시하지 않음                 | 워커 결과와 조회/UI 계약           |
| I11 | 작업의 해결은 원본 상태와 일치, 작업 보류가 업무 기한을 지우지 않음    | case 전이 RPC                      |
| I12 | AI는 회원 미확인 내용을 자동 공개하거나 근거 없는 사실을 추가하지 않음 | 초안 저장/검증/승인                |
| I13 | 계정 탈퇴가 새 운영 기록·캐시에도 전파됨                               | 삭제 이벤트와 purge 검증           |
| I14 | 화면 숨김이 아니라 서버 권한으로 어드민 접근 차단                      | RPC·RLS·뷰·Edge 테스트             |
| I15 | 주요 업무 수치는 목록과 동일한 조건, 처리 기간/표본이 명시됨           | 공통 SQL 기반 조회                 |

I08의 충돌 범위는 **확정된 약속의 시작부터 90분**을 초기 제안으로 두고 설정 가능하게 한다. 이미 확정된 약속의 적용 범위는 생성 당시 정책 버전을 보존한다. 90분을 사용자에게 실제 데이트 소요시간으로 약속하지 않는다. 정책 승인 전에는 기존 동시간 충돌 검증 강화만 구현하고 광범위한 시간 예약 제한은 OFF다.

## 4. 데이터 확장

이름은 제안 계약이다. 기존 테이블의 같은 역할을 먼저 재사용하고, 구현 시 최신 마이그레이션과 중복 여부를 확인한다. 임의 JSON을 실행 규칙으로 받지 않는다.

### 4.1 P0 핵심 테이블

| 모델                           | 주요 필드                                                                                                                                                      | 제약/소유                                                                                  |
| ------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------ |
| `ops_cases` 신규               | id, type, source_type/id, subject_id, occurrence, priority, status, opened_at, due_at, next_check_at, source_revision, resolved_at, resolution_code, version   | 문제 키별 active case 하나. 회원 삭제에 최소 메타데이터만 보존 가능하도록 분리             |
| `ops_case_events` 신규         | case_id, event_type, actor_type/id, from/to_state, reason_code, note, at, request_id                                                                           | append-only 작업 이력. 원문 프로필/신고 내용을 복제하지 않음                               |
| `automation_rules` 신규        | key, mode, version, bounded_config, daily_limit, paused_reason, updated_by/at                                                                                  | 허용 rule key만, config schema와 범위 검증                                                 |
| `automation_runs` 신규         | rule/version, source_ref/revision, dedupe_key, status, due_at, next_attempt_at, attempts, lease_until, lease_token, approval_hash, approved_by/at, result_code | unique dedupe_key. 상태 pending/approval_required/running/succeeded/skipped/failed/unknown |
| `domain_events` 신규           | event_type, aggregate_type/id, subject_ref, occurred_at, source_version, dedupe_key, allowlisted_props                                                         | 서버만 삽입하는 신뢰 사건. 미래 코호트 분석 원본, 비밀/자유 원문 제외                      |
| `notification_deliveries` 신규 | notification_id, channel, recipient_ref, status, provider_ref, attempt, lease, next_attempt_at, last_error_code, submitted_at                                  | 알림 하나의 채널별 상태. 토큰·메일 원문 대신 참조, 유일 delivery key                       |

`ops_case_events`는 업무 처리 이력, `domain_events`는 실제 서비스 전이 이력이다. 하나의 완료 건을 서로 다른 지표로 중복 합산하지 않는다. `admin_actions`는 기존 감사 기록을 유지하고 새로운 case_id/request_id 및 필요한 action kind를 추가해 연결한다. 금전·제재 조치는 도메인 변경과 감사 기록을 한 트랜잭션으로 남긴다.

`automation_runs`가 예약·lease·실행 결과의 단일 원장이다. 별도 범용 잡큐 테이블을 만들지 않는다. 기존 cron은 이 큐를 깨우는 역할이며 기존 도메인 만료 함수는 그대로 호출 가능하다.

### 4.2 기존 모델 보강

- `profiles`: 도메인용 revision과 자격 전이 이벤트. 이미 존재하는 `updated_at`만으로 모든 변경 충돌을 판단하지 않는다.
- `intro_queue`: 삭제/만료 전 서버 이벤트를 남겨 전송·열람·만료 코호트 이력 보존. 과거 삭제 이력을 추측해 복원하지 않는다.
- `ticket_orders`: 승인/취소 시도 추적, 결과 미상과 마지막 대사 시각. payment_key 등은 안전한 서버 경로에만 저장하고 일반 ops payload에 복제하지 않음.
- `tickets`: 기존 `restored_from_ticket_id` unique 계보와 `refund_ticket()`을 재사용한다. 같은 원 티켓에서 대체 티켓이 한 번만 발급되는 제약을 유지하고, 서비스 반환과 현금 취소를 구분해 표시한다. 별도 반환 원장을 중복 생성하지 않는다.
- `notifications`: 기존 인앱 원본 유지. `sent_at`의 의미를 새 전달 상태와 호환 매핑하고 새 화면에서는 발송 성공 지표로 사용하지 않음.
- `support_requests`: P0는 정확한 count, 필터, 답변 알림·감사, 버전 충돌. P1에서 `support_messages`와 후속 대화 상태로 확장.
- `ai_runs`: request_id, source_hash, cached 여부, error code, 비용 기준 버전 등 원문 없는 계측 확장.
- 정책 동의: 신규 정책 카탈로그와 append-only 동의 이력. 기존 동의 시각·버전은 legacy record로 보존하고 새로 동의한 것으로 소급하지 않음.

### 4.3 P1 데이터

AI 초안 보관 `ai_artifacts`는 private 저장, 사용자/운영자 승인·source revision·만료를 포함한다. 회원에게 승인받아 게시한 프로필은 기존 `profiles`가 원본이다. 캐시는 개인정보이며 삭제 대상이다. 영구 원문 캐시를 비용 절감 수단으로 삼지 않는다.

초안 캐시 기본 TTL 7일, 비식별 실행 상세 90일은 기술 기본 제안이다. 법정 거래/신고 증빙 보관과 섞지 않고, 정책 검토·승인 전에 새 장기 보관을 시작하지 않는다. 탈퇴 시 일반 cache/메모/문의는 삭제하고, 유지 근거가 필요한 증빙은 별도 제한 저장소·보관정책으로 관리한다.

### 4.4 인덱스와 과거 데이터

- 작업: `(status, priority, due_at, id)`, `(subject_id, opened_at desc, id)`, active 문제 키 partial unique.
- 실행: `(status, next_attempt_at, id)`, unique dedupe_key, `(rule_key, created_at desc)`.
- 이벤트: `(event_type, occurred_at, id)`, `(aggregate_type, aggregate_id, occurred_at)`.
- 전달: `(status, next_attempt_at, id)`, unique logical delivery key.
- 테이블 크기·쿼리 계획을 측정 후 추가 인덱스 결정. 초기 규모에 파티셔닝/외부 검색엔진을 넣지 않음.

최초 backfill은 **현재 살아 있는 문제만** dry-run→upsert한다. 모든 과거 AI 실패·종료된 문의를 새 긴급 건으로 만들지 않는다. 과거 사건이 없는 지표는 “계측 시작 전, 데이터 없음”으로 표시하고 가입 시각으로 자격 시각을 지어내지 않는다.

## 5. 조회·명령 API 계약

| API 제안                         | 입력                                                  | 핵심 결과/조건                                           |
| -------------------------------- | ----------------------------------------------------- | -------------------------------------------------------- |
| `my_readiness()`                 | 없음                                                  | 본인 자격, blocker, as_of                                |
| `home_state_v2()`                | 없음                                                  | §2.2 계약, 서버 권한 범위                                |
| `admin_ops_overview()`           | hub, period                                           | 작업별 exact count, 위험·freshness, as_of                |
| `admin_ops_cases()`              | 필터, cursor, limit ≤ 50                              | items, total, next_cursor, as_of                         |
| `admin_ops_case_detail()`        | case_id                                               | 근거 참조, 이력, 허용 actions, version                   |
| `admin_transition_case()`        | case_id, action, expected_version, reason, request_id | 최신 case 또는 충돌; 도메인 완료 가장 금지               |
| 기존 도메인 action 확장          | 대상, expected_version, reason, request_id            | 원본 변경+감사+event+case 갱신 원자 처리                 |
| `admin_member_timeline()`        | user_id, cursor, categories                           | allowlist events, 관련 객체 링크                         |
| `admin_automation_preview()`     | rule/version, 범위                                    | 대상·효과·비용 상한·expires_at·hash                      |
| `admin_approve_automation()`     | preview_id/hash, reason, request_id                   | 변경 없는 대상만 실행 예약; 바뀐 대상은 skipped          |
| `admin_update_automation_rule()` | key, expected_version, config, reason                 | 버전 증가·감사. 금지된 auto 모드 거절                    |
| `admin_marketplace_health_v2()`  | hub, cohort, period                                   | 정의된 모집단·분모·표본·coverage                         |
| 결제 대사 Edge                   | 주문 ID, 운영자 인증/권한                             | 공급자 읽기→일치 검증→기존 완료 RPC. 임의 현금 취소 금지 |

모든 입력은 enum/range/길이/소유권 검증한다. 검색은 파라미터 바인딩, 임의 SQL/함수명 실행 금지. 일반 회원은 admin RPC를 호출해도 42501/403으로 거절한다.

조회의 `items`와 `total`은 같은 호출 스냅샷에서 같은 조건으로 계산한다. 페이지가 넘어가는 사이 상태가 변할 수 있으므로 `as_of`와 정렬 커서로 일관성을 설명하고 새로고침 시 갱신한다. 서로 다른 호출을 영구 고정 스냅샷처럼 표현하지 않는다. count를 목록의 length로 대체하지 않는다.

충돌은 구조화된 코드(`stale_version`, `already_resolved`, `eligibility_changed`, `approval_expired`, `provider_unknown`)로 반환한다. 재시도 가능/불가능을 UI가 구분하고, 성공인지 불명인 금전 요청은 새 주문 생성 버튼 대신 상태 확인 경로를 보여준다.

## 6. 자동화 실행과 멱등성

1. 원본 사건/주기 점검으로 deterministic key를 생성한다: 규칙 + 대상 + 발생 회차 + 정책 버전.
2. 동일 active 문제는 upsert. 전이 이벤트에 기반한 적재와 주기적 reconciliation을 병행해 누락 복구.
3. worker가 짧은 DB 트랜잭션에서 실행을 claim하고 lease token을 발급한다. 외부 호출 동안 DB 잠금을 유지하지 않는다.
4. 실행 직전 계정·동의·권한·기한·source revision·규칙 중지 여부를 확인한다. 승인 이후 변경되면 skipped, 승인 재사용 금지.
5. 외부 호출은 timeout, 지원되는 provider idempotency key, backoff를 사용한다. 결과 기록은 lease token과 현재 버전이 일치할 때만 허용한다.
6. 실패 상한에 도달하면 작업함으로 보내고 더 이상 무한 재시도하지 않는다. timeout은 실패 확정이 아니라 unknown일 수 있다.
7. lease 만료는 재claim 가능하되 금전/전송 결과 미상은 먼저 provider 조회나 운영자 대사로 처리한다.

큐 claim에 `FOR UPDATE SKIP LOCKED`를 사용할 수 있으나, 이것을 지표/일반 사용자 조회의 일관성 수단으로 쓰지 않는다. PostgreSQL은 이를 여러 소비자의 큐 경합 회피 용도로 설명한다. [PostgreSQL SELECT](https://www.postgresql.org/docs/17/sql-select.html)

동시 일정 확정은 양측 사용자 ID 정렬 순으로 잠그고 일정 겹침을 검사한다. 단순히 meeting 한 행만 잠그면 서로 다른 meeting의 동일 사용자 충돌을 막지 못한다. 데드락을 줄이도록 모든 관련 함수의 잠금 순서를 고정하고 재시도 가능한 충돌을 반환한다.

외부 공급자에 대한 exactly-once는 보장하지 않는다. 내부 상태 전이는 요청 ID와 unique constraint로 멱등하게, 외부 side effect는 중복 억제·결과 대사·사용자 영향 최소화로 설계한다.

## 7. 관측·분석 계약

신뢰 가능한 이벤트 초안: `member_became_ready`, `member_became_unready`, `candidate_shown`, `affinity_recorded`, `intro_delivered`, `intro_opened`, `intro_expired`, `meeting_requested`, `meeting_confirmed`, `meeting_canceled`, `meeting_outcome_recorded`, `ticket_issued`, `ticket_consumed`, `ticket_restored`, `payment_reconciled`, `case_resolved`.

서버 발생시각 UTC, 화면 KST. 권역·기수는 사건 당시 값을 기록하고 뒤의 회원 상태 변화로 과거 분모를 바꾸지 않는다. 개인정보가 필요한 연결키와 집계 데이터는 분리하며 삭제 후 재식별 가능성이 남는 pseudonymous 데이터도 개인정보로 취급한다.

노출은 조회 부작용/화면 실제 표시의 정의를 일치시킨다. 현재 `next_candidate()`의 impression이 실제 봄을 완전히 의미한다고 단정하지 않는다. 초기 이벤트명은 “후보 제공”과 “화면 표시 확인”을 나눠 계측하고, 재시도·prefetch 중복을 제거한다.

기본 대시보드 성능 목표: 1만 건 합성 운영 이벤트·1천 회원에서 첫 목록 2초 내 표시, API p95 1초 내를 초기 측정 목표로 둔다. 현재 성능 보증은 아니다. 브라우저에서 전체 회원·전체 이벤트를 내려받아 집계하지 않는다. 필요해질 때만 주기적 rollup을 추가한다.

## 8. 구현 PR 순서

설계 승인 후 아래 단위로 구현한다. PR마다 테스트·리뷰·커밋·push·merge를 수행하되 외부 미준비 기능은 OFF 상태로 배포한다. 문서 작성 단계에서는 아래 작업을 실행하지 않는다.

| 순서     | 범위 / 주요 파일                                                                                                  | 선행      | 완료 조건                                                    |
| -------- | ----------------------------------------------------------------------------------------------------------------- | --------- | ------------------------------------------------------------ |
| PR-01 P0 | 자격/운영 집계 통일, count 정확화, 오류·stale UI. `src/lib/admin.ts`, `admin.index`, `admin.system`, 새 SQL/tests | 없음      | F01~F04/F06 재현 테스트 통과, 같은 필터의 count/목록 일치    |
| PR-02 P0 | 서버 상태 계약과 홈·가입·인증·소개·요청 문구 연결. `home`, `signup`, `intro`, `requests`, `api`, 새 RPC           | 01        | 미완료/검수/공급 부족/휴식/오류를 구분, 기존 흐름 회귀 없음  |
| PR-03 P0 | 원자 전이·권한·일정 충돌·거래 결과 미상 경로 강화, MFA 준비/강제 단계                                             | 01        | 동시성 및 anon/member/admin 권한 매트릭스, 금전 재시도 검증  |
| PR-04 P0 | domain events, ops cases/events, 통합 조회·회원 타임라인, 기존 admin_actions 연결                                 | 01,03     | 중복 없는 작업·보류 복귀·해결 검증, 과거 데이터 dry-run      |
| PR-05 P0 | 어드민 IA·홈·작업 상세·회원·큐레이션 연결. `src/components/admin`, `admin.*`                                      | 04        | 운영 리허설 일반 업무를 SQL 없이 수행                        |
| PR-06 P0 | notifications 전달 상태, claim/lease, freshness·heartbeat, 제한적 retry                                           | 03,04     | 채널 없음/공급자 접수/읽음 분리, 동시 워커·장애 주입 통과    |
| PR-07 P0 | 규칙 모드·preview/승인·상한·중지, 사용자/운영자 알림 선택형 배선                                                  | 04,06     | 관찰 모드 결과 대조, 승인 만료·철회·탈퇴·취소 후 발송 방지   |
| PR-08 P0 | 수급·성과 v2, 코호트/현재 대기/완료 표본·운영 시간, 정책 버전·재동의                                              | 02,04     | 표본 부족/legacy/미완료를 정직하게 표시, 권리 행사 경로 유지 |
| PR-09 P0 | AI 원문 근거·쿼터 예약·실패 대체·평가셋, 공개 전 승인 연결                                                        | 02,03     | 인젝션/사실 창작/동시 호출/입력 변경 검증                    |
| PR-10 P0 | 통합 E2E·접근성·실기기·운영 리허설·릴리스 증빙                                                                    | 05~09     | §9와 §10 통과, 남녀·운영자 한 사이클 증빙                    |
| PR-11 P1 | 문의 후속 대화·FAQ 보조, AI cache/feedback, 주간 단위 경제·배포 관측 연동                                         | 베타 관측 | 실제 반복 업무 시간 감소 확인                                |

PR-01~~03은 기초 신뢰성, PR-04~~07은 1인 운영, PR-08~10은 성과/품질 및 출시 검증 묶음이다. 기반이 검증되기 전 자동화부터 켜지 않는다. 코드 양을 줄이기 위해 읽기 모델·기존 컴포넌트·명령 RPC를 재사용하고, 새 일반화 프레임워크를 만들지 않는다.

외부 계약·법률·운영 채널 선택은 개발과 병행할 수 있지만 완료되지 않은 게이트를 우회해 유료 공개 출시하지 않는다. 자동 배포 CI 시크릿 복구는 별도 운영 작업이며, 테스트 통과와 배포 반영 확인을 구분한다.

## 9. 테스트 매트릭스

기존 `npm run check`, `npm run build:app`, `supabase/tests`를 유지한다. 추가 테스트는 합성 로컬 데이터로 격리하고 운영 DB seed/reset을 금지한다. 새 브라우저 E2E를 릴리스 게이트에 추가하며, 현재 테스트가 모든 시나리오를 검증한다고 가정하지 않는다.

| 묶음        | 필수 사례                                                                                                                             |
| ----------- | ------------------------------------------------------------------------------------------------------------------------------------- |
| 자격        | 사진 2/3장, 검수 pending/rejected, 휴대폰 미인증, 성인 플래그 ON/OFF, 휴식/정지/탈퇴, 재동의 필요, 남녀·권역별 판정                   |
| 사용자 상태 | 각 blocker와 진행 중 약속의 조합, 여러 요청, 지연/오류/null, 재로그인·뒤로가기·중복 탭, 홈 조회 무차감                                |
| 큐레이션    | 저장 중 후보 변경/차단, 호감 없음, 다른 권역, 같은 페어 중복, 오래된 reason/AI 초안, 전달 3장 정책 유지                               |
| 티켓        | 중복 열람/요청 동시 실행, 만료 경계 KST, 무료 legacy, 반환 재시도, 동일 원 만료일, 취소 잠금 중 사용                                  |
| 결제        | provider 성공 후 DB 실패, timeout, 4xx/429/5xx, 승인/취소 재시도, 주문 소유 불일치, 금액 불일치, canceling 대사                       |
| 약속        | 같은 회원의 서로 다른 요청 동시 수락, 지난 슬롯, 비활성 장소, 변경/취소와 수락 경합, 응답 기한 경계                                   |
| 작업함      | 같은 사건 10회 감지→1 active case, 보류 후 복귀, source 해결/재발, 완료 위장 거절, 버전 충돌, 201건 문의 count/페이지                 |
| 알림        | 두 worker 동시 claim, 공급자 접수 직후 crash, lease 만료, 탈퇴/차단/취소 후 retry, 기기 없음, APNs 설정 없음, token 만료, 연락처 철회 |
| 자동화      | 관찰은 side effect 0, 승인 후 입력 변경, 승인 TTL, rule pause 경쟁, 일일 상한/빈도, 무한 재시도 차단, worker 실패와 cron 성공 구분    |
| AI          | 형식 38건 유지 + 원문 불일치, 인젝션, 자유입력 PII, cache stale, 동시 quota, 타임아웃/거절, 직접 작성, 승인 없는 공개 금지            |
| 안전/권한   | anon/회원/정지/탈퇴/admin/worker 전 API 매트릭스, 다른 회원 ID 추측, 감사 로그 변조, MFA 우회, webhook/worker 인증                    |
| 개인정보    | 탈퇴→메모/초안/문의 삭제, pending evidence 분리, 로그 redaction, 삭제 후 재전송·캐시 조회 차단                                        |
| 지표        | 0/null/오류, 미완료/탈퇴 포함 기수, 권역 필터, 과거 데이터 미확인, 같은 분모와 기간, 스냅샷·목록 변화                                 |
| UI          | 360/390/768/1440 폭, 다크·라이트, 키보드 focus, 확대 200%, 긴 이름·오류·빈 데이터, 부분 실패, 주요 대비 검사                          |

각 이슈는 실패하는 회귀 테스트부터 작성한다. SQL 트랜잭션 테스트만으로 실제 두 연결의 경합을 검증했다고 보지 않고, 동시성 harness에서 별도 연결로 실행한다. 제공자 테스트 더블과 실제 샌드박스 검증을 구분해 결과를 남긴다.

## 10. 롤아웃과 출시 게이트

### 단계

1. 로컬 DB: 새 마이그레이션 fresh install + 기존 seed 업그레이드 둘 다 테스트.
2. staging 또는 별도 테스트 프로젝트: 합성 데이터로 남성/여성/운영자 시나리오. 독립 환경 없으면 외부 호출 OFF인 로컬까지 진행하고 운영 데이터로 대체하지 않음.
3. additive schema→이전 클라이언트 호환 RPC→새 조회/UI 순서. 기존 API는 호환기간 유지.
4. 작업함 backfill dry-run, 개수/이유 비교 후 제한 적용. 신규 자동화 observe 상태 배포.
5. 최소 48시간 관찰 + 의도적으로 만든 실패 시나리오를 통과한 규칙만 approval로 전환. 실제 관측 0건은 성공 증거가 아님.
6. 반복 저위험 규칙만 상한을 두고 auto. 자동화 결과를 수기 표본 대조.
7. 운영자 단독 리허설 및 타깃 사용자 과업 확인 후 제한 베타. 결제·인증·법률 게이트 완료 후 유료 전환 판단.

### 중단/복구

새 기능은 플래그로 꺼서 구 화면/수기 처리로 돌아갈 수 있게 한다. 플래그 OFF가 이미 발급한 티켓·확정 약속·감사 기록을 삭제하면 안 된다. DB rollback을 위해 테이블 drop/대량 restore를 기본 수단으로 쓰지 않는다. 잘못된 상태는 감사 가능한 보상 전이로 복구한다.

결제 결과 미상 증가, 중복 발급/외부 발송, 무권한 노출, 미성년 게이트 우회는 즉시 해당 기능 중단 기준이다. 중요한 오류를 고치지 못한 상태에서는 광고 확대를 멈추도록 운영 경보를 내되 광고 계정을 자동 변경하지 않는다.

### 출시 체크

- [ ] PR-01~10의 범위별 테스트/리뷰/검증 증빙 연결
- [ ] CI 통과뿐 아니라 실제 배포 커밋·DB 마이그레이션·함수 버전 확인
- [ ] 운영자 강화 인증 및 유일 계정 복구 수단 확인
- [ ] 실제 인증 공급자 계약·LIVE 결과·취소/미성년/중복/복귀 검증
- [ ] 결제 실사용 활성화 전 PG 심사·샌드박스 승인/취소/결과 미상 대사 확인
- [ ] 정책·수집·위탁·삭제·재동의 검토와 현재 화면 일치
- [ ] 웹 사용자 연락 경로와 중요 알림 실제 수신 테스트; 채널 부재를 정상으로 숨기지 않음
- [ ] 1인 운영 가능한 모집량·운영시간·혜택·내부 SLA 설정
- [ ] 남녀·운영자 전체 흐름 및 신고/취소/공급 부족 리허설
- [ ] 신규 기능 OFF·자동화 중지·수기 복구 절차 실습

무료 베타라고 안전·개인정보·허위 고지의 검증을 생략하지 않는다. 외부 항목이 미완료이면 내부/허가된 테스트 범위와 공개 모집 범위를 분리해 판단한다.

## 11. 도구 적용 범위

이번 설계에는 설치된 Emil 디자인 기준과 모바일 기준을 반영했고, 코드/마이그레이션을 직접 대조했다. 다음 여섯 도구는 아직 설치·실행한 것으로 간주하지 않는다.

- gstack: 구현 중 제품/설계 체크와 읽기 전용 QA에 우선 검토. 자동 수정 전에 테스트 범위 확정.
- understand-anything: 인증·프로필·소개·티켓·운영 경로로 범위를 제한해 구조 추적에 사용 검토.
- ui-ux-pro-max: 정한 디자인 토큰을 유지하는 접근성·레이아웃 체크리스트 보조.
- taste-skill: 기존 화면 개선 부분만 선택. 전체 브랜드 재생성은 하지 않음.
- korean-privacy-terms: 실제 데이터 목록 기반 문서 검토 보조. 프레임워크 설치 코드를 현재 TanStack 앱에 그대로 적용하지 않음.
- LazyCodex: 이번 제품 개편과 별개의 개발 환경 변경이므로 보류.

설치할 때는 원본·라이선스·버전·실행 스크립트·외부 전송·권한 변경을 확인한다. 운영 시크릿·회원 원문을 넘기지 않는다. 도구 실행 완료가 제품 테스트나 법률 검토의 완료를 대신하지 않는다.
