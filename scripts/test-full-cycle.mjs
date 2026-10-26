import assert from "node:assert/strict";
import { execFileSync, spawn } from "node:child_process";
import { createHmac, randomUUID } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import { setTimeout as delay } from "node:timers/promises";
import { createClient } from "@supabase/supabase-js";
import AxeBuilder from "@axe-core/playwright";
import { chromium, webkit } from "playwright";

// Production URLs, real payments, outbound messages and real identities are
// deliberately excluded. Auth/SMS/PG are explicit fixtures, never release proof.
const env = execFileSync("npx", ["supabase", "status", "--output", "env"], { encoding: "utf8" });
const value = (key) => env.match(new RegExp(`^${key}="?([^"\\n]+)"?`, "m"))?.[1];
const api = value("API_URL"),
  db = value("DB_URL");
if (!/^http:\/\/127\.0\.0\.1:\d+$/.test(api ?? "") || !db?.includes("@127.0.0.1:"))
  throw new Error("Full-cycle QA refuses non-local Supabase");
const service = createClient(api, value("SERVICE_ROLE_KEY"));
const sql = (s) =>
  execFileSync("psql", [db, "-v", "ON_ERROR_STOP=1", "-Atc", s], {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  }).trim();
const base = "http://127.0.0.1:4178";
const password = "after-local-cycle-qa-only";
const run = randomUUID().slice(0, 8);
const output = `/tmp/after-full-cycle-${run}`;
const report = {
  run,
  environment: "local",
  browser: process.env.AFTER_TEST_BROWSER === "webkit" ? "webkit" : "chromium",
  fixtures: ["company email", "SMS delivery", "PG provider", "pair-copy provider (UI fixture)"],
  checks: [],
  personas: [],
};
const ids = [],
  paths = [],
  contexts = [];
const settings = sql("select row_to_json(a) from app_settings a");
const assistantFlagColumns = [
  "assistant_chat_enabled",
  "assistant_memory_enabled",
  "assistant_schedule_enabled",
  "assistant_introduction_enabled",
  "assistant_profile_edit_enabled",
];
const cohortHub = ["jongno", "yeouido", "pangyo"].find(
  (hub) => sql(`select count(*) from profiles where hub_id='${hub}' and role='member'`) === "0",
);
if (!cohortHub) throw new Error("QA needs an empty local hub; refusing to change existing members");
let browser, server;
await mkdir(output, { recursive: true });

async function check(name, fn) {
  try {
    await fn();
    report.checks.push({ name, status: "PASS" });
    console.log(`PASS ${name}`);
  } catch (e) {
    report.checks.push({ name, status: "FAIL", error: e.message });
    console.log(`FAIL ${name}: ${e.message.slice(0, 240)}`);
  }
}
async function pageFor(width = 390) {
  const context = await browser.newContext({
    viewport: { width, height: 900 },
    isMobile: width < 768,
    hasTouch: width < 768,
    locale: "ko-KR",
    timezoneId: "Asia/Seoul",
  });
  contexts.push(context);
  const page = await context.newPage();
  page.setDefaultTimeout(12000);
  return page;
}
async function screen(page, name) {
  // Sonner pauses auto-dismiss while the document is hidden or its stack is hovered.
  await page.bringToFront();
  await page.waitForFunction(() => document.visibilityState === "visible", undefined, {
    timeout: 5000,
  });
  await page.mouse.move(0, 0);
  const toast = page.locator("[data-sonner-toast]").last();
  if (await toast.count()) await toast.waitFor({ state: "hidden", timeout: 10000 });
  // Measure settled UI, not the intermediate alpha of a dialog/content fade.
  // Keep animations enabled; a stuck finite animation must still fail the test.
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
  await page.screenshot({ path: `${output}/${name}.png`, fullPage: true });
  assert.equal(
    await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1),
    false,
    `${name} overflow`,
  );
  const result = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa"]).analyze();
  await writeFile(`${output}/${name}.axe.json`, JSON.stringify(result.violations, null, 2));
  assert.deepEqual(
    result.violations.filter((x) => ["serious", "critical"].includes(x.impact)).map((x) => x.id),
    [],
    name,
  );
}
async function login(page, person) {
  await page.goto(`${base}/login`);
  for (let n = 0; n < 20; n++) {
    await page.getByLabel("가입한 이메일").fill(person.email);
    await page.getByLabel("비밀번호").fill(password);
    if (await page.getByRole("button", { name: "로그인", exact: true }).isEnabled()) break;
    await delay(200);
  }
  await page.getByRole("button", { name: "로그인", exact: true }).click();
  await waitForHome(page);
}

async function waitForHome(page) {
  await page.waitForURL("**/home");
  // WebKit can expose the new URL before the SPA has committed the screen.
  // Wait for the home UI, not a delay or a second forced navigation.
  await page.getByRole("navigation", { name: "주요 메뉴", exact: true }).waitFor();
  await page.locator(".home-greeting h1").waitFor();
}

async function finishFeedback(page) {
  // Memory-enabled local labs intentionally retain the submitted receipt so a
  // member can choose to save a preference. The beta OFF path goes straight home.
  await Promise.race([
    page.waitForURL("**/home"),
    page.getByText("후기를 남겨주셨어요. 고마워요.", { exact: true }).waitFor(),
  ]);
  if (new URL(page.url()).pathname === "/feedback")
    await page.getByRole("button", { name: "홈으로", exact: true }).click();
  await waitForHome(page);
}
function localTotp(secret) {
  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
  const bits = [...secret.replace(/=+$/, "").toUpperCase()]
    .map((c) => alphabet.indexOf(c).toString(2).padStart(5, "0"))
    .join("");
  const key = Buffer.from((bits.match(/.{8}/g) ?? []).map((byte) => parseInt(byte, 2)));
  const counter = Buffer.alloc(8);
  counter.writeBigUInt64BE(BigInt(Math.floor(Date.now() / 30000)));
  const hmac = createHmac("sha1", key).update(counter).digest();
  return String((hmac.readUInt32BE(hmac[19] & 15) & 0x7fffffff) % 1000000).padStart(6, "0");
}

async function setPaymentsInUI(page, enabled) {
  await page.goto(`${base}/admin/orders`);
  await page
    .getByPlaceholder("전환 사유 (필수 — 기록에 남습니다)")
    .fill("QA: 로컬 결제 대역 모드 검증. 실제 청구 없음.");
  await page
    .getByRole("button", { name: enabled ? "결제 켜기" : "결제 끄기 (베타로)", exact: true })
    .click();
  await page
    .getByRole("button", { name: enabled ? "결제 끄기 (베타로)" : "결제 켜기", exact: true })
    .waitFor();
  assert.equal(sql("select payments_enabled from app_settings"), enabled ? "t" : "f");
}
const personas = [
  {
    key: "m1",
    name: "민준QA",
    gender: "male",
    birth: "1993-05-12",
    job: "백엔드 개발자",
    story:
      "퇴근 후에는 동네를 걸으며 하루를 정리해요. 주말에는 커피 한 잔과 영화 이야기를 나누고 싶어요.",
    scenario: "능동적·유료 구매·정상 만남",
  },
  {
    key: "m2",
    name: "도윤QA",
    gender: "male",
    birth: "1991-08-20",
    job: "프로덕트 매니저",
    story:
      "주중에는 일이 바쁘지만 금요일 저녁은 비워두고 싶어요. 차분하게 대화하며 가까워지는 만남이 좋아요.",
    scenario: "소개 넘김·미응답 취소·티켓 복구",
  },
  {
    key: "f1",
    name: "서연QA",
    gender: "female",
    birth: "1995-03-15",
    job: "브랜드 디자이너",
    story:
      "전시를 보고 오래 걷는 걸 좋아해요. 처음에는 커피를 마시며 일상의 작은 이야기를 나누고 싶어요.",
    scenario: "호감·일정 수락·후기",
  },
  {
    key: "f2",
    name: "지우QA",
    gender: "female",
    birth: "1994-11-04",
    job: "회계사",
    story:
      "바쁜 시기에는 연락이 늦어질 수 있어요. 일정이 맞으면 퇴근 후 가볍게 저녁을 먹으며 만나고 싶어요.",
    scenario: "거절·미응답·운영 검토",
  },
  {
    key: "f3",
    name: "하린QA",
    gender: "female",
    birth: "1996-06-23",
    job: "서비스 기획자",
    story:
      "새로운 카페를 찾아가는 주말을 좋아해요. 평일 저녁에는 서로의 하루를 듣는 편안한 만남을 기대해요.",
    scenario: "복수 호감·큐 대기·예외 경로",
  },
];

async function signup(person, i) {
  const page = await pageFor();
  await page.route("**/functions/v1/signup-identity", (route) =>
    route.request().postDataJSON()?.action === "dev-status"
      ? route.fulfill({ json: { enabled: true } })
      : route.fallback(),
  );
  person.page = page;
  person.email = `cycle-${run}-${person.key}@verify.local`;
  await page.goto(`${base}/signup`);
  await page.getByRole("heading", { name: "시작하기 전에, 확인해 주세요" }).waitFor();
  await page.getByRole("checkbox", { name: "이용약관 동의 (필수)", exact: true }).check();
  await page.getByRole("checkbox", { name: "개인정보 수집·이용 동의 (필수)", exact: true }).check();
  await page.getByRole("button", { name: "동의하고 시작하기" }).click();
  await page
    .getByRole("button", { name: person.gender === "male" ? "남성" : "여성", exact: true })
    .click();
  await page.getByRole("button", { name: "다음", exact: true }).click();
  await page.getByLabel("회사 이메일").fill(person.email);
  await page.getByRole("button", { name: "개발 계정 만들기" }).click();
  await page.getByText("로컬 개발 환경").waitFor();
  person.id = sql(`select id from auth.users where email='${person.email}'`);
  ids.push(person.id);
  await page.getByRole("button", { name: "계속하기" }).click();
  await page.getByLabel("비밀번호", { exact: true }).fill(password);
  await page.getByRole("button", { name: "가입 계속하기" }).click();
  await page.getByRole("button", { name: /강남·역삼권/ }).click();
  await page.getByRole("button", { name: "다음", exact: true }).click();
  const phone = `+82100000008${i}`;
  let code;
  await page.route("**/functions/v1/phone-otp", async (route) => {
    const r = await service.rpc("issue_phone_code", { p_user: person.id, p_phone: phone });
    if (r.error) {
      await route.fulfill({ status: 409, json: { error: r.error.message } });
      return;
    }
    code = r.data;
    await route.fulfill({ json: { sent: false, phone, devCode: code } });
  });
  const phoneInput = page.getByLabel("휴대폰 번호", { exact: true });
  assert.equal(await phoneInput.getAttribute("placeholder"), "01000000000");
  await phoneInput.fill(
    i % 3 === 0 ? `010-0000-008${i}` : i % 3 === 1 ? `+82 10-0000-008${i}` : `0100000008${i}`,
  );
  await page.waitForFunction(
    (expected) => document.getElementById("phone")?.value === expected,
    `0100000008${i}`,
  );
  await page.getByRole("button", { name: "인증 없이 계속" }).click();
  await page.getByRole("heading", { name: "내 비서가 생겼어요." }).waitFor();
  await page.getByRole("button", { name: "프로필 준비 시작", exact: true }).click();
  await page.getByRole("heading", { name: "어떤 모습으로 소개할까요?" }).waitFor();
  const image = await page.evaluate((name) => {
    const c = document.createElement("canvas");
    c.width = 360;
    c.height = 480;
    const x = c.getContext("2d");
    x.fillStyle = "#e9ded2";
    x.fillRect(0, 0, 360, 480);
    x.fillStyle = "#24312d";
    x.font = "28px sans-serif";
    x.fillText(name, 30, 220);
    x.font = "18px sans-serif";
    x.fillText("SYNTHETIC QA / NOT A PERSON", 15, 270);
    return c.toDataURL("image/png").split(",")[1];
  }, person.key);
  await page.getByLabel("프로필 사진 추가").setInputFiles(
    [0, 1, 2].map((n) => ({
      name: `qa-${n}.png`,
      mimeType: "image/png",
      buffer: Buffer.from(image, "base64"),
    })),
  );
  await page.getByText("3/6장 · 사진을 누르면 대표 사진이 돼요", { exact: true }).waitFor();
  await page.getByLabel("이름", { exact: true }).fill(person.name);
  await page.getByLabel("생년월일", { exact: true }).fill(person.birth);
  await page.getByLabel("직업", { exact: true }).fill(person.job);
  await page.getByRole("button", { name: "다음", exact: true }).click();
  await page.getByRole("button", { name: "비흡연", exact: true }).click();
  await page.getByRole("button", { name: "가끔 한 잔", exact: true }).click();
  await page.getByRole("button", { name: "다음", exact: true }).click();
  await page.getByRole("button", { name: "직접 쓰기", exact: true }).click();
  await page
    .getByLabel("한 줄 소개", { exact: true })
    .fill(person.story.split(".")[0].slice(0, 34));
  await page.getByLabel("카드에서 보일 짧은 소개", { exact: true }).fill(person.story);
  await page.locator('textarea[id^="section-"]').first().fill(person.story);
  await page.getByRole("button", { name: "프로필 저장하기", exact: true }).click();
  await page.waitForURL(/\/(home|profile)$/);
  paths.push(
    ...JSON.parse(sql(`select to_json(photo_paths) from profiles where id='${person.id}'`)),
  );
  assert.equal(
    sql(
      `select onboarding_step::text||':'||(phone_verified_at is not null)::text||':'||(identity_verified_at is null)::text from profiles where id='${person.id}'`,
    ),
    "7:true:true",
  );
  report.personas.push({ key: person.key, name: person.name, scenario: person.scenario });
  await screen(page, `signup-${person.key}`);
}

async function purchase(person, kind) {
  const page = person.page;
  await page.addInitScript(() => {
    window.TossPayments = () => ({
      widgets: () => {
        let amount;
        return {
          setAmount: async (a) => {
            amount = a.value;
          },
          renderPaymentMethods: async ({ selector }) => {
            document.querySelector(selector).textContent = "QA 결제 대역 · 실제 청구 없음";
            return { destroy: async () => {} };
          },
          renderAgreement: async ({ selector }) => {
            document.querySelector(selector).textContent = "QA 테스트 약관";
            return { destroy: async () => {} };
          },
          requestPayment: async (p) => {
            const u = new URL(p.successUrl);
            u.searchParams.set("orderId", p.orderId);
            u.searchParams.set("amount", String(amount));
            u.searchParams.set("paymentKey", `qa_${p.orderId}`);
            location.assign(u.href);
          },
        };
      },
    });
  });
  await page.route("**/functions/v1/confirm-ticket-payment", async (route) => {
    try {
      const body = route.request().postDataJSON();
      const orderId = body.orderId;
      const order = await service
        .from("ticket_orders")
        .select("user_id,amount")
        .eq("order_id", orderId)
        .single();
      assert.ifError(order.error);
      assert.equal(order.data.user_id, person.id);
      assert.equal(order.data.amount, body.amount);
      const result = await service.rpc("fulfill_paid_ticket_order", {
        p_order_id: orderId,
        p_payment_key: body.paymentKey,
        p_method: "QA_CARD",
      });
      assert.ifError(result.error);
      await route.fulfill({ json: { confirmed: true } });
    } catch (e) {
      report.checks.push({ name: "QA provider fixture", status: "FAIL", error: e.message });
      await route.fulfill({ status: 502, json: { error: "QA provider fixture failed" } });
    }
  });
  await page.goto(`${base}/store?kind=${kind}`);
  await page.getByRole("button", { name: "1장 결제하기", exact: true }).click();
  await page.getByRole("button", { name: /원 결제하기$/ }).click();
  await page.getByRole("heading", { name: "결제가 완료되었습니다", exact: true }).waitFor();
  assert.equal(
    sql(
      `select count(*) from ticket_orders where user_id='${person.id}' and kind='${kind}' and state='confirmed' and payment_key is not null`,
    ),
    "1",
  );
  await screen(page, `payment-${person.key}-${kind}`);
}

async function openAndRequest(male, beta = false, expectedReason) {
  const page = male.page;
  await page.goto(`${base}/home`);
  await waitForHome(page);
  await page.getByLabel("비서에게 물어볼 내용").fill("소개 보여줘");
  await page.getByRole("button", { name: "비서에게 질문하기" }).click();
  await page
    .locator(".assistant-reply")
    .getByRole("link", { name: "소개 확인하기", exact: true })
    .click();
  await page
    .getByRole("button", {
      name: beta ? "베타 무료로 열기" : "소개 티켓 1장 쓰고 열기",
      exact: true,
    })
    .click();
  if (expectedReason)
    await page
      .getByLabel("소개 이유", { exact: true })
      .getByText(expectedReason, { exact: true })
      .waitFor();
  await page
    .getByRole("button", { name: beta ? "만남 요청하기" : "만남 티켓 쓰기", exact: true })
    .click();
  await page.getByRole("heading", { name: "언제 만날까요?", exact: true }).waitFor();
  await page.getByRole("group", { name: "날짜", exact: true }).getByRole("button").first().click();
  await page
    .getByRole("group", { name: "시간", exact: true })
    .getByRole("button", { name: "7시", exact: true })
    .click();
  const places = page.getByRole("radiogroup", { name: "장소", exact: true });
  if (await places.count()) await places.getByRole("radio").first().click();
  else await page.getByLabel("만날 곳", { exact: true }).fill("QA 역삼 카페 · 예약 아님");
  await page
    .getByRole("button", { name: beta ? /후보 1개로 무료 요청하기/ : /후보 1개로 요청하기/ })
    .click();
  await page.getByText("답변을 기다리는 중입니다", { exact: true }).waitFor();
  return JSON.parse(
    sql(
      `select row_to_json(x) from (select m.id,m.ticket_id,i.female_id from meetings m join intros i on i.id=m.intro_id where i.male_id='${male.id}' and i.closed_at is null) x`,
    ),
  );
}

function asUser(person, command) {
  return sql(
    `begin; set local role authenticated; set local request.jwt.claims='{"sub":"${person.id}","role":"authenticated","aal":"aal2"}'; ${command}; commit;`,
  );
}

function shiftMeeting(id, when) {
  // Moving this fixture's timestamp represents elapsed time, not a real
  // reschedule. Preserve the confirmations made earlier in this scenario.
  const before = JSON.parse(
    sql(
      `select json_build_object('male',male_attendance_at,'female',female_attendance_at) from meetings where id='${id}'`,
    ),
  );
  sql(`update meetings set scheduled_at=${when},proposed_slots=array[${when}],accepted_slot=0 where id='${id}';
    update meetings set male_attendance_at=${before.male ? `'${before.male}'::timestamptz` : "null"},female_attendance_at=${before.female ? `'${before.female}'::timestamptz` : "null"} where id='${id}'`);
}

async function readNotices(people) {
  for (const person of people) {
    const read = person.page.waitForResponse(
      (r) => r.url().includes("/rest/v1/rpc/mark_displayed_notifications_read") && r.ok(),
    );
    await person.page.goto(`${base}/notifications`);
    await read;
  }
}

try {
  sql(
    // This suite exercises the production baseline. The separate assistant
    // suites cover enabled features; preserve the operator's local lab switches.
    `update app_settings set payments_enabled=false,identity_required=false,admin_mfa_required=false,
      ${assistantFlagColumns.map((column) => `${column}=false`).join(",")}`,
  );
  server = spawn(
    process.execPath,
    ["node_modules/vite/bin/vite.js", "--host", "127.0.0.1", "--port", "4178", "--strictPort"],
    {
      env: {
        ...process.env,
        TZ: "Asia/Seoul",
        VITE_SUPABASE_URL: api,
        VITE_SUPABASE_ANON_KEY: value("ANON_KEY"),
        VITE_CARRIER_IDENTITY_ENABLED: "false",
        VITE_DEV_AUTH_BYPASS: "true",
        VITE_TOSS_CLIENT_KEY: "test_gck_cycle_fixture",
      },
      stdio: "ignore",
    },
  );
  for (let n = 0; n < 100; n++) {
    try {
      if ((await fetch(base)).ok) break;
    } catch {}
    await delay(200);
  }
  browser = await (process.env.AFTER_TEST_BROWSER === "webkit" ? webkit : chromium).launch({
    headless: true,
  });
  for (const [i, person] of personas.entries())
    await check(`signup ${person.key}: consent → SMS → photos → profile`, () => signup(person, i));
  if (personas.some((p) => !p.id || !paths.some((x) => x.startsWith(p.id))))
    throw new Error("A signup failed; dependent scenarios cannot be trusted");
  sql(
    `update profiles set hub_id='${cohortHub}' where id in (${personas.map((p) => `'${p.id}'`).join(",")})`,
  );
  const adminEmail = `cycle-${run}-admin@verify.local`;
  const a = await service.auth.admin.createUser({
    email: adminEmail,
    password,
    email_confirm: true,
  });
  assert.ifError(a.error);
  const admin = { id: a.data.user.id, email: adminEmail };
  ids.push(admin.id);
  sql(
    `insert into profiles(id,gender,hub_id,company_email,name,onboarding_step,role,terms_agreed_at,privacy_agreed_at) values('${admin.id}','male','gangnam','${adminEmail}','운영QA',7,'admin',now(),now())`,
  );
  const ap = await pageFor(1440);
  await login(ap, admin);
  await check("operator approves all five photo sets in UI", async () => {
    await ap.goto(`${base}/admin/photos`);
    for (const p of personas) {
      const card = ap
        .locator("li")
        .filter({ has: ap.getByRole("link", { name: p.name, exact: true }) });
      await card.getByRole("button", { name: "승인", exact: true }).click();
      await ap
        .getByRole("alertdialog")
        .getByRole("button", { name: "확인하고 처리", exact: true })
        .click();
      await card.waitFor({ state: "detached" });
    }
    assert.equal(
      sql(
        `select count(*) from profiles where id in (${personas.map((p) => `'${p.id}'`).join(",")}) and photo_state='approved'`,
      ),
      "5",
    );
    await screen(ap, "operator-photos");
  });
  if (
    sql(
      `select count(*) from profiles where id in (${personas.map((p) => `'${p.id}'`).join(",")}) and photo_state='approved'`,
    ) !== "5"
  )
    throw Error("Photo review failed; dependent cycles cannot be trusted");
  const [m1, m2, f1, f2, f3] = personas;
  let mfaSecret;
  await check(
    "operator enrolls real local TOTP and explicitly enables sensitive-action MFA",
    async () => {
      await ap.goto(`${base}/admin/settings`);
      const security = ap.getByRole("region", { name: "관리자 보안", exact: true });
      await security.getByRole("button", { name: "인증앱 등록 시작", exact: true }).waitFor();
      const enrolled = ap.waitForResponse(
        (r) =>
          new URL(r.url()).pathname === "/auth/v1/factors" &&
          r.request().method() === "POST" &&
          r.ok(),
      );
      await security.getByRole("button", { name: "인증앱 등록 시작", exact: true }).click();
      mfaSecret = (await (await enrolled).json()).totp.secret;
      assert.ok(mfaSecret);
      await security.getByLabel("인증앱 6자리 코드", { exact: true }).fill(localTotp(mfaSecret));
      await security.getByRole("button", { name: "2단계 인증 확인", exact: true }).click();
      await security.getByText(/현재 세션 2단계 인증 완료/).waitFor();
      await security
        .getByRole("checkbox", { name: "본인 복구수단을 별도로 확인했어요", exact: true })
        .check();
      await security
        .getByRole("button", { name: "중요 조치 MFA 필수로 켜기", exact: true })
        .click();
      await security.getByText(/중요 조치 MFA 필수$/).waitFor();
      assert.equal(sql("select admin_mfa_required from app_settings"), "t");
      assert.equal(
        await security.getByRole("img").count(),
        0,
        "verified setup no longer exposes its QR",
      );
      await screen(ap, "operator-security-verified");
    },
  );
  await check("operational phone contact is separately opt-in and can be revoked", async () => {
    await m1.page.goto(`${base}/settings`);
    const consent = m1.page.getByRole("checkbox", {
      name: "약속 확인을 위한 운영팀 연락에 동의해요 (선택)",
      exact: true,
    });
    await consent.check();
    await m1.page.getByRole("button", { name: "운영 연락 설정 저장", exact: true }).click();
    await m1.page.getByText("운영 연락 동의를 저장했어요.", { exact: true }).waitFor();
    assert.equal(
      sql(`select allowed from member_contact_preferences where user_id='${m1.id}'`),
      "t",
    );
    await consent.uncheck();
    await m1.page.getByRole("button", { name: "운영 연락 설정 저장", exact: true }).click();
    await m1.page.getByText("운영 연락 동의를 해제했어요.", { exact: true }).waitFor();
    assert.equal(
      sql(`select allowed from member_contact_preferences where user_id='${m1.id}'`),
      "f",
    );
    await consent.check();
    await m1.page.getByRole("button", { name: "운영 연락 설정 저장", exact: true }).click();
    await m1.page.getByText("운영 연락 동의를 저장했어요.", { exact: true }).waitFor();
    await screen(m1.page, "contact-consent-mobile");
  });
  await check("male pauses and resumes introductions without charging", async () => {
    await m1.page.goto(`${base}/home`);
    await waitForHome(m1.page);
    assert.equal(await m1.page.getByRole("switch").count(), 0);
    await m1.page.getByRole("link", { name: "나", exact: true }).click();
    await m1.page.getByRole("link", { name: /환경설정/ }).click();
    const pause = m1.page.getByRole("switch", { name: "소개 받지 않기", exact: true });
    await pause.click();
    await m1.page
      .getByRole("switch", { name: "소개 받지 않기", exact: true, checked: true })
      .waitFor();
    assert.equal(
      sql(`select (paused_at is not null)::text from profiles where id='${m1.id}'`),
      "true",
    );
    await pause.click();
    await m1.page
      .getByRole("switch", { name: "소개 받지 않기", exact: true, checked: false })
      .waitFor();
    assert.equal(sql(`select (paused_at is null)::text from profiles where id='${m1.id}'`), "true");
    assert.equal(sql(`select count(*) from tickets where user_id='${m1.id}'`), "0");
    await m1.page.goto(`${base}/home`);
    await waitForHome(m1.page);
  });
  await check("home background failure preserves state and retry recovers", async () => {
    const headline = await m1.page.locator(".home-greeting h1").innerText();
    await m1.page.route("**/rest/v1/rpc/home_state_v2", (route) =>
      route.fulfill({
        status: 503,
        json: { message: "QA temporary outage" },
      }),
    );
    try {
      await m1.page.evaluate(() => window.dispatchEvent(new Event("focus")));
      await m1.page
        .getByText("최신 상태를 확인하지 못했어요. 마지막으로 확인한 내용을 보여드려요.", {
          exact: true,
        })
        .waitFor();
      assert.equal(await m1.page.locator(".home-greeting h1").innerText(), headline);
      await m1.page.getByLabel("비서에게 물어볼 내용").waitFor();
      assert.equal(await m1.page.getByRole("switch").count(), 0);
    } finally {
      // An assertion failure must not leave every later cycle with a forced outage.
      await m1.page.unroute("**/rest/v1/rpc/home_state_v2");
    }
    await m1.page.getByRole("button", { name: "상태 다시 확인", exact: true }).click();
    await m1.page
      .getByText("최신 상태를 확인하지 못했어요. 마지막으로 확인한 내용을 보여드려요.", {
        exact: true,
      })
      .waitFor({ state: "hidden" });
  });
  for (const [f, choices] of [
    [f1, ["like", "pass"]],
    [f2, ["like", "like"]],
    [f3, ["like", "like"]],
  ]) {
    await check(`${f.key} evaluates both men with explicit like/pass`, async () => {
      await f.page.goto(`${base}/home`);
      await waitForHome(f.page);
      await f.page.getByLabel("비서에게 물어볼 내용").fill("티켓 구매하고 싶어");
      await f.page.getByRole("button", { name: "비서에게 질문하기" }).click();
      await f.page
        .getByText("현재 여성 회원에게 티켓 구매를 요청하지 않아요.", { exact: false })
        .waitFor();
      assert.equal(
        await f.page
          .locator(".assistant-reply")
          .getByRole("link", { name: "티켓·가격 확인" })
          .count(),
        0,
      );
      await f.page.getByLabel("비서에게 물어볼 내용").fill("호감 보내줘");
      await f.page.getByRole("button", { name: "비서에게 질문하기" }).click();
      await f.page
        .locator(".assistant-reply")
        .getByRole("link", { name: "소개 확인하기", exact: true })
        .click();
      await f.page.getByLabel("비서 안내", { exact: true }).waitFor();
      for (let n = 0; n < 2; n++) {
        await f.page.getByRole("button", { name: "좋아요", exact: true }).waitFor();
        const current = (await f.page.getByRole("main").innerText()).includes(m1.name) ? m1 : m2;
        const verdict = choices[current === m1 ? 0 : 1];
        await f.page.getByText(current.name).first().waitFor();
        const photos = f.page.getByRole("region", {
          name: `${current.name} 사진 3장`,
          exact: true,
        });
        const inset = await photos.evaluate((el) => {
          const bounds = el.getBoundingClientRect();
          const main = el.closest("main").getBoundingClientRect();
          return { left: bounds.left - main.left, right: main.right - bounds.right };
        });
        assert.ok(inset.left >= 19 && inset.right >= 19, "photo rail retains both page gutters");
        await photos.evaluate((el) => {
          el.scrollLeft = el.scrollWidth;
        });
        await f.page.waitForFunction((name) => {
          const el = document.querySelector(`[aria-label="${name} 사진 3장"]`);
          return (
            el &&
            el.lastElementChild.getBoundingClientRect().right <=
              el.getBoundingClientRect().right + 1
          );
        }, current.name);
        await photos.evaluate((el) => {
          el.scrollLeft = 0;
        });
        if (f === f1 && verdict === "like") {
          await f.page.route("**/rest/v1/affinities*", (route) =>
            route.fulfill({
              status: 503,
              json: { code: "QA_OUTAGE", message: "temporary outage" },
            }),
          );
          await f.page.getByRole("button", { name: "좋아요", exact: true }).click();
          await f.page
            .getByText("좋아요를 저장하지 못했어요. 다시 눌러주세요.", { exact: true })
            .waitFor();
          await f.page
            .getByRole("main")
            .getByRole("heading", { name: new RegExp(current.name) })
            .waitFor();
          assert.equal(
            sql(
              `select count(*) from affinities where from_id='${f.id}' and to_id='${current.id}'`,
            ),
            "0",
          );
          await f.page.unroute("**/rest/v1/affinities*");
        }
        await f.page
          .getByRole("button", { name: verdict === "like" ? "좋아요" : "관심 없어요", exact: true })
          .click();
        if (verdict === "pass") {
          const dialog = f.page.getByRole("alertdialog");
          await dialog.waitFor();
          await f.page.waitForFunction(() => document.activeElement?.textContent === "취소");
          assert.equal(
            sql(
              `select count(*) from affinities where from_id='${f.id}' and to_id='${current.id}'`,
            ),
            "0",
          );
          await dialog.getByRole("button", { name: "취소", exact: true }).click();
          await f.page.waitForFunction(() =>
            document.activeElement?.textContent?.includes("관심 없어요"),
          );
          await f.page.getByText(current.name).first().waitFor();
          assert.equal(
            sql(
              `select count(*) from affinities where from_id='${f.id}' and to_id='${current.id}'`,
            ),
            "0",
          );
          await f.page.getByRole("button", { name: "관심 없어요", exact: true }).click();
          await f.page.route("**/rest/v1/affinities*", (route) =>
            route.fulfill({
              status: 503,
              json: { code: "QA_OUTAGE", message: "temporary outage" },
            }),
          );
          await dialog.getByRole("button", { name: "넘기기", exact: true }).click();
          await f.page
            .getByText("처리하지 못했어요. 다시 시도해 주세요.", { exact: true })
            .waitFor();
          assert.equal(
            sql(
              `select count(*) from affinities where from_id='${f.id}' and to_id='${current.id}'`,
            ),
            "0",
          );
          await dialog
            .getByRole("heading", { name: `${current.name}님을 넘길까요?`, exact: true })
            .waitFor();
          await f.page.unroute("**/rest/v1/affinities*");
          await dialog.getByRole("button", { name: "넘기기", exact: true }).click();
        }
        await f.page.getByText(current.name).first().waitFor({ state: "hidden" });
      }
      assert.equal(
        sql(
          `select count(*) from affinities where from_id='${f.id}' and to_id in ('${m1.id}','${m2.id}')`,
        ),
        "2",
      );
      await f.page.goto(`${base}/home`);
      await f.page
        .getByRole("heading", { name: "마음을 남긴 소개가 있어요.", exact: true })
        .waitFor();
      await f.page.getByText("만남 요청이 오면 날짜를 보고 결정해요.", { exact: true }).waitFor();
      await f.page
        .getByRole("navigation", { name: "주요 메뉴", exact: true })
        .getByRole("link", { name: "소개", exact: true })
        .waitFor();
    });
  }
  if (
    sql(
      `select count(*) from affinities where from_id in ('${f1.id}','${f2.id}','${f3.id}') and to_id in ('${m1.id}','${m2.id}')`,
    ) !== "6"
  )
    throw new Error("Introduction decisions failed; dependent meeting scenarios cannot be trusted");
  await check("request refresh failure retains the last list and retry recovers", async () => {
    await f1.page.goto(`${base}/requests`);
    await f1.page.getByText("아직 받은 요청이 없습니다", { exact: true }).waitFor();
    await f1.page.route("**/rest/v1/intros**", (route) =>
      route.fulfill({
        status: 503,
        json: { message: "QA temporary outage" },
      }),
    );
    await f1.page.evaluate(() => window.dispatchEvent(new Event("focus")));
    await f1.page
      .getByText("최신 상태를 확인하지 못했어요. 마지막으로 확인한 내용을 보여드려요.", {
        exact: true,
      })
      .waitFor();
    await f1.page.getByText("아직 받은 요청이 없습니다", { exact: true }).waitFor();
    await f1.page.unroute("**/rest/v1/intros**");
    await f1.page.getByRole("button", { name: "상태 다시 확인", exact: true }).click();
    await f1.page
      .getByText("최신 상태를 확인하지 못했어요. 마지막으로 확인한 내용을 보여드려요.", {
        exact: true,
      })
      .waitFor({ state: "hidden" });
  });
  for (const m of [m1, m2])
    await check(`operator curates ${m.key} queue in UI`, async () => {
      await ap.goto(`${base}/admin/curation?male=${m.id}`);
      await ap.getByRole("button", { name: "전송 슬롯 자동 채우기", exact: true }).click();
      await ap
        .getByPlaceholder("큐레이션 사유 (필수 — 왜 이 순서인지)")
        .fill("QA: 직장 지역과 서로의 의사를 확인한 수기 큐레이션");
      await ap.getByRole("button", { name: "큐 저장", exact: true }).click();
      await ap.getByText("큐를 저장했습니다.", { exact: true }).waitFor();
      assert.equal(
        sql(`select count(*) from intro_queue where male_id='${m.id}'`),
        m === m1 ? "3" : "2",
      );
      await screen(ap, `operator-queue-${m.key}`);
    });
  const approvedReason =
    "서로가 보내는 하루를 읽어보고 두 분의 이야기를 이어드리고 싶었어요. 처음에는 부담 없이 이야기를 나눠 보시면 좋겠어요.";
  await check(
    "operator reviews grounded prose and explicitly approves the exact draft",
    async () => {
      const femaleId = sql(
        `select female_id from intro_queue where male_id='${m1.id}' order by position limit 1`,
      );
      const woman = personas.find((p) => p.id === femaleId);
      const context = await service.rpc("pair_brief_context", {
        p_male: m1.id,
        p_female: femaleId,
      });
      assert.ifError(context.error);
      assert.ok(context.data?.source_hash);
      const requestId = randomUUID();
      const reserved = await service.rpc("reserve_ai_run", {
        p_user: admin.id,
        p_feature: "pair_brief",
        p_source_hash: context.data.source_hash,
        p_request_id: requestId,
        p_prompt_version: "UI-fixture",
        p_model: "UI-fixture",
      });
      assert.ifError(reserved.error);
      assert.equal(reserved.data?.reserved, true);
      const finished = await service.rpc("finish_ai_run", {
        p_request_id: requestId,
        p_status: "success",
        p_latency_ms: 1,
        p_input_tokens: 0,
        p_output_tokens: 0,
      });
      assert.ifError(finished.error);
      const pick = (person) => {
        const section = person.profile_story?.sections?.[0];
        return section
          ? { sourceField: `story_${section.id}`, quote: section.answer.slice(0, 40) }
          : { sourceField: "intro", quote: person.intro.slice(0, 40) };
      };
      const brief = {
        verified: true,
        commonGround: [],
        conversationStarters: [
          "요즘의 일상을 이야기해 보세요.",
          "처음 만날 때 편한 자리를 물어보세요.",
          "최근 관심이 가는 것부터 나눠 보세요.",
        ],
        considerations: [],
        recommendation: {
          text: approvedReason,
          evidence: [
            { person: "a", ...pick(context.data.sources.a) },
            { person: "b", ...pick(context.data.sources.b) },
          ],
        },
      };
      const stored = await service.rpc("store_pair_brief_draft", {
        p_male: m1.id,
        p_female: femaleId,
        p_hash: context.data.source_hash,
        p_brief: brief,
        p_run_id: reserved.data.run_id,
        p_prompt: "UI-fixture",
        p_model: "UI-fixture",
        p_actor: admin.id,
      });
      assert.ifError(stored.error);
      assert.equal(stored.data, true);
      await ap.route("**/functions/v1/compose-pair-brief", (route) =>
        route.fulfill({
          json: {
            ...brief,
            meta: {
              sourceHash: context.data.source_hash,
              model: "UI-fixture",
              promptVersion: "UI-fixture",
              runId: reserved.data.run_id,
              draftRunId: reserved.data.run_id,
              cached: false,
            },
          },
        }),
      );
      await ap.goto(`${base}/admin/curation?male=${m1.id}`);
      await ap
        .locator("ol")
        .getByRole("button", { name: new RegExp(woman.name) })
        .click();
      await ap.getByRole("button", { name: "소개 이유 만들기", exact: true }).click();
      await ap.getByText(approvedReason, { exact: true }).waitFor();
      assert.equal(
        sql(
          `select reason is null from intro_queue where male_id='${m1.id}' and female_id='${femaleId}'`,
        ),
        "t",
      );
      await ap.getByRole("button", { name: "근거 확인 후 소개에 반영", exact: true }).click();
      await ap
        .getByText("소개 이유를 승인했습니다. 두 분에게 같은 설명을 전합니다.", { exact: true })
        .waitFor();
      assert.equal(
        sql(`select reason from intro_queue where male_id='${m1.id}' and female_id='${femaleId}'`),
        approvedReason,
      );
      await ap.unroute("**/functions/v1/compose-pair-brief");
      await screen(ap, "operator-approved-pair-reason");
    },
  );
  await setPaymentsInUI(ap, true);
  for (const m of [m1, m2])
    for (const kind of ["intro", "meeting"])
      await check(`${m.key} buys ${kind}: real order + fixture PG + real ticket issue`, () =>
        purchase(m, kind),
      );
  let success, unanswered;
  await check("m1 requests; selected female accepts proposed time", async () => {
    const firstId = sql(
      `select female_id from intro_queue where male_id='${m1.id}' and delivered_at is not null and opened_at is null order by position limit 1`,
    );
    const waitingFemale = personas.find((p) => p.id === firstId);
    await waitingFemale.page.goto(`${base}/requests`);
    await waitingFemale.page.getByText("아직 받은 요청이 없습니다", { exact: true }).waitFor();
    const homeObserver = await pageFor();
    await login(homeObserver, waitingFemale);
    await homeObserver
      .getByRole("heading", { name: "마음을 남긴 소개가 있어요.", exact: true })
      .waitFor();
    success = await openAndRequest(m1, false, approvedReason);
    const f = personas.find((p) => p.id === success.female_id);
    success.female = f;
    await homeObserver
      .getByRole("link", { name: "요청 확인하기", exact: true })
      .waitFor({ timeout: 25000 });
    await f.page
      .getByLabel("소개 이유", { exact: true })
      .getByText(approvedReason, { exact: true })
      .waitFor();
    await f.page
      .getByRole("button", { name: /이 날로 정하기/ })
      .first()
      .waitFor({ timeout: 25000 });
    await f.page
      .getByRole("button", { name: /이 날로 정하기/ })
      .first()
      .click();
    await waitForHome(f.page);
    await homeObserver
      .getByRole("heading", { name: "곧, 만나겠네요.", exact: true })
      .waitFor({ timeout: 25000 });
    await homeObserver.close();
    assert.equal(
      sql(`select (confirmed_at is not null)::text from meetings where id='${success.id}'`),
      "true",
    );
    await screen(f.page, "female-confirmed");
  });
  await check(
    "mutual rescheduling preserves ticket and invalidates the previous schedule",
    async () => {
      const target = sql(
        `select to_char(((now() at time zone 'Asia/Seoul')::date+n),'YYYY-MM-DD') from generate_series(4,12)n where extract(isodow from ((now() at time zone 'Asia/Seoul')::date+n))<=5 order by n limit 1`,
      );
      await m1.page.goto(`${base}/chat/${success.id}`);
      await m1.page.getByRole("button", { name: "약속 시간 바꾸기", exact: true }).click();
      const proposal = m1.page.getByRole("dialog");
      await proposal.getByLabel("변경할 날짜", { exact: true }).fill(target);
      await proposal.getByLabel("변경할 시간", { exact: true }).selectOption("19:30");
      await screen(m1.page, "reschedule-proposal-mobile");
      await proposal.getByRole("button", { name: "새 시간 제안하기", exact: true }).click();
      await proposal.getByRole("button", { name: "변경 제안 취소", exact: true }).waitFor();
      assert.equal(sql(`select schedule_revision from meetings where id='${success.id}'`), "1");
      await success.female.page.goto(`${base}/chat/${success.id}`);
      await success.female.page
        .getByRole("button", { name: "새 일정 제안 확인하기", exact: true })
        .click();
      await success.female.page
        .getByRole("dialog")
        .getByRole("button", { name: "이 시간으로 변경할게요", exact: true })
        .click();
      await success.female.page.getByRole("dialog").waitFor({ state: "hidden" });
      assert.equal(sql(`select schedule_revision from meetings where id='${success.id}'`), "2");
      assert.equal(
        sql(`select ticket_id from meetings where id='${success.id}'`),
        success.ticket_id,
      );
      assert.equal(
        sql(`select count(*) from tickets where restored_from_ticket_id='${success.ticket_id}'`),
        "0",
      );
    },
  );
  await check(
    "two participants exchange chat without reload and sending is deduplicated",
    async () => {
      await m1.page.goto(`${base}/chat/${success.id}`);
      await success.female.page.goto(`${base}/chat/${success.id}`);
      const body = `QA 인사 ${run}`;
      await m1.page.getByLabel("메시지", { exact: true }).fill(body);
      await m1.page.getByRole("button", { name: "보내기", exact: true }).evaluate((el) => {
        el.click();
        el.click();
      });
      await success.female.page.getByText(body, { exact: true }).waitFor();
      await success.female.page.getByLabel("메시지", { exact: true }).fill(`QA 답변 ${run}`);
      await success.female.page.getByRole("button", { name: "보내기", exact: true }).click();
      await m1.page.getByText(`QA 답변 ${run}`, { exact: true }).waitFor();
      assert.equal(
        sql(`select count(*) from messages where meeting_id='${success.id}' and body='${body}'`),
        "1",
      );
    },
  );
  await check("chat refresh failure preserves history and offers retry", async () => {
    await success.female.page.route("**/rest/v1/messages**", (route) =>
      route.request().method() === "GET" ? route.abort("failed") : route.continue(),
    );
    await success.female.page
      .getByText("대화를 새로 불러오지 못했어요.", { exact: false })
      .waitFor();
    await success.female.page.getByText(`QA 인사 ${run}`, { exact: true }).waitFor();
    await success.female.page.unroute("**/rest/v1/messages**");
    await success.female.page
      .getByRole("button", { name: "대화 다시 불러오기", exact: true })
      .click();
    await success.female.page
      .getByText("대화를 새로 불러오지 못했어요.", { exact: false })
      .waitFor({ state: "hidden" });
  });
  await check("incoming message does not interrupt reading older chat", async () => {
    asUser(
      m1,
      `insert into messages(meeting_id,sender_id,channel,body) select '${success.id}','${m1.id}','coord','QA 대화 '||n||' '||repeat('일정 확인을 위한 합성 대화입니다. ',12) from generate_series(1,25)n`,
    );
    const log = success.female.page.getByRole("log", { name: "대화 내용" });
    await log.getByText("QA 대화 25 ", { exact: false }).waitFor({ state: "attached" });
    await log.evaluate((el) => {
      el.scrollTop = 0;
      el.dispatchEvent(new Event("scroll"));
    });
    await m1.page.getByLabel("메시지", { exact: true }).fill(`QA 최신 ${run}`);
    await m1.page.getByRole("button", { name: "보내기", exact: true }).click();
    await success.female.page
      .getByRole("button", { name: "최근 메시지 보기", exact: true })
      .waitFor();
    assert.ok(await log.evaluate((el) => el.scrollTop < 8));
    await success.female.page
      .getByRole("button", { name: "최근 메시지 보기", exact: true })
      .click();
    assert.ok(await log.evaluate((el) => el.scrollHeight - el.clientHeight - el.scrollTop < 64));
  });
  await check("future meeting cannot be reported as no-show", async () => {
    assert.ok(success);
    assert.throws(() => asUser(m1, `select report_no_show('${success.id}')`));
  });
  await check("future meeting cannot receive feedback", async () => {
    assert.ok(success);
    assert.throws(() =>
      asUser(
        m1,
        `insert into feedbacks(meeting_id,author_id,met,result) values('${success.id}','${m1.id}',true,'again')`,
      ),
    );
  });
  await check("future feedback deep-link explains eligibility instead of submitting", async () => {
    await m1.page.goto(`${base}/feedback?meetingId=${success.id}`);
    await m1.page
      .getByText("예정된 만남이 지난 뒤 후기를 남길 수 있어요.", { exact: false })
      .waitFor();
    assert.equal(await m1.page.getByRole("button", { name: "보내기", exact: true }).count(), 0);
  });
  await check("m2 unanswered request cancels once and restores one meeting ticket", async () => {
    unanswered = await openAndRequest(m2);
    sql(
      `update tickets set used_at=now()-interval '25 hours' where id='${unanswered.ticket_id}'; select expire_unanswered_meetings(); select expire_unanswered_meetings();`,
    );
    assert.equal(
      sql(`select cancel_reason from meetings where id='${unanswered.id}'`),
      "no_response_24h",
    );
    assert.equal(
      sql(`select count(*) from tickets where restored_from_ticket_id='${unanswered.ticket_id}'`),
      "1",
    );
  });
  await check("D-24h check-in nudge and first participant response in UI", async () => {
    shiftMeeting(success.id, "now()+interval '20 hours'");
    sql("select meeting_lifecycle_tick();select meeting_lifecycle_tick();");
    assert.equal(
      sql(
        `select count(*) from notifications where meeting_id='${success.id}' and kind='meeting_checkin_reminder'
          and schedule_revision=(select schedule_revision from meetings where id='${success.id}')`,
      ),
      "2",
    );
    await m1.page.goto(`${base}/chat/${success.id}`);
    await m1.page.getByRole("button", { name: "이 약속에 참석할게요", exact: true }).click();
    await m1.page.getByText("참석 의사를 전달했어요", { exact: true }).first().waitFor();
    await screen(m1.page, "male-checkin");
  });
  await check("D-4h only the unconfirmed person is nudged", async () => {
    shiftMeeting(success.id, "now()+interval '3 hours'");
    sql("select meeting_lifecycle_tick();select meeting_lifecycle_tick();");
    assert.equal(
      sql(
        `select count(*) from notifications where meeting_id='${success.id}' and kind='meeting_checkin_final' and user_id='${success.female.id}'
          and schedule_revision=(select schedule_revision from meetings where id='${success.id}')`,
      ),
      "1",
    );
    assert.equal(
      sql(
        `select count(*) from notifications where meeting_id='${success.id}' and kind='meeting_checkin_final' and user_id='${m1.id}'
          and schedule_revision=(select schedule_revision from meetings where id='${success.id}')`,
      ),
      "0",
    );
  });
  await check(
    "one response prevents D-2h auto-cancel; operator sees actionable state",
    async () => {
      shiftMeeting(success.id, "now()+interval '90 minutes'");
      sql("select meeting_lifecycle_tick()");
      assert.equal(
        sql(`select (cancelled_at is null)::text from meetings where id='${success.id}'`),
        "true",
      );
      await ap.goto(`${base}/admin/meetings`);
      await ap.getByText("참석 미확인 · 운영 확인 필요", { exact: true }).waitFor();
      await screen(ap, "operator-checkin-help");
    },
  );
  await check(
    "operator contact task masks non-consenting phone and records a next check",
    async () => {
      const caseId = sql(
        `select id from ops_cases where case_type='meeting_followup' and source_id='${success.id}' and status not in ('resolved','superseded')`,
      );
      assert.ok(caseId);
      await ap.goto(`${base}/admin/tasks?caseId=${caseId}`);
      const pane = ap
        .locator("section")
        .filter({ has: ap.getByRole("heading", { name: "약속 참석 확인 연락", exact: true }) });
      await pane.getByRole("button", { name: "동의한 회원 연락처 확인", exact: true }).click();
      await pane.getByText("운영 연락 미동의 · 앱 문의로 조율", { exact: false }).waitFor();
      assert.equal(await pane.locator('a[href^="tel:"]').count(), 1);
      await pane
        .getByLabel("처리 사유", { exact: true })
        .fill("QA: 한쪽 참석 응답을 확인했고 상대에게 앱 확인을 요청했습니다.");
      const next = new Date(Date.now() + 10 * 60_000)
        .toLocaleString("sv-SE", { timeZone: "Asia/Seoul" })
        .slice(0, 16)
        .replace(" ", "T");
      await pane.getByLabel("보류 시 다음 확인 시각", { exact: true }).fill(next);
      await pane.getByRole("button", { name: "답변 대기", exact: true }).click();
      await pane.getByRole("button", { name: "처리 시작", exact: true }).waitFor();
      assert.equal(sql(`select status from ops_cases where id='${caseId}'`), "waiting");
      await screen(ap, "operator-contact-task");
      await ap.goto(`${base}/admin/meetings`);
    },
  );
  await check(
    "second participant confirms; operator auto-refresh observes both responses",
    async () => {
      await success.female.page.goto(`${base}/chat/${success.id}`);
      await success.female.page
        .getByRole("button", { name: "이 약속에 참석할게요", exact: true })
        .click();
      await success.female.page
        .getByText("두 분 모두 참석을 확인했어요", { exact: true })
        .waitFor();
      await ap.getByText("양측 참석 확인", { exact: true }).waitFor({ timeout: 35000 });
      await screen(success.female.page, "female-checkin");
    },
  );
  await check("both participants receive independent midnight feedback requests", async () => {
    assert.ok(success);
    sql(
      `update meetings set scheduled_at=((now() at time zone 'Asia/Seoul')::date-1+time '19:00') at time zone 'Asia/Seoul' where id='${success.id}'; select enqueue_feedback_due();`,
    );
    assert.equal(
      sql(
        `select count(*) from notifications where meeting_id='${success.id}' and kind='feedback_due'`,
      ),
      "2",
    );
  });
  await check("first survey submission finishes once and retry deep-link is calm", async () => {
    await m1.page.goto(`${base}/feedback?meetingId=${success.id}`);
    await m1.page.getByRole("button", { name: "또 만나고 싶어요", exact: true }).click();
    await m1.page.getByRole("button", { name: "대화가 편했어요", exact: true }).click();
    await screen(m1.page, "survey-mobile");
    await m1.page.getByRole("button", { name: "보내기", exact: true }).click();
    await finishFeedback(m1.page);
    await m1.page.goto(`${base}/feedback?meetingId=${success.id}`);
    await m1.page.getByText("후기를 남겨주셨어요. 고마워요.", { exact: true }).waitFor();
    assert.equal(
      sql(
        `select count(*) from feedbacks where meeting_id='${success.id}' and author_id='${m1.id}'`,
      ),
      "1",
    );
  });
  await check("one bounded follow-up reaches only the remaining survey participant", async () => {
    shiftMeeting(success.id, "now()-interval '3 days'");
    sql("select enqueue_feedback_due();select enqueue_feedback_due();");
    assert.equal(
      sql(
        `select count(*) from notifications where meeting_id='${success.id}' and kind='feedback_followup' and user_id='${success.female.id}'`,
      ),
      "1",
    );
    assert.equal(
      sql(
        `select count(*) from notifications where meeting_id='${success.id}' and kind='feedback_followup' and user_id='${m1.id}'`,
      ),
      "0",
    );
    await success.female.page.goto(`${base}/notifications`);
    await success.female.page
      .getByRole("link")
      .filter({ hasText: "지난 만남은 어떠셨어요?" })
      .click();
    await success.female.page
      .getByRole("button", { name: "좋았지만 인연은 아니에요", exact: true })
      .click();
    await success.female.page.getByRole("button", { name: "보내기", exact: true }).click();
    await finishFeedback(success.female.page);
    assert.equal(sql(`select count(*) from feedbacks where meeting_id='${success.id}'`), "2");
    assert.equal(
      sql(`select cardinality(completed_by) from meetings where id='${success.id}'`),
      "2",
    );
  });
  await setPaymentsInUI(ap, false);
  await check(
    "female politely declines a beta request; ticket returns without warning",
    async () => {
      const declined = await openAndRequest(m1, true);
      assert.equal(declined.female_id, f2.id);
      await f2.page.goto(`${base}/requests`);
      await f2.page.getByRole("button", { name: "이번엔 정중히 거절할게요", exact: true }).click();
      await f2.page.evaluate(() => window.dispatchEvent(new Event("focus")));
      await f2.page
        .getByRole("alertdialog")
        .getByRole("button", { name: "돌아가기", exact: true })
        .click();
      assert.equal(
        sql(`select (cancelled_at is null)::text from meetings where id='${declined.id}'`),
        "true",
      );
      await f2.page.getByRole("button", { name: "이번엔 정중히 거절할게요", exact: true }).click();
      await f2.page
        .getByRole("alertdialog")
        .getByRole("button", { name: "거절하기", exact: true })
        .click();
      await f2.page.getByRole("alertdialog").waitFor({ state: "hidden" });
      assert.equal(
        sql(`select count(*) from tickets where restored_from_ticket_id='${declined.ticket_id}'`),
        "1",
      );
      assert.equal(
        sql(`select count(*) from meeting_response_warnings where meeting_id='${declined.id}'`),
        "0",
      );
    },
  );
  let silent;
  await check(
    "both silent after two nudges: cancel + one restored ticket + two warnings",
    async () => {
      silent = await openAndRequest(m1, true);
      assert.equal(silent.female_id, f3.id);
      await f3.page.goto(`${base}/requests`);
      await f3.page
        .getByRole("button", { name: /이 날로 정하기/ })
        .first()
        .click();
      await waitForHome(f3.page);
      shiftMeeting(silent.id, "now()+interval '20 hours'");
      sql("select meeting_lifecycle_tick()");
      shiftMeeting(silent.id, "now()+interval '1 hour'");
      sql("select meeting_lifecycle_tick()");
      assert.equal(sql(`select cancelled_at is null from meetings where id='${silent.id}'`), "t");
      assert.equal(
        sql(`select count(*) from meeting_response_warnings where meeting_id='${silent.id}'`),
        "0",
      );
      await readNotices([m1, f3]);
      shiftMeeting(silent.id, "now()+interval '3 hours'");
      sql("select meeting_lifecycle_tick()");
      shiftMeeting(silent.id, "now()+interval '1 hour'");
      sql("select meeting_lifecycle_tick();select meeting_lifecycle_tick();");
      assert.equal(
        sql(`select cancel_reason from meetings where id='${silent.id}'`),
        "checkin_no_response",
      );
      assert.equal(
        sql(`select count(*) from tickets where restored_from_ticket_id='${silent.ticket_id}'`),
        "1",
      );
      assert.equal(
        sql(`select count(*) from meeting_response_warnings where meeting_id='${silent.id}'`),
        "2",
      );
      assert.equal(
        sql(
          `select count(*) from profiles where id in ('${m1.id}','${f3.id}') and account_state='active'`,
        ),
        "2",
      );
      assert.equal(
        sql(
          `select count(*) from notifications where meeting_id='${silent.id}' and kind in ('meeting_checkin_reminder','meeting_checkin_final')`,
        ),
        "4",
      );
    },
  );
  await check(
    "male can pass next introduction and permanent exclusion prevents requeue",
    async () => {
      await m2.page.goto(`${base}/intro`);
      await m2.page.getByRole("button", { name: "베타 무료로 열기", exact: true }).click();
      await m2.page.getByRole("button", { name: "이 소개 넘기기", exact: true }).click();
      await m2.page
        .getByRole("alertdialog")
        .getByRole("button", { name: "넘기기", exact: true })
        .click();
      await waitForHome(m2.page);
      assert.equal(
        sql(
          `select count(*) from intro_exclusions where user_lo=least('${m2.id}'::uuid,'${f3.id}'::uuid) and user_hi=greatest('${m2.id}'::uuid,'${f3.id}'::uuid)`,
        ),
        "1",
      );
      assert.throws(() =>
        asUser(
          admin,
          `select admin_set_queue('${m2.id}',array['${f3.id}']::uuid[],'QA: 제외된 상대 재등록 거절 검증')`,
        ),
      );
    },
  );
  await check("notification load failure is not shown as an empty inbox", async () => {
    await f3.page.route("**/rest/v1/rpc/my_notifications", (route) => route.abort("failed"));
    await f3.page.goto(`${base}/notifications`);
    await f3.page.getByText("알림을 불러오지 못했어요.", { exact: true }).waitFor();
    await f3.page.unroute("**/rest/v1/rpc/my_notifications");
    await f3.page.getByRole("button", { name: "다시 불러오기", exact: true }).click();
    await f3.page.getByRole("link").filter({ hasText: "이번 약속이 취소됐어요" }).waitFor();
  });
  const extra = {
    key: "f4",
    name: "유나QA",
    gender: "female",
    birth: "1992-12-11",
    job: "영업 매니저",
    story:
      "일정이 바쁜 날에도 편안한 대화를 나눌 시간을 만들고 싶어요. 쉬는 날에는 동네 카페를 찾아가요.",
    scenario: "반복 미응답 경고·운영 검토 추가 표본",
  };
  personas.push(extra);
  await check("additional persona signs up for repeat-warning scenario", async () => {
    await signup(extra, 5);
    sql(`update profiles set hub_id='${cohortHub}' where id='${extra.id}'`);
    await ap.goto(`${base}/admin/photos`);
    const card = ap
      .locator("li")
      .filter({ has: ap.getByRole("link", { name: extra.name, exact: true }) });
    await card.getByRole("button", { name: "승인", exact: true }).click();
    await ap
      .getByRole("alertdialog")
      .getByRole("button", { name: "확인하고 처리", exact: true })
      .click();
    await card.waitFor({ state: "detached" });
    await extra.page.goto(`${base}/intro`);
    for (let n = 0; n < 2; n++) {
      await extra.page.getByRole("button", { name: "좋아요", exact: true }).waitFor();
      const current = (await extra.page.getByRole("main").innerText()).includes(m1.name) ? m1 : m2;
      await extra.page
        .getByRole("button", { name: current === m1 ? "좋아요" : "관심 없어요", exact: true })
        .click();
      if (current !== m1)
        await extra.page
          .getByRole("alertdialog")
          .getByRole("button", { name: "넘기기", exact: true })
          .click();
      await extra.page.getByText(current.name).first().waitFor({ state: "hidden" });
    }
  });
  await check("second real silence produces review flag, never an automatic ban", async () => {
    await ap.goto(`${base}/admin/curation?male=${m1.id}`);
    await ap.getByRole("button", { name: "전송 슬롯 자동 채우기", exact: true }).click();
    await ap
      .getByPlaceholder("큐레이션 사유 (필수 — 왜 이 순서인지)")
      .fill("QA: 반복 미응답 검토를 위한 추가 소개");
    await ap.getByRole("button", { name: "큐 저장", exact: true }).click();
    await ap.getByText("큐를 저장했습니다.", { exact: true }).waitFor();
    const again = await openAndRequest(m1, true);
    assert.equal(again.female_id, extra.id);
    await extra.page.goto(`${base}/requests`);
    await extra.page
      .getByRole("button", { name: /이 날로 정하기/ })
      .first()
      .click();
    await waitForHome(extra.page);
    for (const hours of [20, 3, 1]) {
      shiftMeeting(again.id, `now()+interval '${hours} hours'`);
      sql("select meeting_lifecycle_tick()");
      if (hours === 20) await readNotices([m1, extra]);
    }
    assert.equal(
      sql(`select count(*) from meeting_response_warnings where user_id='${m1.id}'`),
      "2",
    );
    assert.equal(sql(`select account_state from profiles where id='${m1.id}'`), "active");
    await ap.goto(`${base}/admin/meetings`);
    await ap.getByText("반복 미응답 검토", { exact: false }).first().waitFor();
    await screen(ap, "operator-repeat-warning");
    await ap.getByRole("link", { name: "검토 작업 보기", exact: true }).first().click();
    await ap.getByRole("heading", { name: "반복 미응답 검토", exact: true }).waitFor();
    await ap
      .getByLabel("처리 사유", { exact: true })
      .fill("QA: 두 약속 기록을 검토했고 우선 안내 후 관찰합니다.");
    await ap.getByRole("button", { name: "검토 완료", exact: true }).click();
    await ap.getByRole("link", { name: "관련 회원 보기", exact: true }).click();
    await ap.getByText("미응답 경고 기록", { exact: true }).first().waitFor();
    await screen(ap, "operator-warning-timeline");
  });
  await check("baseline lifecycle capability audit", async () => {
    const attendance = sql(
      "select count(*) from pg_proc where proname='confirm_meeting_attendance'",
    );
    const lifecycle = sql("select count(*) from pg_proc where proname='meeting_lifecycle_tick'");
    assert.equal(
      `${attendance}:${lifecycle}`,
      "1:1",
      "pre-meeting confirmation/nudges/cancellation lifecycle not implemented",
    );
  });
  await check("operator meeting dashboard mobile/desktop access", async () => {
    await ap.goto(`${base}/admin/meetings`);
    await ap.getByRole("button", { name: "진행 중", exact: true }).waitFor();
    await screen(ap, "operator-meetings");
    await ap.getByRole("button", { name: "전체", exact: true }).click();
    await ap.waitForURL("**state=all");
    await ap.getByRole("button", { name: "전체", exact: true, pressed: true }).waitFor();
    assert.equal(
      await ap.getByRole("button", { name: "전체", exact: true }).getAttribute("aria-pressed"),
      "true",
    );
    await ap.getByRole("table").getByRole("link", { name: m1.name, exact: true }).first().waitFor();
    for (const width of [390, 320]) {
      await ap.setViewportSize({ width, height: 844 });
      await screen(ap, `operator-meetings-mobile-${width}`);
    }
  });
  await check(
    "fresh operator login challenges the existing authenticator without disabling MFA",
    async () => {
      assert.ok(mfaSecret);
      const fresh = await pageFor(1440);
      await login(fresh, admin);
      await fresh.goto(`${base}/admin/settings`);
      const security = fresh.getByRole("region", { name: "관리자 보안", exact: true });
      await security.getByText(/현재 세션 추가 인증 필요/).waitFor();
      await security.getByLabel("인증앱 6자리 코드", { exact: true }).fill(localTotp(mfaSecret));
      await security.getByRole("button", { name: "2단계 인증 확인", exact: true }).click();
      await security.getByText(/현재 세션 2단계 인증 완료/).waitFor();
      assert.equal(sql("select admin_mfa_required from app_settings"), "t");
      await screen(fresh, "operator-mfa-rechallenge");
    },
  );
} catch (e) {
  report.checks.push({ name: "suite execution", status: "FAIL", error: e.message });
  console.error(e);
} finally {
  for (const context of contexts) await context.close().catch(() => {});
  await browser?.close();
  server?.kill("SIGTERM");
  if (paths.length) await service.storage.from("profile-photos").remove(paths);
  const old = JSON.parse(settings);
  sql(`begin; set local request.jwt.claims='{"role":"service_role","aal":"aal2"}';
    update app_settings set admin_mfa_required=${old.admin_mfa_required},payments_enabled=${old.payments_enabled},identity_required=${old.identity_required},
      ${assistantFlagColumns.map((column) => `${column}=${old[column]}`).join(",")},
      updated_at='${old.updated_at}'::timestamptz,updated_by=${old.updated_by ? `'${old.updated_by}'::uuid` : "null"}; commit;`);
  if (ids.length) {
    const listed = ids.map((id) => `'${id}'`).join(",");
    assert.equal(
      sql(
        `select count(*) from auth.users where id in (${listed}) and email like 'cycle-${run}-%@verify.local'`,
      ),
      String(ids.length),
      "cleanup ownership",
    );
    sql(`begin;
      delete from pair_brief_drafts where generated_by in (${listed}) or male_id in (${listed}) or female_id in (${listed});
      delete from ai_runs where user_id in (${listed});
      delete from support_requests where user_id in (${listed}) or responded_by in (${listed});
      delete from admin_actions where actor_id in (${listed}) or target_user in (${listed});
      delete from no_show_reports where reporter_id in (${listed}) or accused_id in (${listed});
      delete from feedbacks where author_id in (${listed});
      delete from meetings where intro_id in (select id from intros where male_id in (${listed}) or female_id in (${listed}));
      delete from tickets where user_id in (${listed});
      delete from intros where male_id in (${listed}) or female_id in (${listed});
      delete from intro_queue where male_id in (${listed}) or female_id in (${listed}) or curated_by in (${listed});
      delete from ticket_orders where user_id in (${listed}) or fulfilled_by in (${listed});
      commit;`);
  }
  if (ids.length)
    sql(
      `delete from auth.users where id in (${ids.map((id) => `'${id}'`).join(",")}) and email like 'cycle-${run}-%@verify.local'`,
    );
  await writeFile(`${output}/report.json`, JSON.stringify(report, null, 2));
  console.log(`Evidence: ${output}/report.json`);
  console.log(
    `Full cycle: ${report.checks.filter((x) => x.status === "PASS").length} passed, ${report.checks.filter((x) => x.status === "FAIL").length} failed`,
  );
  if (report.checks.some((x) => x.status === "FAIL")) process.exitCode = 1;
}
