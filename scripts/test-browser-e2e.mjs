import assert from "node:assert/strict";
import { execFileSync, spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import { mkdir } from "node:fs/promises";
import { createServer } from "node:net";
import { join } from "node:path";
import { setTimeout as delay } from "node:timers/promises";

import AxeBuilder from "@axe-core/playwright";
import { createClient } from "@supabase/supabase-js";
import { chromium, webkit } from "playwright";
import { checkAccountScreens } from "./lib/account-screen-checks.mjs";
import { checkTicketScreens } from "./lib/ticket-screen-checks.mjs";
import { checkPaymentScreens } from "./lib/payment-screen-checks.mjs";
import { checkAdminScreens } from "./lib/admin-screen-checks.mjs";

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

const testPort = Number(process.env.AFTER_TEST_PORT ?? 4174);
const screenshotDir = process.env.AFTER_E2E_SCREENSHOT_DIR;
assert.ok(Number.isInteger(testPort) && testPort >= 1024 && testPort <= 65535);
const baseUrl = `http://127.0.0.1:${testPort}`;
await new Promise((resolve, reject) => {
  const probe = createServer();
  probe.once("error", () =>
    reject(new Error(`Port ${testPort} is occupied; set AFTER_TEST_PORT to a free port.`)),
  );
  probe.listen(testPort, "127.0.0.1", () =>
    probe.close((error) => (error ? reject(error) : resolve())),
  );
});
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
  // Valid 1×1 RGBA PNG: both chunk CRCs and the zlib checksum are verified.
  // WebKit can reject the old corrupt IDAT even when another decoder tolerates it.
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR4nGO4NK3pPwAHEgLqTt8GBgAAAABJRU5ErkJggg==",
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
  await waitForHome(page);
}

async function waitForHome(page) {
  await page.waitForURL("**/home", { timeout: 15_000 });
  await page.getByRole("navigation", { name: "주요 메뉴", exact: true }).waitFor();
  await page
    .getByRole("main")
    .getByText(/님의 애프터|나의 애프터/)
    .waitFor();
  await page.getByRole("main").getByRole("heading", { level: 1 }).waitFor();
}

async function checkPage(page, name, accessibility = true) {
  await page.waitForFunction(
    () =>
      !document
        .getAnimations()
        .some(
          (animation) =>
            animation.playState === "running" &&
            animation.effect?.getComputedTiming().iterations !== Infinity,
        ),
    undefined,
    { timeout: 5000 },
  );
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
          `${item.id}: ${item.nodes.map((node) => `${node.target.join(",")} ${node.html} ${node.failureSummary ?? ""}`).join(" | ")}`,
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
      String(testPort),
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
        VITE_TOSS_CLIENT_KEY: "test_gck_browser_fixture",
      },
      stdio: "ignore",
    },
  );
  await waitForServer();
  browser = await (process.env.AFTER_TEST_BROWSER === "webkit" ? webkit : chromium).launch({
    headless: true,
  });

  const publicPage = await (
    await browser.newContext({ ...koreanBrowser, viewport: { width: 390, height: 844 } })
  ).newPage();
  await publicPage.goto(baseUrl);
  await publicPage.getByRole("link", { name: "로그인" }).waitFor();
  const landingPhoto = publicPage.locator(
    '.landing-photo img[src="/brand/after-first-conversation.jpg"]',
  );
  await landingPhoto.evaluate((image) => image.decode());
  await checkPage(publicPage, "landing mobile");
  for (const width of [320, 360, 768, 1440]) {
    await publicPage.setViewportSize({ width, height: 900 });
    await checkPage(publicPage, `landing ${width}`, false);
    const photoRatio = await landingPhoto.evaluate((image) => ({
      actual: image.getBoundingClientRect().width / image.getBoundingClientRect().height,
      source: image.naturalWidth / image.naturalHeight,
      reserved: Number(image.getAttribute("width")) / Number(image.getAttribute("height")),
    }));
    assert.equal(photoRatio.reserved, photoRatio.source, "landing reserves its image ratio");
    assert.ok(
      Math.abs(photoRatio.actual - photoRatio.source) < 0.01,
      `landing photo is uncropped at ${width}px`,
    );
    if (screenshotDir && [320, 1440].includes(width)) {
      await mkdir(screenshotDir, { recursive: true });
      await publicPage.screenshot({ path: join(screenshotDir, `landing-warm-${width}px.png`) });
    }
  }
  await publicPage.emulateMedia({ reducedMotion: "reduce" });
  assert.equal(
    await publicPage
      .locator(".landing-photo")
      .evaluate((element) => getComputedStyle(element).animationName),
    "none",
    "reduced motion removes the landing photo reveal",
  );
  const publicSupportPage = await publicPage.context().newPage();
  await publicPage.close();
  await publicSupportPage.goto(`${baseUrl}/support`, { waitUntil: "domcontentloaded" });
  await publicSupportPage.getByText("1:1 문의").waitFor();
  await checkPage(publicSupportPage, "public support direct entry");
  await publicSupportPage.close();

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
  await signupPage.getByRole("heading", { name: "시작하기 전에, 확인해 주세요" }).waitFor();
  await checkPage(signupPage, "signup consent mobile");
  if (screenshotDir) {
    await mkdir(screenshotDir, { recursive: true });
    await signupPage.screenshot({ path: join(screenshotDir, "signup-consent.png") });
  }
  await acceptSignupConsent(signupPage);
  const signupNext = signupPage.getByRole("button", { name: "다음", exact: true });
  for (let attempt = 0; attempt < 20; attempt += 1) {
    await signupPage.getByRole("button", { name: "여성" }).click();
    if (await signupNext.isEnabled()) break;
    await signupPage.waitForTimeout(250);
  }
  assert.equal(await signupNext.isEnabled(), true, "signup form did not hydrate");
  await signupNext.click();

  // Synthetic provider failures only: never send a real OTP or create a user.
  // Exercise the SDK's code-only and '{}' message shapes through the actual UI.
  let authFailure = { error_code: "user_already_exists", msg: "{}" };
  const authRoute = /\/auth\/v1\/(?:signup|token)(?:\?|$)/;
  await signupPage.route(authRoute, (route) =>
    route.fulfill({
      status: 422,
      contentType: "application/json",
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Expose-Headers": "X-Supabase-Api-Version",
        "X-Supabase-Api-Version": "2024-01-01",
      },
      body: JSON.stringify(authFailure),
    }),
  );
  await signupPage.getByLabel("회사 이메일").fill("synthetic-error@verify.local");
  await signupPage.getByRole("button", { name: "개발 계정 만들기" }).click();
  await signupPage.getByRole("alert").waitFor();
  assert.equal(
    await signupPage.getByRole("alert").locator("p").innerText(),
    "이미 가입된 계정이 있어요. 기존 계정으로 로그인해 주세요.",
  );
  assert.equal(
    await signupPage.getByRole("link", { name: "로그인 화면으로" }).getAttribute("href"),
    "/login",
  );
  await checkPage(signupPage, "signup duplicate account mobile");
  if (screenshotDir) {
    await mkdir(screenshotDir, { recursive: true });
    await signupPage.screenshot({
      path: join(screenshotDir, "signup-error-mobile.png"),
      fullPage: true,
    });
  }
  await signupPage.setViewportSize({ width: 1440, height: 900 });
  await checkPage(signupPage, "signup duplicate account desktop", false);
  if (screenshotDir) {
    await signupPage.screenshot({
      path: join(screenshotDir, "signup-error-desktop.png"),
      fullPage: true,
    });
  }
  await signupPage.setViewportSize({ width: 390, height: 844 });
  authFailure = {};
  await signupPage.getByRole("button", { name: "개발 계정 만들기" }).click();
  await signupPage
    .getByRole("alert")
    .getByText("인증을 완료하지 못했어요. 잠시 후 다시 시도해 주세요.", { exact: true })
    .waitFor();
  assert.equal((await signupPage.getByRole("alert").innerText()).includes("{}"), false);
  await signupPage.unroute(authRoute);
  await signupPage.getByLabel("회사 이메일").fill(existing.email);
  await signupPage.getByRole("button", { name: "개발 계정 만들기" }).click();
  // Local sign-in loads this existing profile through the auth listener. Do not
  // race it with OTP continuation, which independently redirects to home.
  await signupPage.getByRole("heading", { name: "이미 가입된 계정이 있어요" }).waitFor();
  assert.equal(await signupPage.getByText(existing.name).count(), 0);
  await signupPage.getByRole("button", { name: "기존 계정으로 계속" }).click();
  await waitForHome(signupPage);
  await signupPage.getByText(`${existing.name}님의 애프터 · 판교권`, { exact: true }).waitFor();
  // A landscape brand photo must remain uncropped at every app-shell width.
  // The old portrait + fixed 160px cover box discarded most of the scene.
  const readiness = signupPage.getByRole("region", { name: "소개 설정", exact: true });
  const readinessPhoto = readiness.locator('img[src="/brand/after-first-conversation.jpg"]');
  await readinessPhoto.waitFor();
  await readinessPhoto.evaluate((image) => image.decode());
  await signupPage
    .locator("[data-sonner-toast]")
    .last()
    .waitFor({ state: "hidden", timeout: 10000 });
  for (const width of [320, 390, 430, 768, 1440]) {
    await signupPage.setViewportSize({ width, height: 900 });
    const imageSize = await readinessPhoto.evaluate((image) => ({
      width: image.getBoundingClientRect().width,
      height: image.getBoundingClientRect().height,
      naturalWidth: image.naturalWidth,
      naturalHeight: image.naturalHeight,
      declaredWidth: Number(image.getAttribute("width")),
      declaredHeight: Number(image.getAttribute("height")),
    }));
    assert.ok(imageSize.width > 0 && imageSize.naturalWidth > 0, "waiting photo loaded");
    const availabilityBox = await readiness
      .getByRole("link", { name: /만남 가능 시간/ })
      .boundingBox();
    const photoBox = await readinessPhoto.boundingBox();
    assert.ok(
      availabilityBox.y + availabilityBox.height <= photoBox.y,
      "settings and next action precede the brand photo",
    );
    assert.equal(
      imageSize.declaredWidth / imageSize.declaredHeight,
      imageSize.naturalWidth / imageSize.naturalHeight,
      "photo reserves its intrinsic ratio before loading",
    );
    assert.ok(
      Math.abs(
        imageSize.width / imageSize.height - imageSize.naturalWidth / imageSize.naturalHeight,
      ) < 0.01,
      `waiting photo is uncropped at ${width}px`,
    );
    await checkPage(signupPage, `waiting home ${width}px`, width === 390);
    if (screenshotDir && [320, 390, 1440].includes(width)) {
      await signupPage.evaluate(() => {
        window.scrollTo(0, 0);
        document.querySelector("main")?.scrollTo(0, 0);
      });
      await signupPage.screenshot({ path: join(screenshotDir, `waiting-home-${width}px.png`) });
    }
  }
  await signupPage.setViewportSize({ width: 390, height: 844 });
  const waitingSwitch = readiness.getByRole("switch");
  const switchBox = await waitingSwitch.boundingBox();
  assert.ok(switchBox.width >= 44 && switchBox.height >= 44, "switch has a 44px touch target");
  await signupPage.emulateMedia({ reducedMotion: "reduce" });
  assert.equal(
    await signupPage
      .locator(".app-tab[aria-current='page'] .app-tab-icon")
      .evaluate((element) => getComputedStyle(element).animationName),
    "none",
    "selected tab respects reduced motion",
  );
  assert.equal(
    await waitingSwitch.evaluate(
      (element) => getComputedStyle(element, "::before").transitionProperty,
    ),
    "none",
    "switch rail respects reduced motion",
  );
  await signupPage.emulateMedia({ reducedMotion: "no-preference" });
  await readiness.getByRole("switch", { name: "소개 잠시 멈추기", exact: true }).click();
  await readiness.getByRole("switch", { name: "소개 다시 받기", exact: true }).waitFor();
  assert.equal(await readinessPhoto.count(), 0, "paused introductions do not show a waiting photo");
  await readiness.getByRole("switch", { name: "소개 다시 받기", exact: true }).click();
  await readinessPhoto.waitFor();
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
  await freshPage.setViewportSize({ width: 320, height: 480 });
  await freshPage.getByLabel("이름", { exact: true }).fill("신규 테스트");
  await delay(400);
  await freshPage
    .waitForFunction(
      () => {
        const field = document.getElementById("name");
        if (!field || document.activeElement !== field) return false;
        const rect = field.getBoundingClientRect();
        const main = field.closest("main").getBoundingClientRect();
        return rect.top >= main.top && rect.bottom <= main.bottom;
      },
      undefined,
      { timeout: 3000 },
    )
    .catch(async (error) => {
      const geometry = await freshPage.getByLabel("이름", { exact: true }).evaluate((field) => ({
        field: field.getBoundingClientRect().toJSON(),
        main: field.closest("main").getBoundingClientRect().toJSON(),
        active: document.activeElement?.tagName,
        scrollTop: field.closest("main").scrollTop,
        viewportHeight: window.visualViewport?.height,
      }));
      throw new Error(`Focused signup field was not visible: ${JSON.stringify(geometry)}`, {
        cause: error,
      });
    });
  await freshPage.getByLabel("생년월일", { exact: true }).fill("1994-03-12");
  await freshPage.getByLabel("직업", { exact: true }).fill("서비스 기획자");
  assert.equal(
    await freshPage.getByRole("button", { name: "다음", exact: true }).isDisabled(),
    true,
  );
  await freshPage
    .getByRole("status")
    .filter({ hasText: "다음으로 가려면" })
    .getByText(/사진 3장/)
    .waitFor();
  const uploadRoute = "**/storage/v1/object/profile-photos/**";
  await freshPage.route(uploadRoute, async (route) => {
    if (route.request().method() === "POST") {
      objectPaths.push(
        decodeURIComponent(new URL(route.request().url()).pathname.split("/profile-photos/")[1]),
      );
      await delay(700);
    }
    await route.continue();
  });
  const uploadFile = (n) => ({
    name: `onboarding-${n}.png`,
    mimeType: "image/png",
    buffer: tinyPng,
  });
  await freshPage.getByLabel("프로필 사진 추가").setInputFiles([0, 1, 2].map(uploadFile));
  await freshPage.getByText("3/6장 · 사진을 누르면 대표 사진이 돼요", { exact: true }).waitFor();
  await freshPage.getByLabel("프로필 사진 추가").setInputFiles(uploadFile(3));
  assert.equal(
    await freshPage.getByRole("button", { name: "사진을 올리는 중…", exact: true }).isDisabled(),
    true,
  );
  assert.equal(
    await freshPage.getByRole("button", { name: "대표 사진", exact: true }).isDisabled(),
    true,
  );
  await freshPage.getByText("4/6장 · 사진을 누르면 대표 사진이 돼요", { exact: true }).waitFor();
  await freshPage.unroute(uploadRoute);
  const removePhoto = freshPage.getByRole("button", { name: "4번째 사진 빼기", exact: true });
  const removePhotoBox = await removePhoto.boundingBox();
  assert.ok(removePhotoBox.width >= 44 && removePhotoBox.height >= 44);
  await removePhoto.click();
  await freshPage.getByRole("button", { name: "2번째 사진을 대표로", exact: true }).click();
  await freshPage.setViewportSize({ width: 390, height: 844 });
  await freshPage.getByRole("heading", { name: "기본적인 것부터" }).focus();
  await freshPage.getByRole("main").evaluate((main) => main.scrollTo(0, 0));
  await checkPage(freshPage, "signup basics and photos");
  if (screenshotDir) await freshPage.screenshot({ path: join(screenshotDir, "signup-basics.png") });
  await freshPage.getByRole("button", { name: "다음", exact: true }).click();
  await freshPage.getByRole("heading", { name: "만나기 전에 알아 두면 좋은 것" }).waitFor();
  await checkPage(freshPage, "signup lifestyle choices");
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
  await checkTicketScreens({ page: malePage, baseUrl, checkPage, screenshotDir });
  await checkPaymentScreens({ page: malePage, baseUrl, checkPage, screenshotDir, userId: male.id });
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
  if (screenshotDir)
    await malePage.screenshot({ path: join(screenshotDir, "intro-native-390px.png") });
  await malePage.setViewportSize({ width: 320, height: 568 });
  await malePage.emulateMedia({ reducedMotion: "reduce", colorScheme: "dark" });
  await malePage.getByRole("button", { name: "더보기", exact: true }).click();
  await malePage.getByRole("menuitem", { name: "신고하기", exact: true }).click();
  const reportDialog = malePage.getByRole("alertdialog");
  await reportDialog.waitFor();
  assert.equal(
    await reportDialog.evaluate((element) => getComputedStyle(element).animationName),
    "none",
    "reduced motion overrides the Radix open-state animation",
  );
  assert.equal(
    await reportDialog.evaluate((element) => getComputedStyle(element).transitionProperty),
    "none",
    "viewport changes never animate dialog layout properties",
  );
  assert.equal(
    await malePage
      .locator(".bg-scrim")
      .evaluate((element) => getComputedStyle(element).animationName),
    "none",
    "reduced motion also removes the scrim animation",
  );
  const reportBox = await reportDialog.boundingBox();
  assert.ok(reportBox.x >= 19 && reportBox.x + reportBox.width <= 301);
  assert.ok(reportBox.y >= 0 && reportBox.y + reportBox.height <= 568);
  await reportDialog.getByRole("button", { name: "취소", exact: true }).click();
  await reportDialog.waitFor({ state: "hidden" });
  await malePage.emulateMedia({ reducedMotion: "no-preference", colorScheme: "light" });
  await malePage.setViewportSize({ width: 390, height: 844 });
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
  const removeSlot = malePage.getByRole("button", { name: /빼기$/ });
  const removeSlotBox = await removeSlot.boundingBox();
  assert.ok(
    removeSlotBox.width >= 44 && removeSlotBox.height >= 44,
    "slot removal is a 44px target",
  );
  await checkPage(malePage, "meeting request selected slot");
  if (screenshotDir) {
    await malePage.getByRole("main").evaluate((main) => main.scrollTo(0, 0));
    await malePage.screenshot({ path: join(screenshotDir, "meeting-request-native.png") });
  }
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
  await checkPage(femalePage, "meeting request received");
  if (screenshotDir)
    await femalePage.screenshot({ path: join(screenshotDir, "meeting-received-native.png") });
  await femalePage
    .getByRole("button", { name: /이 날로 정하기/ })
    .first()
    .click();
  await waitForHome(femalePage);
  assert.equal(
    sql(`select count(*) from public.meetings m join public.intros i on i.id=m.intro_id
    where i.male_id='${male.id}' and i.female_id='${female.id}'
      and m.confirmed_at is not null`),
    "1",
    "female accepted a proposed meeting slot",
  );
  const homeSummary = femalePage.getByRole("region", { name: "약속 요약", exact: true });
  await homeSummary.waitFor();
  const homeTime = await homeSummary.locator("dd").first().textContent();
  await femalePage.goto(`${baseUrl}/chats`);
  const chatSummary = femalePage.getByRole("region", { name: "약속 요약", exact: true });
  await chatSummary.waitFor();
  assert.equal(
    await chatSummary.locator("dd").first().textContent(),
    homeTime,
    "home and conversation show the same complete date and time",
  );
  await checkPage(femalePage, "conversation with meeting summary");
  await femalePage
    .getByLabel("메시지", { exact: true })
    .fill("안녕하세요! 약속한 카페에서 만나요.");
  await femalePage.getByRole("button", { name: "보내기", exact: true }).click();
  const sentBubble = femalePage.locator('.chat-message[data-sent="true"]');
  await sentBubble.waitFor();
  assert.equal(
    await sentBubble.evaluate((el) => getComputedStyle(el).animationName),
    "after-message-send",
  );
  assert.equal(await femalePage.getByLabel("메시지", { exact: true }).inputValue(), "");
  const conversationMeetingId =
    sql(`select m.id from public.meetings m join public.intros i on i.id=m.intro_id
    where i.male_id='${male.id}' and i.female_id='${female.id}'`);
  sql(`insert into public.messages(meeting_id,sender_id,channel,body)
    values('${conversationMeetingId}','${male.id}','coord','네, 좋아요. 퇴근하고 여유 있게 갈게요!');`);
  await femalePage
    .getByRole("log")
    .getByText("네, 좋아요. 퇴근하고 여유 있게 갈게요!", { exact: true })
    .waitFor();
  await checkPage(femalePage, "conversation sent and received bubbles");
  if (screenshotDir)
    await femalePage.screenshot({ path: join(screenshotDir, "meeting-summary.png") });
  sql(
    `update public.meetings set private_opens_at=now()-interval '1 minute' where id='${conversationMeetingId}'`,
  );
  await femalePage.reload();
  await femalePage.getByRole("tab", { name: "사적인 대화", exact: true }).waitFor();
  for (const viewport of [
    { width: 320, height: 568 },
    { width: 390, height: 480 },
    { width: 844, height: 390 },
  ]) {
    await femalePage.setViewportSize(viewport);
    await femalePage.emulateMedia({ reducedMotion: "reduce" });
    await checkPage(femalePage, `compact conversation ${viewport.width}x${viewport.height}`);
    const composerBox = await femalePage.locator(".chat-composer").boundingBox();
    const logBox = await femalePage.getByRole("log").boundingBox();
    const tabBox = await femalePage
      .getByRole("navigation", { name: "주요 메뉴", exact: true })
      .boundingBox();
    assert.ok(
      logBox.height >= 60,
      `meeting context must leave room to read messages at ${viewport.width}x${viewport.height}`,
    );
    assert.ok(
      composerBox.y >= logBox.y + logBox.height - 1 &&
        composerBox.y + composerBox.height <= tabBox.y,
      `composer remains between conversation and navigation at ${viewport.width}x${viewport.height}: ${JSON.stringify({ composerBox, logBox, tabBox })}`,
    );
    const context = femalePage.getByRole("region", { name: "약속 정보와 참석 확인", exact: true });
    await context.focus();
    await context.evaluate((el) => el.scrollTo(0, el.scrollHeight));
    await femalePage.getByRole("button", { name: "약속 시간 바꾸기", exact: true }).click();
    await femalePage
      .getByRole("dialog")
      .getByRole("heading", { name: "약속 시간 바꾸기", exact: true })
      .waitFor();
    await femalePage.keyboard.press("Escape");
  }
  await femalePage.setViewportSize({ width: 390, height: 844 });
  await femalePage
    .getByLabel("메시지", { exact: true })
    .fill("https://example.test/" + "longpath".repeat(40));
  await femalePage.getByRole("button", { name: "보내기", exact: true }).click();
  await femalePage.getByRole("log").getByText("https://example.test/", { exact: false }).waitFor();
  assert.equal(
    await sentBubble.evaluate((el) => getComputedStyle(el).animationName),
    "none",
    "reduced motion suppresses send feedback",
  );
  await checkPage(femalePage, "long message wrapping");
  await femalePage.locator("html").evaluate((el) => el.classList.add("dark"));
  await checkPage(femalePage, "dark conversation contrast");
  await femalePage.locator("html").evaluate((el) => el.classList.remove("dark"));
  await femalePage.emulateMedia({ reducedMotion: "no-preference" });
  const scheduleRequest = "**/rest/v1/meetings?*";
  // Read-only UI fixture for the older preference-first planner; actual
  // confirmation, ticket and cancellation semantics are covered by DB/full-cycle suites.
  await femalePage.route(scheduleRequest, async (route) => {
    const response = await route.fetch();
    const original = await response.json();
    const asPending = (meeting) => ({
      ...meeting,
      confirmed_at: null,
      scheduled_at: null,
      prefs_submitted_at: new Date().toISOString(),
      prefs: { dates: [meeting.scheduled_at], stations: ["강남"], anywhere: false },
    });
    await route.fulfill({
      response,
      json: Array.isArray(original) ? original.map(asPending) : asPending(original),
    });
  });
  await femalePage.goto(`${baseUrl}/schedule?meetingId=${conversationMeetingId}`);
  const confirmPlan = femalePage.getByRole("button", {
    name: "이 날짜와 장소로 확정하기",
    exact: true,
  });
  await confirmPlan.waitFor();
  assert.equal(await confirmPlan.isDisabled(), true);
  await femalePage.getByRole("button", { name: homeTime.trim(), exact: true }).click();
  await femalePage.getByLabel("만날 장소").fill("강남역 근처의 조용한 카페");
  assert.equal(await confirmPlan.isEnabled(), true);
  await checkPage(femalePage, "preference-first date planner");
  if (screenshotDir) {
    await femalePage.getByRole("main").evaluate((main) => main.scrollTo(0, 0));
    await femalePage.screenshot({ path: join(screenshotDir, "schedule-native.png") });
  }
  await femalePage.unroute(scheduleRequest);
  await femalePage.route(scheduleRequest, (route) =>
    route.fulfill({
      status: 503,
      contentType: "application/json",
      body: JSON.stringify({ message: "Synthetic unavailable" }),
    }),
  );
  await femalePage.goto(`${baseUrl}/schedule?meetingId=${randomUUID()}`);
  await femalePage
    .getByRole("alert")
    .getByText("약속 정보를 불러오지 못했어요. 다시 확인해 주세요.")
    .waitFor();
  await femalePage.unroute(scheduleRequest);
  await femalePage.getByRole("button", { name: "다시 확인", exact: true }).click();
  await femalePage.getByText("아직 정할 날짜가 없습니다", { exact: true }).waitFor();
  await femalePage.goto(`${baseUrl}/support`);
  await femalePage
    .getByLabel("문의 내용")
    .fill("합성 브라우저 검증을 위한 문의입니다. 답변은 필요하지 않습니다.");
  await femalePage.getByRole("button", { name: /문의.*보내기|문의.*남기기|문의 접수/ }).click();
  await femalePage.getByText("합성 브라우저 검증을 위한 문의입니다.", { exact: false }).waitFor();
  await checkAccountScreens({ page: femalePage, baseUrl, checkPage, screenshotDir });

  // An existing member can revise her introduction without changing the
  // public copy until the final confirmation. A reload resumes the draft.
  const publicProfileBeforeInterview = sql(`select row_to_json(p)::text from (
    select headline,intro,profile_story from public.profiles where id='${female.id}'
  ) p`);
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
  await checkPage(femalePage, "interview choices mobile");
  if (screenshotDir) {
    await femalePage.getByRole("heading", { name: "나에게 편한 방식", exact: true }).focus();
    await femalePage.getByRole("main").evaluate((main) => main.scrollTo(0, 0));
    await femalePage.screenshot({ path: join(screenshotDir, "interview-choices.png") });
  }
  await femalePage.getByRole("button", { name: "다음", exact: true }).click();
  await femalePage.getByRole("button", { name: "틈틈이 짧게", exact: true }).waitFor();
  await femalePage.getByRole("button", { name: "다음", exact: true }).click();
  await femalePage.getByRole("button", { name: "영화·드라마" }).click();
  await femalePage.getByRole("button", { name: "다음", exact: true }).click();
  await femalePage
    .getByRole("heading", { name: "최근 퇴근 후 기억에 남는 작은 순간이 있나요?" })
    .waitFor();
  await femalePage.getByText("집에 돌아오는 길처럼, 떠오르는 장면 하나만 적어 주세요.").waitFor();
  assert.equal(await femalePage.getByText("동네 돌아보기", { exact: true }).count(), 0);
  assert.equal(await femalePage.getByText("고른 답:", { exact: false }).count(), 0);
  await checkPage(femalePage, "interview question mobile");
  if (screenshotDir) {
    await mkdir(screenshotDir, { recursive: true });
    await femalePage.screenshot({ path: join(screenshotDir, "interview-390px.png") });
  }
  await femalePage.setViewportSize({ width: 1440, height: 900 });
  await checkPage(femalePage, "interview question desktop");
  if (screenshotDir) {
    await femalePage.screenshot({ path: join(screenshotDir, "interview-desktop.png") });
  }
  await femalePage.setViewportSize({ width: 390, height: 844 });
  await femalePage.getByLabel("내 답변").fill("퇴근하면 동네를 천천히 걸어요");
  const saveDraftRoute = "**/rest/v1/rpc/save_profile_interview_draft";
  await femalePage.route(saveDraftRoute, (route) =>
    route.fulfill({ status: 503, json: { message: "Synthetic draft save unavailable" } }),
  );
  await femalePage.getByRole("button", { name: "다시 저장하기", exact: true }).waitFor();
  assert.equal(
    await femalePage.getByLabel("내 답변").inputValue(),
    "퇴근하면 동네를 천천히 걸어요",
  );
  await femalePage.unroute(saveDraftRoute);
  await femalePage.getByRole("button", { name: "다시 저장하기", exact: true }).click();
  await femalePage.getByText("저장됨", { exact: true }).waitFor();
  let transitionSaves = 0;
  await femalePage.route(saveDraftRoute, async (route) => {
    transitionSaves++;
    await delay(1200);
    await route.continue();
  });
  await femalePage.getByLabel("내 답변").fill("퇴근하면 동네를 천천히 걸어요. 익숙한 길이 편해요.");
  await femalePage.getByRole("button", { name: "다음 이야기" }).click();
  await femalePage
    .getByRole("heading", { name: "누군가와 어색함이 풀렸던 순간이 있나요?" })
    .waitFor();
  await delay(900);
  assert.equal(transitionSaves, 1, "slow next-step saving must not queue the previous step again");
  assert.equal(
    sql(`select data->>'stage' from public.profile_interview_drafts where user_id='${female.id}'`),
    "story1",
  );
  await femalePage.unroute(saveDraftRoute);
  await femalePage.getByText("함께 있던 때나 오간 말을 한두 문장으로 적어도 좋아요.").waitFor();
  assert.equal(await femalePage.getByText("짧게 커피", { exact: true }).count(), 0);
  await femalePage.getByLabel("내 답변").fill("처음에는 서로 이야기를 듣는 편이에요");
  await femalePage.getByRole("button", { name: "다음 이야기" }).click();
  await femalePage
    .getByRole("heading", { name: "요즘 누군가에게 들려주고 싶은 이야기가 있나요?" })
    .waitFor();
  await femalePage.getByText("최근 본 것처럼 가벼운 이야기부터 적어도 좋아요.").waitFor();
  assert.equal(await femalePage.getByText("영화·드라마", { exact: true }).count(), 0);
  await femalePage.getByLabel("내 답변").fill("주말에 본 영화를 이야기하고 싶어요");
  await femalePage.getByText("저장 중…").waitFor();
  await femalePage.getByText("저장됨", { exact: true }).waitFor();
  await femalePage.getByRole("button", { name: "이전", exact: true }).click();
  await femalePage
    .getByRole("heading", { name: "누군가와 어색함이 풀렸던 순간이 있나요?" })
    .waitFor();
  assert.equal(
    await femalePage.getByLabel("내 답변").inputValue(),
    "처음에는 서로 이야기를 듣는 편이에요",
  );
  assert.equal(
    sql(`select data->>'stage' from public.profile_interview_drafts where user_id='${female.id}'`),
    "story1",
    "previous story stage is saved",
  );
  await femalePage.getByRole("button", { name: "다음 이야기" }).click();
  await femalePage
    .getByRole("heading", { name: "요즘 누군가에게 들려주고 싶은 이야기가 있나요?" })
    .waitFor();
  assert.equal(
    await femalePage.getByLabel("내 답변").inputValue(),
    "주말에 본 영화를 이야기하고 싶어요",
  );
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
    sql(`select row_to_json(p)::text from (
      select headline,intro,profile_story from public.profiles where id='${female.id}'
    ) p`),
    publicProfileBeforeInterview,
    "unpublished answers do not change the existing public copy or story",
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
  await femalePage
    .getByRole("heading", { name: "요즘 누군가에게 들려주고 싶은 이야기가 있나요?" })
    .waitFor();
  assert.equal(
    sql(`select data->>'stage' from public.profile_interview_drafts where user_id='${female.id}'`),
    "story2",
    "editing basics does not reset the interview",
  );
  assert.equal(
    sql(
      `select data->>'version' from public.profile_interview_drafts where user_id='${female.id}'`,
    ),
    "3",
    "v3 draft version is retained after reload",
  );
  await femalePage.getByLabel("내 답변").waitFor();
  assert.equal(
    await femalePage.getByLabel("내 답변").inputValue(),
    "주말에 본 영화를 이야기하고 싶어요",
    "draft answer survives reload",
  );
  await femalePage.getByRole("button", { name: "답변 확인하기" }).click();
  let analysisCalls = 0;
  let composeCalls = 0;
  const composeRoute = "**/functions/v1/compose-profile-v3";
  await femalePage.route(composeRoute, async (route) => {
    const request = route.request().postDataJSON();
    await delay(800);
    if (request.mode === "analyze" && ++analysisCalls > 1) {
      await route.fulfill({
        json: {
          status: "success",
          analysis: {
            facts: [],
            summary: [
              {
                text: "퇴근 후 동네를 걸으며 여유를 찾는 시간을 좋아해요.",
                sourceIds: ["answer:daily_life"],
              },
            ],
            contradictions: [],
            followupIds: ["walk"],
          },
        },
      });
    } else if (request.mode === "compose" && ++composeCalls > 1) {
      await route.fulfill({
        json: {
          status: "success",
          story: {
            version: 3,
            headline: "산책 끝에 나누는 다정한 이야기",
            summary:
              "동네를 천천히 걸으며 하루를 정리해요. 주말에 본 영화 이야기를 함께 나누고 싶어요.",
            sections: [
              {
                id: "daily_life",
                questionId: "daily_life_v1",
                questionVersion: 1,
                question: "퇴근 후에는 어떻게 보내세요?",
                answer:
                  "퇴근하면 동네를 천천히 걸어요. 익숙한 길을 걷다 보면 하루 동안 분주했던 마음도 한결 편안해져요.",
              },
              {
                id: "getting_closer",
                questionId: "getting_closer_v1",
                questionVersion: 1,
                question: "어떤 만남에서 편해지나요?",
                answer:
                  "처음에는 서로의 이야기를 듣는 편이에요. 천천히 이야기를 나누며 알아가는 시간이 좋아요.",
              },
              {
                id: "conversation",
                questionId: "conversation_v1",
                questionVersion: 1,
                question: "만나면 어떤 이야기를 나누고 싶나요?",
                answer:
                  "주말에 본 영화를 이야기하고 싶어요. 함께 본 장면에 대해 서로 다른 생각을 듣는 것도 좋아해요.",
              },
            ],
            conversationHooks: [],
            publishedRevision: 0,
          },
        },
      });
    } else
      await route.fulfill({
        status: 503,
        contentType: "application/json",
        body: JSON.stringify({
          status: "error",
          code: "config_error",
          retryable: false,
        }),
      });
  });
  await femalePage.getByRole("button", { name: "내용 정리하기" }).click();
  assert.equal(
    await femalePage.getByRole("button", { name: "답변 수정", exact: true }).isDisabled(),
    true,
    "analysis keeps the submitted answers locked",
  );
  await femalePage.getByRole("heading", { name: "답변은 그대로 있어요" }).waitFor();
  await femalePage.getByRole("button", { name: "다시 시도", exact: true }).click();
  await femalePage.getByRole("heading", { name: "조금만 더 들려주세요" }).waitFor();
  await femalePage
    .getByLabel("걷는 시간은 어떤 점이 좋아요?", { exact: true })
    .fill("익숙한 길을 걸으면 마음이 편안해져요.");
  await femalePage.getByRole("button", { name: "계속하기", exact: true }).click();
  await femalePage.getByRole("heading", { name: "이렇게 이해했어요" }).waitFor();
  await checkPage(femalePage, "interview understanding");
  if (screenshotDir)
    await femalePage.screenshot({ path: join(screenshotDir, "interview-understanding.png") });
  await femalePage.getByRole("button", { name: "맞아요", exact: true }).click();
  await femalePage.getByRole("heading", { name: "프로필에 담을 이야기" }).waitFor();
  await femalePage.getByRole("button", { name: "이 내용으로 프로필 만들기", exact: true }).click();
  assert.equal(
    await femalePage.getByRole("button", { name: "직접 정리하기", exact: true }).isDisabled(),
    true,
    "generation cannot be overwritten by changing modes mid-request",
  );
  await femalePage
    .getByRole("alert")
    .filter({ hasText: "소개글 생성 설정을 확인하고 있어요" })
    .waitFor();
  await femalePage.getByRole("button", { name: "이 내용으로 프로필 만들기", exact: true }).click();
  await femalePage.getByRole("heading", { name: "이렇게 소개할까요?" }).waitFor();
  assert.equal(analysisCalls, 2);
  assert.equal(composeCalls, 2);
  await femalePage.getByText("산책 끝에 나누는 다정한 이야기", { exact: true }).waitFor();
  await checkPage(femalePage, "generated interview preview");
  if (screenshotDir)
    await femalePage.screenshot({ path: join(screenshotDir, "interview-generated.png") });
  await femalePage.getByRole("button", { name: "프로필 수정", exact: true }).click();
  await femalePage.getByLabel("한 줄 소개").fill("퇴근 후 동네를 걷는 시간");
  await femalePage
    .getByLabel("카드에서 보일 짧은 소개")
    .fill("퇴근 후에는 동네를 걷고, 주말에 본 영화 이야기를 좋아해요.");
  await checkPage(femalePage, "interview preview mobile");
  // Keep publication in flight past the 800ms autosave debounce. A pending
  // autosave must not advance the revision between final save and publication.
  const publishRoute = "**/rest/v1/rpc/publish_profile_interview_v3";
  await femalePage.route(publishRoute, async (route) => {
    await delay(1200);
    await route.continue();
  });
  await femalePage
    .getByLabel("카드에서 보일 짧은 소개")
    .fill("퇴근 후에는 동네를 걷고, 첫 만남에는 커피를 마시고 싶어요.");
  const publication = femalePage.waitForResponse((response) =>
    response.url().endsWith("/rpc/publish_profile_interview_v3"),
  );
  await femalePage.getByRole("button", { name: "프로필 저장하기" }).click();
  assert.equal(
    await femalePage.getByLabel("카드에서 보일 짧은 소개").isDisabled(),
    true,
    "publication locks its approved snapshot",
  );
  assert.equal((await publication).status(), 200, "pending autosave must not race publication");
  await femalePage.waitForURL("**/profile", { timeout: 15_000 });
  await femalePage.unroute(publishRoute);
  await femalePage.getByRole("heading", { name: "내 프로필", exact: true }).waitFor();
  assert.equal(
    await femalePage
      .getByRole("navigation", { name: "주요 메뉴", exact: true })
      .getByRole("link", { name: "나", exact: true })
      .getAttribute("aria-current"),
    "page",
    "profile keeps the account tab selected",
  );
  const profileArticle = femalePage.locator("article");
  assert.equal(
    await profileArticle.evaluate((article) => {
      const headline = article.querySelector("blockquote");
      const photos = article.querySelector('[role="region"]');
      const facts = article.querySelector("dl");
      const interview = article.querySelector("section");
      return (
        [headline, photos, facts, interview].every(Boolean) &&
        Boolean(headline.compareDocumentPosition(photos) & Node.DOCUMENT_POSITION_FOLLOWING) &&
        Boolean(photos.compareDocumentPosition(facts) & Node.DOCUMENT_POSITION_FOLLOWING) &&
        Boolean(facts.compareDocumentPosition(interview) & Node.DOCUMENT_POSITION_FOLLOWING)
      );
    }),
    true,
    "profile reads headline, photos, facts, then interview",
  );
  const photoOpener = femalePage.getByRole("button", { name: /프로필 사진 1 크게 보기/ });
  await femalePage
    .locator("[data-sonner-toast]")
    .last()
    .waitFor({ state: "hidden", timeout: 10000 });
  for (const width of [320, 390]) {
    await femalePage.setViewportSize({ width, height: 844 });
    await checkPage(femalePage, `profile reading ${width}px`);
    if (screenshotDir)
      await femalePage.screenshot({ path: join(screenshotDir, `profile-reading-${width}px.png`) });
  }
  await femalePage.locator("html").evaluate((el) => el.classList.add("dark"));
  await checkPage(femalePage, "dark profile contrast");
  await femalePage.locator("html").evaluate((el) => el.classList.remove("dark"));
  await photoOpener.click();
  const photoDialog = femalePage.getByRole("dialog");
  await photoDialog.getByRole("img", { name: /사진 1 확대/ }).waitFor();
  await photoDialog.evaluate(async (dialog) => {
    await Promise.all(
      dialog
        .getAnimations({ subtree: true })
        .map((animation) => animation.finished.catch(() => {})),
    );
  });
  assert.equal(await photoDialog.getByRole("button", { name: "이전 사진" }).isDisabled(), true);
  await checkPage(femalePage, "profile photo viewer mobile");
  await photoDialog.getByRole("button", { name: "다음 사진" }).click();
  await photoDialog.getByRole("img", { name: /사진 2 확대/ }).waitFor();
  await photoDialog.getByRole("button", { name: "더 크게 보기" }).click();
  await photoDialog.getByLabel("확대한 사진 스크롤 영역").waitFor();
  await photoDialog.getByRole("button", { name: "원래 크기로" }).click();
  await femalePage.keyboard.press("ArrowRight");
  await photoDialog.getByRole("img", { name: /사진 3 확대/ }).waitFor();
  assert.equal(await photoDialog.getByRole("button", { name: "다음 사진" }).isDisabled(), true);
  await femalePage.keyboard.press("Escape");
  await photoDialog.waitFor({ state: "hidden" });
  assert.equal(
    await photoOpener.evaluate((button) => button === document.activeElement),
    true,
    "closing returns focus to the opened photo",
  );
  const photoSigningRoute = "**/storage/v1/object/sign/profile-photos/**";
  await femalePage.route(photoSigningRoute, (route) =>
    route.fulfill({
      status: 403,
      contentType: "application/json",
      body: JSON.stringify({ message: "Photo unavailable" }),
    }),
  );
  await photoOpener.click();
  await photoDialog.getByText("사진을 불러오지 못했어요. 닫은 뒤 다시 열어 주세요.").waitFor();
  assert.equal(await photoDialog.getByRole("button", { name: "더 크게 보기" }).isDisabled(), true);
  await photoDialog.getByRole("button", { name: "닫기", exact: true }).click();
  await photoDialog.waitFor({ state: "hidden" });
  await femalePage.unroute(photoSigningRoute);
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
  const publishedSections = JSON.parse(
    sql(`select profile_story->'sections' from public.profiles where id='${female.id}'`),
  );
  assert.deepEqual(
    publishedSections.map(({ id, questionId, questionVersion, question }) => ({
      id,
      questionId,
      questionVersion,
      question,
    })),
    [
      {
        id: "daily_life",
        questionId: "daily_life_v1",
        questionVersion: 1,
        question: "퇴근 후에는 어떻게 보내세요?",
      },
      {
        id: "getting_closer",
        questionId: "getting_closer_v1",
        questionVersion: 1,
        question: "어떤 만남에서 편해지나요?",
      },
      {
        id: "conversation",
        questionId: "conversation_v1",
        questionVersion: 1,
        question: "만나면 어떤 이야기를 나누고 싶나요?",
      },
    ],
    "published question identities stay unchanged by the input-only prompts",
  );
  await femalePage.goto(`${baseUrl}/signup?edit=1`);
  await femalePage.getByRole("heading", { name: "기본적인 것부터" }).waitFor();
  await femalePage.getByRole("button", { name: "다음", exact: true }).click();
  await femalePage.getByRole("heading", { name: "만나기 전에 알아 두면 좋은 것" }).waitFor();
  await femalePage.getByRole("button", { name: "다음", exact: true }).click();
  await femalePage.getByRole("button", { name: "프로필 수정" }).click();
  await femalePage.getByLabel("카드에서 보일 짧은 소개").fill("연락은 010-1234-5678로 주세요.");
  assert.equal(
    await femalePage.getByRole("button", { name: "프로필 저장하기" }).isDisabled(),
    true,
    "contact details cannot be submitted from the preview",
  );
  await femalePage
    .getByLabel("카드에서 보일 짧은 소개")
    .fill("이번에는 제가 직접 쓴 소개글이에요.");
  await femalePage.getByRole("button", { name: "프로필 저장하기" }).click();
  await femalePage.waitForURL("**/profile", { timeout: 15_000 });
  await femalePage.getByRole("heading", { name: "내 프로필", exact: true }).waitFor();
  assert.equal(
    sql(`select intro from public.profiles where id='${female.id}'`),
    "이번에는 제가 직접 쓴 소개글이에요.",
    "manual editing works without generating a new introduction",
  );

  // A locally seeded v2 draft still opens through the existing migration path.
  const publicStoryBeforeV2 = sql(
    `select profile_story::text from public.profiles where id='${female.id}'`,
  );
  sql(`insert into public.profile_interview_drafts(user_id,revision,data)
    values('${female.id}',1,jsonb_build_object(
      'version',2,'stage','start','mode','interview',
      'profile',jsonb_build_object(
        'headline','','eveningNote','예전에는 퇴근 후 책을 읽었어요',
        'knownAs','','interests','[]'::jsonb,'details','{}'::jsonb,
        'matchTags','[]'::jsonb,'matchNote','','topics','[]'::jsonb,'topicNote',''
      ),
      'intro','','included',jsonb_build_array('eveningNote'),
      'skipped','[]'::jsonb,'alternatives','[]'::jsonb,
      'followupIds','[]'::jsonb,'followupAnswers','{}'::jsonb,
      'followupIndex',0,'analyzed',false,'suggestedTopics','[]'::jsonb
    ))
    on conflict (user_id) do update set revision=1,data=excluded.data`);
  await femalePage.goto(`${baseUrl}/signup?edit=1`);
  await femalePage.getByRole("heading", { name: "기본적인 것부터" }).waitFor();
  await femalePage.getByRole("button", { name: "다음", exact: true }).click();
  await femalePage.getByRole("heading", { name: "만나기 전에 알아 두면 좋은 것" }).waitFor();
  await femalePage.getByRole("button", { name: "다음", exact: true }).click();
  await femalePage.getByRole("heading", { name: "내 이야기를 시작해 볼까요?" }).waitFor();
  const delayedDraftSave = "**/rest/v1/rpc/save_profile_interview_draft";
  await femalePage.route(delayedDraftSave, async (route) => {
    await delay(250);
    await route.continue();
  });
  await femalePage.getByRole("button", { name: "시작하기", exact: true }).click();
  // Advancing persists asynchronously; wait for the distinct choice group so
  // consecutive clicks cannot hit the previous screen's still-visible button.
  for (const question of [
    "퇴근 후 시간이 생기면 주로 어떻게 보내세요?",
    "일하는 날에는 어떻게 연락하는 편인가요?",
    "어떤 순간에 상대와 가까워졌다고 느끼나요?",
  ]) {
    await femalePage.getByRole("group", { name: question, exact: true }).waitFor();
    await femalePage.getByRole("button", { name: "다음", exact: true }).click();
  }
  await femalePage
    .getByRole("heading", { name: "최근 퇴근 후 기억에 남는 작은 순간이 있나요?" })
    .waitFor();
  assert.equal(
    await femalePage.getByLabel("내 답변").inputValue(),
    "예전에는 퇴근 후 책을 읽었어요",
    "v2 answer is available in the new input screen",
  );
  assert.equal(
    sql(`select profile_story::text from public.profiles where id='${female.id}'`),
    publicStoryBeforeV2,
    "migrating a private v2 draft leaves the published story intact",
  );
  await femalePage.unroute(delayedDraftSave);
  await femalePage.close();

  const adminPage = await (
    await browser.newContext({ ...koreanBrowser, viewport: { width: 1440, height: 900 } })
  ).newPage();
  await login(adminPage, admin);
  await adminPage.goto(`${baseUrl}/admin`);
  await adminPage.getByText("운영 홈").first().waitFor();
  await checkPage(adminPage, "admin operations");
  await checkAdminScreens({ page: adminPage, baseUrl, checkPage, screenshotDir, male, female });
  const supportCaseId = sql(
    `select c.id from ops_cases c join support_requests s on s.id::text=c.source_id where c.case_type='support' and s.user_id='${female.id}' order by c.opened_at desc limit 1`,
  );
  assert.ok(supportCaseId, "synthetic inquiry has an operational case");
  await adminPage.goto(`${baseUrl}/admin/tasks`);
  const worklist = adminPage.getByRole("region", { name: "작업 목록", exact: true });
  const workdetail = adminPage.getByRole("region", { name: "작업 상세", exact: true });
  await worklist.locator(`[data-case-id="${supportCaseId}"]`).waitFor();
  await adminPage
    .getByRole("group", { name: "기한 필터" })
    .getByRole("button", { name: "기한 초과", exact: true })
    .click();
  await adminPage.waitForURL("**/admin/tasks?focus=overdue");
  await adminPage
    .getByRole("group", { name: "기한 필터" })
    .getByRole("button", { name: "모든 기한", exact: true })
    .click();
  await worklist.locator(`[data-case-id="${supportCaseId}"]`).click();
  await workdetail.getByRole("heading", { name: "고객 문의", exact: true }).waitFor();
  assert.equal(await worklist.isVisible(), true, "desktop keeps the queue beside the detail");
  await checkPage(adminPage, "admin workbench desktop");
  if (screenshotDir)
    await adminPage.screenshot({ path: join(screenshotDir, "admin-workbench-desktop.png") });
  await adminPage.setViewportSize({ width: 390, height: 844 });
  assert.equal(await worklist.isVisible(), false, "mobile focuses on the selected task");
  await checkPage(adminPage, "admin workbench mobile");
  if (screenshotDir)
    await adminPage.screenshot({ path: join(screenshotDir, "admin-workbench-mobile.png") });
  await workdetail.getByRole("button", { name: "목록으로 돌아가기", exact: true }).click();
  assert.equal(await worklist.isVisible(), true, "return restores the mobile worklist");
  assert.equal(
    await worklist
      .locator(`[data-case-id="${supportCaseId}"]`)
      .evaluate((node) => document.activeElement === node),
    true,
    "return restores keyboard focus to the selected row",
  );
  await adminPage.setViewportSize({ width: 1440, height: 900 });
  // Refreshing after an action must retain already loaded pages, not silently
  // collapse the operator's working set back to the first 30 rows.
  sql(`insert into ops_cases(case_type,source_id,subject_id,occurrence,priority,status,due_at,source_revision)
    select 'support','e2e-worklist-${admin.id}-'||n,'${admin.id}',1,'normal','open',now()+interval '3 days','qa'
    from generate_series(1,35) n`);
  await adminPage.getByRole("button", { name: "새로고침", exact: true }).click();
  await worklist.getByRole("button", { name: "더 보기", exact: true }).click();
  await worklist.locator("[data-case-id]").nth(34).waitFor();
  const loadedRows = await worklist.locator("[data-case-id]").count();
  await worklist.locator(`[data-case-id="${supportCaseId}"]`).click();
  await workdetail.getByLabel("처리 사유", { exact: true }).fill("합성 검증: 목록 위치 유지 확인");
  await workdetail.getByRole("button", { name: "처리 시작", exact: true }).click();
  await workdetail.getByText("처리 중", { exact: true }).first().waitFor();
  await worklist
    .locator("[data-case-id]")
    .nth(loadedRows - 1)
    .waitFor();
  assert.equal(
    await worklist.locator("[data-case-id]").count(),
    loadedRows,
    "action refresh retains all loaded pages",
  );
  await adminPage.setViewportSize({ width: 390, height: 844 });
  await workdetail.getByRole("button", { name: "목록으로 돌아가기", exact: true }).click();
  const lastRow = worklist.locator("[data-case-id]").last();
  await lastRow.scrollIntoViewIfNeeded();
  const listScroll = await worklist.evaluate((node) => node.closest("main").scrollTop);
  assert.ok(listScroll > 500, "long mobile queue is scrolled before selection");
  await lastRow.click();
  await adminPage.waitForFunction(() => document.querySelector("main").scrollTop === 0);
  await workdetail.getByRole("button", { name: "목록으로 돌아가기", exact: true }).click();
  await adminPage.waitForFunction(
    (top) => Math.abs(document.querySelector("main").scrollTop - top) < 2,
    listScroll,
  );
  sql(
    `delete from ops_cases where subject_id='${admin.id}' and source_id like 'e2e-worklist-${admin.id}-%'`,
  );
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
    await waitForHome(betaFemalePage);
    await betaFemalePage.close();

    const betaMalePage = await (
      await browser.newContext({ ...koreanBrowser, viewport: { width: 390, height: 844 } })
    ).newPage();
    await login(betaMalePage, betaMale);
    await betaMalePage.goto(`${baseUrl}/store?kind=intro`);
    await betaMalePage.getByText("지금은 티켓 신청 없이 이용해요").waitFor();
    await checkPage(betaMalePage, "beta store fallback");
    if (screenshotDir)
      await betaMalePage.screenshot({ path: join(screenshotDir, "ticket-store-beta.png") });
    await betaMalePage.goto(`${baseUrl}/availability`);
    await betaMalePage.getByRole("heading", { name: "퇴근 후, 언제 편하세요?" }).waitFor();
    for (const day of ["월", "화", "수", "목", "금"]) {
      await betaMalePage
        .getByRole("group", { name: "편한 요일" })
        .getByRole("button", { name: day })
        .click();
    }
    await betaMalePage.getByRole("button", { name: "저장하기" }).click();
    await waitForHome(betaMalePage);
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
      delete from public.ops_cases where subject_id in (${listed}) and source_id like 'e2e-worklist-%';
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
