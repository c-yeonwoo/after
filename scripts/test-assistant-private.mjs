import assert from "node:assert/strict";
import { execFileSync, spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import { mkdir } from "node:fs/promises";
import { setTimeout as delay } from "node:timers/promises";
import { createClient } from "@supabase/supabase-js";
import { chromium, webkit } from "playwright";
import AxeBuilder from "@axe-core/playwright";

const env = JSON.parse(
  execFileSync("npx", ["supabase", "status", "-o", "json"], {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  }),
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
let id, server, browser;
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
  assert.equal((await member.rpc("assistant_consent", { p_agree: true })).error.code, "PT403");
  sql("update app_settings set assistant_chat_enabled=true,assistant_memory_enabled=true");
  await rpc("assistant_consent", { p_agree: true });
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
  await page.goto(`${base}/login`);
  for (let n = 0; n < 20; n++) {
    await page.getByLabel("가입한 이메일").fill(email);
    await page.getByLabel("비밀번호").fill(password);
    if (await page.getByRole("button", { name: "로그인", exact: true }).isEnabled()) break;
    await delay(200);
  }
  await page.getByRole("button", { name: "로그인", exact: true }).click();
  await page.waitForURL("**/home");
  await page.getByRole("heading", { name: "내 비서", exact: true }).waitFor();
  await page.goto(`${base}/assistant?panel=memory`);
  await page.getByRole("button", { name: "기억할 선호 추가" }).click();
  await page
    .getByLabel("기억할 선호", { exact: true })
    .fill("첫 만남은 조용한 카페에서 짧게 하고 싶어요");
  const save = page.getByRole("button", { name: "승인하고 기억하기" });
  assert.equal(await save.isEnabled(), false);
  await page.getByRole("checkbox").check();
  await save.click();
  await page.getByText("첫 만남은 조용한 카페에서 짧게 하고 싶어요", { exact: true }).waitFor();
  assert.equal((await rpc("my_assistant_state")).memories.length, 1);
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
  await page.getByText("아직 승인한 기억이 없어요.").waitFor();
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
  await page.getByRole("link", { name: "나만의 상담", exact: true }).click();
  await page.getByLabel("비서에게 상담할 내용").fill("첫 만남이 긴장돼요");
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
}
