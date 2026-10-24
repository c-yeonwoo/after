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
  throw Error("local only");
const sql = (s) =>
  execFileSync("psql", [env.DB_URL, "-v", "ON_ERROR_STOP=1", "-Atc", s], {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  }).trim();
const service = createClient(env.API_URL, env.SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});
const original = sql("select assistant_schedule_enabled from app_settings");
const members = [],
  intro = randomUUID(),
  meeting = randomUUID(),
  ticket = randomUUID();
const port = Number(process.env.AFTER_TEST_PORT ?? 4194),
  base = `http://127.0.0.1:${port}`;
let server, browser;
try {
  for (const gender of ["male", "female"]) {
    const email = `assistant-schedule-${randomUUID()}@verify.local`,
      password = randomUUID() + "Aa1!";
    const created = await service.auth.admin.createUser({ email, password, email_confirm: true });
    assert.ifError(created.error);
    const id = created.data.user.id;
    members.push({ id, email, password, gender });
    sql(`insert into profiles(id,gender,hub_id,company_email,name,birth,job,onboarding_step,terms_agreed_at,privacy_agreed_at,phone_verified_at)
      values('${id}','${gender}','gangnam','${email}','${gender === "male" ? "가상 민준" : "가상 서연"}','1996-01-01','기획',7,now(),now(),now());`);
  }
  sql(`update app_settings set assistant_schedule_enabled=true;
    insert into intros(id,male_id,female_id,closed_at,outcome) values('${intro}','${members[0].id}','${members[1].id}',now(),'ticket_used');
    insert into tickets(id,user_id,payment_id,price_krw,state,kind,intro_id,used_at,expires_at) values('${ticket}','${members[0].id}','${ticket}',30000,'used','meeting','${intro}',now(),now()+interval '12 months');
    insert into meetings(id,intro_id,ticket_id,male_attendance_policy_ack_at) values('${meeting}','${intro}','${ticket}',now());`);
  const date = sql(
    "select ((date_trunc('week',now() at time zone 'Asia/Seoul')+interval '7 days')::date)::text",
  );
  sql("notify pgrst, 'reload schema'");
  await delay(700);
  const femaleClient = createClient(env.API_URL, env.ANON_KEY, { auth: { persistSession: false } });
  assert.ifError(
    (
      await femaleClient.auth.signInWithPassword({
        email: members[1].email,
        password: members[1].password,
      })
    ).error,
  );
  const initial = await femaleClient.rpc("my_assistant_schedule");
  assert.ifError(initial.error);
  assert.equal(initial.data.meetings.length, 1, JSON.stringify(initial.data));
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
  browser = await (process.env.AFTER_TEST_BROWSER === "webkit" ? webkit : chromium).launch();
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
    locale: "ko-KR",
    timezoneId: "America/Los_Angeles",
    reducedMotion: "reduce",
  });
  let page = await context.newPage();
  page.on("pageerror", (error) => console.log("Synthetic UI runtime:", error.message));
  page.on("console", (message) => {
    if (message.type() === "error") console.log("Synthetic UI error:", message.text());
  });
  async function login(member) {
    await page.goto(`${base}/login`);
    for (let n = 0; n < 20; n++) {
      await page.getByLabel("가입한 이메일").fill(member.email);
      await page.getByLabel("비밀번호").fill(member.password);
      if (await page.getByRole("button", { name: "로그인", exact: true }).isEnabled()) break;
      await delay(200);
    }
    await page.getByRole("button", { name: "로그인", exact: true }).click();
    await page.waitForURL("**/home");
    await page.getByRole("heading", { name: "내 비서", exact: true }).waitFor();
    await page.goto(`${base}/assistant-schedule`);
  }
  await login(members[1]);
  const shots = process.env.AFTER_E2E_SCREENSHOT_DIR;
  if (shots) {
    await mkdir(shots, { recursive: true });
    await page.getByRole("heading", { name: "가능한 시간 전달", exact: true }).waitFor();
    for (const scheme of ["light", "dark"]) {
      await page.emulateMedia({ colorScheme: scheme });
      for (const width of [320, 390, 1440]) {
        await page.setViewportSize({ width, height: 844 });
        await delay(200);
        await page.screenshot({ path: `${shots}/assistant-schedule-form-${scheme}-${width}.png` });
      }
    }
    await page.emulateMedia({ colorScheme: "light" });
    await page.setViewportSize({ width: 390, height: 844 });
  }
  await page.getByLabel("날짜", { exact: true }).fill("2020-01-01");
  await page
    .getByText("지금부터 3시간 이후, 21일 이내의 시간을 골라주세요.", { exact: true })
    .waitFor();
  assert.equal(await page.getByRole("button", { name: "전달 전 초안 보기" }).isEnabled(), false);
  await page
    .getByLabel("날짜", { exact: true })
    .fill(date, { timeout: 12000 })
    .catch(async (error) => {
      console.log("Synthetic schedule page:", page.url(), await page.locator("body").innerText());
      throw error;
    });
  await page.getByLabel("시간 · 한국 기준").fill("19:00");
  await page.getByRole("button", { name: "전달 전 초안 보기" }).click();
  const panel = page.getByRole("region", { name: "일정 초안", exact: true }).first();
  await panel.getByRole("button", { name: "승인하고 요청하기" }).waitFor();
  assert.equal(sql(`select prefs_submitted_at is null from meetings where id='${meeting}'`), "t");
  assert.equal(await panel.getByRole("button", { name: "승인하고 요청하기" }).isEnabled(), false);
  for (const scheme of ["light", "dark"]) {
    await page.emulateMedia({ colorScheme: scheme });
    for (const width of [320, 390, 1440]) {
      await page.setViewportSize({ width, height: 844 });
      await delay(200);
      const issues = (await new AxeBuilder({ page }).analyze()).violations.filter((v) =>
        ["serious", "critical"].includes(v.impact),
      );
      assert.equal(issues.length, 0, JSON.stringify(issues.map((v) => v.id)));
      assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
      if (shots)
        await page.screenshot({
          path: `${shots}/assistant-schedule-${scheme}-${width}.png`,
          fullPage: true,
        });
    }
  }
  await panel.getByRole("checkbox").check();
  await panel.getByRole("button", { name: "승인하고 요청하기" }).click();
  await panel.getByText("요청을 전달했어요. 상대의 답변을 기다려 주세요.").waitFor();
  assert.equal(
    await page.getByRole("region", { name: "일정 초안 만들기" }).count(),
    0,
    "show the receipt before offering a fresh form",
  );
  if (shots) {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.screenshot({ path: `${shots}/assistant-schedule-succeeded.png` });
  }
  assert.equal(
    sql(
      `select (prefs->'dates'->>0)::timestamptz='${date}T19:00:00+09:00'::timestamptz from meetings where id='${meeting}'`,
    ),
    "t",
    "Seoul time independent of browser timezone",
  );
  // Fresh context avoids sharing a session across personas.
  await page.context().close();
  const maleClient = createClient(env.API_URL, env.ANON_KEY, { auth: { persistSession: false } });
  assert.ifError(
    (
      await maleClient.auth.signInWithPassword({
        email: members[0].email,
        password: members[0].password,
      })
    ).error,
  );
  const maleContext = await browser.newContext({
    viewport: { width: 390, height: 844 },
    locale: "ko-KR",
    timezoneId: "America/Los_Angeles",
    reducedMotion: "reduce",
  });
  page = await maleContext.newPage();
  await login(members[0]);
  await page.getByRole("radio").first().check();
  await page.getByLabel("만날 장소", { exact: true }).fill("가상 카페");
  await page.getByLabel("어떤 만남인가요?").selectOption("카페");
  await page.getByRole("button", { name: "전달 전 초안 보기" }).click();
  await page
    .getByRole("region", { name: "일정 초안" })
    .getByText("가상 카페", { exact: true })
    .waitFor();
  const draft = await maleClient.rpc("my_assistant_schedule");
  assert.ifError(draft.error);
  const action = draft.data.actions.find((a) => a.kind === "confirm");
  assert.ok(action);
  const request = action.id;
  assert.equal(sql(`select confirmed_at is null from meetings where id='${meeting}'`), "t");
  const args = { p_id: request, p_token: action.approval_token, p_policy_ack: true };
  const concurrent = await Promise.all([
    maleClient.rpc("assistant_approve_schedule", args),
    maleClient.rpc("assistant_approve_schedule", args),
  ]);
  concurrent.forEach((r) => assert.ifError(r.error));
  assert.equal(
    sql(
      `select count(*) from events where user_id='${members[0].id}' and name='meeting_confirmed'`,
    ),
    "1",
    "concurrent approval executes once",
  );
  assert.equal(
    sql(`select attendance_policy_version from meetings where id='${meeting}'`),
    "checkin-v1",
  );
  await page.getByRole("button", { name: "상태 다시 확인", exact: true }).click();
  await page.getByRole("button", { name: "일정 다시 준비하기", exact: true }).click();
  await page.getByRole("heading", { name: "시간 변경 요청", exact: true }).waitFor();
  await page.getByLabel("날짜", { exact: true }).fill(date);
  await page.getByLabel("시간 · 한국 기준").fill("20:00");
  await page.getByRole("button", { name: "전달 전 초안 보기" }).click();
  const changePanel = page.getByRole("region", { name: "일정 초안" });
  await changePanel.getByRole("checkbox").check();
  await changePanel.getByRole("button", { name: "승인하고 요청하기" }).click();
  await changePanel.getByText("요청을 전달했어요. 상대의 답변을 기다려 주세요.").waitFor();
  assert.equal(
    sql(
      `select scheduled_at='${date}T19:00:00+09:00'::timestamptz from meetings where id='${meeting}'`,
    ),
    "t",
    "change request must not silently replace confirmed time",
  );
  console.log(
    "Schedule female/male UI + change request + concurrent retry + mobile/dark + timezone QA PASS",
  );
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
    `update app_settings set assistant_schedule_enabled=${original === "t"};delete from meetings where id='${meeting}';delete from tickets where id='${ticket}';delete from intros where id='${intro}';`,
  );
  for (const member of members) await service.auth.admin.deleteUser(member.id);
}
