import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdir, writeFile, unlink } from "node:fs/promises";
import { setTimeout as delay } from "node:timers/promises";
import { chromium, webkit } from "playwright";
import AxeBuilder from "@axe-core/playwright";
import { createClient } from "@supabase/supabase-js";
import {
  localEnvironment,
  prepareCycle,
  recoverIncompleteCycle,
  cycleStatus,
  legacyFingerprint,
  database,
  quote,
  password,
  manifestPath,
} from "./lib/manual-cycle-fixtures.mjs";
import { startManualServer, manualOrigin as base } from "./lib/manual-cycle-server.mjs";

const env = localEnvironment();
const before = legacyFingerprint(env);
const manifest = await prepareCycle(env, "qa-manual");
assert.deepEqual(
  ["likes", "queue", "intros", "orders", "tickets", "meetings"].map(
    (k) => cycleStatus(env, manifest)[k],
  ),
  [0, 0, 0, 0, 0, 0],
  "QA fixture must be fresh; never reset existing progress",
);
const server = await startManualServer(env, "qa-manual");
database(
  env,
  `update profiles set paused_at=null where id in (${quote(manifest.accounts.male.id)},${quote(manifest.accounts.female.id)});`,
);
const browser = await (process.env.AFTER_TEST_BROWSER === "webkit" ? webkit : chromium).launch();
const contexts = [];
const shots = "/tmp/after-manual-cycle-qa";
await mkdir(shots, { recursive: true });
let providerRequests = 0;
let llmRequests = 0;
const headers = (token) => ({
  "Content-Type": "application/json",
  Origin: base,
  ...(token ? { Authorization: `Bearer ${token}` } : {}),
});
async function post(path, body, token, origin = base) {
  return fetch(base + path, {
    method: "POST",
    headers: { ...headers(token), Origin: origin },
    body: JSON.stringify(body),
  });
}
const clients = {};
async function go(page, path) {
  await page.goto(base + path, { waitUntil: "domcontentloaded" });
}
async function login(role) {
  const account = manifest.accounts[role];
  const client = createClient(env.API_URL, env.ANON_KEY, { auth: { persistSession: false } });
  const session = await client.auth.signInWithPassword({ email: account.email, password });
  assert.ifError(session.error);
  clients[role] = { client, token: session.data.session.access_token };
  const context = await browser.newContext({
    viewport: { width: role === "admin" ? 1440 : 390, height: 844 },
    locale: "ko-KR",
    timezoneId: "Asia/Seoul",
    reducedMotion: "reduce",
  });
  contexts.push(context);
  await context.route(/https:\/\/([^/]*\.)?(tosspayments\.com|tosspayments\.io)\//, (route) => {
    providerRequests++;
    return route.abort();
  });
  const page = await context.newPage();
  page.on("request", (request) => {
    if (
      /\/functions\/v1\/(assistant-chat|compose-profile|prepare-conversation|compose-pair-brief)(?:\?|$)/.test(
        new URL(request.url()).pathname,
      )
    )
      llmRequests++;
  });
  page.setDefaultTimeout(15000);
  page.setDefaultNavigationTimeout(45000);
  await go(page, "/login");
  for (let attempt = 0; attempt < 20; attempt++) {
    await page.getByLabel("가입한 이메일").fill(account.email);
    await page.getByLabel("비밀번호").fill(password);
    if (await page.getByRole("button", { name: "로그인", exact: true }).isEnabled()) break;
    await delay(200);
  }
  await page.getByRole("button", { name: "로그인", exact: true }).click();
  await page.waitForURL("**/home");
  await page.locator(".home-greeting h1").waitFor();
  return page;
}
async function ask(page, text, action) {
  await go(page, "/home");
  await page.getByLabel("매니저에게 물어볼 내용").fill(text);
  await page.getByRole("button", { name: "매니저에게 질문하기" }).click();
  const link = page.locator(".assistant-reply").getByRole("link", { name: action, exact: true });
  await link.waitFor();
  return link;
}
async function screenshot(page, name) {
  await page.evaluate(() => document.fonts.ready);
  const issues = (await new AxeBuilder({ page }).analyze()).violations.filter((v) =>
    ["serious", "critical"].includes(v.impact),
  );
  assert.deepEqual(
    issues.map((v) => v.id),
    [],
  );
  assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
  await page.screenshot({ path: `${shots}/${name}.png` });
}
try {
  const male = await login("male"),
    female = await login("female"),
    admin = await login("admin");
  assert.equal(
    (await post("/__lab/supabase/functions/v1/reconcile-ticket-payment", {}, clients.admin.token))
      .status,
    409,
  );
  await assert.rejects(recoverIncompleteCycle(env, "manual"), /completed fixture/);
  // Simulate an interrupted setup using another fresh, explicitly owned cohort.
  const incomplete = await prepareCycle(env, "qa-incomplete");
  incomplete.ready = false;
  await writeFile(manifestPath("qa-incomplete"), JSON.stringify(incomplete), { mode: 0o600 });
  assert.equal(
    (await recoverIncompleteCycle(env, "qa-incomplete")).removedUnusedSyntheticAccounts,
    3,
  );
  assert.equal((await post("/__lab/payment/authorize", {})).status, 401);
  assert.equal(
    (await post("/__lab/payment/authorize", {}, clients.male.token, "https://aftersunset.kr"))
      .status,
    403,
  );
  await (await ask(male, "약속 잡아줘", "소개 확인하기")).waitFor();
  assert.equal(cycleStatus(env, manifest).meetings, 0);
  // Direct profile editing is separate from signup and does not call an LLM.
  await (await ask(male, "프로필 수정해줘", "내 프로필 보기")).click();
  await male.getByRole("link", { name: "프로필 수정", exact: true }).click();
  await male.getByLabel("직업", { exact: true }).fill("로컬 QA 엔지니어");
  await male
    .getByLabel("한 줄 소개", { exact: true })
    .fill("작은 일상을 다정하게 나누고 싶은 사람");
  await male
    .getByLabel("짧은 소개", { exact: true })
    .fill("퇴근길에 동네 서점을 들러 책을 읽어요. 서로의 하루를 편하게 궁금해하는 만남이 좋아요.");
  await male
    .locator('textarea[id^="edit-daily_life"]')
    .first()
    .fill("퇴근길 동네 서점을 들러 새 책을 살펴보는 걸 좋아해요. 요즘은 수영도 배우고 있습니다.");
  await male.getByRole("button", { name: "변경사항 저장", exact: true }).click();
  await male.waitForURL("**/profile");
  assert.equal(
    database(env, `select job from profiles where id=${quote(manifest.accounts.male.id)}`),
    "로컬 QA 엔지니어",
  );
  console.log("PASS assistant → real profile edit and publish");

  await (await ask(female, "호감 보내줘", "소개 확인하기")).click();
  await female.getByRole("button", { name: "좋아요", exact: true }).click();
  await female.getByText("좋아요를 남겼어요.", { exact: true }).waitFor();
  assert.equal(cycleStatus(env, manifest).likes, 1);
  assert.equal(
    cycleStatus(env, manifest).queue,
    0,
    "like does not silently create a curated intro",
  );
  await go(admin, `/admin/curation?male=${manifest.accounts.male.id}`);
  await admin.getByRole("button", { name: "큐에 추가", exact: true }).click();
  await admin
    .getByPlaceholder("큐레이션 사유 (필수 — 왜 이 순서인지)")
    .fill("수동 QA: 같은 지역의 실제 호감을 확인하고 소개 승인");
  await admin.getByRole("button", { name: "큐 저장", exact: true }).click();
  await admin.getByText("큐를 저장했습니다.", { exact: true }).waitFor();
  assert.equal(cycleStatus(env, manifest).queue, 1);
  console.log("PASS female like → explicit operator curation");

  const paidOrders = {};
  for (const kind of ["intro", "meeting"]) {
    await (await ask(male, "티켓 구매하고 싶어", "티켓·가격 확인")).click();
    await male.waitForURL("**/store");
    await male
      .getByRole("group", { name: "티켓 종류", exact: true })
      .getByRole("button", { name: kind === "intro" ? "소개 티켓" : "만남 티켓", exact: true })
      .click();
    await male.waitForURL(`**/store?kind=${kind}`);
    await male.getByRole("button", { name: "1장 결제하기", exact: true }).click();
    await male.waitForURL("**/checkout?orderId=*");
    const orderId = new URL(male.url()).searchParams.get("orderId");
    paidOrders[kind] = orderId;
    const order = JSON.parse(
      database(env, `select row_to_json(o) from ticket_orders o where order_id=${quote(orderId)}`),
    );
    const paymentKey = `local_manual_${orderId}`;
    const body = { orderId, amount: order.amount, paymentKey };
    const confirm = "/__lab/supabase/functions/v1/confirm-ticket-payment";
    assert.equal(
      (await post(confirm, body, clients.male.token)).status,
      409,
      "forged success URL cannot issue a ticket",
    );
    assert.equal((await post("/__lab/payment/authorize", body, clients.female.token)).status, 403);
    assert.equal(
      (
        await post(
          "/__lab/payment/authorize",
          { ...body, amount: order.amount + 1 },
          clients.male.token,
        )
      ).status,
      400,
    );
    if (kind === "intro") {
      await male.getByRole("button", { name: /원 결제하기$/ }).click();
      await male.getByRole("button", { name: "모의 결제 취소", exact: true }).click();
      await male.waitForURL("**/payment/fail?*");
      assert.equal(cycleStatus(env, manifest).tickets, 0);
      await male.getByRole("link", { name: "결제 이어하기", exact: true }).click();
    }
    await male.getByRole("button", { name: /원 결제하기$/ }).click();
    await male.getByRole("dialog").waitFor();
    for (const scheme of ["light", "dark"]) {
      await male.emulateMedia({ colorScheme: scheme });
      for (const width of [320, 390, 1440]) {
        await male.setViewportSize({ width, height: 844 });
        const box = await male.getByRole("dialog").boundingBox();
        assert.ok(box.x >= 16 && box.y >= 16 && box.y + box.height <= 828);
        await screenshot(male, `mock-dialog-${kind}-${scheme}-${width}`);
      }
    }
    await male.setViewportSize({ width: 390, height: 844 });
    await male.emulateMedia({ colorScheme: "light" });
    await male.getByRole("button", { name: "청구 없이 모의 결제 승인", exact: true }).click();
    await male.getByRole("heading", { name: "결제가 완료되었습니다", exact: true }).waitFor();
    assert.equal(
      (await post(confirm, body, clients.male.token)).status,
      200,
      "confirmation retry is idempotent",
    );
    assert.equal(
      database(
        env,
        `select count(*) from tickets where user_id=${quote(manifest.accounts.male.id)} and kind=${quote(kind)}`,
      ),
      "1",
    );
    if (kind === "intro") {
      await go(male, "/orders");
      await male.getByRole("button", { name: "미사용 주문 취소", exact: true }).click();
      await male.getByRole("button", { name: "주문 취소하기", exact: true }).click();
      await male.getByText("결제 취소를 확인했습니다.", { exact: true }).waitFor();
      const cancel = "/__lab/supabase/functions/v1/cancel-ticket-payment";
      assert.equal((await post(cancel, { orderId }, clients.male.token)).status, 200);
      assert.equal(
        database(env, `select state from ticket_orders where order_id=${quote(orderId)}`),
        "canceled",
      );
      assert.equal(
        database(
          env,
          `select count(*) from tickets where user_id=${quote(manifest.accounts.male.id)} and state='refunded'`,
        ),
        "1",
      );
      await go(male, "/store?kind=intro");
      await male.getByRole("button", { name: "1장 결제하기", exact: true }).click();
      await male.waitForURL("**/checkout?orderId=*");
      paidOrders.intro = new URL(male.url()).searchParams.get("orderId");
      await male.getByRole("button", { name: /원 결제하기$/ }).click();
      await male.getByRole("button", { name: "청구 없이 모의 결제 승인", exact: true }).click();
      await male.getByRole("heading", { name: "결제가 완료되었습니다", exact: true }).waitFor();
    }
  }
  console.log(
    "PASS manual mock approve/cancel, real LOCAL order/tickets, owner/amount/origin/forged-callback guards, idempotency",
  );

  await (await ask(male, "이 여자 소개시켜줘", "소개 확인하기")).click();
  await male.getByRole("button", { name: "소개 티켓 1장 쓰고 열기", exact: true }).click();
  await male.getByRole("heading", { name: new RegExp(manifest.accounts.female.name) }).waitFor();
  await (await ask(male, "약속 잡아줘", "만남 요청 확인")).click();
  await male.getByRole("heading", { name: "언제 만날까요?", exact: true }).waitFor();
  await male.getByRole("group", { name: "날짜", exact: true }).getByRole("button").first().click();
  await male
    .getByRole("group", { name: "시간", exact: true })
    .getByRole("button", { name: "7시", exact: true })
    .click();
  await male.getByLabel("만날 곳", { exact: true }).fill("가상 로컬 카페 · 실제 예약 아님");
  await male.getByRole("button", { name: /후보 1개로 요청하기/ }).click();
  await male.getByText("답변을 기다리는 중입니다", { exact: true }).waitFor();
  assert.equal(cycleStatus(env, manifest).meetings, 1);
  await (await ask(female, "약속 잡아줘", "매니저와 일정 정리")).click();
  await female.getByRole("radio").first().check();
  await female.getByRole("button", { name: "전달 전 초안 보기", exact: true }).click();
  await female.getByRole("region", { name: "일정 초안", exact: true }).waitFor();
  const meetingId = cycleStatus(env, manifest).meetingId;
  assert.equal(
    database(env, `select confirmed_at is not null from meetings where id=${quote(meetingId)}`),
    "f",
    "Draft alone must not confirm a meeting",
  );
  await female.getByRole("checkbox").check();
  await female.getByRole("button", { name: "승인하고 확정하기", exact: true }).click();
  await female
    .getByText("약속을 확정했어요. 기존 약속 화면에서도 확인할 수 있어요.", { exact: true })
    .waitFor();
  assert.equal(
    database(env, `select confirmed_at is not null from meetings where id=${quote(meetingId)}`),
    "t",
  );
  console.log(
    "PASS assistant introduction → meeting request → female acceptance → confirmed schedule",
  );
  for (const command of ["checkin", "feedback"]) {
    execFileSync("node", ["scripts/assistant-manual-cycle.mjs", command, "qa-manual"], {
      stdio: "pipe",
    });
    const valid =
      command === "checkin"
        ? "scheduled_at between now()+interval '19 hours' and now()+interval '21 hours'"
        : "scheduled_at between now()-interval '3 hours' and now()-interval '1 hour'";
    assert.equal(database(env, `select ${valid} from meetings where id=${quote(meetingId)}`), "t");
  }
  assert.equal(providerRequests, 0, "No actual Toss SDK/API network requests");
  assert.equal(llmRequests, 0, "Service workflow must not invoke LLM");
  for (const orderId of Object.values(paidOrders))
    assert.equal(
      (
        await post(
          "/__lab/supabase/functions/v1/cancel-ticket-payment",
          { orderId },
          clients.male.token,
        )
      ).status,
      409,
      "Used orders cannot be refunded by the mock",
    );
  assert.deepEqual(legacyFingerprint(env), before, "Original accounts and settings preserved");
  await writeFile(
    `${shots}/report.json`,
    JSON.stringify(
      {
        result: "PASS",
        browser: process.env.AFTER_TEST_BROWSER === "webkit" ? "webkit" : "chromium",
        providerRequests,
        llmRequests,
        existingRecordsUnchanged: true,
        tag: manifest.tag,
        state: cycleStatus(env, manifest),
      },
      null,
      2,
    ),
  );
  console.log(`Manual cycle QA PASS. Evidence: ${shots}/report.json`);
} catch (error) {
  for (const [index, context] of contexts.entries()) {
    const page = context.pages()[0];
    if (page) await page.screenshot({ path: `${shots}/failure-${index}.png` }).catch(() => {});
  }
  throw error;
} finally {
  await browser.close();
  await server.close();
  // Dispose only the three owned qa-manual users created by this test. Never
  // reset the manual participant or the original lab. The report remains.
  assert.equal(manifest.tag, "qa-manual");
  const ids = [manifest.accounts.male.id, manifest.accounts.female.id].map(quote).join(",");
  for (const table of ["intros", "intro_queue", "pair_brief_drafts"])
    assert.equal(
      database(
        env,
        `select count(*) from ${table} where (male_id in (${ids}) or female_id in (${ids})) and not(male_id in (${ids}) and female_id in (${ids}))`,
      ),
      "0",
      "Refusing to remove QA fixture with external relationships",
    );
  database(
    env,
    `begin;
    delete from admin_actions where actor_id=${quote(manifest.accounts.admin.id)};
    delete from pair_brief_drafts where male_id in (${ids}) and female_id in (${ids});
    delete from meetings where intro_id in (select id from intros where male_id in (${ids}) and female_id in (${ids}));
    delete from tickets where user_id in (${ids});
    delete from intro_queue where male_id in (${ids}) and female_id in (${ids});
    delete from intros where male_id in (${ids}) and female_id in (${ids});
    delete from ticket_orders where user_id in (${ids});
    commit;`,
  );
  const service = createClient(env.API_URL, env.SERVICE_ROLE_KEY, {
    auth: { persistSession: false },
  });
  for (const account of Object.values(manifest.accounts)) {
    const files = Array.from({ length: 3 }, (_, i) => `${account.id}/manual-cycle-${i}.png`);
    assert.ifError((await service.storage.from("profile-photos").remove(files)).error);
    assert.ifError((await service.auth.admin.deleteUser(account.id)).error);
  }
  await unlink(manifestPath("qa-manual"));
  assert.deepEqual(legacyFingerprint(env), before);
}
