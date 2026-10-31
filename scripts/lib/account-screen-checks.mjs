import assert from "node:assert/strict";
import { join } from "node:path";
import { randomUUID } from "node:crypto";

export async function checkAccountScreens({ page, baseUrl, checkPage, screenshotDir }) {
  const capture = async (name) => {
    await page.getByRole("main").evaluate((main) => main.scrollTo(0, 0));
    await checkPage(page, name);
    if (screenshotDir) await page.screenshot({ path: join(screenshotDir, `${name}.png`) });
  };
  const fail = (route) =>
    route.fulfill({ status: 503, json: { message: "Synthetic unavailable" } });
  const reminderUrl = "**/rest/v1/rpc/my_notification_preferences";
  const reminderWrite = "**/rest/v1/rpc/set_my_request_reminders";
  const inboxUrl = "**/rest/v1/rpc/my_notifications";
  const supportUrl = "**/rest/v1/rpc/my_support_requests";

  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(`${baseUrl}/me`);
  await page.getByRole("link", { name: /프로필 보기/ }).waitFor();
  assert.equal(await page.locator('a[href="/profile"]').count(), 1, "one clear profile entry");
  assert.equal(await page.getByRole("link", { name: /티켓 이용 내역/ }).count(), 0);
  await capture("account-me-mobile");
  await page.getByRole("link", { name: /환경설정 화면/ }).click();
  await page.waitForURL("**/settings");
  assert.equal(
    await page
      .getByRole("navigation", { name: "주요 메뉴" })
      .locator('[aria-current="page"]')
      .count(),
    0,
  );

  await page.route(reminderUrl, fail);
  await page.reload();
  await page.getByRole("alert").getByText("요청 리마인드 설정을 확인할 수 없습니다.").waitFor();
  await page.unroute(reminderUrl);
  await page.getByRole("button", { name: "다시 확인", exact: true }).click();
  const reminder = page.getByRole("switch", { name: "답변 대기 리마인드", exact: true });
  await reminder.waitFor({ state: "visible" });
  await page.waitForFunction(() => !document.querySelector('[role="switch"]')?.disabled);
  const originalReminder = await reminder.getAttribute("aria-checked");
  await page.route(reminderWrite, fail);
  await reminder.click();
  await page.getByText("설정을 바꾸지 못했습니다.", { exact: true }).waitFor();
  assert.equal(
    await reminder.getAttribute("aria-checked"),
    originalReminder,
    "failed preference save keeps the acknowledged state",
  );
  await page.unroute(reminderWrite);
  const changed = page.waitForResponse(
    (r) => r.url().includes("/rpc/set_my_request_reminders") && r.ok(),
  );
  await reminder.click();
  await changed;
  await page.reload();
  await reminder.waitFor();
  await page.waitForFunction(
    (expected) =>
      document.querySelector('[role="switch"]')?.getAttribute("aria-checked") === expected,
    originalReminder === "true" ? "false" : "true",
  );
  await reminder.click();
  await page.waitForFunction(
    (expected) =>
      document.querySelector('[role="switch"]')?.getAttribute("aria-checked") === expected,
    originalReminder,
  );
  await capture("account-settings-mobile");
  await page.getByRole("button", { name: "어둡게", exact: true }).click();
  await capture("account-settings-dark");
  await page.getByRole("button", { name: "밝게", exact: true }).click();

  await page.getByRole("button", { name: "탈퇴하기", exact: true }).click();
  await page.getByRole("alertdialog").waitFor();
  await checkPage(page, "account withdrawal confirmation");
  await page.getByRole("button", { name: "취소", exact: true }).click();
  assert.equal(new URL(page.url()).pathname, "/settings");
  await page.getByRole("link", { name: "뒤로", exact: true }).click();
  await page.waitForURL("**/me");
  assert.equal(await page.getByRole("main").evaluate((main) => main.scrollTop), 0);

  const notifications = [
    {
      id: randomUUID(),
      kind: "meeting_requested",
      counterpart_name: "대화하며 천천히 알아가고 싶은 합성 사용자",
      meeting_id: null,
      created_at: new Date().toISOString(),
      read_at: null,
    },
    {
      id: randomUUID(),
      kind: "intro_delivered",
      counterpart_name: null,
      meeting_id: null,
      created_at: new Date(Date.now() - 3600_000).toISOString(),
      read_at: new Date().toISOString(),
    },
  ];
  await page.route(inboxUrl, (route) => route.fulfill({ json: notifications }));
  const readUrl = "**/rest/v1/rpc/mark_displayed_notifications_read";
  let acknowledged = [];
  await page.route(readUrl, (route) => {
    acknowledged = route.request().postDataJSON().p_ids;
    return route.fulfill({ status: 204 });
  });
  await page.getByRole("link", { name: /^(알림|읽지 않은 알림)/ }).click();
  await page.waitForURL("**/notifications?from=me");
  await page.getByText("새 소개가 도착했어요", { exact: true }).waitFor();
  await capture("account-notifications-mobile");
  assert.deepEqual(
    acknowledged,
    [notifications[0].id],
    "only displayed unread IDs are acknowledged",
  );
  await page.getByRole("link", { name: "뒤로", exact: true }).click();
  await page.waitForURL("**/me");
  await page.getByRole("link", { name: /^(알림|읽지 않은 알림)/ }).click();
  await page.getByRole("link").filter({ hasText: "새 소개가 도착했어요" }).click();
  await page.waitForURL("**/intro");
  await page.unroute(inboxUrl);
  await page.route(inboxUrl, fail);
  await page.goto(`${baseUrl}/notifications`);
  await page.getByText("알림을 불러오지 못했어요.", { exact: true }).waitFor();
  await page.unroute(inboxUrl);
  await page.route(inboxUrl, (route) => route.fulfill({ json: [] }));
  await page.getByRole("button", { name: "다시 불러오기", exact: true }).click();
  await page.getByRole("heading", { name: "아직 알림이 없어요", exact: true }).waitFor();
  await checkPage(page, "account notification empty recovery");
  notifications[0].kind = "meeting_checkin_reminder";
  await page.unroute(inboxUrl);
  await page.route(inboxUrl, (route) => route.fulfill({ json: notifications }));
  await page.evaluate(() => window.dispatchEvent(new Event("focus")));
  await page.getByText("약속이 가까워졌어요", { exact: true }).waitFor();
  await page.unroute(inboxUrl);
  await page.unroute(readUrl);

  await page.goto(`${baseUrl}/me`);
  await page.getByRole("link", { name: /도움 · 문의/ }).click();
  await page.getByRole("heading", { name: "고객센터", exact: true }).waitFor();
  const body = page.getByLabel("문의 내용", { exact: true });
  const send = page.getByRole("button", { name: "문의 보내기", exact: true });
  await body.waitFor();
  await capture("account-support-mobile");
  await body.fill("짧은 문의");
  assert.equal(await send.isDisabled(), true);
  await page.getByText("10자 이상 적어 주세요.", { exact: true }).waitFor();
  const draft = "합성 문의 내용입니다. 오류가 나도 이 내용은 사라지면 안 됩니다.";
  await body.fill(draft);
  const createUrl = "**/rest/v1/rpc/create_support_request";
  await page.route(createUrl, fail);
  await send.click();
  await page.getByRole("status").filter({ hasText: "접수 여부를 확인할 수 없어요." }).waitFor();
  assert.equal(await body.inputValue(), draft);
  assert.equal(await send.isEnabled(), true);
  await page.unroute(createUrl);
  await page.route(supportUrl, fail);
  await page.getByRole("button", { name: "내역 새로고침", exact: true }).click();
  await page.getByText(/내역을 새로고침하지 못했어요/).waitFor();
  await page.getByText("합성 브라우저 검증을 위한 문의입니다.", { exact: false }).waitFor();
  await page.unroute(supportUrl);
  const reloaded = page.waitForResponse(
    (r) => r.url().includes("/rpc/my_support_requests") && r.ok(),
  );
  await page.getByRole("button", { name: "내역 새로고침", exact: true }).click();
  await reloaded;
  await page.setViewportSize({ width: 320, height: 480 });
  await body.focus();
  await page.waitForFunction(() => {
    const field = document.querySelector("#support-body");
    const main = document.querySelector("main").getBoundingClientRect();
    const rect = field.getBoundingClientRect();
    return document.activeElement === field && rect.top >= main.top && rect.bottom <= main.bottom;
  });
  assert.ok((await body.evaluate((field) => parseFloat(getComputedStyle(field).fontSize))) >= 16);
  await checkPage(page, "account support compact keyboard viewport");
  await page.setViewportSize({ width: 390, height: 844 });
  await body.fill("");
  await body.blur();
  await page.getByRole("link", { name: "뒤로", exact: true }).click();
  await page.waitForURL("**/me");

  await page.setViewportSize({ width: 1440, height: 1000 });
  for (const route of ["me", "settings", "notifications", "support"]) {
    await page.goto(`${baseUrl}/${route}`);
    if (route === "me") {
      await page.getByRole("link", { name: /프로필 보기/ }).waitFor();
      assert.equal(await page.locator('a[href="/profile"]').count(), 1, "one clear profile entry");
    }
    if (route === "settings")
      await page.getByRole("switch", { name: "답변 대기 리마인드", exact: true }).waitFor();
    if (route === "notifications")
      await page.getByRole("main").locator("ul li a").first().waitFor();
    if (route === "support") await body.waitFor();
    await capture(`account-${route}-desktop`);
  }
  await page.setViewportSize({ width: 390, height: 844 });
}
