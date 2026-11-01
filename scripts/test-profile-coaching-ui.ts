import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import { chromium, webkit } from "playwright";
import { storyFromAnswers } from "../src/lib/profileStory";

// UI contract tests with synthetic transport fixtures. Never contacts a DB/model/payment API.
const base = process.env.AFTER_COACH_UI_BASE ?? "http://127.0.0.1:5192";
assert.equal(new URL(base).hostname, "127.0.0.1");
const output = process.env.AFTER_COACH_UI_OUTPUT ?? "/tmp/after-coaching-ui-20261101";
await mkdir(output, { recursive: true });
const id = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const story = storyFromAnswers({
  daily_life:
    "보통 퇴근 후에는 동네 수영장에서 운동해요. 집으로 돌아와 좋아하는 음악을 들으며 저녁을 먹어요.",
  getting_closer: "지난주 동료와 점심을 먹으며 요즘 본 영화 이야기를 나누니 자연스럽게 친해졌어요.",
  conversation:
    "최근 읽은 소설의 마지막 장면이 기억에 남아요. 각자 어떻게 읽었는지 이야기하고 싶어요.",
});
story.headline = "물속에서 보내는 저녁을 좋아해요";
story.summary = "수영과 소설을 좋아하고, 일상의 작은 이야기를 함께 나누고 싶어요.";
const profile = {
  id,
  account_state: "active",
  onboarding_step: 7,
  name: "합성 코칭",
  gender: "female",
  birth: "1997-04-12",
  job: "제품 기획",
  hub_id: "gangnam",
  headline: story.headline,
  intro: story.summary,
  profile_story: story,
  photo_paths: [],
  interests: [],
  topics: [],
  smoking: "none",
  drinking: "none",
  updated_at: "2026-11-01T00:00:00Z",
};
const user = {
  id,
  email: "coaching-ui@verify.local",
  role: "authenticated",
  aud: "authenticated",
  app_metadata: {},
  user_metadata: {},
  created_at: profile.updated_at,
};
const jwt = [
  "eyJhbGciOiJIUzI1NiJ9",
  Buffer.from(JSON.stringify({ sub: id, exp: Math.floor(Date.now() / 1000) + 3600 })).toString(
    "base64url",
  ),
  "synthetic",
].join(".");
const session = {
  access_token: jwt,
  refresh_token: "synthetic",
  expires_at: Math.floor(Date.now() / 1000) + 3600,
  expires_in: 3600,
  token_type: "bearer",
  user,
};
const checks = [];
for (const [engine, browserType] of [
  ["chromium", chromium],
  ["webkit", webkit],
] as const) {
  const browser = await browserType.launch();
  try {
    for (const [theme, width] of [
      ["light", 390],
      ["dark", 390],
      ["light", 1280],
    ] as const) {
      const context = await browser.newContext({
        viewport: { width, height: 844 },
        colorScheme: theme,
        reducedMotion: "reduce",
      });
      await context.addInitScript(
        ({ session, theme }) => {
          localStorage.setItem("sb-127-auth-token", JSON.stringify(session));
          localStorage.setItem("after.theme", theme);
        },
        { session, theme },
      );
      const flags = {
        chat: true,
        memory: false,
        schedule: false,
        introduction: false,
        profileEdit: false,
      };
      const state = {
        flags,
        consented: true,
        revision: 1,
        session_id: id,
        memories: [],
        turns: [] as Record<string, unknown>[],
      };
      let sends = 0;
      await context.route("http://127.0.0.1:55321/**", async (route) => {
        const path = new URL(route.request().url()).pathname;
        let data: unknown = [];
        if (path === "/auth/v1/user") data = user;
        else if (path === "/rest/v1/profiles") data = profile;
        else if (path === "/rest/v1/profile_interview_drafts") data = null;
        else if (path.endsWith("/assistant_capabilities")) data = flags;
        else if (path.endsWith("/my_assistant_state")) data = state;
        else if (path.endsWith("/assistant-chat")) {
          sends++;
          const request = route.request().postDataJSON();
          assert.equal(request.purpose, "profile_coaching");
          state.turns.push({
            id: request.requestId,
            question: request.question,
            answer:
              "‘동네 수영장에서 운동해요’는 그대로 두어도 좋아요. 더 고치기보다 궁금한 점을 편하게 물어봐 주세요.",
            state: "complete",
            created_at: new Date().toISOString(),
          });
          data = { state: "complete" };
        }
        await route.fulfill({ status: 200, json: data });
      });
      const page = await context.newPage();
      const errors: string[] = [];
      page.on("pageerror", (e) => errors.push(e.message));
      page.setDefaultTimeout(15000);
      await page.goto(base + "/profile");
      await page.waitForLoadState("networkidle");
      const ready = page.getByText(
        "내 이야기가 충분히 담겨 있어요. 궁금한 게 있으면 편하게 물어봐 주세요.",
      );
      await ready.waitFor();
      await ready.scrollIntoViewIfNeeded();
      assert.equal(await page.getByText("이 소재는 앞에 두세요").count(), 0);
      await page.screenshot({ path: `${output}/${engine}-${width}-${theme}-ready.png` });
      await page.getByRole("link", { name: "프로필 수정", exact: true }).click();
      const job = page.getByLabel("직업", { exact: true });
      await job.fill("저장 전 변경한 직업");
      const trigger = page.getByRole("button", { name: "프로필 매니저에게 물어보기" });
      await trigger.click();
      const dialog = page.getByRole("dialog");
      await dialog.waitFor();
      const input = dialog.getByRole("textbox", { name: "매니저에게 상담할 내용" });
      await input.fill("이 문장 어때? 동네 수영장에서 운동해요.");
      await dialog.getByRole("button", { name: "닫기", exact: true }).click();
      assert.equal(await job.inputValue(), "저장 전 변경한 직업");
      await trigger.click();
      assert.equal(await input.inputValue(), "이 문장 어때? 동네 수영장에서 운동해요.");
      assert.equal(sends, 0, "Opening chat never generates automatically");
      await dialog.getByRole("button", { name: "상담 보내기" }).click();
      await dialog.getByText(/더 고치기보다 궁금한 점/).waitFor();
      assert.equal(sends, 1);
      await input.fill("후속 질문은 아직 보내지 않았어요");
      assert.equal(
        await page.evaluate(() => document.documentElement.scrollWidth > innerWidth),
        false,
      );
      const box = await dialog.boundingBox();
      assert.ok(box && box.x >= 0 && box.x + box.width <= width + 1);
      await page.screenshot({ path: `${output}/${engine}-${width}-${theme}-chat.png` });
      await dialog.getByRole("button", { name: "닫기", exact: true }).click();
      assert.equal(await job.inputValue(), "저장 전 변경한 직업");
      await trigger.click();
      await dialog.getByText(/더 고치기보다 궁금한 점/).waitFor();
      assert.equal(await input.inputValue(), "후속 질문은 아직 보내지 않았어요");
      await dialog.getByRole("button", { name: "닫기", exact: true }).click();
      flags.chat = false;
      await page.reload();
      await page.waitForLoadState("networkidle");
      assert.equal(await trigger.count(), 0, "OFF gate hides chat entry");
      assert.deepEqual(errors, []);
      checks.push({
        engine,
        theme,
        width,
        unsavedFormPreserved: true,
        unsentQuestionPreserved: true,
        historyContinues: true,
        noAutomaticGeneration: true,
        flagOffRespected: true,
      });
      await context.close();
    }
  } finally {
    await browser.close();
  }
}
await writeFile(
  `${output}/checks.json`,
  JSON.stringify({ transport: "synthetic fixtures", checks }, null, 2),
);
console.log("Profile coaching UI PASS", checks.length, "cases; synthetic transport only");
