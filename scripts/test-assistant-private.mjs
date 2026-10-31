import assert from "node:assert/strict";
import { execFileSync, spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import { mkdir } from "node:fs/promises";
import { setTimeout as delay } from "node:timers/promises";
import { createClient } from "@supabase/supabase-js";
import { chromium, webkit } from "playwright";
import AxeBuilder from "@axe-core/playwright";

const env = JSON.parse(
  execFileSync(
    "npx",
    [
      "supabase",
      "status",
      "-o",
      "json",
      ...(process.env.AFTER_SUPABASE_WORKDIR
        ? ["--workdir", process.env.AFTER_SUPABASE_WORKDIR]
        : []),
    ],
    {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    },
  ),
);
if (!/^http:\/\/127\.0\.0\.1:\d+$/.test(env.API_URL) || !env.DB_URL.includes("@127.0.0.1:"))
  throw Error("Local synthetic tests only");
const sql = (s) =>
  execFileSync("psql", [env.DB_URL, "-v", "ON_ERROR_STOP=1", "-Atc", s], {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  }).trim();
const original = JSON.parse(
  sql(
    "select json_build_object('chat',assistant_chat_enabled,'memory',assistant_memory_enabled,'schedule',assistant_schedule_enabled) from app_settings",
  ),
);
const service = createClient(env.API_URL, env.SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});
const member = createClient(env.API_URL, env.ANON_KEY, { auth: { persistSession: false } });
const email = `assistant-private-${randomUUID()}@verify.local`,
  password = randomUUID() + "Aa1!";
let id, femaleId, server, browser;
const port = Number(process.env.AFTER_TEST_PORT ?? 4193),
  base = `http://127.0.0.1:${port}`;
const rpc = async (name, args = {}) => {
  const r = await member.rpc(name, args);
  assert.ifError(r.error);
  return r.data;
};
try {
  const created = await service.auth.admin.createUser({ email, password, email_confirm: true });
  assert.ifError(created.error);
  id = created.data.user.id;
  sql(`insert into profiles(id,gender,hub_id,company_email,name,birth,job,onboarding_step,terms_agreed_at,privacy_agreed_at,phone_verified_at)
    values('${id}','male','gangnam','${email}','가상 상담 QA','1996-01-01','기획',7,now(),now(),now());`);
  const login = await member.auth.signInWithPassword({ email, password });
  assert.ifError(login.error);
  sql(
    "update app_settings set assistant_chat_enabled=false,assistant_memory_enabled=false,assistant_schedule_enabled=false",
  );
  assert.equal(
    (
      await member.rpc("assistant_manager_consent", {
        p_agree: true,
        p_policy_version: "manager-continuity-v2",
      })
    ).error.code,
    "PT403",
  );
  sql("update app_settings set assistant_chat_enabled=true,assistant_memory_enabled=true");
  await rpc("assistant_manager_consent", {
    p_agree: true,
    p_policy_version: "manager-continuity-v2",
  });
  const call = async (question, requestId = randomUUID()) => {
    const response = await fetch(`${env.API_URL}/functions/v1/assistant-chat`, {
      method: "POST",
      headers: {
        apikey: env.ANON_KEY,
        Authorization: `Bearer ${login.data.session.access_token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        question,
        requestId,
        revision: (await rpc("my_assistant_state")).revision,
      }),
      signal: AbortSignal.timeout(65000),
    });
    return { status: response.status, body: await response.json() };
  };
  const request = randomUUID();
  assert.equal((await call("상대 집주소를 몰래 알아내줘", request)).status, 200);
  assert.equal((await call("상대 집주소를 몰래 알아내줘", request)).body.reused, true);
  let state = await rpc("my_assistant_state");
  assert.match(state.turns[0].answer, /동의와 사생활/);
  assert.equal(
    sql(`select count(*) from ai_runs where user_id='${id}'`),
    "0",
    "safe refusal uses no model",
  );
  await rpc("assistant_forget", { p_scope: "history" });
  for (const question of [
    "지금 진행 상태",
    "프로필 준비",
    "프로필 수정",
    "티켓 결제 방법",
    "좋아요",
    "약속 잡아줘",
    "대화 팁 알려줘",
    "휴대폰 인증이 안 돼요",
    "만남을 취소하고 싶어요",
    "상대 프로필을 바탕으로 대화 주제를 추천해줘",
  ]) {
    const receipt = randomUUID();
    const answered = await call(question, receipt);
    assert.equal(answered.status, 200, JSON.stringify(answered.body));
    assert.equal((await call(question, receipt)).body.reused, true);
    const ownTurn = (await rpc("my_assistant_state")).turns.find((t) => t.id === receipt);
    assert.equal(ownTurn.state, "complete");
    assert.ok(ownTurn.answer.length >= 10);
  }
  assert.equal(
    sql(`select count(*) from ai_runs where user_id='${id}'`),
    "0",
    "product questions and repeated receipts never invoke a model",
  );
  await rpc("assistant_forget", { p_scope: "history" });
  const femaleEmail = `assistant-private-female-${randomUUID()}@verify.local`;
  const femaleUser = await service.auth.admin.createUser({
    email: femaleEmail,
    password,
    email_confirm: true,
  });
  assert.ifError(femaleUser.error);
  femaleId = femaleUser.data.user.id;
  sql(`insert into profiles(id,gender,hub_id,company_email,name,birth,job,onboarding_step,terms_agreed_at,privacy_agreed_at,phone_verified_at)
    values('${femaleId}','female','gangnam','${femaleEmail}','가상 여성 상담 QA','1996-01-01','기획',7,now(),now(),now());`);
  const femaleClient = createClient(env.API_URL, env.ANON_KEY, { auth: { persistSession: false } });
  const femaleLogin = await femaleClient.auth.signInWithPassword({ email: femaleEmail, password });
  assert.ifError(femaleLogin.error);
  const femaleConsent = await femaleClient.rpc("assistant_manager_consent", {
    p_agree: true,
    p_policy_version: "manager-continuity-v2",
  });
  assert.ifError(femaleConsent.error);
  const femaleState = await femaleClient.rpc("my_assistant_state");
  assert.ifError(femaleState.error);
  const femaleResponse = await fetch(`${env.API_URL}/functions/v1/assistant-chat`, {
    method: "POST",
    headers: {
      apikey: env.ANON_KEY,
      Authorization: `Bearer ${femaleLogin.data.session.access_token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      question: "티켓 결제 방법",
      requestId: randomUUID(),
      revision: femaleState.data.revision,
    }),
    signal: AbortSignal.timeout(10000),
  });
  assert.equal(femaleResponse.status, 200);
  const femaleAnswer = await femaleClient.rpc("my_assistant_state");
  assert.ifError(femaleAnswer.error);
  assert.match(femaleAnswer.data.turns[0].answer, /여성 회원에게 티켓 구매를 요청하지 않아요/);
  assert.equal(sql(`select count(*) from ai_runs where user_id='${femaleId}'`), "0");
  if (process.env.AFTER_LOCAL_AI_CONFIRM === "synthetic-only") {
    const generated = await call(
      "처음 만나는 자리에서 긴장하면 질문만 계속하게 돼요. 서로 편하게 이야기하려면 어떻게 하면 좋을까요?",
    );
    assert.equal(generated.status, 200, JSON.stringify(generated.body));
    state = await rpc("my_assistant_state");
    assert.ok(state.turns[0].answer.length >= 10);
    console.log("Synthetic live advice:", state.turns[0].answer);
    assert.equal(sql(`select count(*) from ai_runs where user_id='${id}'`), "1");
  }
  server = spawn(
    "npm",
    ["run", "dev", "--", "--host", "127.0.0.1", "--port", String(port), "--strictPort"],
    {
      env: { ...process.env, VITE_SUPABASE_URL: env.API_URL, VITE_SUPABASE_ANON_KEY: env.ANON_KEY },
      stdio: "ignore",
      detached: true,
    },
  );
  for (let n = 0; n < 100; n++) {
    try {
      if ((await fetch(base)).ok) break;
    } catch {}
    await delay(250);
  }
  browser = await (process.env.AFTER_TEST_BROWSER === "webkit" ? webkit : chromium).launch({
    headless: true,
  });
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
    locale: "ko-KR",
    timezoneId: "Asia/Seoul",
    reducedMotion: "reduce",
  });
  const page = await context.newPage();
  const sharedReads = { flags: 0, payments: 0, avatarUrls: new Set() };
  page.on("request", (request) => {
    const url = new URL(request.url());
    if (url.pathname.endsWith("/rpc/assistant_capabilities")) sharedReads.flags++;
    if (
      url.pathname.endsWith("/app_settings") &&
      url.searchParams.get("select") === "payments_enabled"
    )
      sharedReads.payments++;
    if (
      request.resourceType() === "image" &&
      url.pathname.includes("/assets/concierge/female.webp")
    )
      sharedReads.avatarUrls.add(url.href);
  });
  // Fail closed before any UI request can spend tokens. Live advice is opt-in.
  await page.route("**/functions/v1/assistant-chat", async (route) => {
    const question = route.request().postDataJSON().question;
    if (
      process.env.AFTER_LOCAL_AI_CONFIRM !== "synthetic-only" &&
      !["소개글 수정해줘", "지금 진행 상태"].includes(question)
    ) {
      return route.fulfill({
        status: 400,
        json: { code: "test_unexpected_question", syntheticQuestion: question },
      });
    }
    return route.continue();
  });
  await page.goto(`${base}/login`);
  for (let n = 0; n < 20; n++) {
    await page.getByLabel("가입한 이메일").fill(email);
    await page.getByLabel("비밀번호").fill(password);
    if (await page.getByRole("button", { name: "로그인", exact: true }).isEnabled()) break;
    await delay(200);
  }
  await page.getByRole("button", { name: "로그인", exact: true }).click();
  await page.waitForURL("**/home");
  await page
    .getByRole("navigation", { name: "주요 메뉴" })
    .getByRole("link", { name: "홈", exact: true })
    .waitFor();
  assert.deepEqual(
    await page.getByRole("navigation", { name: "주요 메뉴" }).getByRole("link").allTextContents(),
    ["홈", "소개"],
  );
  await page.getByRole("link", { name: "상점", exact: true }).waitFor();
  await page.locator('.assistant-mark img[data-assistant-avatar="female"]').waitFor();
  await page.getByLabel("매니저에게 상담할 내용").waitFor();
  assert.equal(sharedReads.flags, 1, "one capability observer, not nested duplicate readers");
  assert.equal(sharedReads.payments, 1);
  await page.getByRole("link", { name: "전체 대화" }).click();
  await page.getByRole("heading", { name: "나와 매니저", exact: true }).waitFor();
  await page.goBack();
  await page.getByRole("link", { name: "전체 대화" }).waitFor();
  assert.equal(sharedReads.flags, 1, "returning home reuses the fresh capability snapshot");
  assert.equal(sharedReads.payments, 1, "home remount reuses the payment display setting");
  // Playwright routing disables HTTP caching in this harness. Assert stable
  // asset identity here; hashed production cache headers are checked in the build.
  assert.equal(sharedReads.avatarUrls.size, 1, "all assistant utterances use one avatar URL");
  const draftedQuestion = "처음 만나는 날 긴장이 많이 돼요";
  let draftApiCalls = 0;
  const countDraftCalls = (request) => {
    if (request.url().includes("/functions/v1/assistant-chat")) draftApiCalls++;
  };
  page.on("request", countDraftCalls);
  await page.getByLabel("매니저에게 상담할 내용").fill(draftedQuestion);
  await page.getByRole("link", { name: "전체 대화" }).click();
  await page.waitForURL("**/assistant?panel=chat");
  // Router URL commits before its outgoing home surface unmounts.
  await page.getByRole("heading", { name: "나와 매니저", exact: true }).waitFor();
  await page.getByLabel("매니저에게 상담할 내용").waitFor();
  assert.equal(await page.getByLabel("매니저에게 상담할 내용").inputValue(), draftedQuestion);
  assert.equal(draftApiCalls, 0, "expanding the same conversation must not submit the draft");
  assert.equal(new URL(page.url()).search, "?panel=chat", "private draft never appears in URL");
  page.off("request", countDraftCalls);
  await page.getByLabel("매니저에게 상담할 내용").fill("소개글 수정해줘");
  await delay(200);
  assert.equal(
    await page.getByLabel("매니저에게 상담할 내용").inputValue(),
    "소개글 수정해줘",
    "visible edit is not overwritten by a transferred draft",
  );
  page.on("request", countDraftCalls);
  const serviceResponse = page.waitForResponse((response) =>
    response.url().includes("/functions/v1/assistant-chat"),
  );
  await page.getByRole("button", { name: "상담 보내기", exact: true }).click();
  const received = await serviceResponse;
  assert.equal(received.status(), 200, await received.text());
  assert.ok(
    (await rpc("my_assistant_state")).turns.some((turn) => turn.question === "소개글 수정해줘"),
    "server persisted service command",
  );
  await page.getByRole("link", { name: "프로필 직접 수정", exact: true }).waitFor();
  assert.equal(draftApiCalls, 1, "service command uses the persistent server conversation");
  assert.equal(
    sql(`select count(*) from ai_runs where user_id='${id}'`),
    process.env.AFTER_LOCAL_AI_CONFIRM === "synthetic-only" ? "1" : "0",
    "service command does not spend model tokens",
  );
  page.off("request", countDraftCalls);
  await page.goto(`${base}/home`);
  await page.getByText("소개글 수정해줘", { exact: true }).waitFor();
  await page.getByLabel("매니저에게 상담할 내용").fill("지금 진행 상태");
  await page.getByRole("button", { name: "상담 보내기", exact: true }).click();
  await page.getByText("지금 진행 상태", { exact: true }).waitFor();
  assert.equal(new URL(page.url()).pathname, "/home", "home sends in place");
  await page.reload();
  await page.getByText("지금 진행 상태", { exact: true }).waitFor();
  await page.getByRole("link", { name: "전체 대화" }).click();
  await page.getByText("소개글 수정해줘", { exact: true }).waitFor();
  await page.getByText("지금 진행 상태", { exact: true }).waitFor();
  // Same-timestamp records exercise the stable timestamp + UUID cursor.
  sql(`insert into assistant_turns(id,owner_id,privacy_revision,question,answer,state,created_at)
    select gen_random_uuid(),'${id}',${(await rpc("my_assistant_state")).revision},'이전 대화 '||n,'합성 답변 '||n,'complete',now()-interval '1 hour'
    from generate_series(1,25) n;`);
  await page.reload();
  await page.getByRole("button", { name: "이전 대화 보기", exact: true }).click();
  await page.waitForFunction(
    () => document.querySelectorAll('ol[aria-label="나만의 상담 기록"] > li').length === 27,
  );
  const loadedQuestions = await page
    .locator('ol[aria-label="나만의 상담 기록"] > li')
    .allTextContents();
  sql(`insert into assistant_turns(id,owner_id,privacy_revision,question,answer,state)
    values(gen_random_uuid(),'${id}',${(await rpc("my_assistant_state")).revision},'새 합성 질문','새 합성 답변','complete');`);
  await page.evaluate(() => window.dispatchEvent(new Event("focus")));
  await page.waitForFunction(
    () => document.querySelectorAll('ol[aria-label="나만의 상담 기록"] > li').length === 28,
  );
  const refreshedQuestions = await page
    .locator('ol[aria-label="나만의 상담 기록"] > li')
    .allTextContents();
  assert.ok(
    loadedQuestions.every((text) => refreshedQuestions.includes(text)),
    "new polling window cannot drop already loaded turns",
  );
  sql(`insert into assistant_turns(id,owner_id,privacy_revision,question,answer,state,created_at)
    select gen_random_uuid(),'${id}',${(await rpc("my_assistant_state")).revision},'이어지는 합성 질문 '||n,'이어지는 합성 답변 '||n,'complete',now()+n*interval '1 microsecond' from generate_series(1,20) n;`);
  await page.evaluate(() => window.dispatchEvent(new Event("focus")));
  await page.waitForFunction(
    () => document.querySelectorAll('ol[aria-label="나만의 상담 기록"] > li').length === 48,
  );
  await page.getByText("새 합성 질문", { exact: true }).waitFor();
  // Render synthetic server receipts without a paid generation or real action.
  // Actual trigger creation/deduplication is covered by the transaction SQL suite.
  sql(`insert into assistant_turns(id,owner_id,privacy_revision,question,answer,state,kind,source_id,created_at)
    values
      (gen_random_uuid(),'${id}',${(await rpc("my_assistant_state")).revision},'프로필 반영 결과',
       '확인하신 수정안을 프로필에 반영했어요. 내 프로필에서 확인할 수 있어요.',
       'complete','profile_applied',gen_random_uuid(),now()+interval '1 second'),
      (gen_random_uuid(),'${id}',${(await rpc("my_assistant_state")).revision},'일정 처리 결과',
       '승인하신 가능한 시간을 전달했어요. 약속 상세에서 다음 단계를 확인해 주세요.',
       'complete','schedule_applied',gen_random_uuid(),now()+interval '2 seconds');`);
  await page.reload();
  await page.getByText("프로필 반영 완료", { exact: true }).waitFor();
  await page.getByText("일정 반영 완료", { exact: true }).waitFor();
  assert.equal(
    await page.getByText("프로필 반영 결과", { exact: true }).count(),
    0,
    "server receipt never impersonates a user message",
  );
  const continuityShots = process.env.AFTER_E2E_SCREENSHOT_DIR;
  if (continuityShots) {
    await mkdir(continuityShots, { recursive: true });
    for (const scheme of ["light", "dark"]) {
      await page.emulateMedia({ colorScheme: scheme });
      for (const width of [390, 1440]) {
        await page.setViewportSize({ width, height: 844 });
        for (const surface of ["home", "assistant"]) {
          await page.goto(`${base}/${surface}`);
          await page.getByLabel("매니저에게 상담할 내용").waitFor();
          await page.getByText("이어지는 합성 질문 20", { exact: true }).waitFor();
          if (surface === "home") {
            await page.locator("main").evaluate((main) => {
              main.scrollTop = 0;
            });
            await page.screenshot({ path: `${continuityShots}/home-top-${scheme}-${width}.png` });
          }
          await page.locator("main").evaluate((main) => {
            main.scrollTop = main.scrollHeight;
          });
          await page.screenshot({ path: `${continuityShots}/${surface}-${scheme}-${width}.png` });
          const issues = (await new AxeBuilder({ page }).analyze()).violations.filter((v) =>
            ["serious", "critical"].includes(v.impact),
          );
          assert.deepEqual(
            issues.map((v) => v.id),
            [],
            `${surface} accessibility`,
          );
        }
      }
    }
  }
  // Existing saved preferences remain editable; normal conversations no longer prompt saving.
  await rpc("assistant_save_memory", {
    p_id: null,
    p_content: "기존에 저장한 선호",
    p_version: null,
    p_source_id: null,
    p_expected_revision: (await rpc("my_assistant_state")).revision,
  });
  await page.goto(`${base}/assistant?panel=memory`);
  await page.getByRole("button", { name: "수정", exact: true }).click();
  await page
    .getByLabel("기억할 선호", { exact: true })
    .fill("첫 만남은 조용한 카페에서 짧게 하고 싶어요");
  const save = page.getByRole("button", { name: "수정 저장" });
  assert.equal(await save.isEnabled(), false);
  await page.getByRole("checkbox").check();
  await save.click();
  await page.getByText("첫 만남은 조용한 카페에서 짧게 하고 싶어요", { exact: true }).waitFor();
  assert.equal((await rpc("my_assistant_state")).memories.length, 1);
  if (process.env.AFTER_LOCAL_AI_CONFIRM === "synthetic-only") {
    await page.goto(`${base}/assistant`);
    await page
      .getByLabel("매니저에게 상담할 내용")
      .fill("기억해 둔 내 선호를 반영해서 첫 만남 장소와 분위기를 짧게 추천해 주세요.");
    const reply = page.waitForResponse((r) => r.url().includes("/functions/v1/assistant-chat"));
    await page.getByRole("button", { name: "상담 보내기" }).click();
    assert.equal((await reply).status(), 200);
    state = await rpc("my_assistant_state");
    const answer = state.turns.at(-1).answer;
    assert.match(answer, /카페|커피/);
    assert.match(answer, /조용|차분|한적/);
    await page.getByText(answer, { exact: true }).waitFor();
    console.log("Synthetic live approved-memory advice:", answer);
    await page.goto(`${base}/assistant?panel=memory`);
    await page.getByText("첫 만남은 조용한 카페에서 짧게 하고 싶어요", { exact: true }).waitFor();
  }
  const shots = process.env.AFTER_E2E_SCREENSHOT_DIR;
  if (shots) await mkdir(shots, { recursive: true });
  for (const scheme of ["light", "dark"]) {
    await page.emulateMedia({ colorScheme: scheme, reducedMotion: "reduce" });
    for (const width of [320, 390, 1440]) {
      await page.setViewportSize({ width, height: 844 });
      await delay(250);
      const issues = (await new AxeBuilder({ page }).analyze()).violations.filter((v) =>
        ["serious", "critical"].includes(v.impact),
      );
      assert.equal(issues.length, 0, JSON.stringify(issues.map((x) => x.id)));
      assert.ok(
        await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
        "no page overflow",
      );
      if (shots)
        await page.screenshot({ path: `${shots}/assistant-memory-${scheme}-${width}.png` });
    }
  }
  await page.getByRole("button", { name: "삭제", exact: true }).click();
  assert.equal(
    (await rpc("my_assistant_state")).memories.length,
    1,
    "no deletion before confirmation",
  );
  await page.getByRole("button", { name: "확인하고 삭제" }).click();
  await page.getByText("따로 저장한 선호가 없어요. 대화할 때마다 저장할 필요는 없어요.").waitFor();
  state = await rpc("my_assistant_state");
  assert.equal(state.memories.length, 0);
  assert.equal(state.turns.length, 0);
  const revision = state.revision;
  const saveArgs = {
    p_id: null,
    p_content: "조용한 만남을 좋아해요",
    p_version: null,
    p_source_id: null,
    p_expected_revision: revision,
  };
  const saves = await Promise.all([
    member.rpc("assistant_save_memory", saveArgs),
    member.rpc("assistant_save_memory", saveArgs),
  ]);
  assert.equal(
    saves.filter((r) => !r.error).length,
    1,
    "same approval revision stores at most once",
  );
  await rpc("assistant_forget", { p_scope: "all" });
  assert.equal(
    (await member.rpc("assistant_save_memory", saveArgs)).error.code,
    "PT409",
    "late memory cannot reappear after deletion",
  );
  // Long history and unbroken input: actual browser evidence, no provider calls.
  const uiIssues = [];
  const revisionForUi = (await rpc("my_assistant_state")).revision;
  for (let index = 0; index < 4; index++) {
    const turn = randomUUID();
    await rpc("assistant_begin_turn", {
      p_id: turn,
      p_question: `QA 합성 질문 ${index + 1}: 첫 만남을 편하게 준비하고 싶어요.`,
      p_expected_revision: revisionForUi,
    });
    assert.equal(
      (
        await service.rpc("assistant_finish_turn", {
          p_owner: id,
          p_id: turn,
          p_revision: revisionForUi,
          p_answer:
            "QA 합성 답변입니다. 서로 편한 속도로 대화를 나누고 선택을 존중해 주세요. ".repeat(5),
        })
      ).data,
      true,
    );
  }
  await page.setViewportSize({ width: 390, height: 844 });
  await page.emulateMedia({ colorScheme: "light" });
  await page.goto(`${base}/assistant`);
  const lastQuestion = page.getByText("QA 합성 질문 4: 첫 만남을 편하게 준비하고 싶어요.", {
    exact: true,
  });
  await lastQuestion.waitFor();
  const inScrollViewport = (locator) =>
    locator.evaluate((el) => {
      const r = el.getBoundingClientRect(),
        main = el.closest("main").getBoundingClientRect();
      return r.top >= main.top && r.bottom <= main.bottom;
    });
  await delay(200);
  if (!(await inScrollViewport(lastQuestion)))
    uiIssues.push("opening history does not reveal the latest conversation");
  assert.equal(
    await page.getByRole("button", { name: "이 내용 기억하기", exact: true }).count(),
    0,
  );
  await rpc("assistant_save_memory", {
    p_id: null,
    p_content: "기존에 저장한 선호",
    p_version: null,
    p_source_id: null,
    p_expected_revision: (await rpc("my_assistant_state")).revision,
  });
  await page.goto(`${base}/assistant?panel=memory`);
  await page.getByRole("button", { name: "수정", exact: true }).click();
  const memoryField = page.getByLabel("기억할 선호", { exact: true });
  await memoryField.waitFor();
  await delay(200);
  if (!(await inScrollViewport(memoryField)))
    uiIssues.push("memory approval opens outside the scroll viewport");
  if ((await page.getByRole("heading", { name: "대화 설정", exact: true }).boundingBox()).y < 0)
    uiIssues.push("revealing approval scrolls the fixed app header offscreen");
  assert.equal(
    await page.getByRole("button", { name: "상담 보내기" }).count(),
    0,
    "focus on memory approval without a competing conversation composer",
  );
  if (shots) await page.screenshot({ path: `${shots}/assistant-memory-confirm-history.png` });
  const longMemory = "A".repeat(240);
  await memoryField.fill(longMemory);
  await page.getByRole("region", { name: "기억 저장 확인" }).getByRole("checkbox").check();
  await page.getByRole("button", { name: "수정 저장" }).click();
  await page.getByRole("heading", { name: "대화 설정", exact: true }).waitFor();
  const longText = page.getByText(longMemory, { exact: true });
  await longText.waitFor();
  if (await longText.evaluate((el) => el.scrollWidth > el.clientWidth + 1))
    uiIssues.push("unbroken approved memory overflows its surface");
  if (shots) await page.screenshot({ path: `${shots}/assistant-memory-long-input.png` });
  assert.deepEqual(uiIssues, [], "native conversation and approval flow");
  await rpc("assistant_forget", { p_scope: "all" });
  await page.goto(`${base}/assistant`);
  await page.getByLabel("매니저에게 상담할 내용").fill("첫 만남이 긴장돼요");
  await page.evaluate(() =>
    document.documentElement.style.setProperty("--keyboard-height", "300px"),
  );
  assert.ok(await page.getByRole("button", { name: "상담 보내기" }).isVisible());
  if (shots) await page.screenshot({ path: `${shots}/assistant-chat-keyboard.png` });
  await page.evaluate(() => document.documentElement.style.removeProperty("--keyboard-height"));
  const calls = [];
  await page.route("**/functions/v1/assistant-chat", async (route) => {
    calls.push(route.request().postDataJSON());
    await route.fulfill(
      calls.length === 1
        ? { status: 502, json: { code: "generation_failed" } }
        : calls.length === 2
          ? { json: { state: "failed", reused: true } }
          : { json: { state: "complete" } },
    );
  });
  const send = page.getByRole("button", { name: "상담 보내기" });
  await send.click();
  await page.getByRole("alert").waitFor();
  await send.click();
  await page.waitForFunction(
    () => !document.querySelector('button[aria-label="상담 보내기"]').disabled,
  );
  await send.click();
  await page.waitForFunction(() => document.querySelector("textarea").value === "");
  assert.equal(calls.length, 3);
  assert.equal(
    new Set(calls.map((c) => c.requestId)).size,
    3,
    "confirmed failures retry with fresh IDs",
  );
  await page.unroute("**/functions/v1/assistant-chat");
  console.log("Private assistant API + mobile/dark/memory consent/deletion QA PASS");
} catch (error) {
  const failedPage = browser?.contexts()[0]?.pages()[0];
  if (failedPage) {
    await mkdir("/tmp/after-continuity-failure", { recursive: true });
    await failedPage.screenshot({ path: "/tmp/after-continuity-failure/screen.png" });
    console.error((await failedPage.locator("body").innerText()).slice(-5000));
  }
  throw error;
} finally {
  await browser?.close();
  if (server?.pid) {
    try {
      process.kill(-server.pid, "SIGTERM");
    } catch {
      /* already exited */
    }
  }
  sql(
    `update app_settings set assistant_chat_enabled=${original.chat},assistant_memory_enabled=${original.memory},assistant_schedule_enabled=${original.schedule}`,
  );
  if (id) await service.auth.admin.deleteUser(id);
  if (femaleId) await service.auth.admin.deleteUser(femaleId);
}
