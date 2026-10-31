import assert from "node:assert/strict";
import { mkdir, writeFile, readFile } from "node:fs/promises";
import { join } from "node:path";
import { chromium, webkit } from "playwright";
import AxeBuilder from "@axe-core/playwright";

// Existing dev server only. Every backend request is fulfilled in this isolated
// browser context; no login, database, provider, or model request reaches a server.
const base = new URL(process.env.AFTER_CONCIERGE_BASE ?? "http://127.0.0.1:5191").origin;
assert.ok(
  ["127.0.0.1", "localhost", "[::1]"].includes(new URL(base).hostname),
  "surface fixtures require an existing loopback dev server",
);
const output = process.env.AFTER_CONCIERGE_OUTPUT ?? "/tmp/after-concierge-surfaces";
const widths = process.env.AFTER_CONCIERGE_WIDTHS?.split(",").map(Number) ?? [320, 390, 1440];
const schemes = process.env.AFTER_CONCIERGE_SCHEMES?.split(",") ?? ["light", "dark"];
assert.ok(widths.length && widths.every((width) => [320, 390, 1440].includes(width)));
assert.ok(schemes.length && schemes.every((scheme) => ["light", "dark"].includes(scheme)));
const introductionVersion = (
  await readFile("supabase/functions/_shared/member-introduction.ts", "utf8")
).match(/MEMBER_INTRODUCTION_VERSION\s*=\s*["']([^"']+)/)[1];
const id = "11111111-1111-4111-8111-111111111111";
const otherId = "22222222-2222-4222-8222-222222222222";
const introId = "33333333-3333-4333-8333-333333333333";
const meetingId = "44444444-4444-4444-8444-444444444444";
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
  updated_at: now,
  profile_preferences: {
    version: 1,
    choices: { planning: ["상대와 함께 맞추기"] },
    choiceCustom: { contact: privateSentinel },
  },
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
const pendingMeeting = {
  id: meetingId,
  intro_id: introId,
  male_id: id,
  female_id: otherId,
  created_at: now,
  requested_at: now,
  prefs_submitted_at: null,
  confirmed_at: null,
  scheduled_at: null,
  closed_at: null,
  cancelled_at: null,
};
const assistantHistory = [
  {
    id: "55555555-5555-4555-8555-555555555555",
    kind: "conversation",
    question: "예전에 소개받은 상대와 나눌 대화 주제를 알려줘",
    answer: "이전 소개의 공개된 이야기를 살펴보고 대화를 준비해 주세요.",
    state: "complete",
    created_at: new Date(Date.now() - 3600_000).toISOString(),
  },
  {
    id: "66666666-6666-4666-8666-666666666666",
    kind: "conversation",
    question: "약속 시간 변경해줘",
    answer: "이전 약속의 시간은 상세에서 다시 확인해 주세요.",
    state: "complete",
    created_at: new Date(Date.now() - 1800_000).toISOString(),
  },
];
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
  {
    name: "signup-consent",
    path: "/signup?consent-preview=true",
    heading: "시작하기 전에, 확인해 주세요",
  },
  { name: "home-arrival", path: "/home", heading: "합성 지수님, 반가워요." },
  { name: "home-history", path: "/home", heading: "합성 지수님, 반가워요.", consented: true },
  { name: "home-liked", path: "/home", heading: "호감을 보냈어요.", consented: true },
  { name: "manager-consent", path: "/consent?manager=true", heading: "나를 알아가는 매니저" },
  { name: "meetings-pending", path: "/chats", heading: "함께할 약속" },
  { name: "meetings-scheduling", path: "/chats", heading: "함께할 약속", gender: "male" },
  { name: "meetings-confirmed", path: "/chats", heading: "함께할 약속" },
  { name: "intro-ai", path: "/intro", heading: "합성 도윤" },
  { name: "intro-ai-failure", path: "/intro", heading: "합성 도윤" },
  { name: "intro-ai-limit", path: "/intro", heading: "합성 도윤" },
  { name: "legacy-off", path: "/assistant", heading: "나와 매니저" },
  { name: "home", path: "/home", heading: "아직 새 소개가 없어요." },
  {
    name: "home-chat",
    path: "/home",
    heading: "아직 새 소개가 없어요.",
    consented: true,
    gender: "male",
  },
  { name: "legacy-story", path: "/home", heading: "아직 새 소개가 없어요." },
  { name: "intro", path: "/intro", heading: "합성 도윤" },
  { name: "intro-pending", path: "/intro", heading: "합성 서연", gender: "male" },
  { name: "assistant-no-consent", path: "/assistant", heading: "나와 매니저" },
  { name: "assistant-chat", path: "/assistant", heading: "나와 매니저", consented: true },
  { name: "profile", path: "/profile", heading: "합성 지수" },
  { name: "photos", path: "/profile-edit", heading: "프로필 수정" },
  {
    name: "reinterview",
    path: "/profile-interview",
    stage: "start",
    complete: true,
    heading: "내 이야기를 시작해 볼까요?",
  },
  { name: "profile-edit-failure", path: "/profile-edit", heading: "프로필 수정" },
  { name: "profile-edit-conflict", path: "/profile-edit", heading: "프로필 수정" },
  { name: "profile-edit-load-error", path: "/profile-edit", heading: "프로필 수정" },
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
  assistantChecks: [],
  legacyChecks: [],
  limitations: [
    "Synthetic profile-photo placeholders; no real member data.",
    "Chromium viewport emulation only; no physical iPhone or native keyboard QA.",
    "No AI quality, server authorization, persistence, real payment, or notification verification.",
    "External Google Fonts CSS is mocked empty; self-hosted Wanted Sans loads normally.",
  ],
};
await mkdir(output, { recursive: true });
const engine = process.env.AFTER_TEST_BROWSER ?? "chromium";
assert.ok(["chromium", "webkit"].includes(engine));
const browser = await (engine === "webkit" ? webkit : chromium).launch();

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
  assert.equal(await page.getByText("매니저에게만 보여요", { exact: true }).count(), 0);
  assert.equal(await page.getByRole("switch").count(), 0, "home has no introduction settings");
  assert.equal(await page.getByRole("link", { name: "만남 가능 시간" }).count(), 0);
  assert.equal(
    await page.locator(".home-greeting .assistant-mark").count(),
    1,
    "manager starts the home conversation",
  );
  const input = page.getByLabel("매니저에게 물어볼 내용");
  await page
    .getByRole("button", { name: "첫 만남에서 어색하면 어떻게 말문을 열까요?", exact: true })
    .click();
  assert.match(await input.inputValue(), /첫 만남/);
  await input.fill("답장");
  await page
    .getByRole("button", { name: "답장이 늦을 때 부담 없이 어떻게 물어볼까요?", exact: true })
    .waitFor();
  await input.fill("");
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
  assert.equal(metrics.tops.length, 3, "only three non-duplicate help actions");
  await input.fill("진행 상태");
  await page.getByRole("button", { name: "매니저에게 질문하기" }).click();
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
    await page.getByRole("heading", { name: "첫인상을 더 선명하게" }).waitFor();
    await page.getByRole("heading", { name: "싫은 것 뒤에, 편한 방식도" }).waitFor();
    assert.equal(await page.getByText("프로필에 담긴 요약", { exact: true }).count(), 0);
    assert.ok((await page.locator(".profile-answer").allTextContents()).includes(ownAnswer));
    return;
  }
  assert.ok((await page.locator(".profile-answer").allTextContents()).includes(otherAnswer));
  assert.equal(
    await page.locator(".profile-sheet details").count(),
    0,
    "no native disclosure triangles",
  );
  assert.equal(
    await page.getByText(otherAnswer, { exact: true }).count(),
    1,
    "original interview is shown once",
  );
}

async function verifyAssistant(page, fixture, name, backendStart) {
  await page.getByRole("group", { name: "빠른 도움" }).waitFor();
  if (fixture.consented) {
    const history = page.getByRole("list", { name: "나만의 상담 기록" });
    await history.getByText(assistantHistory[0].answer, { exact: true }).waitFor();
    assert.equal(await history.locator("li").count(), assistantHistory.length);
    assert.equal(await history.locator('a[href*="conversation-prep"]').count(), 0);
    assert.equal(await history.locator('a[href*="assistant-schedule"]').count(), 0);
    assert.equal(await history.locator(`a[href*="${otherId}"]`).count(), 0);
    assert.equal(await history.getByRole("link", { name: "소개 확인하기" }).count(), 1);
    assert.equal(await history.getByRole("link", { name: "약속 상세 보기" }).count(), 1);
    await history.locator("li").first().scrollIntoViewIfNeeded();
    await capture(page, `${name}-history`);
    const field = page.getByLabel("매니저에게 상담할 내용");
    const initialHeight = (await field.boundingBox()).height;
    assert.ok(initialHeight >= 44 && initialHeight <= 46);
    await field.fill("첫 줄\n두 번째 줄\n세 번째 줄");
    assert.ok((await field.boundingBox()).height > initialHeight + 40);
    await field.fill("");
    assert.equal((await field.boundingBox()).height, initialHeight);
  } else {
    await page.getByRole("link", { name: "맞춤 상담 시작", exact: true }).waitFor();
    assert.equal(await page.getByRole("checkbox").count(), 0);
    assert.equal(await page.getByRole("textbox").count(), 0);
  }

  const guide = page.locator('.assistant-reply[role="status"]');
  await page.getByRole("button", { name: "내 상태", exact: true }).click();
  await guide.getByText("상대의 답을 기다리는 중이에요.", { exact: false }).waitFor();
  assert.doesNotMatch(await guide.innerText(), /답을 받았|홈에서 실제 진행/);
  await page.getByRole("button", { name: "티켓 가격", exact: true }).click();
  await guide.getByText("여성 회원에게 티켓 구매를 요청하지 않아요.", { exact: false }).waitFor();
  assert.equal(await guide.locator('a[href="/store"]').count(), 0);
  await page.getByRole("button", { name: "내 프로필 수정", exact: true }).click();
  await guide.getByText("어느 부분을 먼저 바꿀까요?", { exact: false }).waitFor();
  await page.getByRole("button", { name: "대화 팁", exact: true }).click();
  const preparation = guide.getByRole("link", { name: "대화 준비하기", exact: true });
  await preparation.waitFor();
  const preparationUrl = new URL(await preparation.getAttribute("href"), base);
  assert.equal(preparationUrl.pathname, "/conversation-prep");
  assert.equal(preparationUrl.searchParams.get("target"), otherId);

  if (fixture.consented) {
    const history = page.getByRole("list", { name: "나만의 상담 기록" });
    assert.equal(await history.locator('a[href*="conversation-prep"]').count(), 0);
    assert.equal(await history.locator("li").count(), assistantHistory.length);
  } else {
    assert.equal(await page.getByRole("checkbox").count(), 0);
  }
  const requests = summary.backendRequests.slice(backendStart);
  const edge = requests.filter((request) => request.path.includes("/functions/v1/"));
  const writes = requests.filter(
    (request) =>
      request.method !== "GET" &&
      !/\/rpc\/(?:home_state_v2|my_meet_window|assistant_capabilities|my_assistant_state)$/.test(
        request.path,
      ),
  );
  assert.equal(edge.length, 0, "quick guidance must not invoke an Edge function");
  assert.equal(writes.length, 0, "quick guidance must not save history, consent or an operation");
  assert.ok(requests.some((request) => request.path.endsWith("/rpc/home_state_v2")));
  summary.assistantChecks.push({
    name,
    consented: Boolean(fixture.consented),
    edgeRequests: edge.length,
    writeRequests: writes.length,
    sharedHomeState: "request_waiting",
    historicalTargetLinks: 0,
    currentGuideTarget: otherId,
  });
}

async function verifyLegacyStory(page, name, backendStart) {
  const input = page.getByRole("textbox", { name: "매니저에게 물어볼 내용", exact: true });
  const send = page.getByRole("button", { name: "매니저에게 질문하기", exact: true });
  await input.fill("프로필 수정");
  await send.click();
  const guide = page.locator('.assistant-reply[role="status"]');
  await guide.getByText("어느 부분을 먼저 바꿀까요?", { exact: false }).waitFor();
  assert.equal(new URL(page.url()).pathname, "/home", "ambiguous edit stays at target selection");
  assert.equal(await guide.getByRole("link", { name: "내 프로필 보기" }).count(), 1);
  assert.equal(await guide.getByRole("link").count(), 1, "general edit has one profile hub entry");
  await guide.scrollIntoViewIfNeeded();
  await capture(page, `${name}-choose-target`);

  const instruction = "소개글에서 마지막 문장만 삭제해줘";
  await input.fill(instruction);
  await send.click();
  await page.waitForURL(`${base}/assistant-profile`);
  const editor = page.getByRole("textbox", { name: "어떻게 바꿔볼까요?", exact: true });
  await editor.waitFor();
  assert.equal(
    await editor.inputValue(),
    instruction,
    "the exact edit request survives navigation",
  );
  assert.equal(await page.getByRole("checkbox").isChecked(), false);
  assert.equal(
    await page.getByRole("button", { name: "매니저와 다듬기", exact: true }).isDisabled(),
    true,
  );
  const requests = summary.backendRequests.slice(backendStart);
  assert.ok(requests.some((request) => request.path.endsWith("/rpc/my_profile_revision")));
  assert.equal(requests.filter((request) => request.path.includes("/functions/v1/")).length, 0);
  assert.equal(
    requests.filter(
      (request) =>
        request.method !== "GET" &&
        !/\/rpc\/(?:home_state_v2|my_meet_window|assistant_capabilities|my_profile_revision)$/.test(
          request.path,
        ),
    ).length,
    0,
    "handoff cannot generate, approve or save a profile revision",
  );
  summary.legacyChecks.push({
    name,
    ambiguousEditStayedHome: true,
    destination: "/assistant-profile",
    instructionPreserved: true,
    edgeRequests: 0,
    writeRequests: 0,
  });
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
      let switchedOwner = false;
      let releaseConsent;
      let currentDraft = null;
      let revision = 1;
      let publishFailed = false;
      let profileSaved = null;
      await context.addInitScript(
        ({ session, key }) => {
          if (location.search.includes("consent-preview")) {
            localStorage.removeItem(key);
            return;
          }
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
          if (
            current.name === "signup-consent" &&
            path.endsWith("/rpc/begin_signup_with_manager")
          ) {
            const body = request.postDataJSON();
            assert.equal(body.p_manager_policy_version, "manager-continuity-v2");
            assert.match(body.p_token, /^[0-9a-f]{64}$/);
            return fulfill({
              policyVersion: body.p_policy_version,
              acceptedAt: now,
              expiresAt: new Date(Date.now() + 3600000).toISOString(),
              verified: false,
              managerConsented: true,
            });
          }
          const profile = {
            ...member,
            ...profileSaved,
            id: switchedOwner ? otherId : id,
            gender: current.gender ?? member.gender,
            onboarding_step: current.stage && !current.complete ? 4 : 7,
          };
          const assistant =
            current.name.startsWith("assistant-") ||
            current.name === "home-chat" ||
            current.name === "home-history" ||
            current.name === "legacy-off";
          const candidate =
            current.name === "intro-pending"
              ? { ...other, name: "합성 서연", gender: "female" }
              : other;
          const hasMeeting =
            current.name.startsWith("assistant-") || current.name === "intro-pending";
          const flags = {
            chat: assistant && current.name !== "legacy-off",
            schedule: assistant,
            memory: assistant,
            profileEdit: assistant || current.name === "legacy-story" || current.name === "profile",
            introduction: current.name.startsWith("intro-ai"),
          };
          if (path.endsWith("/auth/v1/user"))
            return fulfill({ ...session.user, id: switchedOwner ? otherId : id });
          if (
            current.name === "manager-consent" &&
            path.endsWith("/rpc/assistant_manager_consent")
          ) {
            await new Promise((resolve) => {
              releaseConsent = resolve;
            });
            return fulfill({ consented: true, flags, revision: 2, turns: [], memories: [] });
          }
          if (current.name.startsWith("meetings-")) {
            if (path.endsWith("/rest/v1/intros"))
              return fulfill([
                {
                  id: introId,
                  female_id: profile.gender === "female" ? id : otherId,
                  male_id: profile.gender === "male" ? id : otherId,
                },
              ]);
            if (path.endsWith("/rest/v1/meetings"))
              return fulfill([
                {
                  ...pendingMeeting,
                  prefs_submitted_at: current.name !== "meetings-pending" ? now : null,
                  confirmed_at: current.name === "meetings-confirmed" ? now : null,
                  scheduled_at: current.name === "meetings-confirmed" ? now : null,
                },
              ]);
            if (path.endsWith("/rpc/get_public_profiles")) return fulfill([other]);
          }
          if (path.endsWith("/rest/v1/profiles") && request.method() === "GET") {
            return fulfill(
              current.name === "profile-edit-conflict" &&
                url.searchParams.get("select") === "updated_at"
                ? { updated_at: "changed-elsewhere" }
                : profile,
            );
          }
          if (path.endsWith("/rest/v1/profile_interview_drafts") && request.method() === "GET") {
            if (current.name === "profile-edit-load-error")
              return route.fulfill({
                status: 503,
                json: { message: "Synthetic draft unavailable" },
              });
            return fulfill(currentDraft ? { data: currentDraft, revision } : null);
          }
          if (path.endsWith("/rest/v1/app_settings") && request.method() === "GET")
            return fulfill({ payments_enabled: false });
          if (path.endsWith("/rpc/home_state_v2"))
            return fulfill({
              schema_version: 2,
              as_of: now,
              primary_state: hasMeeting
                ? "request_waiting"
                : ["intro", "home-arrival", "intro-ai", "intro-ai-failure"].includes(current.name)
                  ? "intro_available"
                  : "waiting",
              me: profile,
              candidate:
                ["intro", "home-arrival", "intro-ai", "intro-ai-failure"].includes(current.name) ||
                hasMeeting
                  ? candidate
                  : null,
              meeting: hasMeeting ? pendingMeeting : null,
              request_count: 0,
              pending_no_show: null,
              has_open_intro: hasMeeting,
              queued_intros: 0,
              intro_tickets: 0,
              meeting_tickets: 0,
              readiness: { ready: true, blockers: [] },
              next_action: null,
              deadline_at: null,
              ticket_summary: { intro_available: 0, meeting_available: 0 },
              intro_progress: { has_likes: current.name === "home-liked" },
            });
          if (path.endsWith("/rpc/assistant_capabilities")) return fulfill(flags);
          if (path.endsWith("/rpc/my_introduction_consent"))
            return fulfill(current.name.startsWith("intro-ai") ? 1 : null);
          if (path.endsWith("/rpc/conversation_preparation_allowed"))
            return fulfill(current.name === "meetings-confirmed");
          if (path.endsWith("/rpc/my_profile_revision") && current.name === "legacy-story")
            return fulfill({ enabled: true, draft: null });
          if (path.endsWith("/rpc/my_assistant_state") && assistant)
            return fulfill({
              flags,
              consented: Boolean(current.consented),
              revision: 1,
              session_id: "77777777-7777-4777-8777-777777777777",
              memories: [],
              turns:
                (current.consented && current.name !== "home-chat") || current.name === "legacy-off"
                  ? assistantHistory
                  : [],
            });
          if (current.name.startsWith("intro-ai") && path.endsWith("/rpc/get_public_profile"))
            return fulfill([request.postDataJSON().p_id === id ? profile : other]);
          if (
            current.name.startsWith("intro-ai") &&
            path.endsWith("/functions/v1/introduce-member")
          ) {
            assert.equal(request.postDataJSON().consent, true);
            if (current.name === "intro-ai-limit")
              return route.fulfill({
                status: 429,
                contentType: "application/json",
                body: JSON.stringify({ code: "daily_limit" }),
              });
            if (current.name === "intro-ai-failure")
              return route.fulfill({
                status: 502,
                contentType: "application/json",
                body: JSON.stringify({ code: "quality_failed" }),
              });
            return fulfill({
              viewerId: id,
              targetId: otherId,
              sourceFingerprint: "synthetic",
              promptVersion: introductionVersion,
              expiresAt: new Date(Date.now() + 3600000).toISOString(),
              cached: false,
              portrait: [
                {
                  text: "퇴근 후 본 영화에서 좋아하는 장면을 메모한다고 해요. 최근 어떤 장면이 남았는지 물어보면 어떨까요?",
                  sources: [{ person: "other", field: "story_daily_life", quote: otherAnswer }],
                },
              ],
              connections: [
                {
                  text: "한 분은 음악으로 쉬고, 한 분은 영화 장면을 기록해요. 쉬는 시간을 각자 어떻게 보내는지 나눠볼 수 있겠어요.",
                  selfSources: [{ person: "self", field: "story_daily_life", quote: ownAnswer }],
                  otherSources: [
                    { person: "other", field: "story_daily_life", quote: otherAnswer },
                  ],
                },
              ],
              questions: [],
            });
          }
          if (path.endsWith("/rpc/my_meet_window")) return fulfill(null);
          if (path.endsWith("/rpc/next_candidate")) return fulfill([other]);
          if (path.endsWith("/rpc/remaining_candidates")) return fulfill(1);
          if (current.name === "intro-pending") {
            if (path.endsWith("/rest/v1/intros") && request.method() === "GET")
              return fulfill({
                id: introId,
                male_id: id,
                female_id: otherId,
                reason: null,
                opened_at: now,
                closed_at: null,
              });
            if (path.endsWith("/rest/v1/meetings") && request.method() === "GET")
              return fulfill(pendingMeeting);
            if (path.endsWith("/rpc/get_public_profile")) {
              assert.equal(request.postDataJSON().p_id, otherId);
              return fulfill([candidate]);
            }
          }
          if (path.endsWith("/rpc/publish_profile_interview_v3")) {
            if (current.name === "profile-edit-failure" && !publishFailed) {
              publishFailed = true;
              return route.fulfill({
                status: 503,
                json: { message: "Synthetic publication failed" },
              });
            }
            assert.equal(request.postDataJSON().p_expected_revision, revision);
            assert.deepEqual(currentDraft.choices, member.profile_preferences.choices);
            assert.deepEqual(currentDraft.choiceCustom, member.profile_preferences.choiceCustom);
            profileSaved = {
              ...request.postDataJSON().p_conditions,
              profile_story: currentDraft.story,
              headline: currentDraft.story.headline,
              intro: currentDraft.story.summary,
              onboarding_step: 7,
            };
            currentDraft = null;
            revision = 0;
            return fulfill({ ...profile, ...profileSaved });
          }
          if (path.endsWith("/rpc/save_profile_interview_draft")) {
            if (current.name === "photos" || current.name.startsWith("profile-edit-"))
              assert.equal(request.postDataJSON().p_expected_revision, revision);
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
        const allowedPage = [
          "/home",
          "/intro",
          "/profile",
          "/profile-edit",
          "/profile-interview",
          "/signup",
          "/assistant",
          "/assistant-profile",
          "/consent",
          "/chats",
        ].includes(path);
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
        switchedOwner = false;
        releaseConsent = undefined;
        currentDraft = fixture.stage ? draft(fixture.stage) : null;
        if (fixture.name === "photos")
          currentDraft = { ...draft("preview"), basics: { ...basics, job: "예전 초안의 직업" } };
        revision = currentDraft ? 1 : 0;
        publishFailed = false;
        profileSaved = null;
        const name = `${fixture.name}-${scheme}-${width}`;
        const backendStart = summary.backendRequests.length;
        try {
          await page.goto(base + fixture.path, { waitUntil: "domcontentloaded" });
          if (fixture.heading)
            await page
              .getByRole("heading", {
                name: fixture.heading,
                exact: ![
                  "intro",
                  "intro-ai",
                  "intro-ai-failure",
                  "intro-ai-limit",
                  "intro-pending",
                  "profile",
                ].includes(fixture.name),
              })
              .waitFor();
          else await page.getByRole("textbox", { name: "내 답변", exact: true }).waitFor();
          if (fixture.name === "reinterview") {
            await page.getByRole("button", { name: "이전", exact: true }).click();
            await page.waitForURL("**/profile-edit");
            await page.getByLabel("직업", { exact: true }).waitFor();
          }
          if (fixture.name === "photos" || fixture.name.startsWith("profile-edit-")) {
            const saves = () =>
              summary.backendRequests
                .slice(backendStart)
                .filter((r) => r.path.endsWith("/rpc/save_profile_interview_draft"));
            const saveButton = page.getByRole("button", { name: "변경사항 저장", exact: true });
            if (fixture.name === "profile-edit-load-error") {
              await page.getByRole("button", { name: "다시 불러오기" }).waitFor();
              assert.equal(await saveButton.isDisabled(), true);
            } else {
              await page.getByLabel("직업", { exact: true }).waitFor();
              await page.getByLabel("직업", { exact: true }).fill("새로운 제품 기획자");
              assert.equal(saves().length, 0, "typing is not publication or autosave");
              assert.equal(
                await page.getByRole("button", { name: "다음", exact: true }).count(),
                0,
              );
              assert.equal(
                await page.getByRole("progressbar").count(),
                0,
                "editing is not a signup wizard",
              );
              await page.getByRole("link", { name: "뒤로", exact: true }).click();
              await page.getByRole("alertdialog").waitFor();
              await page.getByRole("button", { name: "계속 수정", exact: true }).click();
              assert.equal(
                await page.getByLabel("직업", { exact: true }).inputValue(),
                "새로운 제품 기획자",
              );
              await page.getByLabel("짧은 소개", { exact: true }).fill("010-1234-5678로 연락해요.");
              assert.equal(
                await saveButton.isDisabled(),
                true,
                "no contact details in public story",
              );
              await page.getByLabel("짧은 소개", { exact: true }).fill(ownAnswer);
              await capture(page, `${name}-form`);
              await audit(page, `${name}-form`);
              if (fixture.name === "photos") {
                await page.getByRole("button", { name: "3번째 사진 빼기", exact: true }).click();
                assert.equal(await saveButton.isDisabled(), true, "three photos remain required");
                await page
                  .getByRole("heading", { name: "사진에도 나다운 모습이 담기게" })
                  .waitFor();
                await page.getByRole("button", { name: "취소", exact: true }).click();
                await page.getByRole("button", { name: "저장하지 않고 나가기" }).click();
                await page.waitForURL("**/profile");
                await page.getByRole("heading", { name: "내 프로필", exact: true }).waitFor();
                assert.equal(saves().length, 0, "discard leaves drafts and public profile alone");
                await page.goto(base + "/signup?edit=true");
                await page.waitForURL("**/profile-edit");
                await page.getByLabel("직업", { exact: true }).fill("새로운 제품 기획자");
              }
              await saveButton.click();
              if (fixture.name === "photos") {
                await page.getByRole("button", { name: "현재 내용 저장", exact: true }).click();
              }
              if (fixture.name === "profile-edit-conflict") {
                await page.getByRole("alert").filter({ hasText: "다른 화면에서" }).waitFor();
                assert.equal(saves().length, 0, "stale profile never overwrites a newer edit");
                assert.equal(await saveButton.isDisabled(), true);
              } else {
                if (fixture.name === "profile-edit-failure") {
                  await page
                    .getByRole("alert")
                    .filter({ hasText: "입력한 내용은 그대로예요" })
                    .waitFor();
                  assert.equal(
                    await page.getByLabel("직업", { exact: true }).inputValue(),
                    "새로운 제품 기획자",
                  );
                  await saveButton.click();
                }
                await page.waitForURL("**/profile");
                assert.equal(profileSaved.job, "새로운 제품 기획자");
                assert.equal(profileSaved.onboarding_step, 7);
                assert.equal(
                  await page.getByRole("button", { name: "동의하고 시작하기" }).count(),
                  0,
                );
                await page.getByRole("link", { name: "프로필 수정", exact: true }).click();
                await page.waitForURL("**/profile-edit");
                await page.getByLabel("직업", { exact: true }).waitFor();
              }
            }
          }
          if (fixture.name === "home-arrival") {
            await page.locator(".introduction-arrival").waitFor();
            assert.equal(
              await page
                .locator(".introduction-arrival")
                .evaluate((el) => getComputedStyle(el).borderTopStyle),
              "solid",
            );
          }
          if (fixture.name === "home-liked") {
            await page.getByText("상대의 만남 요청을 기다리고 있어요.", { exact: true }).waitFor();
            await page.getByText("궁금한 점은 편하게 물어봐 주세요.", { exact: true }).waitFor();
            assert.equal(await page.locator(".home-greeting .assistant-mark").count(), 1);
          }
          if (fixture.name === "signup-consent") {
            const optional = page.getByRole("checkbox", {
              name: "AI 맞춤 상담 동의 (선택)",
              exact: true,
            });
            assert.equal(await optional.isChecked(), false);
            await page.getByRole("checkbox", { name: "이용약관 동의 (필수)", exact: true }).check();
            await page
              .getByRole("checkbox", { name: "개인정보 수집·이용 동의 (필수)", exact: true })
              .check();
            await page
              .locator("button:not([disabled])")
              .filter({ hasText: "동의하고 시작하기" })
              .waitFor();
            assert.equal(
              await optional.isChecked(),
              false,
              "AI consent is not required for signup",
            );
            await capture(page, `${name}-notice`);
            await optional.check();
            const signupResponse = page.waitForResponse((response) =>
              response.url().endsWith("/rpc/begin_signup_with_manager"),
            );
            await page.getByRole("button", { name: "동의하고 시작하기", exact: true }).click();
            await signupResponse;
            assert.equal(
              summary.backendRequests
                .slice(backendStart)
                .filter((r) => r.path.endsWith("/rpc/begin_signup_with_manager")).length,
              1,
            );
          }
          if (fixture.name === "home-history") {
            const history = page.getByRole("list", { name: "나만의 상담 기록" });
            await history.getByText(assistantHistory.at(-1).answer, { exact: true }).waitFor();
            assert.equal(
              await history.locator("li").count(),
              1,
              "home displays latest question/answer pair only",
            );
            assert.equal(
              await page.getByText(assistantHistory[0].answer, { exact: true }).count(),
              0,
            );
            assert.equal(
              await page.getByRole("group", { name: "빠른 도움" }).count(),
              0,
              "no duplicate navigation chips on home",
            );
            assert.equal(await page.getByRole("checkbox").count(), 0);
            assert.equal(
              await page.getByRole("link", { name: "상점", exact: true }).count(),
              0,
              "female store rule unchanged",
            );
            await capture(page, `${name}-home`);
            await page.getByRole("link", { name: "전체 대화", exact: true }).click();
            await page
              .getByRole("list", { name: "나만의 상담 기록" })
              .getByText(assistantHistory[0].answer, { exact: true })
              .waitFor();
            assert.equal(
              await page.getByRole("list", { name: "나만의 상담 기록" }).locator("li").count(),
              2,
              "same archive in full conversation",
            );
            await page.getByRole("button", { name: "상담 기록 지우기" }).click();
            await page.getByRole("heading", { name: "기록을 지울까요?" }).waitFor();
            assert.equal(
              (
                await page.getByRole("button", { name: "확인하고 삭제" }).getAttribute("class")
              ).includes("border-destructive/40"),
              true,
            );
            await page.getByRole("button", { name: "유지하기" }).click();
          }
          if (fixture.name === "manager-consent") {
            const consent = page.getByRole("checkbox", { name: "AI 맞춤 상담 동의 (선택)" });
            assert.equal(await consent.isChecked(), false);
            assert.equal(
              await page.getByRole("button", { name: "동의하고 상담 시작" }).isDisabled(),
              true,
            );
            await consent.check();
            await page
              .locator("button:not([disabled])")
              .filter({ hasText: "동의하고 상담 시작" })
              .waitFor();
            assert.equal(
              await page.getByRole("button", { name: "동의하고 상담 시작" }).isEnabled(),
              true,
            );
            // A's in-flight consent must neither check B's box nor navigate B.
            await page.getByRole("button", { name: "동의하고 상담 시작" }).click();
            for (let attempt = 0; attempt < 200 && !releaseConsent; attempt++)
              await new Promise((resolve) => setTimeout(resolve, 10));
            assert.ok(releaseConsent, "consent request started in synthetic handler");
            switchedOwner = true;
            const nextToken = `${Buffer.from('{"alg":"HS256","typ":"JWT"}').toString("base64url")}.${Buffer.from(JSON.stringify({ sub: otherId, exp: Math.floor(Date.now() / 1000) + 86400 })).toString("base64url")}.${Buffer.from("synthetic-signature").toString("base64url")}`;
            await page.evaluate(
              async ({ access_token, refresh_token }) => {
                const { supabase } = await import("/src/lib/supabase.ts");
                const result = await supabase.auth.setSession({ access_token, refresh_token });
                if (result.error) throw result.error;
              },
              { access_token: nextToken, refresh_token: "synthetic-owner-b" },
            );
            await page.waitForFunction(() => {
              const checkbox = document.querySelector(
                'input[aria-label="AI 맞춤 상담 동의 (선택)"]',
              );
              return checkbox && !checkbox.checked;
            });
            releaseConsent();
            await page.waitForLoadState("networkidle");
            assert.equal(
              new URL(page.url()).pathname,
              "/consent",
              "late A response cannot navigate B",
            );
            assert.equal(await consent.isChecked(), false, "owner switch resets consent");
            assert.equal(
              await page.getByRole("button", { name: "동의하고 상담 시작" }).isDisabled(),
              true,
            );
          }
          if (fixture.name.startsWith("meetings-")) {
            await page.getByRole("heading", { name: "합성 도윤" }).waitFor();
            assert.equal(
              await page
                .getByRole("navigation", { name: "소개 메뉴" })
                .getByRole("link", { name: "만남", exact: true })
                .getAttribute("aria-current"),
              "page",
            );
            assert.equal(
              await page
                .getByRole("navigation", { name: "주요 메뉴" })
                .getByRole("link", { name: "소개", exact: true })
                .getAttribute("aria-current"),
              "page",
            );
            await page
              .getByRole("link", {
                name:
                  fixture.name === "meetings-pending"
                    ? "요청 확인·답하기"
                    : fixture.name === "meetings-scheduling"
                      ? "날짜 고르기"
                      : "약속·상대와 대화",
                exact: true,
              })
              .waitFor();
          }
          if (fixture.name === "legacy-off") {
            assert.equal(await page.getByRole("button", { name: "동의하고 시작하기" }).count(), 0);
            await page.getByRole("button", { name: "동의하지 않고 기존 기록 삭제" }).waitFor();
            await page.getByText("기존 대화와 선호 보기", { exact: true }).click();
            await page.getByText(assistantHistory[0].answer, { exact: true }).waitFor();
          }
          if (fixture.name === "intro-ai") {
            assert.equal(await page.getByRole("button", { name: "매니저와 함께 읽기" }).count(), 0);
            await page.locator(".manager-reading-text").first().waitFor();
            assert.equal(
              summary.backendRequests
                .slice(backendStart)
                .filter((r) => r.path.endsWith("/functions/v1/introduce-member")).length,
              1,
              "automatic generation occurs once",
            );
            assert.equal(
              await page.locator(".manager-reading details, .manager-reading mark").count(),
              0,
            );
            assert.equal(
              await page.getByText(ownAnswer, { exact: true }).count(),
              0,
              "internal evidence is not recited",
            );
            assert.equal(
              await page.getByText(otherAnswer, { exact: true }).count(),
              1,
              "interview original is displayed once",
            );
            await page.locator(".manager-reading").scrollIntoViewIfNeeded();
            await capture(page, `${name}-reading`);
          }
          if (fixture.name === "intro-ai-limit") {
            await page.getByText(/오늘 준비 횟수를 모두 썼어요/).waitFor();
            assert.equal(
              await page.getByRole("button", { name: "설명 다시 준비하기" }).count(),
              0,
              "hard quota cannot invite an unusable retry",
            );
            assert.equal(await page.getByText(otherAnswer, { exact: true }).count(), 1);
          }
          if (fixture.name === "intro-ai-failure") {
            await page.getByRole("button", { name: "설명 다시 준비하기", exact: true }).waitFor();
            assert.equal(
              await page.locator(".manager-reading-text").count(),
              0,
              "failed generation does not become a copied explanation",
            );
            assert.equal(
              summary.backendRequests
                .slice(backendStart)
                .filter((r) => r.path.endsWith("/functions/v1/introduce-member")).length,
              1,
            );
            assert.equal(await page.getByText(otherAnswer, { exact: true }).count(), 1);
          }
          if (fixture.name === "home") {
            await capture(page, name);
            await verifyHome(page, width);
          }
          if (fixture.name === "home-arrival") {
            assert.equal(
              await page
                .locator(".introduction-arrival")
                .getByText(otherAnswer, { exact: true })
                .count(),
              0,
              "home does not repeat the interview when AI is unavailable",
            );
          }
          if (fixture.name === "home-chat") {
            assert.equal(
              await page.getByRole("link", { name: "상점", exact: true }).count(),
              1,
              "male store remains visible",
            );
            await page.getByLabel("매니저에게 상담할 내용").waitFor();
            assert.equal(await page.getByRole("switch").count(), 0);
            await capture(page, name);
            const field = page.getByLabel("매니저에게 상담할 내용");
            assert.equal(
              await page
                .locator(".assistant-dock")
                .evaluate((el) => getComputedStyle(el).borderTopWidth),
              "0px",
            );
            assert.equal(
              await page
                .locator(".app-footer")
                .evaluate((el) => getComputedStyle(el).borderTopWidth),
              "0px",
            );
            assert.ok(
              (
                await page
                  .locator(".assistant-prompt")
                  .evaluateAll((els) => els.map((el) => getComputedStyle(el).borderTopWidth))
              ).every((width) => width === "0px"),
            );
            assert.equal(
              await page
                .locator(".assistant-composer")
                .evaluate((el) => getComputedStyle(el).borderTopWidth),
              "0px",
            );
            await field.focus();
            assert.equal(
              await page
                .locator(".assistant-composer")
                .evaluate((el) => getComputedStyle(el).outlineWidth),
              "2px",
              "composer retains one keyboard focus indicator",
            );
            assert.equal(await field.evaluate((el) => getComputedStyle(el).outlineStyle), "none");
            assert.equal(
              await field.evaluate((el) => getComputedStyle(el).boxShadow),
              "none",
              "input has no duplicate focus ring",
            );
            const emptyHeight = (await field.boundingBox()).height;
            assert.ok(emptyHeight >= 44 && emptyHeight <= 46, "composer starts at one line");
            await field.fill("첫 줄\n두 번째 줄\n세 번째 줄");
            assert.ok((await field.boundingBox()).height > emptyHeight + 40, "newline grows input");
            await field.fill("길게 쓰는 상담 내용이 자연스럽게 줄바꿈되어야 해요. ".repeat(25));
            const longHeight = (await field.boundingBox()).height;
            assert.ok(longHeight <= 140 && longHeight > emptyHeight, "long input has a height cap");
            assert.ok(
              await field.evaluate((el) => el.scrollHeight > el.clientHeight),
              "long input scrolls internally",
            );
            await capture(page, `${name}-expanded`);
            await field.fill("");
            assert.equal((await field.boundingBox()).height, emptyHeight, "clearing shrinks input");
            await page
              .getByRole("button", {
                name: "내 프로필의 장점과 아쉬운 표현을 코칭해줘",
                exact: true,
              })
              .click();
            assert.match(await field.inputValue(), /프로필/);
            assert.equal(
              summary.backendRequests
                .slice(backendStart)
                .filter((r) => r.path.includes("/functions/v1/")).length,
              0,
              "sample is a draft, not a send",
            );
            await field.fill("답장");
            await page.getByRole("group", { name: "입력에 맞는 추천 질문" }).waitFor();
            await field.press("Escape");
            assert.equal(
              await page.getByRole("group", { name: "입력에 맞는 추천 질문" }).count(),
              0,
            );
            if (width === 320) {
              await page.setViewportSize({ width, height: 568 });
              await page.evaluate(() =>
                document.documentElement.style.setProperty("--keyboard-height", "300px"),
              );
              for (const value of [
                "소개글",
                "내 프로필의 장점을 코칭해줘",
                "긴 상담 내용이에요. ".repeat(50),
                "내 프로필을 코칭해줘 ".repeat(50),
              ]) {
                await field.fill(value);
                const send = await page
                  .getByRole("button", { name: "상담 보내기", exact: true })
                  .boundingBox();
                const input = await field.boundingBox();
                assert.ok(input && input.height <= 92, "keyboard caps growth at three lines");
                assert.ok(
                  send && input && send.y + send.height <= 268 && input.y + input.height <= 268,
                  "small keyboard viewport keeps composer and send visible",
                );
              }
              await page.evaluate(() =>
                document.documentElement.style.removeProperty("--keyboard-height"),
              );
              await page.setViewportSize({ width, height: 844 });
            }
            await field.fill("");
          }
          if (["intro", "profile"].includes(fixture.name))
            await verifyProfile(page, fixture.name === "profile");
          if (fixture.name === "intro-pending") {
            await page.getByText("요청을 전달했어요.", { exact: true }).waitFor();
            await page.getByText("아직 상대의 답변을 기다리고 있어요.", { exact: true }).waitFor();
            await page.getByText("상대의 답변을 기다리는 중입니다", { exact: true }).waitFor();
            assert.doesNotMatch(
              await page.locator("main").innerText(),
              /답을 받았|가능한 시간을 보냈/,
            );
          }
          if (fixture.name.startsWith("assistant-"))
            await verifyAssistant(page, fixture, name, backendStart);
          if (fixture.name === "legacy-story") await verifyLegacyStory(page, name, backendStart);
          if (fixture.name === "photos")
            assert.equal(
              await page.getByRole("heading", { name: "사진에도 나다운 모습이 담기게" }).count(),
              0,
              "unchanged photos do not repeat coaching",
            );
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
              fixture.name === "draft"
                ? page.locator("article")
                : fixture.name === "intro"
                  ? page.locator(".profile-stories")
                  : page.locator("aside");
            await target.scrollIntoViewIfNeeded();
            await capture(page, `${name}-reading`);
          }
          summary.results.push({ name, status: "passed" });
          console.log(`PASS ${name}`);
        } catch (error) {
          await capture(page, `${name}-failure`).catch(() => {});
          summary.results.push({ name, status: "failed", error: String(error) });
          console.error(`FAIL ${name}: ${error.message}`);
        } finally {
          releaseConsent?.();
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
