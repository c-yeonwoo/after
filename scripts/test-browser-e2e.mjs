import assert from "node:assert/strict";
import { execFileSync, spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import { setTimeout as delay } from "node:timers/promises";

import AxeBuilder from "@axe-core/playwright";
import { createClient } from "@supabase/supabase-js";
import { chromium } from "playwright";

// This test creates and removes only its own synthetic accounts. It refuses a
// remote Supabase URL so a release job can never seed production by accident.
const status = execFileSync("npx", ["supabase", "status", "--output", "env"], {
  encoding: "utf8",
});
const value = (key) => status.match(new RegExp(`^${key}="?([^"\\n]+)"?`, "m"))?.[1];
const apiUrl = value("API_URL");
const dbUrl = value("DB_URL");
const anonKey = value("ANON_KEY");
const serviceKey = value("SERVICE_ROLE_KEY");
if (
  !apiUrl ||
  !dbUrl ||
  !anonKey ||
  !serviceKey ||
  !/^http:\/\/127\.0\.0\.1:\d+$/.test(apiUrl) ||
  !dbUrl.includes("@127.0.0.1:")
) {
  throw new Error("Browser E2E requires local Supabase only");
}

const baseUrl = "http://127.0.0.1:4174";
const koreanBrowser = { locale: "ko-KR", timezoneId: "Asia/Seoul" };
const service = createClient(apiUrl, serviceKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});
const ids = [];
const objectPaths = [];
let browser;
let server;
let carrierServer;

function sql(statement) {
  return execFileSync("psql", [dbUrl, "-v", "ON_ERROR_STOP=1", "-Atc", statement], {
    encoding: "utf8",
  }).trim();
}

const originalPaymentsEnabled = sql("select payments_enabled from public.app_settings");

async function waitForServer(target = baseUrl) {
  for (let attempt = 0; attempt < 90; attempt += 1) {
    try {
      const response = await fetch(target, { signal: AbortSignal.timeout(1000) });
      if (response.ok) return;
    } catch {
      /* server is starting */
    }
    await delay(200);
  }
  throw new Error("Vite did not start for browser E2E");
}

const tinyPng = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/ScL/nwAAAABJRU5ErkJggg==",
  "base64",
);
async function createPerson(kind, gender, role, password) {
  const email = `after-e2e-${kind}-${randomUUID()}@verify.local`;
  const { data, error } = await service.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  });
  if (error || !data.user) throw error ?? new Error("Synthetic auth user not created");
  const id = data.user.id;
  ids.push(id);
  const paths = [];
  for (let i = 0; i < 3; i += 1) {
    const path = `${id}/e2e-${i}.png`;
    const { error: uploadError } = await service.storage
      .from("profile-photos")
      .upload(path, tinyPng, { contentType: "image/png", upsert: true });
    if (uploadError) throw uploadError;
    objectPaths.push(path);
    paths.push(path);
  }
  const name = kind === "male" ? "남성 테스트" : kind === "female" ? "여성 테스트" : "운영 테스트";
  const { error: profileError } = await service.from("profiles").upsert(
    {
      id,
      gender,
      hub_id: "gangnam",
      company_email: email,
      email_verified_at: new Date().toISOString(),
      name,
      birth: "1993-05-12",
      job: "제품 기획자",
      headline: "퇴근 후 동네를 걷는 편이에요.",
      intro: "퇴근 후에는 동네를 걸으며 하루를 정리합니다. 조용히 이야기 나누는 시간을 좋아해요.",
      interests: ["동네 산책"],
      match_tags: ["대화를 좋아하는 사람"],
      topics: ["퇴근 후 시간"],
      onboarding_step: 7,
      role,
      terms_agreed_at: new Date().toISOString(),
      privacy_agreed_at: new Date().toISOString(),
      agreed_policy_version: "2026-10-17.2",
      phone_verified_at: new Date().toISOString(),
      photo_paths: paths,
      photo_state: "approved",
    },
    { onConflict: "id" },
  );
  if (profileError) throw profileError;
  // New photo paths intentionally reset review state; synthetic fixtures are
  // explicitly approved after upload, never through a product-facing API.
  sql(`update public.profiles set photo_state='approved',photo_reviewed_at=now()
       where id='${id}'`);
  return { id, email, password, name };
}

async function login(page, person) {
  const pageErrors = [];
  page.on("pageerror", (error) => pageErrors.push(error.message));
  await page.goto(`${baseUrl}/login`);
  // SSR can paint fields before React attaches handlers. Filling at that point
  // changes the DOM but not form state, leaving the submit button disabled.
  const submit = page.getByRole("button", { name: "로그인", exact: true });
  for (let attempt = 0; attempt < 20; attempt += 1) {
    await page.getByLabel("가입한 이메일").fill(person.email);
    await page.getByLabel("비밀번호").fill(person.password);
    if (await submit.isEnabled()) break;
    await page.waitForTimeout(250);
  }
  assert.equal(
    await submit.isEnabled(),
    true,
    `login form did not hydrate: ${pageErrors.join(" | ") || "no page error"}`,
  );
  await submit.click();
  await page.waitForURL("**/home", { timeout: 15_000 });
  await page.getByRole("main").waitFor();
}

async function checkPage(page, name, accessibility = true) {
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth > window.innerWidth + 1,
  );
  assert.equal(overflow, false, `${name}: horizontal overflow`);
  if (accessibility) {
    const result = await new AxeBuilder({ page })
      .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
      .analyze();
    const blocking = result.violations.filter(
      (item) => item.impact === "serious" || item.impact === "critical",
    );
    assert.deepEqual(
      blocking.map(
        (item) =>
          `${item.id}: ${item.nodes.map((node) => `${node.target.join(",")} ${node.html}`).join(" | ")}`,
      ),
      [],
      `${name}: serious accessibility issues`,
    );
  }
}

async function chooseWorkZone(page) {
  await page.getByRole("heading", { name: "직장은 어느 지역에 있나요?" }).waitFor();
  const next = page.getByRole("button", { name: "다음", exact: true });
  assert.equal(await next.isEnabled(), false, "signup never guesses a work zone");
  await page.getByRole("button", { name: /강남·역삼권/ }).click();
  await next.click();
}

async function acceptSignupConsent(page) {
  await page.getByRole("heading", { name: "시작하기 전에, 확인해 주세요" }).waitFor();
  const start = page.getByRole("button", { name: "동의하고 시작하기" });
  assert.equal(await start.isEnabled(), false, "signup starts with explicit consent");
  await page.getByRole("checkbox", { name: "이용약관 동의 (필수)", exact: true }).check();
  assert.equal(await start.isEnabled(), false, "both required agreements must be explicit");
  await page.getByRole("checkbox", { name: "개인정보 수집·이용 동의 (필수)", exact: true }).check();
  await start.click();
}

try {
  // The first scenario verifies paid-ticket behavior, even when a freshly
  // started Supabase defaults to free beta. The outer finally restores it.
  sql("update public.app_settings set payments_enabled=true");
  server = spawn(
    process.execPath,
    [
      "node_modules/vite/bin/vite.js",
      "--host",
      "127.0.0.1",
      "--port",
      "4174",
      "--strictPort",
      "--force",
    ],
    {
      env: {
        ...process.env,
        TZ: "Asia/Seoul",
        VITE_SUPABASE_URL: apiUrl,
        VITE_SUPABASE_ANON_KEY: anonKey,
        VITE_CARRIER_IDENTITY_ENABLED: "false",
      },
      stdio: "ignore",
    },
  );
  await waitForServer();
  browser = await chromium.launch({ headless: true });

  const publicPage = await (
    await browser.newContext({ ...koreanBrowser, viewport: { width: 390, height: 844 } })
  ).newPage();
  await publicPage.goto(baseUrl);
  await publicPage.getByRole("link", { name: "로그인" }).waitFor();
  await checkPage(publicPage, "landing mobile");
  for (const width of [360, 768, 1440]) {
    await publicPage.setViewportSize({ width, height: 900 });
    await checkPage(publicPage, `landing ${width}`, false);
  }
  await publicPage.goto(`${baseUrl}/support`);
  await publicPage.getByText("1:1 문의").waitFor();
  await checkPage(publicPage, "public support");
  await publicPage.close();

  const password = `AfterE2E-${randomUUID()}`;
  const male = await createPerson("male", "male", "member", password);
  const female = await createPerson("female", "female", "member", password);
  const admin = await createPerson("admin", "male", "admin", password);
  // A signup attempt with an already registered work address must land in the
  // existing account, not reset its password or treat it as a fresh profile.
  const existing = await createPerson(
    "existing-signup",
    "male",
    "member",
    "eclipse-local-dev-auth-only",
  );
  sql(`update public.profiles set hub_id='pangyo' where id='${existing.id}'`);
  const existingPasswordHash = sql(
    `select encrypted_password from auth.users where id='${existing.id}'`,
  );
  const signupPage = await (
    await browser.newContext({ ...koreanBrowser, viewport: { width: 390, height: 844 } })
  ).newPage();
  await signupPage.goto(`${baseUrl}/signup`);
  await acceptSignupConsent(signupPage);
  const signupNext = signupPage.getByRole("button", { name: "다음", exact: true });
  for (let attempt = 0; attempt < 20; attempt += 1) {
    await signupPage.getByRole("button", { name: "여성" }).click();
    if (await signupNext.isEnabled()) break;
    await signupPage.waitForTimeout(250);
  }
  assert.equal(await signupNext.isEnabled(), true, "signup form did not hydrate");
  await signupNext.click();
  await signupPage.getByLabel("회사 이메일").fill(existing.email);
  await signupPage.getByRole("button", { name: "개발 계정 만들기" }).click();
  await signupPage
    .getByRole("button", { name: "계속하기" })
    .click({ timeout: 2_000 })
    .catch(() => {
      // Signing in through local dev Auth can update the shared profile before
      // this click; the account gate then takes over immediately.
    });
  await signupPage.getByRole("heading", { name: "이미 가입된 계정이 있어요" }).waitFor();
  assert.equal(await signupPage.getByText(existing.name).count(), 0);
  await signupPage.getByRole("button", { name: "기존 계정으로 계속" }).click();
  await signupPage.waitForURL("**/home", { timeout: 15_000 });
  await signupPage.getByText(`${existing.name}님의 애프터 · 판교권`, { exact: true }).waitFor();
  assert.equal(
    sql(
      `select count(*) from public.profiles where lower(company_email)=lower('${existing.email}')`,
    ),
    "1",
    "signup reused the existing account without creating another profile",
  );
  assert.equal(
    sql(`select gender from public.profiles where id='${existing.id}'`),
    "male",
    "signup choices cannot change an existing member's gender",
  );
  assert.equal(
    sql(`select hub_id from public.profiles where id='${existing.id}'`),
    "pangyo",
    "an existing member keeps their own work zone when entering through signup",
  );
  assert.equal(
    sql(`select count(*) from auth.users where lower(email)=lower('${existing.email}')`),
    "1",
    "the same work address keeps one auth identity",
  );
  assert.equal(
    sql(`select encrypted_password from auth.users where id='${existing.id}'`),
    existingPasswordHash,
    "re-entering signup never resets an existing member's password",
  );
  await signupPage.goto(`${baseUrl}/signup`);
  await signupPage.getByRole("heading", { name: "이미 가입된 계정이 있어요" }).waitFor();
  assert.equal(await signupPage.getByText(existing.name).count(), 0);
  await signupPage.getByRole("button", { name: "다른 계정으로 새로 가입" }).click();
  await signupPage.getByRole("heading", { name: "시작하기 전에, 확인해 주세요" }).waitFor();
  await signupPage.close();

  const incomplete = await createPerson(
    "incomplete-signup",
    "female",
    "member",
    "eclipse-local-dev-auth-only",
  );
  sql(`update public.profiles set onboarding_step=3 where id='${incomplete.id}'`);
  const incompletePage = await (
    await browser.newContext({ ...koreanBrowser, viewport: { width: 390, height: 844 } })
  ).newPage();
  await incompletePage.goto(`${baseUrl}/signup`);
  await acceptSignupConsent(incompletePage);
  const incompleteNext = incompletePage.getByRole("button", { name: "다음", exact: true });
  for (let attempt = 0; attempt < 20; attempt += 1) {
    await incompletePage.getByRole("button", { name: "남성" }).click();
    if (await incompleteNext.isEnabled()) break;
    await incompletePage.waitForTimeout(250);
  }
  assert.equal(await incompleteNext.isEnabled(), true, "incomplete signup form did not hydrate");
  await incompleteNext.click();
  await incompletePage.getByLabel("회사 이메일").fill(incomplete.email);
  await incompletePage.getByRole("button", { name: "개발 계정 만들기" }).click();
  await incompletePage.getByRole("heading", { name: "진행 중인 가입이 있어요" }).waitFor();
  assert.equal(await incompletePage.getByText(incomplete.name).count(), 0);
  await incompletePage.getByRole("button", { name: "가입 이어하기" }).click();
  await incompletePage.getByRole("heading", { name: "기본적인 것부터" }).waitFor();
  assert.equal(await incompletePage.getByLabel("이름").inputValue(), incomplete.name);
  await incompletePage.getByLabel("생년월일", { exact: true }).fill("2020-01-01");
  await incompletePage.getByText("만 19~79세만 가입할 수 있습니다.", { exact: true }).waitFor();
  assert.equal(await incompleteNext.isEnabled(), false, "a minor cannot continue beta signup");
  await incompletePage.getByLabel("생년월일", { exact: true }).fill("");
  await incompletePage
    .getByText("입력한 생년월일 기준 만 19세 이상만 가입할 수 있어요.", { exact: true })
    .waitFor();
  assert.equal(await incompleteNext.isEnabled(), false, "a missing birth date blocks beta signup");
  await incompletePage.getByLabel("생년월일", { exact: true }).fill("1993-05-12");
  assert.equal(
    await incompleteNext.isEnabled(),
    true,
    "an adult can continue with complete basics",
  );
  await incompletePage.getByRole("button", { name: "3번째 사진 빼기" }).click();
  await incompletePage.getByText("1장 더 필요해요 (2/3)").waitFor();
  await incompletePage.getByText("다음으로 가려면 사진 1장이 필요해요.").waitFor();
  assert.equal(
    await incompletePage.getByRole("button", { name: "다음", exact: true }).isEnabled(),
    false,
    "missing photos are explained while Next stays disabled",
  );
  await incompletePage.goto(`${baseUrl}/signup`);
  await incompletePage.getByRole("heading", { name: "진행 중인 가입이 있어요" }).waitFor();
  assert.equal(await incompletePage.getByText(incomplete.name).count(), 0);
  await incompletePage.getByRole("button", { name: "다른 계정으로 새로 가입" }).click();
  await acceptSignupConsent(incompletePage);
  const clearedNext = incompletePage.getByRole("button", { name: "다음", exact: true });
  for (let attempt = 0; attempt < 20; attempt += 1) {
    await incompletePage.getByRole("button", { name: "남성" }).click();
    if (await clearedNext.isEnabled()) break;
    await incompletePage.waitForTimeout(250);
  }
  assert.equal(await clearedNext.isEnabled(), true, "new account form did not hydrate");
  await clearedNext.click();
  assert.equal(
    await incompletePage.getByLabel("회사 이메일").inputValue(),
    "",
    "starting a different account clears the previous email and draft",
  );
  await incompletePage.close();

  const freshEmail = `after-e2e-fresh-${randomUUID()}@verify.local`;
  const freshPage = await (
    await browser.newContext({ ...koreanBrowser, viewport: { width: 390, height: 844 } })
  ).newPage();
  await freshPage.goto(`${baseUrl}/signup`);
  await acceptSignupConsent(freshPage);
  const freshNext = freshPage.getByRole("button", { name: "다음", exact: true });
  for (let attempt = 0; attempt < 20; attempt += 1) {
    await freshPage.getByRole("button", { name: "남성" }).click();
    if (await freshNext.isEnabled()) break;
    await freshPage.waitForTimeout(250);
  }
  assert.equal(await freshNext.isEnabled(), true, "fresh signup form did not hydrate");
  await freshNext.click();
  await freshPage.getByLabel("회사 이메일").fill(freshEmail);
  await freshPage.getByRole("button", { name: "개발 계정 만들기" }).click();
  await freshPage.getByText("로컬 개발 환경").waitFor();
  const freshId = sql(`select id from auth.users where email='${freshEmail}'`);
  assert.ok(freshId, "fresh signup creates one synthetic auth identity");
  ids.push(freshId);
  await freshPage.getByRole("button", { name: "계속하기" }).click();
  await freshPage.getByRole("heading", { name: "로그인 비밀번호를 정해 주세요" }).waitFor();
  assert.equal(
    sql(`select count(*) from public.profiles where id='${freshId}'`),
    "0",
    "email verification alone does not create a profile before consent",
  );
  await freshPage.getByLabel("비밀번호").fill(password);
  await freshPage.getByRole("button", { name: "가입 계속하기" }).click();
  await chooseWorkZone(freshPage);
  await freshPage.getByRole("heading", { name: "휴대폰 번호를 확인할게요" }).waitFor();
  assert.equal(
    sql(`select count(*) from public.profiles where id='${freshId}'
      and terms_agreed_at is not null and privacy_agreed_at is not null`),
    "1",
    "new signup creates exactly one consented profile",
  );
  assert.equal(
    sql(`select hub_id from public.profiles where id='${freshId}'`),
    "gangnam",
    "the new profile stores the work zone explicitly chosen during signup",
  );
  // Simulate delivery only: code issuance, wrong-code handling, consumption and
  // profile updates use the actual local DB. Never send SMS to a synthetic number.
  let smsCode;
  await freshPage.route("**/functions/v1/phone-otp", async (route) => {
    assert.equal(route.request().postDataJSON().phone, "01000000074");
    const result = await service.rpc("issue_phone_code", {
      p_user: freshId,
      p_phone: "+821000000074",
    });
    assert.ifError(result.error);
    smsCode = result.data;
    await route.fulfill({ json: { sent: true, phone: "+821000000074" } });
  });
  await freshPage.getByLabel("휴대폰 번호", { exact: true }).fill("01000000074");
  await freshPage.getByRole("button", { name: "인증번호 받기", exact: true }).click();
  const smsInput = freshPage.getByLabel("인증번호", { exact: true });
  await smsInput.waitFor();
  assert.equal(await smsInput.inputValue(), "", "beta production UI does not prefill SMS codes");
  await smsInput.fill(smsCode === "000000" ? "111111" : "000000");
  await freshPage.getByRole("button", { name: "인증하고 계속", exact: true }).click();
  await freshPage.getByText("인증번호가 맞지 않아요.", { exact: true }).waitFor();
  await smsInput.fill(smsCode);
  await freshPage.getByRole("button", { name: "인증하고 계속", exact: true }).click();
  await freshPage.getByRole("heading", { name: "기본적인 것부터" }).waitFor();
  assert.equal(await freshPage.getByLabel("생년월일", { exact: true }).inputValue(), "");
  assert.equal(
    await freshPage.getByLabel("생년월일", { exact: true }).getAttribute("readonly"),
    null,
  );
  assert.equal(
    sql(`select (phone_verified_at is not null)::text || ':' ||
      (identity_verified_at is null)::text from public.profiles where id='${freshId}'`),
    "true:true",
    "SMS proves phone access only, never verified identity or adulthood",
  );
  await freshPage.close();

  // Exercise the identity-first UI with a trusted-provider fixture. The HTTP
  // response is simulated, but proof transfer and profile creation use real DB
  // functions. No test result is presented as a live KCP verification.
  const carrierBase = "http://127.0.0.1:4176";
  carrierServer = spawn(
    process.execPath,
    ["node_modules/vite/bin/vite.js", "--host", "127.0.0.1", "--port", "4176", "--strictPort"],
    {
      env: {
        ...process.env,
        TZ: "Asia/Seoul",
        VITE_SUPABASE_URL: apiUrl,
        VITE_SUPABASE_ANON_KEY: anonKey,
        VITE_CARRIER_IDENTITY_ENABLED: "true",
      },
      stdio: "ignore",
    },
  );
  await waitForServer(carrierBase);
  const carrierPage = await (
    await browser.newContext({ ...koreanBrowser, viewport: { width: 390, height: 844 } })
  ).newPage();
  await carrierPage.goto(`${carrierBase}/signup`);
  await acceptSignupConsent(carrierPage);
  await carrierPage.getByRole("heading", { name: "본인과 성인 여부를 확인할게요" }).waitFor();
  await carrierPage.reload();
  await carrierPage.getByRole("heading", { name: "진행 중인 가입이 있어요" }).waitFor();
  await carrierPage.getByRole("button", { name: "가입 이어하기" }).click();
  await carrierPage.getByRole("heading", { name: "본인과 성인 여부를 확인할게요" }).waitFor();
  assert.equal(await carrierPage.getByRole("heading", { name: "성별을 알려주세요" }).count(), 0);
  assert.equal(
    await carrierPage.getByLabel("회사 이메일").count(),
    0,
    "company email follows identity verification",
  );
  const signupProof = await carrierPage.evaluate(() =>
    sessionStorage.getItem("after-signup-session"),
  );
  assert.ok(signupProof);
  // A canceled mobile return keeps the verified-email screen inaccessible.
  await carrierPage.goto(`${carrierBase}/signup?code=USER_CANCEL`);
  await carrierPage.getByRole("heading", { name: "본인과 성인 여부를 확인할게요" }).waitFor();
  await carrierPage.getByRole("alert").waitFor();
  assert.equal(await carrierPage.getByLabel("회사 이메일").count(), 0);
  const verificationId = `av${randomUUID().replaceAll("-", "")}`;
  const { error: startIdentityError } = await service.rpc("start_signup_identity", {
    p_token: signupProof,
    p_id: verificationId,
  });
  if (startIdentityError) throw startIdentityError;
  await carrierPage.evaluate(
    (id) => sessionStorage.setItem("after-signup-identity", id),
    verificationId,
  );
  await carrierPage.route("**/functions/v1/signup-identity", async (route) => {
    const body = route.request().postDataJSON();
    assert.equal(body.action, "complete");
    assert.equal(body.token, signupProof);
    assert.equal(body.identityVerificationId, verificationId);
    const { data, error } = await service.rpc("finish_signup_identity", {
      p_token: signupProof,
      p_id: verificationId,
      p_gender: "female",
      p_birth: "1994-02-15",
      p_phone: `+8210${Date.now().toString().slice(-8)}`,
      p_di: `e2e-${randomUUID()}`,
    });
    if (error) throw error;
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      headers: { "access-control-allow-origin": "*" },
      body: JSON.stringify(data),
    });
  });
  await carrierPage.goto(`${carrierBase}/signup?identityVerificationId=${verificationId}`);
  await carrierPage.getByRole("heading", { name: "회사 이메일로 인증해 주세요" }).waitFor();
  assert.equal(new URL(carrierPage.url()).searchParams.has("identityVerificationId"), false);
  assert.equal(await carrierPage.getByRole("heading", { name: "성별을 알려주세요" }).count(), 0);
  const carrierEmail = `after-e2e-carrier-${randomUUID()}@verify.local`;
  await carrierPage.route("**/rest/v1/rpc/signup_session_status", (route) => route.abort());
  await carrierPage.reload();
  await carrierPage.getByRole("heading", { name: "가입 정보를 확인하지 못했어요" }).waitFor();
  assert.equal(
    await carrierPage.evaluate(() => sessionStorage.getItem("after-signup-session")),
    signupProof,
    "a network outage never discards completed identity proof",
  );
  await carrierPage.unroute("**/rest/v1/rpc/signup_session_status");
  await carrierPage.getByRole("button", { name: "다시 확인하기" }).click();
  await carrierPage.getByRole("heading", { name: "진행 중인 가입이 있어요" }).waitFor();
  await carrierPage.getByRole("button", { name: "가입 이어하기" }).click();
  await carrierPage.getByRole("heading", { name: "회사 이메일로 인증해 주세요" }).waitFor();
  await carrierPage.getByLabel("회사 이메일").fill(carrierEmail);
  await carrierPage.getByRole("button", { name: "개발 계정 만들기" }).click();
  await carrierPage.getByText("로컬 개발 환경").waitFor();
  const carrierUserId = sql(`select id from auth.users where email='${carrierEmail}'`);
  assert.ok(carrierUserId);
  ids.push(carrierUserId);
  await carrierPage.getByRole("button", { name: "계속하기" }).click();
  await carrierPage.getByRole("heading", { name: "로그인 비밀번호를 정해 주세요" }).waitFor();
  await carrierPage.getByLabel("비밀번호").fill(password);
  await carrierPage.getByRole("button", { name: "가입 계속하기" }).click();
  await chooseWorkZone(carrierPage);
  await carrierPage.getByRole("heading", { name: "기본적인 것부터" }).waitFor();
  assert.equal(await carrierPage.getByLabel("생년월일").inputValue(), "1994-02-15");
  assert.notEqual(await carrierPage.getByLabel("생년월일").getAttribute("readonly"), null);
  assert.equal(
    sql(
      `select gender || ':' || birth::text || ':' || (identity_verified_at is not null)::text from public.profiles where id='${carrierUserId}'`,
    ),
    "female:1994-02-15:true",
  );
  assert.equal(
    sql(
      `select (p.terms_agreed_at=s.accepted_at and p.privacy_agreed_at=s.accepted_at)::text from public.profiles p join public.signup_sessions s on s.claimed_by=p.id where p.id='${carrierUserId}'`,
    ),
    "true",
    "the first consent timestamp survives company authentication",
  );
  await carrierPage.close();
  carrierServer.kill("SIGTERM");
  carrierServer = null;

  const eligible = sql(`select count(*) from public.eligible_profiles
    where id in ('${male.id}','${female.id}')`);
  assert.equal(eligible, "2", "synthetic pair must be ready before browser flow");
  sql(`insert into public.affinities(from_id,to_id,verdict)
    values('${female.id}','${male.id}','like');
    select public.issue_ticket('${male.id}','e2e_${male.id}',3000,'intro');
    select public.issue_ticket('${male.id}','e2e_meeting_${male.id}',30000,'meeting');
    begin;
    set local role authenticated;
    set local request.jwt.claims='{"sub":"${admin.id}","role":"authenticated","aal":"aal2"}';
    select public.admin_set_queue('${male.id}',array['${female.id}']::uuid[],
      '합성 브라우저 E2E 원문 검토 후 큐 등록');
    commit;`);

  const malePage = await (
    await browser.newContext({ ...koreanBrowser, viewport: { width: 390, height: 844 } })
  ).newPage();
  await login(malePage, male);
  await malePage.getByRole("link", { name: "소개 열어보기" }).click();
  await malePage.getByRole("button", { name: "소개 티켓 1장 쓰고 열기" }).click();
  await malePage.getByText(female.name).first().waitFor({ timeout: 15_000 });
  assert.equal(
    sql(`select count(*) from public.intros where male_id='${male.id}'
    and female_id='${female.id}'`),
    "1",
    "browser opened exactly one introduction",
  );
  await checkPage(malePage, "male opened introduction");
  await malePage.getByRole("button", { name: "만남 티켓 쓰기" }).click();
  await malePage.getByRole("heading", { name: "언제 만날까요?" }).waitFor();
  await malePage.getByRole("group", { name: "날짜" }).getByRole("button").first().click();
  await malePage
    .getByRole("group", { name: "시간" })
    .getByRole("button", { name: "7시", exact: true })
    .click();
  const placeChoices = malePage.getByRole("radiogroup", { name: "장소" });
  if (await placeChoices.count()) await placeChoices.getByRole("radio").first().click();
  else await malePage.getByLabel("만날 곳").fill("역삼역 3번 출구 근처 카페");
  await malePage.getByRole("button", { name: /후보 1개로 요청하기/ }).click();
  await malePage.getByText("답변을 기다리는 중입니다").waitFor();
  assert.equal(
    sql(`select count(*) from public.meetings m join public.intros i on i.id=m.intro_id
    where i.male_id='${male.id}' and i.female_id='${female.id}'`),
    "1",
    "meeting request created from the browser",
  );
  await malePage.close();

  const femalePage = await (
    await browser.newContext({ ...koreanBrowser, viewport: { width: 390, height: 844 } })
  ).newPage();
  await login(femalePage, female);
  await checkPage(femalePage, "female home");
  await femalePage.getByRole("link", { name: "요청 확인하기" }).click();
  await femalePage
    .getByRole("button", { name: /이 날로 정하기/ })
    .first()
    .click();
  await femalePage.waitForURL("**/home");
  assert.equal(
    sql(`select count(*) from public.meetings m join public.intros i on i.id=m.intro_id
    where i.male_id='${male.id}' and i.female_id='${female.id}'
      and m.confirmed_at is not null`),
    "1",
    "female accepted a proposed meeting slot",
  );
  await femalePage.goto(`${baseUrl}/support`);
  await femalePage
    .getByLabel("문의 내용")
    .fill("합성 브라우저 검증을 위한 문의입니다. 답변은 필요하지 않습니다.");
  await femalePage.getByRole("button", { name: /문의.*보내기|문의.*남기기|문의 접수/ }).click();
  await femalePage.getByText("합성 브라우저 검증을 위한 문의입니다.", { exact: false }).waitFor();

  // An existing member can revise her introduction without changing the
  // public copy until the final confirmation. A reload resumes the draft.
  await femalePage.goto(`${baseUrl}/signup?edit=1`);
  await femalePage.getByRole("heading", { name: "기본적인 것부터" }).waitFor();
  await femalePage.getByLabel("직업", { exact: true }).fill("서비스 기획자");
  await femalePage.getByRole("button", { name: "다음", exact: true }).click();
  await femalePage.getByRole("heading", { name: "만나기 전에 알아 두면 좋은 것" }).waitFor();
  await femalePage.getByRole("button", { name: "비흡연" }).click();
  await femalePage.getByRole("button", { name: "안 마심" }).click();
  await femalePage.getByRole("button", { name: "다음", exact: true }).click();
  await femalePage.getByRole("heading", { name: "내 이야기를 시작해 볼까요?" }).waitFor();
  await checkPage(femalePage, "interview start mobile");
  await femalePage.getByRole("button", { name: "시작하기", exact: true }).click();
  await femalePage.getByRole("button", { name: "동네 돌아보기" }).click();
  await femalePage.getByRole("button", { name: "짧게 커피" }).click();
  await femalePage.getByRole("button", { name: "다음", exact: true }).click();
  await femalePage.getByRole("button", { name: "다음", exact: true }).click();
  await femalePage.getByRole("button", { name: "영화·드라마" }).click();
  await femalePage.getByRole("button", { name: "다음", exact: true }).click();
  await checkPage(femalePage, "interview question mobile");
  await femalePage.getByLabel("내 답변").fill("퇴근하면 동네를 천천히 걸어요");
  await femalePage.getByRole("button", { name: "다음 이야기" }).click();
  await femalePage.getByRole("heading", { name: "어떤 만남에서 편해지나요?" }).waitFor();
  await femalePage.getByLabel("내 답변").fill("처음에는 서로 이야기를 듣는 편이에요");
  await femalePage.getByRole("button", { name: "다음 이야기" }).click();
  await femalePage.getByRole("heading", { name: "만나면 어떤 이야기를 나누고 싶나요?" }).waitFor();
  await femalePage.getByLabel("내 답변").fill("주말에 본 영화를 이야기하고 싶어요");
  assert.equal(
    await femalePage.getByLabel("내 답변").inputValue(),
    "주말에 본 영화를 이야기하고 싶어요",
  );
  await femalePage.getByText("저장 중…").waitFor();
  await femalePage.getByText("저장됨", { exact: true }).waitFor();
  assert.equal(
    await femalePage.getByLabel("내 답변").inputValue(),
    "주말에 본 영화를 이야기하고 싶어요",
    "current answer remains in the form after autosave",
  );
  assert.equal(
    sql(`select data->>'stage' from public.profile_interview_drafts where user_id='${female.id}'`),
    "story2",
    "interview position is saved",
  );
  assert.equal(
    sql(
      `select data->'answers'->>'conversation' from public.profile_interview_drafts where user_id='${female.id}'`,
    ),
    "주말에 본 영화를 이야기하고 싶어요",
    "current answer is saved",
  );
  assert.equal(
    sql(`select headline from public.profiles where id='${female.id}'`),
    "퇴근 후 동네를 걷는 편이에요.",
    "unpublished answers do not change the public headline",
  );
  assert.equal(
    sql(`select job from public.profiles where id='${female.id}'`),
    "제품 기획자",
    "unpublished basics do not change the public job",
  );
  assert.equal(
    sql(
      `select data->'basics'->>'job' from public.profile_interview_drafts where user_id='${female.id}'`,
    ),
    "서비스 기획자",
    "private draft retains edited job",
  );
  await femalePage.reload();
  await femalePage.getByRole("heading", { name: "기본적인 것부터" }).waitFor();
  assert.equal(
    await femalePage.getByLabel("직업", { exact: true }).inputValue(),
    "서비스 기획자",
    "private basic edits survive reload",
  );
  await femalePage.getByRole("button", { name: "다음", exact: true }).click();
  await femalePage.getByRole("button", { name: "다음", exact: true }).click();
  await femalePage.getByRole("heading", { name: "만나면 어떤 이야기를 나누고 싶나요?" }).waitFor();
  assert.equal(
    sql(`select data->>'stage' from public.profile_interview_drafts where user_id='${female.id}'`),
    "story2",
    "editing basics does not reset the interview",
  );
  await femalePage.getByLabel("내 답변").waitFor();
  assert.equal(
    await femalePage.getByLabel("내 답변").inputValue(),
    "주말에 본 영화를 이야기하고 싶어요",
    "draft answer survives reload",
  );
  await femalePage.getByRole("button", { name: "답변 확인하기" }).click();
  await femalePage.route("**/functions/v1/compose-profile-v3", (route) =>
    route.fulfill({
      status: 503,
      contentType: "application/json",
      body: JSON.stringify({
        status: "error",
        code: "config_error",
        retryable: false,
      }),
    }),
  );
  await femalePage.getByRole("button", { name: "내용 정리하기" }).click();
  await femalePage.getByRole("heading", { name: "답변은 그대로 있어요" }).waitFor();
  await femalePage.getByRole("button", { name: "내가 직접 정리하기" }).click();
  await femalePage.getByRole("heading", { name: "이렇게 소개할까요?" }).waitFor();
  await femalePage.getByLabel("한 줄 소개").fill("퇴근 후 동네를 걷는 시간");
  await femalePage
    .getByLabel("카드에서 보일 짧은 소개")
    .fill("퇴근 후에는 동네를 걷고, 주말에 본 영화 이야기를 좋아해요.");
  await checkPage(femalePage, "interview preview mobile");
  await femalePage.getByRole("button", { name: "이 소개장으로 완료" }).click();
  await femalePage.waitForURL("**/profile", { timeout: 15_000 });
  assert.notEqual(
    sql(`select headline from public.profiles where id='${female.id}'`),
    "퇴근 후 동네를 걷는 편이에요.",
    "confirmed interview changes the public headline",
  );
  assert.equal(
    sql(`select job from public.profiles where id='${female.id}'`),
    "서비스 기획자",
    "confirmed interview publishes private basic edits",
  );
  await femalePage.goto(`${baseUrl}/signup?edit=1`);
  await femalePage.getByRole("heading", { name: "기본적인 것부터" }).waitFor();
  await femalePage.getByRole("button", { name: "다음", exact: true }).click();
  await femalePage.getByRole("button", { name: "다음", exact: true }).click();
  await femalePage.getByRole("button", { name: "소개장 수정" }).click();
  await femalePage.getByLabel("카드에서 보일 짧은 소개").fill("연락은 010-1234-5678로 주세요.");
  assert.equal(
    await femalePage.getByRole("button", { name: "이 소개장으로 완료" }).isDisabled(),
    true,
    "contact details cannot be submitted from the preview",
  );
  await femalePage
    .getByLabel("카드에서 보일 짧은 소개")
    .fill("이번에는 제가 직접 쓴 소개글이에요.");
  await femalePage.getByRole("button", { name: "이 소개장으로 완료" }).click();
  await femalePage.waitForURL("**/profile", { timeout: 15_000 });
  assert.equal(
    sql(`select intro from public.profiles where id='${female.id}'`),
    "이번에는 제가 직접 쓴 소개글이에요.",
    "manual editing works without generating a new introduction",
  );
  await femalePage.close();

  const adminPage = await (
    await browser.newContext({ ...koreanBrowser, viewport: { width: 1440, height: 900 } })
  ).newPage();
  await login(adminPage, admin);
  await adminPage.goto(`${baseUrl}/admin`);
  await adminPage.getByText("운영 홈").first().waitFor();
  await checkPage(adminPage, "admin operations");
  await adminPage.goto(`${baseUrl}/admin/support`);
  const inquiry = adminPage
    .getByRole("article")
    .filter({ hasText: "합성 브라우저 검증을 위한 문의입니다." });
  await inquiry.waitFor();
  await inquiry.getByRole("button", { name: "답변하기" }).click();
  await inquiry.getByLabel("답변").fill("테스트 문의를 확인했습니다.");
  await inquiry.getByRole("button", { name: "답변 등록" }).click();
  await adminPage.getByText("답변을 등록했습니다.").waitFor();
  assert.equal(
    sql(`select count(*) from public.support_requests where user_id='${female.id}'
      and response='테스트 문의를 확인했습니다.'`),
    "1",
    "operator answered the inquiry through the admin UI",
  );
  await adminPage.goto(`${baseUrl}/admin/insights`);
  await adminPage.getByRole("heading", { name: "운영 병목과 흐름" }).waitFor();
  await checkPage(adminPage, "admin insights");
  await adminPage.goto(`${baseUrl}/admin/system`);
  await adminPage.getByRole("heading", { name: "시스템 운영" }).waitFor();
  await checkPage(adminPage, "admin system");
  await adminPage.close();

  // Exercise the beta path without pre-issuing tickets. Restore the local
  // setting even if a browser assertion fails; this script never touches prod.
  const previousPaymentsEnabled = sql("select payments_enabled from public.app_settings");
  try {
    sql("update public.app_settings set payments_enabled=false");
    const betaMale = await createPerson("male", "male", "member", password);
    const betaFemale = await createPerson("female", "female", "member", password);
    sql(`insert into public.affinities(from_id,to_id,verdict)
      values('${betaFemale.id}','${betaMale.id}','like');
      begin;
      set local role authenticated;
      set local request.jwt.claims='{"sub":"${admin.id}","role":"authenticated","aal":"aal2"}';
      select public.admin_set_queue('${betaMale.id}',array['${betaFemale.id}']::uuid[],
        '베타 무료 경로 합성 브라우저 검증');
      commit;`);

    const betaFemalePage = await (
      await browser.newContext({ ...koreanBrowser, viewport: { width: 390, height: 844 } })
    ).newPage();
    await login(betaFemalePage, betaFemale);
    await betaFemalePage.goto(`${baseUrl}/availability`);
    await betaFemalePage.getByRole("heading", { name: "퇴근 후, 언제 편하세요?" }).waitFor();
    await checkPage(betaFemalePage, "beta female availability");
    for (const day of ["월", "화", "수", "목", "금"]) {
      await betaFemalePage
        .getByRole("group", { name: "편한 요일" })
        .getByRole("button", { name: day })
        .click();
    }
    await betaFemalePage.getByRole("button", { name: "저장하기" }).click();
    await betaFemalePage.waitForURL("**/home");
    await betaFemalePage.close();

    const betaMalePage = await (
      await browser.newContext({ ...koreanBrowser, viewport: { width: 390, height: 844 } })
    ).newPage();
    await login(betaMalePage, betaMale);
    await betaMalePage.goto(`${baseUrl}/store?kind=intro`);
    await betaMalePage.getByText("지금은 티켓 신청 없이 이용해요").waitFor();
    await checkPage(betaMalePage, "beta store fallback");
    await betaMalePage.goto(`${baseUrl}/availability`);
    await betaMalePage.getByRole("heading", { name: "퇴근 후, 언제 편하세요?" }).waitFor();
    for (const day of ["월", "화", "수", "목", "금"]) {
      await betaMalePage
        .getByRole("group", { name: "편한 요일" })
        .getByRole("button", { name: day })
        .click();
    }
    await betaMalePage.getByRole("button", { name: "저장하기" }).click();
    await betaMalePage.waitForURL("**/home");
    assert.equal(
      sql(
        `select count(*) from public.meet_windows where user_id in ('${betaMale.id}','${betaFemale.id}')`,
      ),
      "2",
      "both beta members saved private meeting windows",
    );
    await betaMalePage.getByRole("link", { name: "소개 열어보기" }).click();
    await betaMalePage.getByRole("button", { name: "베타 무료로 열기" }).click();
    await betaMalePage.getByText(betaFemale.name).first().waitFor({ timeout: 15_000 });
    await betaMalePage.getByRole("button", { name: "만남 요청하기" }).click();
    await betaMalePage.getByText("서로 편한 요일이 겹쳐요").waitFor();
    await checkPage(betaMalePage, "beta meeting request");
    await betaMalePage.getByRole("group", { name: "날짜" }).getByRole("button").first().click();
    await betaMalePage
      .getByRole("group", { name: "시간" })
      .getByRole("button", { name: "7시", exact: true })
      .click();
    const betaPlaces = betaMalePage.getByRole("radiogroup", { name: "장소" });
    if (await betaPlaces.count()) await betaPlaces.getByRole("radio").first().click();
    else await betaMalePage.getByLabel("만날 곳").fill("역삼역 3번 출구 근처 카페");
    await betaMalePage.getByRole("button", { name: /후보 1개로 무료 요청하기/ }).click();
    await betaMalePage.getByText("답변을 기다리는 중입니다").waitFor();
    const betaMeetingId = sql(`select m.id from public.meetings m
      join public.intros i on i.id=m.intro_id
      where i.male_id='${betaMale.id}' and i.female_id='${betaFemale.id}'`);
    assert.ok(betaMeetingId, "beta meeting exists without a pre-issued ticket");
    assert.equal(
      sql(
        `select count(*) from public.tickets where user_id='${betaMale.id}' and price_krw=0 and used_at is not null`,
      ),
      "2",
      "beta opening and meeting request used zero-won tickets only",
    );
    await betaMalePage.goto(`${baseUrl}/home`);
    await betaMalePage.getByText("이 요청은 종료돼요.", { exact: false }).waitFor();
    await betaMalePage.goto(`${baseUrl}/ticket`);
    await betaMalePage.getByRole("link", { name: "약속 조율 도움받기" }).click();
    await betaMalePage.getByLabel("문의 내용").fill("이 만남의 약속 장소를 조율하고 싶어요.");
    await betaMalePage.getByRole("button", { name: /문의.*보내기|문의.*남기기|문의 접수/ }).click();
    assert.equal(
      sql(`select count(*) from public.support_requests where user_id='${betaMale.id}'
        and meeting_id='${betaMeetingId}'`),
      "1",
      "concierge request is linked to the actual meeting",
    );
    await betaMalePage.close();
  } finally {
    sql(`update public.app_settings set payments_enabled=${previousPaymentsEnabled === "t"}`);
  }

  process.stdout.write(
    "Browser E2E: consent/identity-first and beta signup, paid and beta intro/meeting, availability, meeting help, interview, admin PASS\n",
  );
} finally {
  sql(`update public.app_settings set payments_enabled=${originalPaymentsEnabled === "t"}`);
  await browser?.close();
  server?.kill("SIGTERM");
  carrierServer?.kill("SIGTERM");
  if (objectPaths.length) {
    const { error } = await service.storage.from("profile-photos").remove(objectPaths);
    if (error) process.stderr.write(`Synthetic photo cleanup failed: ${error.message}\n`);
  }
  if (ids.length) {
    const listed = ids.map((id) => `'${id}'`).join(",");
    const owned = sql(`select count(*) from auth.users where id in (${listed})
      and email like 'after-e2e-%@verify.local'`);
    if (owned !== String(ids.length)) throw new Error("Refusing to clean up non-E2E users");
    sql(`begin;
      delete from public.support_requests where user_id in (${listed})
        or responded_by in (${listed});
      delete from public.admin_actions where actor_id in (${listed})
        or target_user in (${listed});
      delete from public.meetings where intro_id in
        (select id from public.intros where male_id in (${listed}) or female_id in (${listed}));
      delete from public.tickets where user_id in (${listed});
      delete from public.intros where male_id in (${listed}) or female_id in (${listed});
      delete from public.intro_queue where male_id in (${listed}) or female_id in (${listed})
        or curated_by in (${listed});
      delete from public.ticket_orders where user_id in (${listed}) or fulfilled_by in (${listed});
      commit;`);
  }
  for (const id of ids.reverse()) {
    const { error } = await service.auth.admin.deleteUser(id);
    if (error) process.stderr.write(`Synthetic user cleanup failed: ${id} ${error.message}\n`);
  }
}
