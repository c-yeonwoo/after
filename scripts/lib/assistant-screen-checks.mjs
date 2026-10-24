import assert from "node:assert/strict";
import { join } from "node:path";

export async function checkAssistantScreens({ page, baseUrl, target, checkPage, screenshotDir }) {
  let calls = 0;
  const endpoint = "**/functions/v1/prepare-conversation";
  await page.route(endpoint, async (route) => {
    const body = route.request().postDataJSON();
    assert.equal(body.target, target);
    assert.equal(body.consent, true);
    calls++;
    await route.fulfill({
      json: {
        advice: [
          {
            kind: "start",
            text: "산책할 때 좋아하는 풍경부터 가볍게 물어보세요. 나도 기억에 남는 길 하나를 보태면 대화가 자연스러워요.",
            sourceField: "intro",
            quote: "동네를 걸으며 하루를 정리합니다.",
          },
          {
            kind: "respect",
            text: "정확한 집 위치보다는 길의 분위기를 물어보세요. 답하기 편한 범위에서 이야기하도록 기다려 주세요.",
            sourceField: "intro",
            quote: "동네를 걸으며 하루를 정리합니다.",
          },
          {
            kind: "pace",
            text: "산책 이야기를 들은 뒤 바로 다음 질문으로 넘기지 않아도 괜찮아요. 내 하루를 쉬게 하는 순간도 짧게 보태 보세요.",
            sourceField: "intro",
            quote: "동네를 걸으며 하루를 정리합니다.",
          },
        ],
        topics: [
          {
            title: "하루를 마무리하는 산책",
            question: "동네를 걷다가 자주 들르게 되는 곳이 있나요?",
            followup: "그곳은 어떤 점 때문에 다시 가고 싶어지나요?",
            sourceField: "intro",
            quote: "퇴근 후에는 동네를 걸으며 하루를 정리합니다.",
          },
        ],
      },
    });
  });
  await page.getByRole("link", { name: "내 비서와 대화 준비하기" }).click();
  const generate = page.getByRole("button", { name: "공개 프로필로 준비하기" });
  await generate.waitFor();
  assert.equal(await generate.isEnabled(), false, "no AI request before explicit consent");
  assert.equal(calls, 0);
  await page.getByRole("checkbox").check();
  await generate.click();
  await page
    .getByRole("heading", { name: "동네를 걷다가 자주 들르게 되는 곳이 있나요?" })
    .waitFor();
  assert.equal(calls, 1, "one explicit action makes one request");
  await page.getByRole("heading", { name: "만남 직전, 이것만." }).waitFor();
  assert.equal(
    await page.getByRole("button", { name: /역할극|대화 연습/ }).count(),
    0,
    "advice, not roleplay",
  );
  for (const scheme of ["light", "dark"]) {
    await page.emulateMedia({ colorScheme: scheme, reducedMotion: "reduce" });
    for (const width of [320, 390, 1440]) {
      await page.setViewportSize({ width, height: 844 });
      await checkPage(page, `assistant preparation ${scheme} ${width}`);
      if (screenshotDir)
        await page.screenshot({
          path: join(screenshotDir, `assistant-prep-${scheme}-${width}.png`),
        });
    }
  }
  // A permissions failure must hide already generated copy, not leave a stale memo.
  const access = "**/rest/v1/rpc/get_public_profile";
  await page.route(access, (route) => route.fulfill({ json: [] }));
  await page.evaluate(() => window.dispatchEvent(new Event("focus")));
  await page.getByRole("heading", { name: "지금은 준비할 수 없어요" }).waitFor();
  assert.equal(await page.getByText("동네를 걷다가 자주 들르게 되는 곳이 있나요?").count(), 0);
  await page.unroute(access);
  await page.unroute(endpoint);
  await page.emulateMedia({ colorScheme: "light", reducedMotion: "no-preference" });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(`${baseUrl}/home`);
  await page.getByRole("heading", { name: "내 비서", exact: true }).waitFor();
  await page.getByRole("button", { name: "지금 내 상태", exact: true }).click();
  assert.equal(await page.locator(".assistant-reply").count(), 1);
  await page.getByLabel("비서에게 물어볼 내용").fill("약속 취소해줘");
  await page.getByRole("button", { name: "비서에게 질문하기" }).click();
  await page.getByText("결제·취소·신고는 제가 자동 처리하지 않아요.", { exact: false }).waitFor();
  await checkPage(page, "assistant no automatic consequential action");
  // Model a native keyboard reducing the app frame, without claiming hardware QA.
  await page.evaluate(() => {
    document.documentElement.style.setProperty("--keyboard-height", "300px");
    document.querySelector('input[aria-label="비서에게 물어볼 내용"]').focus();
  });
  await page.waitForFunction(() => {
    const field = document.querySelector('input[aria-label="비서에게 물어볼 내용"]');
    const bounds = field.getBoundingClientRect();
    const main = field.closest("main").getBoundingClientRect();
    return bounds.top >= main.top && bounds.bottom <= main.bottom;
  });
  await page.evaluate(() => {
    document.activeElement?.blur();
    document.documentElement.style.removeProperty("--keyboard-height");
  });
  if (screenshotDir) {
    await page.locator("main").evaluate((el) => el.scrollTo({ top: 0 }));
    await page.screenshot({ path: join(screenshotDir, "assistant-home-light.png") });
    await page.emulateMedia({ colorScheme: "dark" });
    await page.waitForTimeout(300);
    await checkPage(page, "assistant home dark");
    await page.screenshot({ path: join(screenshotDir, "assistant-home-dark.png") });
    await page.emulateMedia({ colorScheme: "light" });
    await page.waitForTimeout(300);
  }
  await page.goto(`${baseUrl}/intro`);
  await page.getByRole("link", { name: "내 비서와 대화 준비하기" }).waitFor();
}
