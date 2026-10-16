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

function sql(statement) {
  return execFileSync("psql", [dbUrl, "-v", "ON_ERROR_STOP=1", "-Atc", statement], {
    encoding: "utf8",
  }).trim();
}

async function waitForServer() {
  for (let attempt = 0; attempt < 90; attempt += 1) {
    try {
      const response = await fetch(baseUrl, { signal: AbortSignal.timeout(1000) });
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
      agreed_policy_version: "2026-10-16.1",
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

try {
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
  await femalePage.getByRole("button", { name: "이야기 시작하기" }).click();
  await femalePage.getByLabel("내 이야기").fill("퇴근하면 동네를 천천히 걸어요");
  await femalePage.getByRole("button", { name: "다음 이야기" }).click();
  await femalePage
    .getByRole("heading", { name: "처음 만난 사람과는 어떻게 가까워지는 편인가요?" })
    .waitFor();
  await femalePage.getByLabel("내 이야기").fill("처음에는 서로 이야기를 듣는 편이에요");
  await femalePage.getByRole("button", { name: "다음 이야기" }).click();
  await femalePage
    .getByRole("heading", { name: "처음 만나면 어떤 이야기를 나눠보고 싶어요?" })
    .waitFor();
  await femalePage.getByLabel("내 이야기").fill("주말에 본 영화를 이야기하고 싶어요");
  await femalePage.getByText("저장 중…").waitFor();
  await femalePage.getByText("작성한 내용이 저장됐어요.").waitFor();
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
  await femalePage.getByLabel("내 이야기").waitFor();
  assert.equal(
    await femalePage.getByLabel("내 이야기").inputValue(),
    "주말에 본 영화를 이야기하고 싶어요",
    "draft answer survives reload",
  );
  await femalePage.getByRole("button", { name: "이야기 확인하기" }).click();
  await femalePage.getByRole("button", { name: "이 정도로 계속하기" }).click();
  await femalePage.getByRole("button", { name: "이 내용으로 소개글 만들기" }).click();
  await femalePage.getByRole("heading", { name: "이렇게 소개할까요?" }).waitFor();
  await checkPage(femalePage, "interview preview mobile");
  await femalePage.getByRole("button", { name: "이 소개글로 계속하기" }).click();
  await femalePage.getByRole("button", { name: "비흡연" }).click();
  await femalePage.getByRole("button", { name: "안 마심" }).click();
  await femalePage.getByRole("button", { name: "저장", exact: true }).click();
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
  await femalePage.getByRole("button", { name: "현재 소개글 직접 고치기" }).click();
  await femalePage.getByLabel("소개글", { exact: true }).fill("연락은 010-1234-5678로 주세요.");
  assert.equal(
    await femalePage.getByRole("button", { name: "이 소개글로 계속하기" }).isDisabled(),
    true,
    "contact details cannot be submitted from the preview",
  );
  await femalePage
    .getByLabel("소개글", { exact: true })
    .fill("이번에는 제가 직접 쓴 소개글이에요.");
  await femalePage.getByRole("button", { name: "이 소개글로 계속하기" }).click();
  await femalePage.getByRole("button", { name: "저장", exact: true }).click();
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
    "Browser E2E: paid and beta intro/meeting, availability, meeting help, interview, admin PASS\n",
  );
} finally {
  await browser?.close();
  server?.kill("SIGTERM");
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
