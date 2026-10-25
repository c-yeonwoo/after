import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { chromium } from "playwright";
import AxeBuilder from "@axe-core/playwright";

// Existing dev server only. Every backend request is fulfilled in this isolated
// browser context; no login, database, provider, or model request reaches a server.
const base = "http://127.0.0.1:5191";
const output = process.env.AFTER_CONCIERGE_OUTPUT ?? "/tmp/after-concierge-surfaces";
const widths = [320, 390, 1440];
const schemes = ["light", "dark"];
const id = "11111111-1111-4111-8111-111111111111";
const otherId = "22222222-2222-4222-8222-222222222222";
const now = new Date().toISOString();
const privateSentinel = "비공개검증전용문장";
const ownAnswer = "영화는 별로 좋아하지 않아요. 퇴근 후에는 음악을 들으며 쉬어요.";
const otherAnswer = "퇴근 후에는 영화를 보고 좋아하는 장면을 메모해요.";
const photo = (number) =>
  `data:image/svg+xml,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" width="600" height="800"><rect width="600" height="800" fill="#e9e6ee"/><text x="300" y="400" text-anchor="middle" font-family="sans-serif" font-size="24" fill="#535066">Synthetic photo ${number}</text></svg>`)}`;
const photos = [1, 2, 3].map(photo);
const story = (answer) => ({
  version: 3,
  headline: "일상의 작은 이야기를 나누고 싶어요",
  summary: answer,
  sections: [
    {
      id: "daily_life",
      questionId: "daily_life_v1",
      questionVersion: 1,
      question: "퇴근 후에는 어떻게 보내세요?",
      answer,
    },
  ],
  conversationHooks: ["퇴근 후 쉬는 방식에 대해 이야기해요."],
  publishedRevision: 1,
});
const member = {
  id,
  gender: "female",
  name: "합성 지수",
  age: 31,
  birth: "1995-04-18",
  job: "서비스 기획자",
  hub_id: "gangnam",
  company_email: "synthetic@verify.local",
  email_verified_at: now,
  terms_agreed_at: now,
  privacy_agreed_at: now,
  phone_verified_at: now,
  identity_verified_at: now,
  agreed_policy_version: "2026-10-17.2",
  account_state: "active",
  onboarding_step: 7,
  role: "member",
  paused_at: null,
  photo_paths: photos,
  photo_url: null,
  photo_state: "approved",
  mbti: "INTJ",
  smoking: "none",
  drinking: "none",
  religion: "none",
  headline: "일상의 작은 이야기를 나누고 싶어요",
  intro: ownAnswer,
  profile_story: story(ownAnswer),
  interests: ["음악"],
  match_tags: [],
  topics: ["퇴근 후 시간"],
  details: {},
  private_notes: privateSentinel,
};
const other = {
  ...member,
  id: otherId,
  gender: "male",
  name: "합성 도윤",
  job: "제품 디자이너",
  company_email: "not-public@verify.local",
  intro: otherAnswer,
  profile_story: story(otherAnswer),
  drinking: "social",
  private_notes: privateSentinel,
};
const basics = {
  name: member.name,
  photos,
  birth: member.birth,
  job: member.job,
  mbti: member.mbti,
  smoking: member.smoking,
  drinking: member.drinking,
  religion: member.religion,
};
const draft = (stage) => ({
  version: 3,
  stage,
  mode: "interview",
  basics,
  answers: { daily_life: ownAnswer, getting_closer: "", conversation: privateSentinel },
  choices: { rhythm: [], first_date: [], contact: [], planning: [], closeness: [], topics: [] },
  choiceCustom: { contact: privateSentinel, planning: privateSentinel },
  followups: {},
  followupIds: [],
  publicIds: ["answer:daily_life"],
  understanding: [
    { text: "영화보다 음악을 들으며 쉬는 시간을 이야기했어요.", sourceIds: ["answer:daily_life"] },
  ],
  contradictions: [],
  understandingConfirmed: stage === "preview",
  story: stage === "preview" ? story(ownAnswer) : null,
  generatedStory: stage === "preview" ? story(ownAnswer) : null,
  sourceRevision: 1,
  storySourceRevision: 1,
});
const allFixtures = [
  { name: "home", path: "/home", heading: "아직 새 소개가 없어요." },
  { name: "intro", path: "/intro", heading: "합성 도윤" },
  { name: "profile", path: "/profile", heading: "합성 지수" },
  { name: "photos", path: "/signup?edit=true", heading: "어떤 모습으로 소개할까요?" },
  { name: "interview", path: "/signup?prepare=true", stage: "story0", heading: null },
  {
    name: "understanding",
    path: "/signup?prepare=true",
    stage: "understanding",
    heading: "이렇게 이해했어요",
  },
  { name: "draft", path: "/signup?prepare=true", stage: "preview", heading: "이렇게 소개할까요?" },
];
const fixtureNames = process.env.AFTER_CONCIERGE_SCREENS?.split(",");
const fixtures = fixtureNames
  ? allFixtures.filter((fixture) => fixtureNames.includes(fixture.name))
  : allFixtures;
assert.ok(fixtures.length > 0, "at least one known surface is required");

const session = {
  access_token: `${Buffer.from('{"alg":"HS256","typ":"JWT"}').toString("base64url")}.${Buffer.from(JSON.stringify({ sub: id, exp: Math.floor(Date.now() / 1000) + 86400 })).toString("base64url")}.synthetic`,
  refresh_token: "synthetic-not-a-real-session",
  token_type: "bearer",
  expires_in: 86400,
  expires_at: Math.floor(Date.now() / 1000) + 86400,
  user: {
    id,
    aud: "authenticated",
    role: "authenticated",
    email: member.company_email,
    app_metadata: {},
    user_metadata: {},
    created_at: now,
  },
};
const summary = {
  base,
  synthetic: true,
  startedAt: now,
  screenshots: [],
  results: [],
  blockedRequests: [],
  mockedFontRequests: [],
  backendRequests: [],
  browserErrors: [],
  limitations: [
    "Synthetic profile-photo placeholders; no real member data.",
    "Chromium viewport emulation only; no physical iPhone or native keyboard QA.",
    "No AI quality, server authorization, persistence, real payment, or notification verification.",
    "External Google Fonts CSS is mocked empty; self-hosted Wanted Sans loads normally.",
  ],
};
await mkdir(output, { recursive: true });
const browser = await chromium.launch();

async function capture(page, name) {
  const path = join(output, `${name}.png`);
  await page.screenshot({ path });
  summary.screenshots.push(path);
}

async function audit(page, name) {
  await page.evaluate(() => document.fonts.ready);
  assert.equal(
    await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1),
    true,
    "document overflow",
  );
  const axe = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
    .analyze();
  const blocking = axe.violations.filter((v) => ["serious", "critical"].includes(v.impact));
  await writeFile(join(output, `${name}.axe.json`), JSON.stringify(axe.violations, null, 2));
  assert.deepEqual(
    blocking.map((v) => ({ id: v.id, nodes: v.nodes.map((n) => n.target) })),
    [],
    "serious/critical accessibility issues",
  );
}

async function verifyHome(page, width) {
  await page.getByRole("heading", { level: 1, name: "합성 지수님, 반가워요." }).waitFor();
  await page.getByRole("heading", { level: 2, name: "아직 새 소개가 없어요." }).waitFor();
  assert.equal(await page.getByText("비서에게만 보여요", { exact: true }).count(), 0);
  assert.equal(await page.locator('img[src*="after-first-conversation"]').count(), 0);
  const metrics = await page.locator(".assistant-quick-actions").evaluate((row) => {
    const buttons = [...row.querySelectorAll("button")];
    return {
      tops: buttons.map((button) => button.getBoundingClientRect().top),
      heights: buttons.map((button) => button.getBoundingClientRect().height),
      visual: buttons.map((button) => button.firstElementChild.getBoundingClientRect().height),
      scroll: row.scrollWidth,
      width: row.clientWidth,
      overflow: getComputedStyle(row).overflowX,
    };
  });
  assert.equal(new Set(metrics.tops).size, 1, "chips are one row");
  assert.ok(
    metrics.heights.every((height) => height >= 44),
    "44px chip targets",
  );
  assert.ok(
    metrics.visual.every((height) => height >= 31 && height <= 34),
    "compact 32px chip visuals",
  );
  assert.equal(metrics.overflow, "auto");
  if (width === 320)
    assert.ok(metrics.scroll > metrics.width, "small screen chips overflow locally");
  await page.getByRole("button", { name: "내 상태", exact: true }).click();
  await page.locator(".assistant-reply").waitFor();
  assert.equal(await page.getByRole("link", { name: "홈에서 확인", exact: true }).count(), 0);
  assert.equal(await page.locator('.assistant-reply a[href="/home"]').count(), 0);
  await page.getByRole("button", { name: "일정 정리", exact: true }).focus();
  assert.equal(
    await page
      .locator(".assistant-quick-chip")
      .last()
      .evaluate((button) => {
        const b = button.getBoundingClientRect();
        const row = button.parentElement.getBoundingClientRect();
        return b.left >= row.left - 1 && b.right <= row.right + 1;
      }),
    true,
    "keyboard focus reveals final chip",
  );
  await page.locator(".assistant-quick-actions").evaluate((row) => row.scrollTo({ left: 0 }));
}

async function verifyProfile(page, own) {
  await page
    .getByText(own ? "내가 들려준 이야기" : "직접 들려준 이야기", { exact: true })
    .waitFor();
  assert.equal(await page.getByText(privateSentinel, { exact: false }).count(), 0);
  if (own) {
    await page.getByRole("heading", { name: "나만 보는 프로필 코칭" }).waitFor();
    assert.ok((await page.locator(".profile-answer").allTextContents()).includes(ownAnswer));
    return;
  }
  await page.getByRole("heading", { name: "이분을 소개할게요" }).waitFor();
  assert.ok((await page.locator(".profile-answer").allTextContents()).includes(otherAnswer));
  const evidence = page.locator("summary").filter({ hasText: "두 사람의 공개 답변 보기" }).first();
  await evidence.click();
  const text = await evidence.locator("..").innerText();
  assert.ok(text.includes(ownAnswer), "negated original is preserved in evidence");
  assert.ok(text.includes(otherAnswer), "counterpart original is preserved in evidence");
  assert.doesNotMatch(
    await page.locator("aside").innerText(),
    /둘 다 영화를 좋아|영화를 함께 좋아/,
  );
}

async function checkPhotoHelper(page) {
  const results = await page.evaluate(async () => {
    const { inspectPhotoForCoaching, photoTips } = await import("/src/lib/photoCoaching.ts");
    const cases = [
      { name: "dark", color: "#000000", width: 320, height: 200 },
      { name: "light", color: "#ffffff", width: 1200, height: 500 },
      { name: "neutral", color: "#888888", width: 600, height: 800 },
    ];
    const results = [];
    for (const item of cases) {
      const canvas = document.createElement("canvas");
      canvas.width = item.width;
      canvas.height = item.height;
      const ctx = canvas.getContext("2d");
      ctx.fillStyle = item.color;
      ctx.fillRect(0, 0, item.width, item.height);
      const blob = await new Promise((resolve) => canvas.toBlob(resolve, "image/png"));
      const observation = await inspectPhotoForCoaching(
        new File([blob], `${item.name}.png`, { type: "image/png" }),
      );
      results.push({
        name: item.name,
        observation,
        tips: photoTips(observation).map((tip) => tip.kind),
      });
    }
    return results;
  });
  assert.deepEqual(
    results.map((result) => result.tips),
    [["resolution", "dark"], ["light", "crop"], []],
  );
  return results;
}

try {
  for (const scheme of schemes) {
    for (const width of widths) {
      const context = await browser.newContext({
        viewport: { width, height: 844 },
        locale: "ko-KR",
        timezoneId: "Asia/Seoul",
        colorScheme: scheme,
        reducedMotion: "reduce",
        serviceWorkers: "block",
      });
      let current = fixtures[0];
      let currentDraft = null;
      let revision = 1;
      await context.addInitScript(
        ({ session, key }) => {
          localStorage.setItem(key, JSON.stringify(session));
          localStorage.setItem("after.theme", "system");
        },
        { session, key: `sb-${new URL(base).hostname.split(".")[0]}-auth-token` },
      );
      await context.routeWebSocket("**", (socket) => socket.close());
      await context.route("**/*", async (route) => {
        const request = route.request();
        const url = new URL(request.url());
        const path = url.pathname;
        const backend =
          /\/(?:auth|rest|storage|functions)\/v1\//.test(path) || path.startsWith("/__lab/");
        const fulfill = (json) =>
          route.fulfill({
            status: 200,
            contentType: "application/json",
            body: JSON.stringify(json),
            headers: { "cache-control": "no-store" },
          });
        if (backend) {
          summary.backendRequests.push({ fixture: current.name, path, method: request.method() });
          const profile = { ...member, onboarding_step: current.stage ? 4 : 7 };
          if (path.endsWith("/auth/v1/user")) return fulfill(session.user);
          if (path.endsWith("/rest/v1/profiles") && request.method() === "GET")
            return fulfill(profile);
          if (path.endsWith("/rest/v1/profile_interview_drafts") && request.method() === "GET")
            return fulfill(currentDraft ? { data: currentDraft, revision } : null);
          if (path.endsWith("/rest/v1/app_settings") && request.method() === "GET")
            return fulfill({ payments_enabled: false });
          if (path.endsWith("/rpc/home_state_v2"))
            return fulfill({
              schema_version: 2,
              as_of: now,
              primary_state: current.name === "intro" ? "intro_available" : "waiting",
              me: profile,
              candidate: current.name === "intro" ? other : null,
              meeting: null,
              request_count: 0,
              pending_no_show: null,
              has_open_intro: false,
              queued_intros: 0,
              intro_tickets: 0,
              meeting_tickets: 0,
              readiness: { ready: true, blockers: [] },
              next_action: null,
              deadline_at: null,
              ticket_summary: { intro_available: 0, meeting_available: 0 },
              intro_progress: { has_likes: false },
            });
          if (path.endsWith("/rpc/assistant_capabilities"))
            return fulfill({ chat: false, schedule: false, memory: false });
          if (path.endsWith("/rpc/my_meet_window")) return fulfill(null);
          if (path.endsWith("/rpc/next_candidate")) return fulfill([other]);
          if (path.endsWith("/rpc/remaining_candidates")) return fulfill(1);
          if (path.endsWith("/rpc/save_profile_interview_draft")) {
            currentDraft = request.postDataJSON().p_data;
            revision++;
            return fulfill(revision);
          }
          summary.blockedRequests.push({
            fixture: current.name,
            path,
            method: request.method(),
            reason: "Unmocked backend request blocked",
          });
          return route.abort();
        }
        if (url.origin === "https://fonts.googleapis.com" && path === "/css2") {
          summary.mockedFontRequests.push({ fixture: current.name, path });
          return route.fulfill({ status: 200, contentType: "text/css", body: "" });
        }
        const allowedPage = ["/home", "/intro", "/profile", "/signup"].includes(path);
        const allowedAsset =
          /^(?:\/src\/|\/supabase\/functions\/_shared\/|\/node_modules\/|\/@(?:vite|id|fs|tanstack-start)\/|\/@react-refresh$|\/fonts\/|\/brand\/|\/favicon\.)/.test(
            path,
          );
        if (url.origin === base && request.method() === "GET" && (allowedPage || allowedAsset))
          return route.continue();
        summary.blockedRequests.push({
          fixture: current.name,
          path,
          origin: url.origin,
          reason: "External or non-asset request blocked",
        });
        return route.abort();
      });
      const page = await context.newPage();
      page.setDefaultTimeout(15000);
      page.on("pageerror", (error) =>
        summary.browserErrors.push({ fixture: current.name, message: error.message }),
      );
      for (const fixture of fixtures) {
        current = fixture;
        currentDraft = fixture.stage ? draft(fixture.stage) : null;
        revision = 1;
        const name = `${fixture.name}-${scheme}-${width}`;
        try {
          await page.goto(base + fixture.path, { waitUntil: "domcontentloaded" });
          if (fixture.heading)
            await page
              .getByRole("heading", {
                name: fixture.heading,
                exact: fixture.name !== "intro" && fixture.name !== "profile",
              })
              .waitFor();
          else await page.getByRole("textbox", { name: "내 답변", exact: true }).waitFor();
          if (fixture.name === "home") {
            await capture(page, name);
            await verifyHome(page, width);
          }
          if (["intro", "profile"].includes(fixture.name))
            await verifyProfile(page, fixture.name === "profile");
          if (fixture.name === "photos")
            await page.getByRole("heading", { name: "사진에도 나다운 모습이 담기게" }).waitFor();
          if (["understanding", "draft"].includes(fixture.name)) {
            await page.locator("summary").first().click();
            assert.ok((await page.locator("details").first().innerText()).includes(ownAnswer));
            assert.equal(
              await page.getByText(privateSentinel, { exact: false }).count(),
              0,
              "unselected/private source omitted",
            );
          }
          if (fixture.name === "interview") {
            assert.equal(
              await page.getByRole("textbox", { name: "내 답변", exact: true }).inputValue(),
              ownAnswer,
            );
          }
          if (fixture.name === "photos" && scheme === "light" && width === 390)
            summary.photoHelper = await checkPhotoHelper(page);
          await page.locator("main").evaluate((element) => element.scrollTo({ top: 0 }));
          await capture(page, fixture.name === "home" ? `${name}-status` : name);
          await audit(page, name);
          if (["intro", "profile", "draft"].includes(fixture.name)) {
            const target =
              fixture.name === "draft" ? page.locator("article") : page.locator("aside");
            await target.scrollIntoViewIfNeeded();
            await capture(page, `${name}-reading`);
          }
          summary.results.push({ name, status: "passed" });
          console.log(`PASS ${name}`);
        } catch (error) {
          await capture(page, `${name}-failure`).catch(() => {});
          summary.results.push({ name, status: "failed", error: String(error) });
          console.error(`FAIL ${name}: ${error.message}`);
        }
      }
      await context.close();
    }
  }
} finally {
  await browser.close();
  summary.finishedAt = new Date().toISOString();
  summary.passed = summary.results.filter((result) => result.status === "passed").length;
  summary.failed = summary.results.filter((result) => result.status === "failed").length;
  await writeFile(join(output, "summary.json"), JSON.stringify(summary, null, 2));
  console.log(
    JSON.stringify({
      passed: summary.passed,
      failed: summary.failed,
      blockedRequests: summary.blockedRequests.length,
      browserErrors: summary.browserErrors.length,
      output,
    }),
  );
  if (summary.failed || summary.blockedRequests.length || summary.browserErrors.length)
    process.exitCode = 1;
}
