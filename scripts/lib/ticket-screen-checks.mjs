import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { join } from "node:path";

export async function checkTicketScreens({ page, baseUrl, checkPage, screenshotDir }) {
  const fail = (route) =>
    route.fulfill({ status: 503, json: { message: "Synthetic unavailable" } });
  const capture = async (name) => {
    await page.locator("[data-sonner-toast]").last().waitFor({ state: "hidden" });
    await page.getByRole("main").evaluate((main) => main.scrollTo(0, 0));
    await checkPage(page, name);
    if (screenshotDir) await page.screenshot({ path: join(screenshotDir, `${name}.png`) });
  };
  await page.goto(`${baseUrl}/me`);
  await page.getByRole("link", { name: /티켓 받기/ }).click();
  const pay = page.getByRole("button", { name: "1장 결제하기", exact: true });
  await pay.waitFor();
  await capture("ticket-store-mobile");
  await page.setViewportSize({ width: 320, height: 480 });
  await checkPage(page, "compact ticket store");
  assert.ok(await pay.evaluate((button) => button.getBoundingClientRect().bottom <= innerHeight));
  await page.setViewportSize({ width: 390, height: 844 });

  const bundlesUrl = "**/rest/v1/rpc/ticket_bundles";
  let releaseIntro;
  let introStarted;
  const started = new Promise((resolve) => {
    introStarted = resolve;
  });
  const held = new Promise((resolve) => {
    releaseIntro = resolve;
  });
  const deliveries = [];
  const deliveryErrors = [];
  await page.route(bundlesUrl, async (route) => {
    let finished;
    deliveries.push(
      new Promise((resolve) => {
        finished = resolve;
      }),
    );
    try {
      const response = await route.fetch();
      if (route.request().postDataJSON().p_kind === "intro") {
        introStarted();
        await held;
      }
      await route.fulfill({ response });
    } catch (error) {
      deliveryErrors.push(error.message);
    } finally {
      finished();
    }
  });
  const kinds = page.getByRole("group", { name: "티켓 종류", exact: true });
  await kinds.getByRole("button", { name: "소개 티켓", exact: true }).click();
  await started;
  assert.equal(
    await page.getByRole("list", { name: "티켓 상품" }).count(),
    0,
    "old kind's prices are not shown during a new kind's load",
  );
  const meetingReloaded = page.waitForResponse(
    (r) =>
      r.url().includes("/rpc/ticket_bundles") && r.request().postDataJSON().p_kind === "meeting",
  );
  await kinds.getByRole("button", { name: "만남 티켓", exact: true }).click();
  await meetingReloaded;
  await pay.waitFor();
  const introReturned = page.waitForResponse(
    (r) => r.url().includes("/rpc/ticket_bundles") && r.request().postDataJSON().p_kind === "intro",
  );
  releaseIntro();
  await introReturned;
  await Promise.all(deliveries);
  assert.deepEqual(
    deliveryErrors,
    [],
    "delayed responses are delivered before removing the fixture",
  );
  assert.equal(
    await kinds
      .getByRole("button", { name: "만남 티켓", exact: true })
      .getAttribute("aria-pressed"),
    "true",
  );
  assert.equal(
    await page
      .getByRole("list", { name: "티켓 상품" })
      .getByRole("button")
      .filter({ hasText: "소개 티켓" })
      .count(),
    0,
    "late intro response cannot overwrite meeting bundles",
  );
  await page.unroute(bundlesUrl);

  await page.route(bundlesUrl, fail);
  await page.reload();
  await page
    .getByRole("alert")
    .getByText("티켓 정보를 불러오지 못했어요.", { exact: true })
    .waitFor();
  await page.unroute(bundlesUrl);
  await page.getByRole("button", { name: "다시 불러오기", exact: true }).click();
  await pay.waitFor();
  const createUrl = "**/rest/v1/rpc/create_ticket_order";
  let releaseCreate;
  let createCount = 0;
  const pendingCreate = new Promise((resolve) => {
    releaseCreate = resolve;
  });
  await page.route(createUrl, async (route) => {
    createCount += 1;
    await pendingCreate;
    await fail(route);
  });
  await pay.dblclick();
  const busy = page.getByRole("button", { name: "처리하는 중…", exact: true });
  await busy.waitFor();
  assert.equal(
    await kinds.getByRole("button", { name: "소개 티켓", exact: true }).isDisabled(),
    true,
  );
  releaseCreate();
  await page.getByText("신청에 실패했습니다.", { exact: true }).waitFor();
  assert.equal(createCount, 1);
  await page.unroute(createUrl);
  await pay.waitFor();
  assert.equal(await pay.isEnabled(), true);

  const pendingOrder = {
    order_id: randomUUID(),
    kind: "meeting",
    quantity: 1,
    amount: 30000,
    state: "pending",
    payment_required: true,
  };
  const ordersUrl = "**/rest/v1/ticket_orders?*";
  await page.route(ordersUrl, (route) => route.fulfill({ json: pendingOrder }));
  await page.reload();
  await page.getByRole("button", { name: "결제 이어하기", exact: true }).waitFor();
  assert.equal(await pay.count(), 0, "pending order is resumed instead of creating another order");
  await checkPage(page, "pending ticket order");
  await page.unroute(ordersUrl);

  const confirmed = {
    ...pendingOrder,
    order_id: randomUUID(),
    state: "confirmed",
    created_at: new Date().toISOString(),
  };
  let paymentOrders = [confirmed];
  await page.route(ordersUrl, (route) => route.fulfill({ json: paymentOrders }));
  await page.getByRole("link", { name: "이용 내역", exact: true }).click();
  await page.getByRole("button", { name: "미사용 주문 취소", exact: true }).waitFor();
  await capture("ticket-orders-mobile");
  let cancelCalls = 0;
  const cancelUrl = "**/functions/v1/cancel-ticket-payment";
  await page.route(cancelUrl, async (route) => {
    cancelCalls += 1;
    if (cancelCalls === 1) return fail(route);
    paymentOrders = [{ ...confirmed, state: "canceled" }];
    await route.fulfill({ json: { canceled: true } });
  });
  await page.getByRole("button", { name: "미사용 주문 취소", exact: true }).click();
  await page
    .getByRole("alertdialog")
    .getByText(/30,000원 주문입니다/)
    .waitFor();
  await checkPage(page, "ticket cancellation confirmation");
  await page.getByRole("button", { name: "돌아가기", exact: true }).click();
  assert.equal(cancelCalls, 0);
  await page.getByRole("button", { name: "미사용 주문 취소", exact: true }).click();
  await page.getByRole("button", { name: "주문 취소하기", exact: true }).click();
  await page
    .getByText("취소를 완료하지 못했습니다. 미사용 상태를 확인하거나 문의해 주세요.", {
      exact: true,
    })
    .waitFor();
  await page.getByRole("button", { name: "미사용 주문 취소", exact: true }).click();
  await page.getByRole("button", { name: "주문 취소하기", exact: true }).click();
  await page.getByText("결제 취소 완료", { exact: true }).waitFor();
  assert.equal(cancelCalls, 2);
  await page.unroute(cancelUrl);
  await page.unroute(ordersUrl);
  await page.route(ordersUrl, fail);
  await page.getByRole("button", { name: "새로고침", exact: true }).click();
  await page
    .getByRole("alert")
    .getByText(/이전 내역을 표시/)
    .waitFor();
  await page.getByText("결제 취소 완료", { exact: true }).waitFor();
  await page.unroute(ordersUrl);
  await page.reload();
  await page.getByText("유료 결제 내역이 없습니다.", { exact: true }).waitFor();
  await page.getByRole("list", { name: "티켓 사용 내역", exact: true }).waitFor();
  await checkPage(page, "issued tickets without paid orders");
  await page.route(ordersUrl, fail);
  await page.reload();
  await page.getByRole("alert").getByText("내역을 불러오지 못했어요.", { exact: true }).waitFor();
  assert.equal(await page.getByText("유료 결제 내역이 없습니다.", { exact: true }).count(), 0);
  await page.unroute(ordersUrl);
  await page.getByRole("button", { name: "다시 불러오기", exact: true }).click();
  await page.getByText("유료 결제 내역이 없습니다.", { exact: true }).waitFor();

  await page.getByRole("link", { name: "뒤로", exact: true }).click();
  await page.getByRole("link", { name: /만남 가능 시간/ }).click();
  await page.waitForURL("**/availability?from=me");
  await page.getByRole("heading", { name: "퇴근 후, 언제 편하세요?", exact: true }).waitFor();
  const days = page.getByRole("group", { name: "편한 요일", exact: true });
  const monday = days.getByRole("button", { name: "월", exact: true });
  const save = page.getByRole("button", { name: "저장하기", exact: true });
  assert.equal(await save.isDisabled(), true);
  await page.getByText("편한 요일을 하나 이상 골라 주세요.", { exact: true }).waitFor();
  await page.setViewportSize({ width: 320, height: 568 });
  const daySize = await monday.boundingBox();
  assert.ok(daySize.width >= 44 && daySize.height >= 44);
  await page.setViewportSize({ width: 390, height: 844 });
  await monday.click();
  const time = page
    .getByRole("group", { name: "가장 이른 시간", exact: true })
    .getByRole("button")
    .last();
  await time.click();
  const selectedTime = await time.textContent();
  const saveUrl = "**/rest/v1/rpc/save_my_meet_window";
  await page.route(saveUrl, fail);
  await save.click();
  await page.getByText("저장하지 못했어요. 다시 시도해 주세요.", { exact: true }).waitFor();
  assert.equal(await monday.getAttribute("aria-pressed"), "true");
  assert.equal(await time.getAttribute("aria-pressed"), "true");
  await page.unroute(saveUrl);
  let releaseSave;
  const saving = new Promise((resolve) => {
    releaseSave = resolve;
  });
  let saveCount = 0;
  await page.route(saveUrl, async (route) => {
    saveCount += 1;
    await saving;
    const response = await route.fetch();
    await route.fulfill({ response });
  });
  await save.dblclick();
  await page.getByRole("button", { name: "저장 중…", exact: true }).waitFor();
  assert.equal(await monday.isDisabled(), true);
  assert.equal(await time.isDisabled(), true);
  releaseSave();
  await page.waitForURL("**/me");
  assert.equal(saveCount, 1);
  await page.unroute(saveUrl);
  await page.getByRole("link", { name: /만남 가능 시간/ }).click();
  await monday.waitFor();
  await page.getByRole("button", { name: selectedTime, exact: true }).waitFor();
  assert.equal(await monday.getAttribute("aria-pressed"), "true");
  await capture("ticket-availability-mobile");
  const clearUrl = "**/rest/v1/rpc/clear_my_meet_window";
  await page.route(clearUrl, fail);
  await page.getByRole("button", { name: "설정 지우기", exact: true }).click();
  await page.getByText("설정을 지우지 못했어요.", { exact: true }).waitFor();
  assert.equal(await monday.getAttribute("aria-pressed"), "true");
  await page.unroute(clearUrl);
  await page.getByRole("button", { name: "설정 지우기", exact: true }).click();
  await page.getByText("가능한 시간 설정을 지웠어요.", { exact: true }).waitFor();
  assert.equal(await save.isDisabled(), true);
  const readUrl = "**/rest/v1/rpc/my_meet_window";
  await page.route(readUrl, fail);
  await page.reload();
  await page
    .getByRole("alert")
    .getByText("저장된 시간을 확인하지 못했습니다.", { exact: true })
    .waitFor();
  await page.unroute(readUrl);
  await page.getByRole("button", { name: "다시 불러오기", exact: true }).click();
  await monday.waitFor();

  await page.setViewportSize({ width: 1440, height: 1000 });
  for (const route of ["store", "orders", "availability"]) {
    await page.goto(`${baseUrl}/${route}`);
    if (route === "store") await pay.waitFor();
    if (route === "orders")
      await page.getByText("유료 결제 내역이 없습니다.", { exact: true }).waitFor();
    if (route === "availability") await monday.waitFor();
    await capture(`ticket-${route}-desktop`);
  }
  await page.setViewportSize({ width: 390, height: 844 });
  await page.emulateMedia({ colorScheme: "dark", reducedMotion: "reduce" });
  for (const route of ["store", "orders", "availability"]) {
    await page.goto(`${baseUrl}/${route}`);
    if (route === "store") await pay.waitFor();
    if (route === "orders")
      await page.getByText("유료 결제 내역이 없습니다.", { exact: true }).waitFor();
    if (route === "availability") await monday.waitFor();
    await capture(`ticket-${route}-dark`);
  }
  await page.emulateMedia({ colorScheme: "light", reducedMotion: "no-preference" });
  await page.goto(`${baseUrl}/home`);
  await page.getByRole("link", { name: "소개 열어보기", exact: true }).waitFor();
}
