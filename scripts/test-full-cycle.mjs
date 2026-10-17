import assert from "node:assert/strict";
import { execFileSync, spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import { setTimeout as delay } from "node:timers/promises";
import { createClient } from "@supabase/supabase-js";
import AxeBuilder from "@axe-core/playwright";
import { chromium } from "playwright";

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
  fixtures: ["company email", "SMS delivery", "PG provider"],
  checks: [],
  personas: [],
};
const ids = [],
  paths = [],
  contexts = [];
const settings = sql("select row_to_json(a) from app_settings a");
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
    locale: "ko-KR",
    timezoneId: "Asia/Seoul",
  });
  contexts.push(context);
  const page = await context.newPage();
  page.setDefaultTimeout(12000);
  return page;
}
async function screen(page, name) {
  const toast = page.locator("[data-sonner-toast]").last();
  if (await toast.count()) await toast.waitFor({ state: "hidden", timeout: 10000 });
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
  await page.waitForURL("**/home");
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
    await route.fulfill({ json: { sent: true, phone } });
  });
  await page.getByLabel("휴대폰 번호", { exact: true }).fill(`0100000008${i}`);
  await page.getByRole("button", { name: "인증번호 받기" }).click();
  await page.getByLabel("인증번호", { exact: true }).waitFor();
  await page.getByLabel("인증번호", { exact: true }).fill(code);
  await page.getByRole("button", { name: "인증하고 계속" }).click();
  await page.getByRole("heading", { name: "기본적인 것부터" }).waitFor();
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
  await page.getByRole("button", { name: "이 소개장으로 완료", exact: true }).click();
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

async function openAndRequest(male, beta = false) {
  const page = male.page;
  await page.goto(`${base}/intro`);
  await page
    .getByRole("button", {
      name: beta ? "베타 무료로 열기" : "소개 티켓 1장 쓰고 열기",
      exact: true,
    })
    .click();
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
      (r) => r.url().includes("/rest/v1/rpc/mark_notifications_read") && r.ok(),
    );
    await person.page.goto(`${base}/notifications`);
    await read;
  }
}

try {
  sql("update app_settings set payments_enabled=false,identity_required=false");
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
  browser = await chromium.launch({ headless: true });
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
  const [m1, m2, f1, f2, f3] = personas;
  await check("male pauses and resumes introductions without charging", async () => {
    await m1.page.goto(`${base}/home`);
    await m1.page.getByRole("switch", { name: "소개 잠시 멈추기" }).click();
    await m1.page.getByRole("switch", { name: "소개 다시 받기" }).waitFor();
    assert.equal(
      sql(`select (paused_at is not null)::text from profiles where id='${m1.id}'`),
      "true",
    );
    await m1.page.getByRole("switch", { name: "소개 다시 받기" }).click();
    await m1.page.getByRole("switch", { name: "소개 잠시 멈추기" }).waitFor();
    assert.equal(sql(`select count(*) from tickets where user_id='${m1.id}'`), "0");
  });
  for (const [f, choices] of [
    [f1, ["like", "pass"]],
    [f2, ["like", "like"]],
    [f3, ["like", "like"]],
  ]) {
    await check(`${f.key} evaluates both men with explicit like/pass`, async () => {
      await f.page.goto(`${base}/intro`);
      for (let n = 0; n < 2; n++) {
        await f.page.getByRole("button", { name: "좋아요", exact: true }).waitFor();
        const current = (await f.page.getByRole("main").innerText()).includes(m1.name) ? m1 : m2;
        const verdict = choices[current === m1 ? 0 : 1];
        await f.page.getByText(current.name).first().waitFor();
        await f.page
          .getByRole("button", { name: verdict === "like" ? "좋아요" : "관심 없어요", exact: true })
          .click();
        await f.page.getByText(current.name).first().waitFor({ state: "hidden" });
      }
      assert.equal(
        sql(
          `select count(*) from affinities where from_id='${f.id}' and to_id in ('${m1.id}','${m2.id}')`,
        ),
        "2",
      );
    });
  }
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
  sql("update app_settings set payments_enabled=true");
  for (const m of [m1, m2])
    for (const kind of ["intro", "meeting"])
      await check(`${m.key} buys ${kind}: real order + fixture PG + real ticket issue`, () =>
        purchase(m, kind),
      );
  let success, unanswered;
  await check("m1 requests; selected female accepts proposed time", async () => {
    success = await openAndRequest(m1);
    const f = personas.find((p) => p.id === success.female_id);
    success.female = f;
    await f.page.goto(`${base}/requests`);
    await f.page
      .getByRole("button", { name: /이 날로 정하기/ })
      .first()
      .click();
    await f.page.waitForURL("**/home");
    assert.equal(
      sql(`select (confirmed_at is not null)::text from meetings where id='${success.id}'`),
      "true",
    );
    await screen(f.page, "female-confirmed");
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
        `select count(*) from notifications where meeting_id='${success.id}' and kind='meeting_checkin_reminder'`,
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
        `select count(*) from notifications where meeting_id='${success.id}' and kind='meeting_checkin_final' and user_id='${success.female.id}'`,
      ),
      "1",
    );
    assert.equal(
      sql(
        `select count(*) from notifications where meeting_id='${success.id}' and kind='meeting_checkin_final' and user_id='${m1.id}'`,
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
    await m1.page.waitForURL("**/home");
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
    await success.female.page.waitForURL("**/home");
    assert.equal(sql(`select count(*) from feedbacks where meeting_id='${success.id}'`), "2");
    assert.equal(
      sql(`select cardinality(completed_by) from meetings where id='${success.id}'`),
      "2",
    );
  });
  sql("update app_settings set payments_enabled=false");
  await check(
    "female politely declines a beta request; ticket returns without warning",
    async () => {
      const declined = await openAndRequest(m1, true);
      assert.equal(declined.female_id, f2.id);
      await f2.page.goto(`${base}/requests`);
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
      await f3.page.waitForURL("**/home");
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
      await m2.page.waitForURL("**/home");
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
    await card.waitFor({ state: "detached" });
    await extra.page.goto(`${base}/intro`);
    for (let n = 0; n < 2; n++) {
      await extra.page.getByRole("button", { name: "좋아요", exact: true }).waitFor();
      const current = (await extra.page.getByRole("main").innerText()).includes(m1.name) ? m1 : m2;
      await extra.page
        .getByRole("button", { name: current === m1 ? "좋아요" : "관심 없어요", exact: true })
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
    await extra.page.waitForURL("**/home");
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
    await ap.getByRole("link", { name: "회원 확인", exact: true }).first().click();
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
} catch (e) {
  report.checks.push({ name: "suite execution", status: "FAIL", error: e.message });
  console.error(e);
} finally {
  for (const context of contexts) await context.close().catch(() => {});
  await browser?.close();
  server?.kill("SIGTERM");
  if (paths.length) await service.storage.from("profile-photos").remove(paths);
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
  const old = JSON.parse(settings);
  sql(
    `update app_settings set payments_enabled=${old.payments_enabled},identity_required=${old.identity_required}`,
  );
  await writeFile(`${output}/report.json`, JSON.stringify(report, null, 2));
  console.log(`Evidence: ${output}/report.json`);
  console.log(
    `Full cycle: ${report.checks.filter((x) => x.status === "PASS").length} passed, ${report.checks.filter((x) => x.status === "FAIL").length} failed`,
  );
  if (report.checks.some((x) => x.status === "FAIL")) process.exitCode = 1;
}
