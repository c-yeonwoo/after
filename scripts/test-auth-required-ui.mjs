import assert from "node:assert/strict";
import { execFileSync, spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import { mkdir } from "node:fs/promises";
import { setTimeout as delay } from "node:timers/promises";
import { chromium, webkit } from "playwright";
import { createClient } from "@supabase/supabase-js";

const status = execFileSync("npx", ["supabase", "status", "--output", "env"], { encoding: "utf8" });
const value = (key) => status.match(new RegExp(`^${key}="?([^"\\n]+)"?`, "m"))?.[1];
const api = value("API_URL");
assert.match(api, /^http:\/\/127\.0\.0\.1:\d+$/);
const service = createClient(api, value("SERVICE_ROLE_KEY"), { auth: { persistSession: false } });
const client = createClient(api, value("ANON_KEY"), { auth: { persistSession: false } });
const origin = "http://127.0.0.1:4186";
const email = `required-auth-${randomUUID()}@verify.local`;
const password = `Auth-${randomUUID()}!`;
let userId;
let server;
let browser;
try {
  const created = await service.auth.admin.createUser({ email, password, email_confirm: true });
  assert.ifError(created.error);
  userId = created.data.user.id;
  assert.ifError(
    (
      await service.from("profiles").insert({
        id: userId,
        gender: "female",
        hub_id: "gangnam",
        company_email: email,
        email_verified_at: new Date().toISOString(),
        birth: "1994-02-15",
        name: "인증 테스트",
        onboarding_step: 7,
      })
    ).error,
  );
  server = spawn(
    process.execPath,
    ["node_modules/vite/bin/vite.js", "--host", "127.0.0.1", "--port", "4186", "--strictPort"],
    {
      env: {
        ...process.env,
        VITE_SUPABASE_URL: api,
        VITE_SUPABASE_ANON_KEY: value("ANON_KEY"),
        VITE_DEV_AUTH_BYPASS: "false",
        VITE_CARRIER_IDENTITY_ENABLED: "false",
      },
      stdio: "ignore",
    },
  );
  let started = false;
  for (let i = 0; i < 100; i++) {
    if (server.exitCode !== null) throw Error("Auth QA server exited (port occupied?)");
    try {
      if ((await fetch(origin)).ok) {
        started = true;
        break;
      }
    } catch {
      /* starting */
    }
    await delay(200);
  }
  assert.ok(started);
  browser = await (process.env.AFTER_TEST_BROWSER === "webkit" ? webkit : chromium).launch();
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
    locale: "ko-KR",
  });
  const page = await context.newPage();
  await page.goto(`${origin}/signup`);
  await page.getByRole("checkbox", { name: "이용약관 동의 (필수)", exact: true }).check();
  await page.getByRole("checkbox", { name: "개인정보 수집·이용 동의 (필수)", exact: true }).check();
  await page.getByRole("button", { name: "동의하고 시작하기" }).click();
  const next = page.getByRole("button", { name: "다음", exact: true });
  for (let i = 0; i < 20; i++) {
    await page.getByRole("button", { name: "여성", exact: true }).click();
    if (await next.isEnabled()) break;
    await delay(200);
  }
  await next.click();
  await page.getByRole("button", { name: "인증 코드 받기", exact: true }).waitFor();
  assert.equal(await page.getByRole("button", { name: "개발 계정 만들기" }).count(), 0);
  const signed = await client.auth.signInWithPassword({ email, password });
  assert.ifError(signed.error);
  await page.evaluate(({ key, session }) => localStorage.setItem(key, JSON.stringify(session)), {
    key: `sb-${new URL(api).hostname.split(".")[0]}-auth-token`,
    session: signed.data.session,
  });
  await delay(1100);
  await page.goto(`${origin}/verify-phone`);
  const phone = `+8210${String(Date.now()).slice(-8)}`;
  let code;
  await page.route("**/functions/v1/phone-otp", async (route) => {
    assert.equal(route.request().postDataJSON().bypass, false);
    const issued = await service.rpc("issue_phone_code", { p_user: userId, p_phone: phone });
    assert.ifError(issued.error);
    code = issued.data;
    await route.fulfill({ json: { sent: true, phone } });
  });
  const send = page.getByRole("button", { name: "인증번호 받기", exact: true });
  for (let i = 0; i < 20; i++) {
    await page.getByLabel("휴대폰 번호", { exact: true }).fill(`0${phone.slice(3)}`);
    if (await send.isEnabled()) break;
    await delay(200);
  }
  assert.equal(await send.isEnabled(), true, "phone form hydrated");
  await send.click();
  const input = page.getByLabel("인증번호", { exact: true });
  await input.waitFor();
  assert.equal(await input.inputValue(), "");
  assert.equal(await page.getByRole("button", { name: "인증 없이 계속" }).count(), 0);
  assert.equal(await page.getByRole("button", { name: "인증하고 계속" }).isEnabled(), false);
  await input.fill(code === "000000" ? "111111" : "000000");
  await page.getByRole("button", { name: "인증하고 계속" }).click();
  await page.getByText("인증번호가 맞지 않아요.", { exact: true }).waitFor();
  assert.equal(
    (await service.from("profiles").select("phone_verified_at").eq("id", userId).single()).data
      .phone_verified_at,
    null,
  );
  const evidence = process.env.AFTER_AUTH_SCREENSHOTS;
  if (evidence) {
    await mkdir(evidence, { recursive: true });
    await page.screenshot({ path: `${evidence}/auth-required-light.png`, fullPage: true });
    await page.evaluate(() => document.documentElement.classList.add("dark"));
    await page.waitForTimeout(350);
    await page.screenshot({ path: `${evidence}/auth-required-dark.png`, fullPage: true });
  }
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
  await input.fill(code);
  await page.getByRole("button", { name: "인증하고 계속" }).click();
  await page.waitForURL("**/home");
  assert.ok(
    (await service.from("profiles").select("phone_verified_at").eq("id", userId).single()).data
      .phone_verified_at,
  );
  console.log(
    "Required auth UI: no email bypass, empty SMS input, wrong-code rejection and valid code completion PASS",
  );
} finally {
  await browser?.close();
  server?.kill("SIGTERM");
  if (userId) assert.ifError((await service.auth.admin.deleteUser(userId)).error);
}
