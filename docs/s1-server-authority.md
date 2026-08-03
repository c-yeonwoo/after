# S1 — 서버 권위 설계 (스키마 · RLS · 부정 테스트)

> 상태: **검증 완료 (실제 Supabase + 엔드투엔드 스모크)** · 2026-07-31 · 기준: [`prd-after-mvp.md`](./prd-after-mvp.md)
> 이 문서와 함께 있는 마이그레이션 3개 + 테스트 1개가 **S2~S4 구현의 스펙**이다.

## 왜 이게 1번인가

진단에서 유료 게이트가 **두 경로로 뚫리는 것을 라이브로 재현**했다.

| 우회로                                         | 원인                                                             | S1이 닫는 방법                                                                             |
| ---------------------------------------------- | ---------------------------------------------------------------- | ------------------------------------------------------------------------------------------ |
| `/chat/hana` 직접 진입으로 대화방 열림         | `chatOpen`이 5개 파일에서 검사되는데 `chat.$id.tsx`에서만 빠졌다 | `messages` 정책이 `is_channel_open()`을 요구한다. **라우트가 잊어도 DB가 거부한다**        |
| 남성이 여성 전용 `/prefs`를 제출해 게이트를 켬 | 역할 검사가 없다                                                 | `meetings`에 클라이언트 UPDATE 권한이 **없다**. `submit_meeting_prefs()`가 성별을 검사한다 |

UI를 먼저 만들면 이 검사가 또 빠진다. **그래서 W1은 화면이 아니라 RLS다.**

## 산출물

| 파일                                                  | 내용                              |
| ----------------------------------------------------- | --------------------------------- |
| `supabase/migrations/20260731120000_s1_schema.sql`    | 타입·테이블·인덱스                |
| `supabase/migrations/20260731120100_s1_functions.sql` | 서버 권위 함수 (SECURITY DEFINER) |
| `supabase/migrations/20260731120200_s1_rls.sql`       | 컬럼 권한 + RLS 정책              |
| `supabase/tests/s1_negative.sql`                      | 부정 테스트 14개 (pgTAP)          |

---

## 연산별 권위 표

**핵심 규칙: 정책이 없는 연산은 불가능하다.** 아래 "정책 없음"은 누락이 아니라 설계다.

| 대상               | SELECT                 | INSERT                 | UPDATE                | DELETE        | 변경 경로                                                                              |
| ------------------ | ---------------------- | ---------------------- | --------------------- | ------------- | -------------------------------------------------------------------------------------- |
| `profiles`         | 본인 + 상대/평가대상   | 본인                   | **컬럼 화이트리스트** | ✗             | `gender`·`hub_id`·`email_verified_at`·`account_state`는 UPDATE 권한 자체가 없다        |
| `affinities`       | 본인이 준 것           | **여성만** (D2)        | ✗                     | ✗             | 평가는 되돌릴 수 없다                                                                  |
| `intro_exclusions` | 본인 포함 건           | **정책 없음**          | **정책 없음**         | **정책 없음** | `exclude_pair()` — append-only                                                         |
| `intros`           | 당사자                 | **정책 없음**          | **정책 없음**         | **정책 없음** | `open_intro()` / `pass_intro()` / `mark_met()`                                         |
| **`tickets`**      | 본인 것                | **정책 없음**          | **정책 없음**         | **정책 없음** | 발급 `issue_ticket()`(웹훅) · 차감 `use_meeting_ticket()` · 환불 `refund_ticket()`(잡) |
| `meetings`         | 당사자                 | **정책 없음**          | **정책 없음**         | **정책 없음** | `use_meeting_ticket()` / `submit_meeting_prefs()` / `confirm_meeting()` / `mark_met()` |
| `messages`         | 당사자 **∧ 채널 오픈** | 당사자 **∧ 채널 오픈** | ✗                     | ✗             | 게이트를 RLS가 판정                                                                    |
| `feedbacks`        | **본인 것만**          | 당사자·확정된 만남     | ✗                     | ✗             | 상대에게 공개되지 않는다 (F9)                                                          |
| `no_show_reports`  | 관련자                 | 당사자                 | **정책 없음**         | ✗             | 판정은 서버. 단일 신고로 제명하지 않는다 (P4)                                          |
| `events`           | **정책 없음**          | 본인                   | ✗                     | ✗             | 쓰기 전용. 분석은 `service_role`                                                       |

### 불변식이 어디서 강제되는가

| 불변식                                 | 강제 수단                                                        |
| -------------------------------------- | ---------------------------------------------------------------- |
| 남성 소개 대상 ⊆ 그에게 호감을 준 여성 | `open_intro()`가 서버에서 계산. `intros`에 INSERT 정책 없음      |
| 동시 오픈 소개 ≤ 1                     | 부분 유니크 인덱스 `intros_one_open_per_male`                    |
| 티켓 차감 원자성                       | `SELECT … FOR UPDATE SKIP LOCKED` + 단일 트랜잭션 상태전이       |
| 결제 멱등                              | 부분 유니크 인덱스 `tickets_payment_idempotent` (`payment_id`)   |
| pass한 쌍 영구 배제 (P1)               | `intro_exclusions` append-only + 쌍 정규화 (`user_lo < user_hi`) |
| 사적 채팅 시각 게이트 (P2)             | `private_opens_at` + `now()` 비교. **bool 컬럼을 두지 않는다**   |
| 성별 변경 불가                         | 컬럼 레벨 UPDATE 권한 미부여                                     |

### 설계 판단 두 가지

**티켓은 카운터가 아니라 행이다.** PRD 스케치는 `tickets: number`였지만 행으로 바꿨다 — 차감이 `unused → used` 원자적 상태전이가 되고, 감사 이력·환불·결제 연결이 공짜로 따라온다. 카운터면 동시 요청에서 음수를 막기 위해 별도 락이 필요하다.

**`chatOpen`을 컬럼으로 만들지 않았다.** 컬럼이면 누군가 켤 수 있다(그게 정확히 진단에서 뚫린 방식이다). `is_channel_open()`이 `prefs_submitted_at`과 `private_opens_at`에서 **파생**한다.

---

## 검증 결과

**1차 검증** — Docker가 꺼져 있던 시점에 로컬 PostgreSQL 16.14에 Supabase shim(`auth.users` + `auth.uid()` + 3개 롤)을 만들어 마이그레이션과 불변식을 확인했다.

**2차 검증 (확정)** — Docker를 켠 뒤 `supabase init && supabase start`로 **실제 Supabase 로컬 스택**(포트 충돌로 `config.toml`을 55xxx 대역으로 이동)을 띄우고, `create extension pgtap` 후 `supabase/tests/s1_negative.sql`을 **그대로** 실행했다. 결과는 1차 검증과 완전히 일치한다.

```
1..14
ok 1  - T1a: 남의 소개에 티켓을 쓸 수 없다
ok 2  - T1b: authenticated 는 tickets 를 직접 UPDATE 할 수 없다
ok 3  - T5: 미사용 티켓이 없으면 차감이 실패한다
ok 4  - T2a: 선호 응답 제출 전에는 조율 채널이 닫혀 있다
ok 5  - T2b: 사적 채널은 오픈 시각 이전에 닫혀 있다
ok 6  - T3: 남성 당사자는 선호 응답을 제출할 수 없다 (여성 전용)
ok 7  - T3b: 제3자는 선호 응답을 제출할 수 없다
ok 8  - T6a: 여성 당사자는 선호 응답을 제출할 수 있다
ok 9  - T6b: 제출 후에는 조율 채널이 열린다
ok 10 - T6d: 확정 후에도 오픈 시각 전에는 사적 채널이 닫혀 있다
ok 11 - T6e: 오픈 시각을 지나면 사적 채널이 열린다
ok 12 - T4a: 넘기기가 영구 배제를 기록한다 (쌍 단위, 전역 플래그가 아니다)
ok 13 - T4b: 배제된 상대는 다시 소개되지 않는다
ok 14 - T4c: intro_exclusions 는 삭제할 수 없다 (append-only)
```

**14/14 통과.** 실패 없음. `supabase migration list`는 프로젝트가 아직 원격에 `link`되지 않아 "Cannot find project ref"를 냈지만, `psql`로 `\dt public.*` 확인 결과 마이그레이션 3개는 로컬 DB에 정상 적용됐다.

**대조군이 왜 필요한가:** 전부 거부하는 설정은 부정 테스트를 100% 통과시키면서 제품을 망가뜨린다. 이 진단에서 실제로 겪은 실패 모드다 — 대비 스캐너가 leaf 노드만 순회해 실패를 과소보고했다. T6a·T6b·T6d·T6e가 그 대조군이며, 통과해야 할 것이 실제로 통과함을 확인했다.

**1차 검증에서 실제로 잡힌 것:** 사적 채널 테스트에 구멍이 있었다. 미확정(`private_opens_at IS NULL`) 상태만 검증하고, **확정 후·오픈 시각 전**이라는 진짜 경계를 빼먹었다. `T6d`로 추가했고, 2차 검증에서도 그대로 통과를 확인했다.

### 로컬 포트 메모

이 머신에는 다른 프로젝트(`cyrano`)의 Supabase 스택이 54321~~54327을 이미 점유하고 있었다. `supabase/config.toml`의 포트를 55321~~55329 대역으로 옮겨 충돌을 피했다 — 다른 프로젝트의 컨테이너를 멈추지 않았다. 이 레포에서 로컬 스택을 다시 띄울 때도 이 설정을 그대로 쓰면 된다.

## S2 통합 테스트에서 잡힌 실제 버그 4건

Docker를 켜고 실제 Supabase 로컬 스택 + `@supabase/supabase-js`로 회원가입→인증→호감→소개→티켓→조율→확정까지 엔드투엔드 스모크 테스트(17개 체크)를 돌리는 과정에서, **로컬 postgres shim으로는 드러나지 않았던** 진짜 버그 2건(1·2)이 나왔다. shim이 실제 Supabase의 권한 모델을 완전히 재현하지 못했다는 뜻이므로, 다음 단계도 shim만으로 검증을 끝내지 않는다.

이후 화면을 실제로 연결하는(S2) 과정에서 버그 2건(4·5)이 더 나왔는데, 둘 다 **자동 테스트(스모크 17개 + pgTAP 14개)는 전부 통과한 상태에서** 브라우저로 직접 온보딩을 걸어봤을 때만 드러났다. 자동화된 테스트가 통과했다고 실제 화면이 동작한다는 보장은 안 된다는 근거.

### 버그 1 — `profiles` RLS 정책의 무한 재귀

`profiles_select_counterpart`와 `affinities_insert_female_only` 정책이 "내 hub_id"를 구하려고 `profiles` 테이블을 인라인 서브쿼리로 다시 조회했다. 그런데 그 서브쿼리 자체도 `profiles`의 RLS 정책을 다시 통과해야 하고, 그 정책이 또 같은 서브쿼리를 담고 있어 **`42P17 infinite recursion detected in policy for relation "profiles"`**로 죽었다.

`my_gender()`는 이미 SECURITY DEFINER 함수라 이 문제가 없었다 — RLS를 우회하고 값만 반환하기 때문이다. 같은 패턴으로 `my_hub_id()`를 추가하고, 두 정책의 인라인 서브쿼리를 `my_hub_id()` 호출로 교체했다.

**교훈:** RLS 정책 안에서 "내 정보"를 구하려고 정책이 걸린 테이블을 다시 조회하면 재귀 위험이 있다. 그 값이 필요하면 반드시 SECURITY DEFINER 헬퍼로 뺀다.

### 버그 2 — `service_role`에 실제로는 아무 권한도 없었다

`service_role`은 Supabase에서 `BYPASSRLS` 속성을 갖지만, **테이블·함수 GRANT는 그것과 별개**다. 이 레포의 로컬 클러스터 기본 ACL은 `postgres` 소유 객체에 대해 `service_role`에게 `D/x/t/m`(삭제·트런케이트·트리거·유지보수)만 주고 `SELECT/INSERT/UPDATE`나 함수 `EXECUTE`는 주지 않는다.

그 결과 결제 웹훅 경로를 시뮬레이션하는 `admin.rpc("issue_ticket", ...)` 호출이 **`42501 permission denied for function issue_ticket`**로 실패했다. RLS 설계(부정 테스트 14개)는 전부 맞았지만, `service_role`이 애초에 그 함수를 호출할 권한이 없었다.

수정: `issue_ticket` · `refund_ticket` · `expire_unanswered_meetings`에 `service_role` EXECUTE를 명시적으로 부여하고, 모든 테이블에 `service_role` 전체 접근을 부여했다 — 이 롤은 신뢰된 백엔드 전용이므로 RLS가 아니라 GRANT로 접근을 준다.

**교훈:** `service_role`의 `BYPASSRLS`는 "행 필터를 통과한다"는 뜻이지 "권한이 있다"는 뜻이 아니다. 둘은 완전히 다른 체크다.

### 부수 발견 — pgTAP 테스트 자체의 오염 취약점

두 버그를 고친 뒤 `supabase db reset`으로 재적용하고 스모크 테스트(17개)를 먼저 돌린 다음, **리셋 없이** 그 위에서 pgTAP을 재실행했더니 `T6a`·`T6b`가 실패했다. 원인은 버그가 아니라 테스트 자체의 결함 — `(select id from meetings limit 1)`이 스코프 없이 **아무 행이나** 집어서, 스모크 테스트가 남긴 실제 데이터를 fixture 데이터 대신 골랐다.

`(select id from meetings limit 1)` 9곳과 `update meetings set ...`(스코프 없는 UPDATE) 1곳을 전부 `where intro_id = (select id from intros where male_id = 'bbbb0001-...')`로 좁혔다. `T4a`/`T4b`/`T4c`는 애초에 고정 UUID로 조건을 걸어 이 문제가 없었다.

**교훈:** append-only 이력이나 고정 UUID로 스코프를 건 조건은 DB 상태와 무관하게 안전하지만, `limit 1`처럼 "아무 행이나"에 기대는 조건은 깨끗한 DB를 전제해야만 안전하다. 실제 CI(`supabase test db`)는 매번 리셋하므로 이 문제를 안 만나지만, 로컬에서 수동으로 반복 실행할 때는 만난다.

### 버그 3 (S2 화면 배선 중 발견) — 온보딩 절반만 마친 프로필이 평가 대상으로 노출됨

`eligible_profiles` 뷰와 `open_intro()`는 `onboarding_step = 7`을 확인하는데, `profiles_select_counterpart`와 `affinities_insert_female_only` 두 RLS 정책은 `email_verified_at`·`account_state`만 확인하고 **`onboarding_step`을 안 봤다.** 즉 회사 이메일만 인증하고 이름·직업 등을 아직 안 적은 남성이 여성에게 이미 평가 대상으로 노출될 수 있었다.

`onboarding.tsx`를 실제 `api.ts`(OTP 인증)로 옮기는 과정에서 "인증 직후·프로필 미완성" 상태가 실제로 존재한다는 걸 깨닫고 발견했다. 재현 스크립트로 확인: onboarding_step=0인 남성을 만들고 여성 계정으로 조회 → **보였다.** 두 정책에 `onboarding_step = 7`을 추가한 뒤 같은 스크립트로 재확인 → **안 보이고, 호감 제출도 거부됨.**

`supabase db reset` 후 스모크 17/17·pgTAP 14/14 재확인, 기존 계약을 안 깼다.

**교훈:** 같은 자격 조건을 두 곳(뷰/함수 하나, RLS 정책 다른 곳)에 따로 적었을 때 조건이 갈라지는 사고가 난다. 화면을 실제로 연결하기 전까지는 "인증 직후, 프로필 미완성" 같은 중간 상태가 테스트 픽스처에 안 나타나서 안 보였다 — 픽스처가 항상 완성된 프로필로 시작했기 때문이다.

### 버그 4 (실제 브라우저 워크스루로 발견) — `email_verified_at`을 실제로 채우는 코드 경로가 없었음

스모크 테스트는 `admin.from("profiles").update({ email_verified_at: ... })`로 이 컬럼을 직접 채우는 지름길을 썼다. 그래서 "OTP 인증 후 이 컬럼이 실제로 채워지는가"는 스모크 테스트가 **한 번도 검증한 적이 없었다** — 17/17 통과가 통과의 증거가 아니었던 셈이다.

실제 UI로 온보딩을 처음부터 걸어봤다: 회사 이메일 입력 → `signInWithOtp()` 호출 → Mailpit(`http://127.0.0.1:55324/api/v1/messages`)에서 실제 인증 코드를 꺼내 입력 → `verifyOtp()` 성공 → onboarding step 6로 진행. 그 직후 `psql`로 `profiles.email_verified_at`을 직접 조회하니 **여전히 null**이었다. `verifyEmailCode()`가 세션만 만들고 이 컬럼을 채우는 호출을 어디에도 하지 않았기 때문이다. 온보딩을 7단계까지 전부 마쳐도 `eligible_profiles`의 `email_verified_at is not null` 조건을 영원히 통과하지 못해 **아무도 매칭 대상이 될 수 없는** 프로덕션 치명 버그였다.

수정: `sync_email_verified()` SECURITY DEFINER 함수를 추가해 `auth.users.email_confirmed_at`(Supabase Auth가 OTP 검증 성공 시에만 서버에서 채우는, 클라이언트가 위조할 수 없는 값 — `select email_confirmed_at from auth.users`로 실제 채워짐을 직접 확인함)을 읽어 `profiles.email_verified_at`에 반영하고, `verifyEmailCode()`에서 이 RPC를 호출하도록 배선했다(`supabase/migrations/20260731130200_s2_email_verification.sql`).

**교훈:** 테스트 픽스처가 실제 유저 흐름을 지름길로 흉내 내면(admin으로 직접 UPDATE), 그 지름길이 가리는 실제 배선 누락을 절대 못 잡는다. "이 값이 실제로 어디서 채워지는가"를 답할 수 없으면 지름길이 아니라 버그 은닉이다.

### 버그 5 (실제 브라우저 워크스루로 발견) — 화면 내부 step id를 그대로 `onboarding_step`에 저장

버그 4를 고친 뒤 같은 온보딩을 처음부터 다시 걸어보다가, 마지막에서 두 번째 화면("어떤 사람과, 무슨 이야기를")의 "프로필 만들기" 버튼을 눌렀는데 **아무 반응이 없었다.** 네트워크 탭을 보니 `PATCH profiles`가 `400`으로 두 번 실패하고 있었다: `new row for relation "profiles" violates check constraint "profiles_onboarding_step_check"` (`onboarding_step`은 0~7만 허용).

원인은 `onboarding.tsx`의 화면 전환 로컬 상태값(`step`)이 화면 id로 1,2,3,4,6,8,9처럼 건너뛰며 매겨져 있는데(각 화면이 `<StepShell step={표시값}>`으로 실제 "N/7" 표시값을 따로 갖고 있음), 두 곳의 `saveOnboardingStep(userId, step, ...)` 호출이 이 로컬 화면 id를 그대로 `onboarding_step`에 저장하고 있었다는 것. "관심사" 화면(표시상 5/7)은 로컬 id 6을 저장하고(우연히 7 이하라 안 걸림), "어떤 사람과" 화면(표시상 6/7)은 로컬 id 8을 저장해 제약을 위반했다.

`saveOnboardingStep(userId, 6, {...})` → `saveOnboardingStep(userId, 5, {...})`, `saveOnboardingStep(userId, 8, {...})` → `saveOnboardingStep(userId, 6, {...})`로 각각 표시값과 맞춰 수정(`src/routes/onboarding.tsx`). 수정 후 같은 브라우저 세션에서 재시도 → 정상적으로 다음 화면(헤드라인 확정)으로 진행되고, 최종 "프로필 확정"까지 마친 뒤 `onboarding_step = 7`로 확정됨을 직접 확인했다.

**교훈:** 이것도 스모크 테스트(17/17)·pgTAP(14/14)·`tsc --noEmit` 전부 통과한 상태에서 잡혔다 — 세 검증 모두 실제 브라우저 클릭 흐름을 대신하지 못한다. 화면 상태 id와 DB에 영속되는 진행 단계 수를 같은 변수(`step`)로 뭉뚱그리면, 화면 id 체계가 바뀔 때마다(중간 화면 추가/제거) 조용히 어긋난다 — 둘은 처음부터 별개 값으로 관리하거나, 최소한 저장 직전에 표시값에서 파생시켜야 한다.

### 재검증 — 리셋 없이도 재현 가능한 확정 순서

수정 후 다음 순서로 최종 확인했다 (**중간에 리셋하지 않음**):

1. `supabase db reset` — 마이그레이션 전체(현재 6개) 재적용
2. 엔드투엔드 스모크 테스트 실행 → **17/17 통과**, DB에 실제 데이터 잔존
3. 그 위에서 pgTAP 재실행 → **14/14 통과** (오염된 DB에서도 통과 확인됨)

두 검증이 서로 간섭하지 않는다는 것 자체가 "정책이 실제 상태와 무관하게 옳다"는 추가 증거다.

버그 4·5는 이 자동 검증 3종(tsc·스모크·pgTAP) 전부가 통과한 뒤에 실제 브라우저 워크스루로만 잡혔다 — 그래서 버그 4·5를 고칠 때마다 위 3종을 전부 재실행해 회귀가 없음을 다시 확인했다.

---

## S3 — 계측 8개 이벤트 감사

F10이 요구하는 8개 이벤트(`signup_verified` · `profile_completed` · `affinity_submitted` · `intro_opened` · `intro_passed` · `ticket_purchased` · `meeting_confirmed` · `meeting_completed`)를 실제로 `events` 테이블에 쌓이는지 하나씩 확인했다. 결과: 6개는 S1 함수 작성 시점에 이미 SQL 함수 안에 바로 심어져 있었다(`open_intro`·`pass_intro`·`issue_ticket`·`confirm_meeting`·`mark_met`). 나머지 2개(`signup_verified`·`profile_completed`)는 클라이언트 `api.ts`에서 남긴다. 감사 중 실제 문제 2건을 더 찾았다.

### 버그 6 — `affinity_submitted`만 클라이언트 경로에 의존했다

다른 6개 이벤트는 전부 SQL 함수 내부에서 발화해 **어떤 클라이언트가 호출하든 보장**되는데, `affinity_submitted`만 유일하게 `submitAffinity()` 안에서 직접 `events`에 insert하고 있었다. 스모크 테스트가 `affinities` 테이블에 바로 insert하는 경로(`.from("affinities").insert(...)`, RPC를 거치지 않음)를 쓰면서 이 차이가 드러났다 — `events` 테이블을 조회해보니 `affinity_submitted`가 **0건**이었다.

수정: `affinities` 테이블에 `after insert` 트리거(`affinities_log_submitted` → `log_affinity_submitted()`)를 추가해 `verdict='like'`일 때 이벤트를 남기도록 옮기고, 클라이언트의 직접 insert는 제거했다(`supabase/migrations/20260801120000_s3_affinity_event_trigger.sql`). 리셋 후 스모크 테스트를 다시 돌리자 `affinity_submitted`가 정상적으로 쌓였다.

**교훈:** 8개 중 7개가 같은 패턴(트리거/함수 내부 발화)을 따르는데 1개만 다른 계층(클라이언트)에 있으면, 그 하나가 항상 가장 먼저 깨진다. 계측을 "이 상태 변화가 일어나는 지점"에 묶으면 호출 경로가 늘어나도(관리자 콘솔, 배치 스크립트, 다른 화면) 계측이 따라온다 — 클라이언트 함수 하나에 묶으면 그 함수를 거치지 않는 모든 경로에서 조용히 샌다.

### 버그 7 — `open_intro()`를 호출하는 화면이 어디에도 없었다

`open_intro()` RPC(불변식 1·2를 지키며 다음 후보를 여는 함수, `intro_opened` 이벤트도 이 함수 안에 있음)는 스모크 테스트에서만 호출되고, **실제 화면(`home.tsx`·`intro.tsx`) 어디에서도 호출되지 않았다.** 두 화면 모두 `getOpenIntroWithCandidate()`로 **이미 열린** 소개를 읽기만 할 뿐, 열려 있는 게 없을 때 새로 열어보는 코드가 없었다. 즉 실제 앱에서는 여성에게 호감을 받은 남성이 **영원히 소개를 못 받는** 상태였다 — `intro_opened` 이벤트 자체는 올바르게 배선돼 있었지만, 그걸 발화시킬 호출부 자체가 없었던 것.

수정: `api.ts`에 `ensureOpenIntro()`를 추가했다 — 이미 열린 소개가 있으면 그대로 반환하고, 없으면 `open_intro()`를 호출해 열어보고(자격 있는 후보가 없어 `P0002`가 나면 조용히 `null`), 성공하면 다시 조회해 반환한다. `home.tsx`·`intro.tsx`의 남성 분기에서 `getOpenIntroWithCandidate()` 대신 이 함수를 쓰도록 교체했다.

**교훈:** RPC가 SQL 레벨에서 완벽하게 옳고 스모크 테스트도 통과해도, **그 RPC를 부르는 화면이 없으면 프로덕션에서는 죽은 코드다.** 버그 3·4·5와 같은 계열 — 자동 테스트는 "함수가 옳은가"만 보고 "화면이 그 함수를 실제로 부르는가"는 안 본다. 화면 배선은 grep으로 "이 함수가 어디서 호출되는가"를 반드시 확인해야 한다.

### 재검증

`supabase db reset`(마이그레이션 7개) → `tsc --noEmit` 클린 → 스모크 17/17 → pgTAP 14/14 → `events` 테이블 직접 조회로 8개 이벤트 전부 실제로 쌓였는지 확인(`meeting_completed`는 스모크 테스트가 `mark_met`을 부르지 않아 psql로 직접 두 당사자 확정을 재현해 확인). 이후 pgTAP을 리셋 없이 재실행해도 14/14 — 이번에 추가한 트리거·헬퍼가 기존 계약을 깨지 않았다.

---

## S4 — 노쇼 확인·제명 전이(P4) + 스케줄 잡

`no_show_reports` 테이블은 S1부터 있었지만 신고→확인→제명 전이 로직 자체가 없었고, `expire_unanswered_meetings()`(P3, 24h 무응답 자동환불)도 함수만 있고 아무도 주기적으로 호출하지 않았다 — 둘 다 버그 3·4·5·7과 같은 계열("함수는 옳은데 부르는 데가 없다")이라 이번에 함께 채웠다.

### 설계 — "신고 자체는 아무 효과가 없다"

D13·P4로 이미 확정된 판정 절차: 신고 접수 → 상대에게 확인 요청(24시간) → **상대가 인정하거나 무응답이면** 확정(피해자 티켓 재발급 + 노쇼자 영구제명). 상대가 부인하면 기각한다.

"단일 미검증 신고로 즉시 제명하지 않는다"는 원칙을 코드로 강제하기 위해, 제명·재발급을 실제로 실행하는 `apply_no_show_confirmed()`를 **어떤 롤에도 EXECUTE를 주지 않았다.** `respond_no_show(admit=true)`와 스케줄 스윕만 내부적으로 호출할 수 있고, 클라이언트는 `report_no_show()`(효과 없음, 상태만 `pending`)와 `respond_no_show()`(피고발자 본인만)만 부를 수 있다. 신고 하나만으로 제명 경로에 닿을 방법이 SQL 권한 레벨에서부터 없다.

새로 추가한 함수(전부 `supabase/migrations/20260801130000_s4_no_show_and_scheduling.sql`):

| 함수                                  | 호출 가능                   | 역할                                              |
| ------------------------------------- | --------------------------- | ------------------------------------------------- |
| `report_no_show(meeting_id)`          | `authenticated`             | 신고 접수. 피고발자는 서버가 참가자 관계에서 유도 |
| `respond_no_show(report_id, admit)`   | `authenticated`(피고발자만) | 인정→확정 위임, 부인→기각                         |
| `apply_no_show_confirmed(report_id)`  | **아무도 없음**             | 확정 처리(제명+재발급)의 유일한 실행 지점         |
| `expire_unanswered_no_show_reports()` | `service_role`              | 확인 기한 만료 신고를 스윕해 자동 확정            |

### `service_role`처럼, 새 함수도 기본값은 "전체 공개"다

`s1_functions.sql`의 `revoke execute on all functions in schema public from public, anon, authenticated;`는 **그 마이그레이션 시점에 존재하던 함수에만** 적용된다. Postgres는 함수를 새로 만들면 기본적으로 `PUBLIC`에 EXECUTE를 연다(테이블과 반대 — 테이블은 기본이 비공개다). 그래서 이번에 만든 함수 4개도 각각 `revoke ... from public, anon, authenticated`를 반복한 뒤 필요한 만큼만 다시 grant했다. 이걸 빠뜨렸다면 버그 2와 정반대 방향의 사고(권한이 없어야 할 곳에 있음)가 났을 것이다.

### 스케줄러 — pg_cron

Cloudflare Cron 같은 외부 스케줄러는 원래 계획(§"아직 안 한 것")에 있었지만, 로컬 개발 단계에서 지금 바로 검증 가능한 건 Postgres 자체에 내장된 `pg_cron`이다. `extensions` 스키마에 설치하고(`pgcrypto`와 같은 위치, 컨벤션 일치), `expire_unanswered_meetings()`·`expire_unanswered_no_show_reports()`를 각각 15분 간격으로 등록했다. 배포를 별도 클라우드로 분리할 때(사용자가 처음부터 말한 계획) 이 두 잡을 그쪽 스케줄러로 옮기고 여기서는 `cron.unschedule()`하면 된다 — 지금 당장 필요한 건 "실제로 주기적으로 도는가"의 검증이었다.

**검증**: `cron.schedule()`로 1분 간격 임시 잡을 추가로 걸어 실제로 자동 실행되는지 확인했다(`cron.job_run_details`에서 `status='succeeded'` 직접 조회, ~70초 대기). 수동 RPC 호출이 되는 것과 스케줄러가 실제로 주기 실행하는 것은 다른 검증이다 — 전자만 확인하고 끝냈다면 "cron.schedule()이 실패해도 아무도 모른다"는 새로운 버전의 버그 7이 됐을 것이다. 확인 후 임시 잡은 제거했다.

### pgTAP — `supabase/tests/s4_no_show.sql` (12개, 전부 통과)

핵심은 "신고 자체는 효과가 없다"(T4), "확정 함수는 아무도 못 부른다"(T5), "부인하면 기각되고 제명되지 않는다"(T7-9), "확인 기한이 지나면 스윕이 자동으로 확정한다"(T10-12)를 각각 독립적으로 증명하는 것 — 대조군(T4·T9) 없이 T10-12만 있었다면 "제명이 일어난다"만 증명하고 "함부로 일어나지 않는다"는 증명하지 못한다.

### 재검증

`supabase db reset`(마이그레이션 7개) → `tsc --noEmit` 클린 → 스모크 17/17 → pgTAP `s1_negative.sql` 14/14 → pgTAP `s4_no_show.sql` 12/12 → cron 잡 재등록 확인.

### 이번에 일부러 미룬 것

사용자 확인(질문·답변)에 따라 이번 세션은 **DB 계층까지만** 잡았다. `feedback.tsx`의 "만나지 못했어요" 선택을 `report_no_show()`에 연결하는 것과, 피고발자가 인정·부인을 응답할 화면은 다음 단계(UI 배선, S2가 API를 붙였던 것과 같은 패턴)로 미뤘다 — 지금 이 함수들은 pgTAP·psql로만 검증됐고, 화면에 연결되지 않은 채로는(버그 7처럼) 실제로는 죽은 코드다. 다음에 반드시 이어서 배선해야 한다.

---

## S5 — 결제 웹훅 (토스페이먼츠)

Q5("결제 수단 미검증 — 정책 세부·수수료율을 추측하지 않는다")를 지키기 위해, 실제 API 문서(docs.tosspayments.com)를 먼저 찾아 확인한 뒤에만 코드를 썼다. 사용자가 PG로 토스페이먼츠, 호스팅으로 Supabase Edge Function을 선택했다.

### 설계 — "웹훅"이 아니라 "승인 콜백"이다

찾아보기 전에는 N1 문서에 적힌 대로 "결제 웹훅에서만 발급"을 문자 그대로 표준 `PAYMENT_STATUS_CHANGED` 웹훅에 서명 검증을 붙이는 구조로 가정했다. 그런데 실제 문서를 확인해보니 그 서명 헤더(`tosspayments-webhook-signature` 등)는 **지급대행(`payout.changed`) 웹훅에만 있고, 일반 카드결제 웹훅에는 없다.** 카드결제의 실제 1차 신호는 웹훅이 아니라, 체크아웃 위젯의 성공 리다이렉트로 받은 `{paymentKey, orderId, amount}`를 **우리 서버가 자기 시크릿 키로 `POST /v1/payments/confirm`을 호출해 승인을 확정**하는 것이다 — 이 확정 호출 자체가 검증이다(우리가 직접 토스에 거는 호출이므로 스푸핑 여지가 없다). 추측하지 않고 확인했기 때문에 잡을 수 있었던 차이다.

이 구조에서 여전히 N1을 지키려면 다른 문제가 남는다: `orderId`는 클라이언트가 체크아웃 위젯에 넘기는 값인데, 승인 콜백만으로는 그 `orderId`가 우리 쪽 어느 `user_id`의 결제인지 알 수 없다. 그래서 체크아웃을 시작하기 전에 서버가 먼저 `orderId`를 만들어 `user_id`·금액과 묶어 둔다(`ticket_orders`, `create_ticket_order()` RPC — 가격 30,000원은 여기서 하드코딩 + 테이블 CHECK로 이중 고정). 승인 콜백은 이 매핑을 조회해서 얻은 값으로만 `issue_ticket()`을 부른다 — 클라이언트가 자기 `user_id`나 금액을 직접 주장할 방법이 없다.

### 구성 요소

| 위치                                                      | 역할                                                                                                         |
| --------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------ |
| `supabase/migrations/20260801140000_s5_ticket_orders.sql` | `ticket_orders` 테이블 + `create_ticket_order()` — orderId↔user_id 매핑, 정책 없음=INSERT/UPDATE 불가 패턴   |
| `supabase/functions/confirm-ticket-payment/index.ts`      | 결제 승인 콜백. 호출자 JWT 확인 → 주문 조회(service_role) → 금액 대조 → 토스 confirm 호출 → `issue_ticket()` |

### 검증 — 실제 Edge Function을 실제로 띄워서

`supabase functions serve`로 로컬 Edge Runtime(Deno, Docker 컨테이너)을 실제로 띄우고, 토스 문서의 요청/응답 계약을 그대로 재현한 목 서버(`mock_toss_server.mjs`, Bun)를 별도 프로세스로 띄운 뒤 `TOSS_API_BASE_URL` 환경변수로 그쪽을 가리키게 했다 — 코드를 읽고 "맞겠지"로 끝내지 않고, 실제 HTTP 콜을 주고받는 전체 경로를 다 태웠다.

컨테이너 안에서는 호스트의 `127.0.0.1:8899`에 닿지 않는다(`ECONNREFUSED`) — Docker 컨테이너 관점에서 호스트 머신은 `host.docker.internal`이어야 한다. 처음에 이걸 놓쳐서 첫 실행이 그대로 실패했다.

11개 체크 전부 통과: 정상 발급·멱등(같은 orderId 재확정해도 티켓 1장)·카드사 거절(402 + 주문 `failed`)·금액 위변조 거부(400)·타인 주문 확정 거부(403). pgTAP `s5_ticket_orders.sql`(7개)은 SQL 계층만 별도로 — RPC 없이 직접 INSERT 불가, 클라이언트가 상태를 직접 못 바꿈, RLS로 남의 주문이 안 보임.

### 이번에 막힌 것 (미룬 게 아니라 진짜 불가능)

체크아웃 버튼 UI와 실제 토스 결제위젯 SDK 연동은 **실제 토스페이먼츠 가맹점 계정(공개용 clientKey, 결제 승인용 secretKey)이 있어야 의미가 있다** — 아직 그 계정이 없다. S3·S4의 "UI는 다음 단계로 미룸"과 다르게, 이건 스코프 선택이 아니라 사용자가 실제로 토스페이먼츠에 가입해 키를 받아야만 풀리는 하드 블로커다. 지금까지 만든 백엔드(마이그레이션+Edge Function)는 실제 문서 계약대로 만들어졌고 목 서버로 전체 경로가 검증됐으므로, 실제 키가 생기면 `TOSS_SECRET_KEY`를 Edge Function 시크릿으로 등록하고 `TOSS_API_BASE_URL`을 지우기만 하면(기본값이 실제 엔드포인트) 그대로 붙는다.

### 재검증

`supabase db reset`(마이그레이션 9개) → `tsc --noEmit` 클린 → 스모크 17/17 → pgTAP `s1_negative.sql` 14/14·`s4_no_show.sql` 12/12·`s5_ticket_orders.sql` 7/7 → Edge Function 목 서버 통합 테스트 11/11.

---

## S2~S4에 넘길 때

**저렴한 모델에게 주는 지시는 "구현하라"가 아니라 "이 14개 테스트를 통과시켜라"다.**

넘길 것: 이 문서 + 마이그레이션 3개 + 테스트 파일.
넘기지 말 것: "RLS 잘 짜줘" 같은 열린 지시. 그럴듯한 정책이 나오고 뚫린다 — 진단에서 클라이언트 게이트가 6곳 중 5곳은 맞고 1곳이 빠져서 뚫린 것과 같은 실패 형태다.

### 아직 안 한 것 (S1 범위 밖)

- ~~직장 인증 메일 토큰 흐름~~ — S2에서 완료 (`sync_email_verified()` + 실제 OTP 배선, 버그 4)
- ~~스케줄 잡 배선~~ — S4에서 완료 (pg_cron, `expire_unanswered_meetings()` + `expire_unanswered_no_show_reports()` 15분 간격)
- ~~노쇼 판정 전이(P4) 함수~~ — S4에서 완료 (`report_no_show`·`respond_no_show`·`apply_no_show_confirmed`). **단, UI 배선은 아직** — `feedback.tsx` 연결과 피고발자 응답 화면은 다음 단계
- ~~결제 승인 백엔드~~ — S5에서 완료 (`ticket_orders` + `create_ticket_order()` + `confirm-ticket-payment` Edge Function, 토스페이먼츠 실제 계약대로, 목 서버로 11개 검증). **단, 실제 토스 가맹점 키가 없어 체크아웃 UI는 못 만든다** — 진짜 블로커
- **배포 스케줄러 이관** — pg_cron은 로컬 검증용. 백엔드를 별도 클라우드로 분리할 때 Cloudflare Cron 등으로 옮기고 pg_cron 잡은 `cron.unschedule()`
- **`hub_id` 인접 권역** — 현재 동일 권역만 매칭한다. PRD의 "같은/인접 존"은 단일 권역 베타에서 무의미하므로 뒤로 미뤘다
