import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { existsSync, readFileSync, statSync } from "node:fs";
import { mkdir, writeFile } from "node:fs/promises";
import { setTimeout as delay } from "node:timers/promises";
import { createClient } from "@supabase/supabase-js";
import { chromium } from "playwright";
import AxeBuilder from "@axe-core/playwright";
import {
  localEnvironment,
  prepareCycle,
  cycleStatus,
  database,
  quote,
  password,
  existingPublicRecordHashes,
  assertExistingPublicRecordsPreserved,
} from "./lib/manual-cycle-fixtures.mjs";
import { startManualServer, manualOriginForPort } from "./lib/manual-cycle-server.mjs";
import {
  fileGenerationReceipts,
  recordedGeneration,
} from "./lib/concierge-generation-receipts.mjs";

// Explicit opt-in: this test uses the real local Edge runtime with a hard cap of
// six generation + verification operations (twelve provider requests), including
// any explicitly diagnosed and repaired failure retained in the same state.
assert.equal(process.env.AFTER_CONCIERGE_LIVE, "1", "Set AFTER_CONCIERGE_LIVE=1 for live LLM QA");
const tag = process.env.AFTER_CYCLE_TAG ?? `qa-concierge-${Date.now().toString(36)}`;
assert.match(tag, /^qa-concierge-[a-z0-9-]{1,18}$/);
const port = 5192;
const base = manualOriginForPort(port);
const evidence = `/tmp/after-concierge-cycle-${tag}`;
await mkdir(evidence, { recursive: true });
const statePath = `${evidence}/state.json`;
const state = existsSync(statePath)
  ? JSON.parse(readFileSync(statePath, "utf8"))
  : { tag, done: {}, generationRequests: 0, generationReceiptVersion: 1, pendingGeneration: null };
assert.equal(state.tag, tag);
const save = () => writeFile(statePath, JSON.stringify(state, null, 2), { mode: 0o600 });
const generationReceipts = fileGenerationReceipts(`${evidence}/generation-receipts`);
if (state.pendingGeneration) {
  const pending = state.pendingGeneration;
  const receipt = pending.operation ? await generationReceipts.read(pending.operation) : null;
  assert.equal(
    receipt?.state,
    "succeeded",
    "Resolve the previous ambiguous live generation before retrying",
  );
  assert.equal(receipt.requestId, pending.requestId, "Generation recovery receipt changed");
  assert.equal(receipt.feature, pending.name, "Generation recovery feature changed");
  assert.equal(receipt.response?.status, 200, "Generation recovery response is not successful");
  state.pendingGeneration = null;
  await save();
}
const env = localEnvironment();
assert.equal(
  database(
    env,
    "select assistant_introduction_enabled and assistant_profile_edit_enabled from app_settings",
  ),
  "t",
  "Root must explicitly prepare the local feature flags before this test",
);
const beforePath = `${evidence}/existing-record-hashes.json`;
const before = existsSync(beforePath)
  ? JSON.parse(readFileSync(beforePath, "utf8"))
  : existingPublicRecordHashes(env);
if (!existsSync(beforePath)) await writeFile(beforePath, JSON.stringify(before), { mode: 0o600 });
assert.equal(
  database(
    env,
    "select count(*) from vault.decrypted_secrets where name in ('edge_function_base_url','service_role_key')",
  ),
  "0",
  "A live notification dispatcher must not be configured during this local QA",
);
const manifest = await prepareCycle(env, tag);
state.accounts = Object.fromEntries(
  Object.entries(manifest.accounts).map(([role, account]) => [
    role,
    { id: account.id, email: account.email },
  ]),
);
await save();
const server = await startManualServer(env, tag, { port });
const browser = await chromium.launch();
const pages = {};
const clients = {};
const failures = [];
const httpErrors = [];
let pgNetworkRequests = 0;
let unexpectedModelRequests = 0;
let browserIntroductionReceipt = null;
const authHeaders = (token) => ({
  "Content-Type": "application/json",
  Origin: base,
  Authorization: `Bearer ${token}`,
});
async function post(path, body, token) {
  const response = await fetch(base + path, {
    method: "POST",
    headers: authHeaders(token),
    body: JSON.stringify(body),
  });
  let data;
  try {
    data = await response.json();
  } catch {
    data = null;
  }
  return { status: response.status, data };
}
async function feature(name, body, role = "male") {
  return post(`/__lab/supabase/functions/v1/${name}`, body, clients[role].token);
}
async function generate(operation, name, body) {
  assert.ok(
    state.generationRequests === 0 || state.generationReceiptVersion === 1,
    "Legacy generation state has no operation receipts; inspect existing evidence before proceeding",
  );
  const recorded = await recordedGeneration({
    operation,
    feature: name,
    body,
    store: generationReceipts,
    beforeSend: async (receipt) => {
      assert.equal(state.pendingGeneration, null, "An unresolved generation already exists");
      assert.ok(state.generationRequests < 6, "Twelve-provider-request upper bound reached");
      state.generationRequests++;
      state.pendingGeneration = { operation, name, requestId: receipt.requestId };
      await save();
    },
    send: (request) => feature(name, request),
  });
  const result = recorded.response;
  // The complete successful response is already atomically on disk at this point.
  state.pendingGeneration = result.status === 200 ? null : state.pendingGeneration;
  state.lastGeneration = {
    operation,
    name,
    requestId: recorded.requestId,
    status: result.status,
    code: result.data?.code,
    stage: result.data?.stage,
    reason: result.data?.reason,
  };
  await save();
  assert.equal(
    result.status,
    200,
    `Live ${name} failed: ${result.data?.code ?? result.status} ${result.data?.stage ?? ""} ${result.data?.reason ?? ""}`,
  );
  return { data: result.data, requestId: recorded.requestId };
}
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
  await context.route(/https:\/\/([^/]*\.)?(tosspayments\.com|tosspayments\.io)\//, (route) => {
    pgNetworkRequests++;
    return route.abort();
  });
  // Paid generation is called explicitly by generate(), never as a side effect
  // of browsing the synthetic profile. Other model-backed features are blocked.
  await context.route(
    /\/functions\/v1\/(assistant-chat|compose-profile|prepare-conversation|compose-pair-brief|introduce-member|revise-profile)(?:\?|$)/,
    (route) => {
      if (
        new URL(route.request().url()).pathname.endsWith("/introduce-member") &&
        browserIntroductionReceipt
      ) {
        const body = route.request().postDataJSON();
        assert.equal(body.target, browserIntroductionReceipt.targetId);
        assert.equal(body.consent, true);
        // Replay only the exact result generated and cache-checked against the
        // real Edge runtime. This UI check cannot start another provider run.
        return route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({ ...browserIntroductionReceipt, cached: true }),
        });
      }
      unexpectedModelRequests++;
      return route.abort();
    },
  );
  const page = await context.newPage();
  pages[role] = page;
  page.on("response", async (response) => {
    if (response.status() >= 400) {
      const path = new URL(response.url()).pathname;
      if (path.startsWith("/__lab/supabase/")) {
        const error = await response.json().catch(() => null);
        httpErrors.push({
          role,
          path,
          status: response.status(),
          code:
            typeof error?.code === "string" && /^[A-Z0-9_]+$/.test(error.code) ? error.code : null,
          issuedInFuture: /issued.*future/i.test(error?.message ?? ""),
        });
      }
    }
  });
  page.setDefaultTimeout(20000);
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
async function ask(page, text, name) {
  await go(page, "/home");
  await page.getByLabel("비서에게 물어볼 내용").fill(text);
  await page.getByRole("button", { name: "비서에게 질문하기" }).click();
  const action = page.locator(".assistant-reply").getByRole("link", { name, exact: true });
  await action.waitFor();
  return action;
}
async function screen(page, name) {
  await page.evaluate(() => document.fonts.ready);
  const violations = (await new AxeBuilder({ page }).analyze()).violations.filter((item) =>
    ["serious", "critical"].includes(item.impact),
  );
  assert.deepEqual(
    violations.map((item) => item.id),
    [],
    name,
  );
  assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), name);
  await page.screenshot({ path: `${evidence}/${name}.png`, fullPage: true });
}
async function screenModes(page, name) {
  for (const scheme of ["light", "dark"]) {
    await page.emulateMedia({ colorScheme: scheme });
    for (const width of [390, 1440]) {
      await page.setViewportSize({ width, height: 844 });
      await screen(page, `${name}-${scheme}-${width}`);
    }
  }
  await page.setViewportSize({ width: 390, height: 844 });
  await page.emulateMedia({ colorScheme: "light" });
}
const profileHash = () =>
  database(
    env,
    `select md5(json_build_object('headline',headline,'intro',intro,'story',profile_story)::text) from profiles where id=${quote(manifest.accounts.male.id)}`,
  );
function assertPreservedRecords(after) {
  const stableBefore = Object.fromEntries(
    Object.entries(before).filter(([table]) => table !== "curation_batch_state"),
  );
  assertExistingPublicRecordsPreserved(stableBefore, after);
  const counterChanged = (before.curation_batch_state ?? []).some(
    (hash) => !after.curation_batch_state?.includes(hash),
  );
  if (counterChanged) {
    const since = new Date(statSync(beforePath).mtimeMs).toISOString();
    assert.ok(
      Number(
        database(
          env,
          `select count(*) from cron.job_run_details r join cron.job j on j.jobid=r.jobid where j.jobname='curation_recommendations_15m' and r.status='succeeded' and r.start_time>=${quote(since)}::timestamptz`,
        ),
      ) > 0,
    );
  }
  return {
    table: "curation_batch_state",
    counterChanged,
    reason: "Existing scheduled aggregate refresh; original hashes retained",
  };
}
async function showIntroduction(page, result, name) {
  browserIntroductionReceipt = result;
  try {
    await go(page, "/intro");
    await page
      .getByLabel("두 사람의 공개 답변을 AI에 보내 소개 설명을 준비하는 데 동의해요.")
      .check();
    await page.getByRole("button", { name: "비서 설명 듣기", exact: true }).click();
    await page.getByText(result.portrait[0].text, { exact: true }).waitFor();
    await screenModes(page, name);
  } finally {
    browserIntroductionReceipt = null;
  }
}
async function stage(name, work) {
  if (state.done[name]) return;
  await work();
  state.done[name] = true;
  await save();
  console.log(`PASS ${name}`);
}
function shiftMeeting(id, when) {
  assert.equal(id, cycleStatus(env, manifest).meetingId);
  const ids = Object.values(manifest.accounts)
    .map((account) => quote(account.id))
    .join(",");
  assert.equal(database(env, `select count(*) from device_tokens where user_id in (${ids})`), "0");
  assert.equal(
    database(env, `select count(*) from profiles where id in (${ids}) and phone is not null`),
    "0",
  );
  database(
    env,
    `begin;
    create temporary table qa_attendance as select male_attendance_at,female_attendance_at from meetings where id=${quote(id)};
    update meetings set scheduled_at=${when},proposed_slots=array[${when}],accepted_slot=0,private_opens_at=now()-interval '1 hour' where id=${quote(id)};
    update meetings set male_attendance_at=(select male_attendance_at from qa_attendance),female_attendance_at=(select female_attendance_at from qa_attendance) where id=${quote(id)};
    commit;`,
  );
}

try {
  const male = await login("male");
  const female = await login("female");
  const admin = await login("admin");
  const maleId = manifest.accounts.male.id;
  const femaleId = manifest.accounts.female.id;
  async function reviseProfileFlow() {
    await stage("profile-revision-gates-and-draft", async () => {
      const requestId = randomUUID();
      assert.equal(
        (
          await feature("revise-profile", {
            requestId,
            instruction: "원문을 다정하게 다듬어 주세요",
            consent: false,
          })
        ).status,
        400,
      );
      const beforeDraft = profileHash();
      const { data: draft } = await generate("profile-revision-gates-and-draft", "revise-profile", {
        instruction:
          "지금 공개된 내용과 사실은 그대로 유지하고, 서점에 들르는 퇴근길과 수영을 배우는 모습을 조금 더 자연스럽고 다정한 존댓말로 다듬어 주세요.",
        consent: true,
      });
      assert.equal(profileHash(), beforeDraft, "Draft generation must not publish a profile");
      const owned = await clients.male.client.rpc("my_profile_revision", {});
      assert.ifError(owned.error);
      assert.ok(owned.data?.draft?.id, "Owner must be able to review the generated draft");
      state.revisionId = owned.data.draft.id;
      state.beforeProfileHash = beforeDraft;
      await writeFile(
        `${evidence}/profile-revision.json`,
        JSON.stringify({ generated: draft, review: owned.data }, null, 2),
        { mode: 0o600 },
      );
      const stranger = await clients.female.client.rpc("my_profile_revision", {
        p_id: state.revisionId,
      });
      assert.ok(
        stranger.error || !stranger.data?.draft,
        "Other member cannot inspect a private revision",
      );
      await go(male, "/assistant-profile");
      await male.getByRole("button", { name: "이대로 프로필에 반영", exact: true }).waitFor();
      await screen(male, "profile-revision-before-approval");
    });
    await stage("profile-explicit-approval-and-idempotency", async () => {
      assert.equal(
        database(
          env,
          `select count(*) from member_introductions where owner_id=${quote(maleId)} and target_id=${quote(femaleId)}`,
        ),
        "1",
        "The earlier public-profile explanation is present before publication",
      );
      await go(male, "/assistant-profile");
      await male.getByRole("button", { name: "이대로 프로필에 반영", exact: true }).click();
      await delay(700);
      assert.notEqual(
        profileHash(),
        state.beforeProfileHash,
        "Approval must atomically publish the changed content",
      );
      assert.equal(
        database(
          env,
          `select count(*) from member_introductions where owner_id=${quote(maleId)} and target_id=${quote(femaleId)}`,
        ),
        "0",
        "Publishing a revised profile must clear the previous member explanation",
      );
      const published = profileHash();
      const repeated = await clients.male.client.rpc("approve_profile_revision", {
        p_id: state.revisionId,
        p_approved: true,
      });
      assert.ifError(repeated.error);
      assert.equal(repeated.data?.state, "approved");
      assert.equal(repeated.data?.reused, true);
      assert.equal(profileHash(), published, "Approval retry must not publish twice");
      await screen(male, "profile-revision-approved");
    });
  }
  await stage("female-like-and-explicit-operator-curation", async () => {
    await (await ask(female, "호감 보내줘", "소개 확인하기")).click();
    await female.getByRole("button", { name: "좋아요", exact: true }).click();
    await female.getByText("좋아요를 남겼어요.", { exact: true }).waitFor();
    assert.equal(cycleStatus(env, manifest).likes, 1);
    assert.equal(cycleStatus(env, manifest).queue, 0);
    await go(admin, `/admin/curation?male=${maleId}`);
    await admin.getByRole("button", { name: "큐에 추가", exact: true }).click();
    await admin
      .getByPlaceholder("큐레이션 사유 (필수 — 왜 이 순서인지)")
      .fill("합성 QA: 같은 지역에서 직접 호감을 남긴 두 회원의 소개를 승인했습니다.");
    await admin.getByRole("button", { name: "큐 저장", exact: true }).click();
    await admin.getByText("큐를 저장했습니다.", { exact: true }).waitFor();
    assert.equal(cycleStatus(env, manifest).queue, 1);
    await screen(admin, "operator-curation");
  });
  for (const kind of ["intro", "meeting"])
    await stage(`mock-checkout-${kind}`, async () => {
      await (await ask(male, "티켓 구매하고 싶어", "티켓·가격 확인")).click();
      await male
        .getByRole("group", { name: "티켓 종류", exact: true })
        .getByRole("button", { name: kind === "intro" ? "소개 티켓" : "만남 티켓", exact: true })
        .click();
      await male.waitForURL(`**/store?kind=${kind}`);
      await male.getByRole("button", { name: "1장 결제하기", exact: true }).click();
      await male.waitForURL("**/checkout?orderId=*");
      const orderId = new URL(male.url()).searchParams.get("orderId");
      const amount = Number(
        database(env, `select amount from ticket_orders where order_id=${quote(orderId)}`),
      );
      const body = { orderId, amount, paymentKey: `local_manual_${orderId}` };
      assert.equal(
        (
          await post(
            "/__lab/supabase/functions/v1/confirm-ticket-payment",
            body,
            clients.male.token,
          )
        ).status,
        409,
      );
      assert.equal(
        (await post("/__lab/payment/authorize", body, clients.female.token)).status,
        403,
      );
      assert.equal(
        (
          await post(
            "/__lab/payment/authorize",
            { ...body, amount: amount + 1 },
            clients.male.token,
          )
        ).status,
        400,
      );
      await male.getByRole("button", { name: /원 결제하기$/ }).click();
      await male.getByRole("button", { name: "청구 없이 모의 결제 승인", exact: true }).click();
      await male.getByRole("heading", { name: "결제가 완료되었습니다", exact: true }).waitFor();
      assert.equal(
        (
          await post(
            "/__lab/supabase/functions/v1/confirm-ticket-payment",
            body,
            clients.male.token,
          )
        ).status,
        200,
      );
      assert.equal(
        database(
          env,
          `select count(*) from tickets where user_id=${quote(maleId)} and kind=${quote(kind)} and state='unused'`,
        ),
        "1",
      );
      await screen(male, `mock-checkout-${kind}`);
    });
  await stage("paid-intro-access", async () => {
    assert.equal(
      (
        await feature("introduce-member", {
          target: femaleId,
          requestId: randomUUID(),
          consent: true,
        })
      ).status,
      403,
      "Unopened paid profile cannot be explained",
    );
    await (await ask(male, "이 여자 소개시켜줘", "소개 확인하기")).click();
    await male.getByRole("button", { name: "소개 티켓 1장 쓰고 열기", exact: true }).click();
    await male.getByRole("heading", { name: new RegExp(manifest.accounts.female.name) }).waitFor();
    await screen(male, "opened-introduction");
  });
  await stage("real-manager-introduction-and-free-cache", async () => {
    const gateRequestId = randomUUID();
    assert.equal(
      (
        await feature("introduce-member", {
          target: maleId,
          requestId: gateRequestId,
          consent: true,
        })
      ).status,
      403,
    );
    assert.equal(
      (
        await feature("introduce-member", {
          target: femaleId,
          requestId: gateRequestId,
          consent: false,
        })
      ).status,
      400,
    );
    const { data: result, requestId } = await generate(
      "real-manager-introduction-and-free-cache",
      "introduce-member",
      {
        target: femaleId,
        consent: true,
      },
    );
    state.initialIntroductionRequestId = requestId;
    state.introductionRequestId = requestId;
    assert.equal(result.viewerId, maleId);
    assert.equal(result.targetId, femaleId);
    assert.equal(result.cached, false);
    assert.ok(result.portrait.length > 0);
    assert.ok(
      result.portrait.every((item) => item.sources.every((source) => source.person === "other")),
    );
    const cached = await feature("introduce-member", {
      target: femaleId,
      requestId,
      consent: true,
    });
    assert.equal(cached.status, 200);
    assert.equal(cached.data.cached, true);
    assert.deepEqual(cached.data.portrait, result.portrait);
    state.initialIntroductionFingerprint = result.sourceFingerprint;
    await writeFile(`${evidence}/manager-introduction.json`, JSON.stringify(result, null, 2), {
      mode: 0o600,
    });
    await showIntroduction(male, result, "real-manager-introduction");
  });
  await reviseProfileFlow();
  await stage("manager-regenerates-after-approved-profile-edit", async () => {
    const existingReceipt = await generationReceipts.read(
      "manager-regenerates-after-approved-profile-edit",
    );
    if (!existingReceipt) {
      const oldRequest = await feature("introduce-member", {
        target: femaleId,
        requestId: state.initialIntroductionRequestId ?? state.introductionRequestId,
        consent: true,
      });
      assert.notEqual(
        oldRequest.status,
        200,
        "An approved profile edit must invalidate the earlier cached explanation",
      );
      // This explicitly owned QA persona now supplies different public material,
      // so the second explanation must reason from two distinct people instead of
      // repeating the identical baseline fixture. Existing participants are untouched.
      if (!state.regenerationPersonaPrepared) {
        const otherAnswers = [
          "퇴근 후에는 집에서 간단한 요리를 해요. 주말엔 혼자 전시를 보고 마음에 든 작품을 메모해 두곤 해요.",
          "처음에는 조용한 카페에서 커피를 마시며 천천히 알아가고 싶어요. 술은 잘 마시지 않아요.",
          "최근 시도한 요리와 인상 깊게 본 전시 이야기를 나누고 싶어요. 평일에는 늦은 약속보다 짧게 만나는 편이 편해요.",
        ];
        await go(female, "/signup?edit=true");
        await female.getByRole("button", { name: "다음", exact: true }).click();
        await female.getByRole("button", { name: "다음", exact: true }).click();
        await female.getByRole("button", { name: "프로필 수정", exact: true }).click();
        await female
          .getByLabel("한 줄 소개", { exact: true })
          .fill("새로운 맛과 전시 이야기를 나누고 싶어요");
        await female.getByLabel("카드에서 보일 짧은 소개", { exact: true }).fill(otherAnswers[0]);
        for (let index = 0; index < otherAnswers.length; index++)
          await female.locator('textarea[id^="section-"]').nth(index).fill(otherAnswers[index]);
        await female.getByRole("button", { name: "프로필 저장하기", exact: true }).click();
        await female.waitForURL("**/profile");
        state.regenerationPersonaPrepared = true;
        await save();
      }
    }
    const { data: result, requestId } = await generate(
      "manager-regenerates-after-approved-profile-edit",
      "introduce-member",
      {
        target: femaleId,
        consent: true,
      },
    );
    state.introductionRequestId = requestId;
    assert.equal(result.cached, false);
    assert.notEqual(result.sourceFingerprint, state.initialIntroductionFingerprint);
    await writeFile(
      `${evidence}/manager-introduction-after-edit.json`,
      JSON.stringify(result, null, 2),
      { mode: 0o600 },
    );
    const cached = await feature("introduce-member", {
      target: femaleId,
      requestId,
      consent: true,
    });
    assert.equal(cached.status, 200);
    assert.equal(cached.data.cached, true);
    await showIntroduction(male, result, "real-manager-introduction-after-edit");
  });
  await stage("meeting-request-and-assistant-schedule-approval", async () => {
    await (await ask(male, "약속 잡아줘", "만남 요청 확인")).click();
    await male.getByRole("heading", { name: "언제 만날까요?", exact: true }).waitFor();
    await male
      .getByRole("group", { name: "날짜", exact: true })
      .getByRole("button")
      .first()
      .click();
    await male
      .getByRole("group", { name: "시간", exact: true })
      .getByRole("button", { name: "7시", exact: true })
      .click();
    await male.getByLabel("만날 곳", { exact: true }).fill("합성 QA 카페 · 실제 예약 없음");
    await male.getByRole("button", { name: /후보 1개로 요청하기/ }).click();
    await male.getByText("답변을 기다리는 중입니다", { exact: true }).waitFor();
    await (await ask(female, "약속 잡아줘", "비서와 일정 정리")).click();
    await female.getByRole("radio").first().check();
    await female.getByRole("button", { name: "전달 전 초안 보기", exact: true }).click();
    await female.getByRole("region", { name: "일정 초안", exact: true }).waitFor();
    const meeting = cycleStatus(env, manifest).meetingId;
    assert.equal(
      database(env, `select confirmed_at is not null from meetings where id=${quote(meeting)}`),
      "f",
    );
    await female.getByRole("checkbox").check();
    await female.getByRole("button", { name: "승인하고 확정하기", exact: true }).click();
    await female
      .getByText("약속을 확정했어요. 기존 약속 화면에서도 확인할 수 있어요.", { exact: true })
      .waitFor();
    assert.equal(
      database(env, `select confirmed_at is not null from meetings where id=${quote(meeting)}`),
      "t",
    );
    state.meetingId = meeting;
    await screen(female, "assistant-schedule-confirmed");
  });
  await stage("both-actual-checkins", async () => {
    const meeting = state.meetingId;
    shiftMeeting(meeting, "now()+interval '20 hours'");
    for (const page of [male, female]) {
      await go(page, `/chat/${meeting}`);
      await page.getByRole("button", { name: "이 약속에 참석할게요", exact: true }).click();
    }
    await female.getByText("두 분 모두 참석을 확인했어요", { exact: true }).waitFor();
    assert.equal(
      database(
        env,
        `select male_attendance_at is not null and female_attendance_at is not null from meetings where id=${quote(meeting)}`,
      ),
      "t",
    );
    await screen(female, "both-attendance-confirmed");
  });
  await stage("both-real-feedback-submissions-and-terminal-state", async () => {
    const meeting = state.meetingId;
    shiftMeeting(meeting, "now()-interval '2 hours'");
    for (const [role, result] of [
      ["male", "또 만나고 싶어요"],
      ["female", "좋았지만 인연은 아니에요"],
    ]) {
      const page = pages[role];
      await go(page, `/feedback?meetingId=${meeting}`);
      await page.getByRole("button", { name: result, exact: true }).click();
      await page.getByRole("button", { name: "대화가 편했어요", exact: true }).click();
      await page.getByRole("button", { name: "보내기", exact: true }).click();
      await page.getByText("후기를 남겨주셨어요. 고마워요.", { exact: true }).waitFor();
      await go(page, `/feedback?meetingId=${meeting}`);
      await page.getByText("후기를 남겨주셨어요. 고마워요.", { exact: true }).waitFor();
      assert.equal(
        database(
          env,
          `select count(*) from feedbacks where meeting_id=${quote(meeting)} and author_id=${quote(manifest.accounts[role].id)}`,
        ),
        "1",
      );
    }
    assert.equal(
      database(
        env,
        `select cardinality(completed_by)=2 and completed_at is not null and cancelled_at is null from meetings where id=${quote(meeting)}`,
      ),
      "t",
    );
    await screen(female, "cycle-feedback-completed");
  });
  await stage("stale-profile-draft-and-revoked-manager-cache", async () => {
    // This guard test deliberately reuses the earlier successful real model
    // result. It is a separate private SQL fixture, not a new LLM generation.
    const requestId = randomUUID();
    const recorded = JSON.parse(readFileSync(`${evidence}/profile-revision.json`, "utf8")).review
      .draft;
    const begun = await clients.male.client.rpc("begin_profile_revision", {
      p_id: requestId,
      p_instruction: recorded.instruction,
      p_consent: true,
    });
    assert.ifError(begun.error);
    assert.equal(begun.data?.created, true);
    const service = createClient(env.API_URL, env.SERVICE_ROLE_KEY, {
      auth: { persistSession: false },
    });
    const stored = await service.rpc("store_profile_revision", {
      p_owner: maleId,
      p_id: requestId,
      p_before: recorded.before,
      p_after: recorded.after,
      p_note: recorded.note,
    });
    assert.ifError(stored.error);
    assert.equal(stored.data, true);
    state.staleValidation = {
      kind: "private SQL safety fixture",
      source: "earlier successful real LLM before/after receipt",
      requestId,
      additionalProviderRequests: 0,
    };
    await save();
    const pending = await clients.male.client.rpc("my_profile_revision", {});
    assert.ifError(pending.error);
    const staleId = pending.data?.draft?.id;
    assert.ok(staleId);
    await go(male, "/assistant-profile");
    await male.getByRole("button", { name: "이대로 프로필에 반영", exact: true }).waitFor();
    await screenModes(male, "profile-revision-final-review");
    database(
      env,
      `update profiles set job='합성 QA 엔지니어 · 새 리비전' where id=${quote(maleId)}`,
    );
    const staleApproval = await clients.male.client.rpc("approve_profile_revision", {
      p_id: staleId,
      p_approved: true,
    });
    assert.ok(staleApproval.error, "Changed source must reject an older generated draft");
    const ownerChanged = await feature("introduce-member", {
      target: femaleId,
      requestId: state.introductionRequestId,
      consent: true,
    });
    assert.notEqual(ownerChanged.status, 200, "Owner change must revoke the previous explanation");
    database(
      env,
      `update profiles set job='합성 QA 디자이너 · 새 리비전' where id=${quote(femaleId)}`,
    );
    const targetChanged = await feature("introduce-member", {
      target: femaleId,
      requestId: state.introductionRequestId,
      consent: true,
    });
    assert.notEqual(
      targetChanged.status,
      200,
      "Target change must revoke the previous explanation",
    );
  });
  assert.equal(pgNetworkRequests, 0, "No real payment provider request");
  assert.equal(unexpectedModelRequests, 0, "Browsing must not silently invoke paid models");
  const derivedCounter = assertPreservedRecords(existingPublicRecordHashes(env));
  const aiUsage = JSON.parse(
    database(
      env,
      `select coalesce(json_agg(json_build_object('requestId',request_id,'feature',feature,'model',model,'status',status,'inputTokens',input_tokens,'outputTokens',output_tokens,'latencyMs',latency_ms)),'[]') from ai_runs where user_id=${quote(maleId)} and feature in ('member_introduction','profile_revision')`,
    ),
  );
  const terminal = JSON.parse(
    database(
      env,
      `select json_build_object('confirmed',confirmed_at is not null,'maleAttendance',male_attendance_at is not null,'femaleAttendance',female_attendance_at is not null,'completedCount',cardinality(completed_by),'completed',completed_at is not null,'cancelled',cancelled_at is not null,'feedbackCount',(select count(*) from feedbacks where meeting_id=m.id)) from meetings m where id=${quote(state.meetingId)}`,
    ),
  );
  await writeFile(
    `${evidence}/report.json`,
    JSON.stringify(
      {
        result: "PASS",
        tag,
        base,
        completed: Object.keys(state.done),
        providerRequestUpperBound: state.generationRequests * 2,
        actualPaymentProviderRequests: pgNetworkRequests,
        unexpectedModelRequests,
        existingPublicRecordsPreserved: true,
        derivedCounter,
        aiUsage,
        generationReliability: {
          successfulOperations: aiUsage.filter((item) => item.status === "success").length,
          rejectedOperations: aiUsage.filter((item) => item.status === "invalid").length,
          erroredOperations: aiUsage.filter((item) => item.status === "error").length,
          remainingLimitation:
            "One definite generation_failed receipt remains without a diagnosed provider/SDK cause; no automatic retry was attempted",
        },
        terminal,
        resolvedFailures: state.resolvedFailures ?? [],
        staleValidation: state.staleValidation,
        previousAttemptEvidence:
          "failure.json records an earlier failed attempt; the final workflow and known generation failures are recorded separately in this report",
        state: { ...cycleStatus(env, manifest), url: `${base}/login`, accounts: state.accounts },
      },
      null,
      2,
    ),
    { mode: 0o600 },
  );
  console.log(`Concierge cycle PASS. Evidence: ${evidence}/report.json`);
} catch (error) {
  failures.push({ message: String(error?.message ?? error) });
  for (const [role, page] of Object.entries(pages))
    await page
      .screenshot({ path: `${evidence}/failure-${role}.png`, fullPage: true })
      .catch(() => {});
  await writeFile(
    `${evidence}/failure.json`,
    JSON.stringify(
      { tag, failures, httpErrors, done: state.done, pendingGeneration: state.pendingGeneration },
      null,
      2,
    ),
    { mode: 0o600 },
  );
  throw error;
} finally {
  await browser.close();
  await server.close();
  // Keep this cohort and evidence for inspection. Never reset or delete a user's
  // manual cycle, previous QA accounts, storage, meetings, orders or feedback.
  assertPreservedRecords(existingPublicRecordHashes(env));
}
