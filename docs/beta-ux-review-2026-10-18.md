# 문의 접수·내역 UX 검토 · 2026-10-18

## 사용자 가치와 화면 비교

기존 화면은 접수 성공 뒤 내역 조회가 실패해도 “접수하지 못했습니다”를 띄웠다. 사용자는 같은 문의를 다시 보낼 수 있었다. 내 문의는 조회가 끝나고 항목이 있을 때만 나타나, 로딩·빈 결과·오류를 구별할 수 없었다. 아래는 코드 기준 비교이며 실제 화면 캡처는 이 실행 환경의 Chromium 권한 오류로 미확인이다.

| 상태 | 기존 | 개선 |
| --- | --- | --- |
| 접수 성공, 조회 실패 | 접수 실패 토스트 | 접수 성공을 먼저 알리고 내역 갱신 실패를 별도 표시. 새로고침은 조회 RPC만 호출 |
| 생성 실패 | 단일 실패 토스트 | SQL 오류가 확정되면 미접수 안내. 통신 결과가 불명확하면 내역 확인을 먼저 안내. 작성 내용·종류 유지 |
| 첫 조회 중·실패·빈 목록 | 내 문의 영역 없음 | 항상 내 문의 제목·새로고침·상태 문구 표시. 빈 목록과 오류 구분 |
| 이전 목록 갱신 실패 | 이전 목록만 표시 | 이전 목록을 유지하며 갱신 실패를 지속 표시 |
| 답변 후 복귀 | 재진입 시에만 재조회 가능 | 화면 재진입, 탭 복귀·포커스 시 재조회. 수동 새로고침도 제공 |
| 연속 제출 | React 상태 갱신 전 재클릭 가능 | 동기 잠금과 버튼 비활성으로 같은 요청 중 중복 제출 방지 |

### 320px·390px 모바일 상태별 확인 기준

두 폭에서 일반 문의와 약속 문의 각각의 `로딩 → 빈 결과`, `오류 → 재시도`, `접수 성공 → 목록 갱신 오류`, `답변 완료`를 확인한다. 긴 한국어 안내가 가로 스크롤 없이 줄바꿈되고, 키보드가 열린 상태에서 입력 내용·버튼·내 문의까지 스크롤로 닿아야 한다. `내역 새로고침`과 제출 버튼의 터치 높이는 공용 Button의 최소 44px, 종류 선택은 48px이다. 선택 상자 글자 크기를 16px로 지정해 iOS 입력 확대를 피했다. 실제 기기와 화면 리더는 별도 QA가 필요하다.

## 디자인 토큰과 접근성

- 기존 `bg-background`, `bg-card`, `text-foreground`, `text-muted-foreground`, `border-border`, `border-input`, `ring-ring`, `rounded-control`, `rounded-surface`를 재사용했다. 새 색·그림자·모션은 추가하지 않았다.
- `npm run check:contrast` 결과 라이트 본문/배경 12.94:1, 보조 글자/배경 5.32:1, 포커스 링/배경 5.48:1. 다크 본문/배경 16.30:1, 보조 글자/배경 7.81:1, 링/배경 8.44:1. 모두 스크립트 기준 통과.
- 문의 종류는 가시 라벨과 포커스 링을 유지한다. 입력·새로고침·제출은 키보드 접근 가능하다. 접수 및 조회 상태는 `role=status`로 알리고, 실패 문구가 다음 행동을 설명한다. 조회 버튼은 로딩 중에만 비활성이다.
- 사용자 계정 식별자와 요청 순번으로 이전 계정 또는 늦은 조회 응답을 화면에서 차단한다. 로그아웃·계정 전환 이벤트 때 목록을 지운다. 서버 인증/RLS는 변경하지 않았다.
- 새로운 애니메이션이 없어 reduced-motion 동작은 기존 공용 스타일을 따른다. 실제 기기 터치·키보드·화면 리더·200% 확대 검증은 미확인이다.

## 개발 인계와 검증

소유 파일: `src/routes/support.tsx`, 이 문서. 일반 문의 카테고리, 약속의 `meetingId`와 23505 안내, 일반 10–2000자·약속 10–1000자, 기존 답변 SLA를 유지했다. 생성 RPC가 성공한 뒤 조회 실패해도 생성 RPC를 다시 호출하지 않는다.

| 명령 | 결과 |
| --- | --- |
| `npm run typecheck` | PASS (초기 타입 오류 수정 후 재실행) |
| `npm run check:ai` | PASS, 118 cases |
| `npm run lint` | PASS (초기 포맷 오류 수정 후 재실행) |
| `npm run check:contrast` | PASS, 라이트·다크 모두 통과 |
| `impeccable detect --json src/routes/support.tsx` | PASS, `[]` |
| `npm run test:browser-e2e` | 미실행. 선행 `npx supabase status --output json`이 샌드박스 밖 `~/.supabase/telemetry.json` 쓰기 EPERM으로 실패 |
| 아래 Playwright 요청 대역 | 미실행. Chromium 시작 시 MachPortRendezvousServer 권한 거부로 종료 |

### 재실행 가능한 합성 Playwright 요청 대역

로컬 환경에서 다음 두 명령을 별도 터미널에서 실행한다. 운영 API·실회원 데이터는 사용하지 않는다. 첫 명령은 이 worktree의 Vite만 실행한다. Playwright 검증은 코드 파일을 만들지 않고 stdin으로 실행한다.

```sh
VITE_SUPABASE_URL=http://127.0.0.1:54399 VITE_SUPABASE_ANON_KEY=synthetic-anon node node_modules/vite/bin/vite.js --host 127.0.0.1 --port 4179 --strictPort
```

```sh
sed -n '/^```js playwright-start$/,/^```$/p' docs/beta-ux-review-2026-10-18.md | sed '1d;$d' | node --input-type=module
```

```js playwright-start
import assert from "node:assert/strict";
import { chromium } from "playwright";

const base = "http://127.0.0.1:4179";
const api = "http://127.0.0.1:54399";
const uid = "11111111-1111-4111-8111-111111111111";
const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 390, height: 844 }, locale: "ko-KR" });
let listMode = "error";
let createMode = "success";
let createCount = 0;
let listCount = 0;
let rows = [];
let releaseCreate;
const session = {
  access_token: "synthetic-access",
  refresh_token: "synthetic-refresh",
  token_type: "bearer",
  expires_in: 36000,
  expires_at: Math.floor(Date.now() / 1000) + 36000,
  user: { id: uid, email: "synthetic@example.test", aud: "authenticated", role: "authenticated", app_metadata: { provider: "email" }, user_metadata: {}, created_at: new Date().toISOString() },
};
const reply = (route, status, value) => route.fulfill({
  status,
  contentType: "application/json",
  headers: { "access-control-allow-origin": "*", "access-control-allow-headers": "*", "access-control-allow-methods": "GET,POST,OPTIONS" },
  body: JSON.stringify(value),
});
await page.addInitScript((value) => localStorage.setItem("sb-127-auth-token", JSON.stringify(value)), session);
await page.route(`${api}/**`, async (route) => {
  const url = new URL(route.request().url());
  if (route.request().method() === "OPTIONS") return reply(route, 200, {});
  if (url.pathname.includes("/profiles")) return reply(route, 200, { id: uid, account_state: "active", role: "member", name: "합성 사용자" });
  if (url.pathname.endsWith("/rpc/my_support_requests")) {
    listCount += 1;
    return listMode === "error" ? reply(route, 503, { code: "PGRST503", message: "synthetic list failure" }) : reply(route, 200, rows);
  }
  if (url.pathname.endsWith("/rpc/create_support_request") || url.pathname.endsWith("/rpc/create_meeting_help_request")) {
    createCount += 1;
    if (createMode === "slow") await new Promise((resolve) => { releaseCreate = resolve; });
    if (createMode === "fail") return reply(route, 400, { code: "P0001", message: "synthetic creation failure" });
    if (createMode === "duplicate") return reply(route, 409, { code: "23505", message: "synthetic duplicate" });
    if (createMode === "unknown") return route.abort("failed");
    return reply(route, 200, null);
  }
  return reply(route, 200, []);
});

try {
  await page.goto(`${base}/support`);
  await page.getByText("문의 내역을 불러오지 못했어요.", { exact: false }).waitFor();
  listMode = "ok";
  await page.getByRole("button", { name: "내역 새로고침" }).click();
  await page.getByText("아직 접수된 문의가 없어요.").waitFor();

  await page.getByLabel("문의 내용").fill("합성 접수 성공 뒤 조회 오류 확인입니다.");
  listMode = "error";
  await page.getByRole("button", { name: "문의 보내기" }).click();
  await page.getByText("문의가 접수되었습니다. 답변은 아래 내 문의에서 확인할 수 있어요.").waitFor();
  await page.getByText("내역을 새로고침하지 못했어요.", { exact: false }).waitFor();
  assert.equal(createCount, 1);
  listMode = "ok";
  rows = [{ id: "22222222-2222-4222-8222-222222222222", category: "account", body: "합성 접수 성공 뒤 조회 오류 확인입니다.", created_at: new Date().toISOString(), status: "open", response: null, responded_at: null }];
  await page.getByRole("button", { name: "내역 새로고침" }).click();
  await page.getByText(rows[0].body).waitFor();
  assert.equal(createCount, 1, "재시도는 조회만 호출");
  assert.ok(listCount >= 4);

  createMode = "fail";
  await page.getByLabel("문의 내용").fill("생성 실패 후에도 보존할 합성 본문입니다.");
  await page.getByRole("button", { name: "문의 보내기" }).click();
  await page.getByText("문의가 접수되지 않았어요.", { exact: false }).waitFor();
  assert.equal(await page.getByLabel("문의 내용").inputValue(), "생성 실패 후에도 보존할 합성 본문입니다.");

  createMode = "unknown";
  await page.getByRole("button", { name: "문의 보내기" }).click();
  await page.getByText("접수 여부를 확인할 수 없어요.", { exact: false }).waitFor();
  assert.equal(await page.getByLabel("문의 내용").inputValue(), "생성 실패 후에도 보존할 합성 본문입니다.");

  createMode = "slow";
  await page.getByLabel("문의 내용").fill("느린 요청 중복 제출 방지 확인입니다.");
  await page.getByRole("button", { name: "문의 보내기" }).click({ noWaitAfter: true });
  await page.getByRole("button", { name: "접수 중…" }).waitFor();
  const deadline = Date.now() + 2000;
  while (createCount < 4 && Date.now() < deadline) await new Promise((resolve) => setTimeout(resolve, 10));
  await page.locator("form").evaluate((form) => form.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true })));
  assert.equal(createCount, 4, "느린 제출 중 추가 생성 없음");
  releaseCreate();
  await page.getByRole("button", { name: "문의 보내기" }).waitFor();

  rows[0].status = "answered";
  rows[0].response = "합성 답변입니다.";
  await page.goto(`${base}/privacy`);
  await page.goto(`${base}/support`);
  await page.getByText("합성 답변입니다.").waitFor();
  createMode = "duplicate";
  await page.goto(`${base}/support?meetingId=33333333-3333-4333-8333-333333333333`);
  assert.equal(await page.getByLabel("문의 내용").getAttribute("maxlength"), "1000");
  await page.getByLabel("문의 내용").fill("합성 약속 문의 중복 안내 확인입니다.");
  await page.getByRole("button", { name: "문의 보내기" }).click();
  await page.getByText("이 약속의 문의가 이미 접수되어 있어요.", { exact: false }).waitFor();
  for (const width of [320, 390]) {
    await page.setViewportSize({ width, height: 720 });
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true, `${width}px 가로 넘침 없음`);
    await page.getByRole("button", { name: "내역 새로고침" }).focus();
    assert.equal(await page.getByRole("button", { name: "내역 새로고침" }).evaluate((element) => document.activeElement === element), true);
  }
  console.log("support synthetic request routing PASS");
} finally {
  await browser.close();
}
```

이 시나리오는 일반 문의·최초 실패 복구·빈 결과·성공 후 조회 실패·생성 실패·느린 중복 제출·답변 후 재진입·두 화면 폭의 기본 동작을 다룬다. 약속 문의는 `/support?meetingId=<합성 UUID>`에서 같은 생성 성공/실패/23505 경로와 1000자 제한을 반복한다. 통신 결과 불명확 시 본문 유지와 재전송 전 조회 안내, 두 합성 계정 전환 중 늦은 응답 폐기, iOS/Android 실기기 키보드·화면 리더 상태 읽기·200% 확대는 독립 QA가 확인한다. 해당 항목은 이번 실행에서 PASS로 간주하지 않는다.

## 영향과 다음 담당

유료 API·실회원 정보·운영 DB 쓰기·외부 발송 없음. 로컬 브라우저 실행과 테스트만 시도했다. 컨트롤러가 이 변경을 통합한 뒤 독립 QA가 위 미확인 사례와 전체 합성 브라우저 E2E를 실행한다. 작성자는 출시 승인을 대신하지 않는다.
