import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { join } from "node:path";

// These fixtures never load a PG script, approve a charge, or cancel a payment.
export async function checkPaymentScreens({ page, baseUrl, checkPage, screenshotDir, userId }) {
  const ordersUrl = "**/rest/v1/ticket_orders?*";
  const confirmUrl = "**/functions/v1/confirm-ticket-payment";
  const pending = {
    order_id: randomUUID(),
    user_id: userId,
    kind: "meeting",
    quantity: 1,
    amount: 30000,
    state: "pending",
    payment_required: true,
    payment_key: null,
    payment_attention: null,
    created_at: new Date().toISOString(),
  };
  let current = { ...pending };
  let readFails = true;
  let confirmations = 0;
  let createCalls = 0;
  let providerRequests = 0;
  const providerGuard = async (route) => {
    providerRequests += 1;
    await route.abort();
  };
  await page.route(/https:\/\/[^/]*tosspayments\.com\//, providerGuard);
  await page.route("**/rest/v1/rpc/create_ticket_order", async (route) => {
    createCalls += 1;
    await route.fulfill({ status: 503, json: { message: "Unexpected creation in result flow" } });
  });
  await page.route(ordersUrl, async (route) => {
    if (readFails)
      return route.fulfill({ status: 503, json: { message: "Synthetic read failure" } });
    await route.fulfill({ json: current });
  });
  await page.addInitScript(() => {
    window.TossPayments = () => ({
      widgets: () => {
        let amount;
        const record = (key) => {
          const next = Number(sessionStorage.getItem(key) || 0) + 1;
          sessionStorage.setItem(key, String(next));
        };
        return {
          setAmount: async (value) => {
            amount = value.value;
          },
          renderPaymentMethods: async ({ selector }) => {
            document.querySelector(selector).innerHTML =
              '<p class="text-sm text-muted-foreground">QA 결제 대역 · 실제 청구 없음</p><label class="mt-3 flex min-h-12 items-center gap-3 rounded-control border border-border p-3 text-sm"><input type="radio" name="fixture-card" checked />테스트 카드</label>';
            return {
              destroy: async () => {
                record("fixtureMethodDestroyed");
                document.querySelector(selector)?.replaceChildren();
              },
            };
          },
          renderAgreement: async ({ selector }) => {
            if (sessionStorage.getItem("fixtureWidgetFail") === "yes") {
              sessionStorage.removeItem("fixtureWidgetFail");
              throw new Error("Synthetic agreement load failure");
            }
            document.querySelector(selector).innerHTML =
              '<label class="flex min-h-12 items-center gap-3 text-sm"><input type="checkbox" checked />QA 테스트 결제 약관</label>';
            return {
              destroy: async () => {
                document.querySelector(selector)?.replaceChildren();
              },
            };
          },
          requestPayment: async (options) => {
            record("fixturePaymentCalls");
            window.fixtureLastPayment = { ...options, amount };
            if (window.fixturePaymentMode === "redirect-pending") return;
            if (window.fixturePaymentMode === "hold") {
              await new Promise((_, reject) => {
                window.fixtureReject = reject;
              });
            }
            throw { code: window.fixturePaymentMode || "USER_CANCEL" };
          },
        };
      },
    });
  });
  const capture = async (name) => {
    await page.bringToFront();
    await page.mouse.move(0, 0);
    await page.getByRole("main").evaluate((main) => main.scrollTo(0, 0));
    await checkPage(page, name);
    if (screenshotDir) await page.screenshot({ path: join(screenshotDir, name + ".png") });
  };
  const checkout = () => page.goto(`${baseUrl}/checkout?orderId=${pending.order_id}`);
  await checkout();
  await page.getByRole("heading", { name: "주문을 불러오지 못했어요", exact: true }).waitFor();
  await checkPage(page, "checkout order read error");
  readFails = false;
  await page.evaluate(() => sessionStorage.setItem("fixtureWidgetFail", "yes"));
  await page.getByRole("button", { name: "다시 불러오기", exact: true }).click();
  await page
    .getByRole("alert")
    .getByText(/결제 수단을 불러오지 못했어요/)
    .waitFor();
  const pay = page.getByRole("button", { name: "30,000원 결제하기", exact: true });
  assert.equal(await pay.isDisabled(), true);
  assert.equal(await page.evaluate(() => sessionStorage.getItem("fixtureMethodDestroyed")), "1");
  await page.getByRole("button", { name: "다시 불러오기", exact: true }).click();
  await pay.waitFor({ state: "visible" });
  await page.waitForFunction(
    () =>
      ![...document.querySelectorAll("button")].find((b) => b.textContent === "30,000원 결제하기")
        ?.disabled,
  );
  await capture("payment-checkout-mobile");
  await page.setViewportSize({ width: 320, height: 480 });
  assert.ok(await pay.evaluate((button) => button.getBoundingClientRect().bottom <= innerHeight));
  await checkPage(page, "compact checkout");
  await page.setViewportSize({ width: 390, height: 844 });
  for (const [code, text] of [
    ["NEED_CARD_PAYMENT_DETAIL", "카드사를 선택한 뒤 다시 결제해 주세요."],
    ["USER_CANCEL", "결제창을 닫았어요. 준비되면 다시 이어갈 수 있어요."],
    ["UNKNOWN", "결제창을 열지 못했습니다. 다시 시도해 주세요."],
  ]) {
    await page.evaluate((mode) => {
      window.fixturePaymentMode = mode;
    }, code);
    await pay.click();
    await page.getByRole("alert").getByText(text, { exact: true }).waitFor();
    assert.equal(await pay.isEnabled(), true);
  }
  await page.evaluate(() => {
    window.fixturePaymentMode = "hold";
  });
  const before = Number(await page.evaluate(() => sessionStorage.getItem("fixturePaymentCalls")));
  await pay.dblclick();
  await page.getByRole("button", { name: "결제창을 여는 중…", exact: true }).waitFor();
  assert.equal(
    Number(await page.evaluate(() => sessionStorage.getItem("fixturePaymentCalls"))),
    before + 1,
  );
  const request = await page.evaluate(() => window.fixtureLastPayment);
  assert.equal(request.amount, pending.amount);
  assert.equal(request.orderId, pending.order_id);
  assert.equal(new URL(request.failUrl).searchParams.get("orderId"), pending.order_id);
  await page.evaluate(() => window.fixtureReject({ code: "USER_CANCEL" }));
  await pay.waitFor();
  await page.evaluate(() => {
    window.fixturePaymentMode = "redirect-pending";
  });
  await pay.click();
  await page.getByRole("button", { name: "결제창을 여는 중…", exact: true }).waitFor();
  assert.equal(
    await page.getByRole("button", { name: "결제창을 여는 중…", exact: true }).isDisabled(),
    true,
    "a fulfilled redirect request stays locked until navigation",
  );

  await page.goto(`${baseUrl}/payment/fail?code=USER_CANCEL&orderId=${pending.order_id}`);
  await page.getByRole("link", { name: "결제 이어하기", exact: true }).waitFor();
  await capture("payment-cancel-mobile");
  await page.getByRole("link", { name: "결제 이어하기", exact: true }).click();
  await pay.waitFor();
  assert.equal(new URL(page.url()).searchParams.get("orderId"), pending.order_id);

  let holdConfirmation;
  let release;
  await page.route(confirmUrl, async (route) => {
    confirmations += 1;
    const body = route.request().postDataJSON();
    assert.equal(body.orderId, pending.order_id);
    assert.equal(body.amount, pending.amount);
    if (confirmations === 1)
      return route.fulfill({ status: 503, json: { message: "Synthetic lost approval" } });
    await holdConfirmation;
    current = { ...pending, state: "confirmed", payment_key: "fixture_payment_key" };
    await route.fulfill({ json: { confirmed: true } });
  });
  await page.goto(
    `${baseUrl}/payment/success?orderId=${pending.order_id}&amount=30000&paymentKey=fixture_payment_key`,
  );
  await page.getByRole("heading", { name: "결제 확인이 지연되고 있습니다", exact: true }).waitFor();
  assert.equal(confirmations, 1);
  await capture("payment-delayed-mobile");
  assert.equal(await page.getByRole("link", { name: "결제 이어하기", exact: true }).count(), 0);
  holdConfirmation = new Promise((resolve) => {
    release = resolve;
  });
  await page.getByRole("button", { name: "다시 확인하기", exact: true }).dblclick();
  await page.getByRole("button", { name: "결제를 확인하는 중…", exact: true }).waitFor();
  await page.waitForFunction(() => !!document.querySelector('[role="status"]'));
  release();
  await page.getByRole("heading", { name: "결제가 완료되었습니다", exact: true }).waitFor();
  assert.equal(confirmations, 2);
  assert.equal(new URL(page.url()).searchParams.has("paymentKey"), false);
  assert.equal(new URL(page.url()).searchParams.has("amount"), false);
  assert.equal(await page.getByRole("heading", { level: 1 }).count(), 1);
  await capture("payment-success-mobile");
  await page.reload();
  await page.getByRole("heading", { name: "결제가 완료되었습니다", exact: true }).waitFor();
  assert.equal(confirmations, 2, "refresh reads the settled order without approving again");

  await page.goto(`${baseUrl}/payment/fail?code=CARD_ERROR&orderId=${pending.order_id}`);
  await page.getByRole("heading", { name: "이미 결제가 완료된 주문입니다", exact: true }).waitFor();
  assert.equal(await page.getByRole("link", { name: "결제 이어하기", exact: true }).count(), 0);
  current = { ...pending, payment_attention: "confirm_unknown" };
  await checkout();
  await page.getByRole("heading", { name: "결제 상태를 확인해 주세요", exact: true }).waitFor();
  assert.equal(await pay.count(), 0, "an ambiguous charge cannot open another payment");
  await page.goto(`${baseUrl}/payment/fail?code=CARD_ERROR&orderId=${pending.order_id}`);
  await page.getByText(/결제 상태 확인이 필요해요/).waitFor();
  assert.equal(await page.getByRole("link", { name: "결제 이어하기", exact: true }).count(), 0);

  current = { ...pending };
  await page.goto(
    `${baseUrl}/payment/success?orderId=${pending.order_id}&amount=1&paymentKey=fixture_payment_key`,
  );
  await page.getByRole("heading", { name: "결제할 주문을 확인해 주세요", exact: true }).waitFor();
  assert.equal(confirmations, 2, "tampered amount never reaches approval");
  current = { ...pending, user_id: randomUUID() };
  await checkout();
  await page.getByRole("heading", { name: "주문을 불러오지 못했어요", exact: true }).waitFor();
  await page.goto(
    `${baseUrl}/payment/success?orderId=${pending.order_id}&amount=30000&paymentKey=fixture_payment_key`,
  );
  await page.getByRole("heading", { name: "결제할 주문을 확인해 주세요", exact: true }).waitFor();
  assert.equal(confirmations, 2, "another actor's order never reaches approval");
  current = { ...pending, state: "canceled" };
  await checkout();
  await page
    .getByRole("heading", { name: "이 주문은 결제를 진행할 수 없어요", exact: true })
    .waitFor();
  await page.goto(`${baseUrl}/payment/success`);
  await page.getByRole("heading", { name: "결제할 주문을 확인해 주세요", exact: true }).waitFor();
  assert.equal(await page.getByRole("button", { name: "다시 확인하기", exact: true }).count(), 0);
  await page.getByRole("link", { name: "결제 내역 보기", exact: true }).waitFor();
  await page.goto(`${baseUrl}/payment/fail?code=CARD_ERROR`);
  await page.getByRole("heading", { name: "결제를 완료하지 못했습니다", exact: true }).waitFor();
  await capture("payment-fail-mobile");

  for (const dark of [false, true]) {
    await page.emulateMedia({ colorScheme: dark ? "dark" : "light", reducedMotion: "reduce" });
    for (const path of [
      `/checkout?orderId=${pending.order_id}`,
      `/payment/success?orderId=${pending.order_id}`,
      `/payment/fail?code=CARD_ERROR&orderId=${pending.order_id}`,
    ]) {
      current = path.includes("success")
        ? { ...pending, state: "confirmed", payment_key: "fixture_payment_key" }
        : { ...pending };
      await page.goto(baseUrl + path);
      if (path.includes("checkout")) await pay.waitFor();
      else if (path.includes("success"))
        await page.getByRole("heading", { name: "결제가 완료되었습니다", exact: true }).waitFor();
      else await page.getByRole("link", { name: "결제 이어하기", exact: true }).waitFor();
      await capture(`payment-${path.split("?")[0].split("/").pop()}-${dark ? "dark" : "light"}`);
      await page.setViewportSize({ width: 1440, height: 1000 });
      await checkPage(page, "desktop " + path);
      if (screenshotDir && !dark)
        await page.screenshot({
          path: join(screenshotDir, `payment-${path.split("?")[0].split("/").pop()}-desktop.png`),
        });
      await page.setViewportSize({ width: 320, height: 480 });
      await checkPage(page, "compact " + path);
      await page.setViewportSize({ width: 390, height: 844 });
    }
  }
  assert.equal(confirmations, 2);
  assert.equal(createCalls, 0, "payment recovery never creates an order");
  assert.equal(providerRequests, 0, "no real PG network traffic");
  await page.emulateMedia({ colorScheme: "light", reducedMotion: "no-preference" });
  await page.unroute(ordersUrl);
  await page.unroute(confirmUrl);
  await page.unroute("**/rest/v1/rpc/create_ticket_order");
  await page.unroute(/https:\/\/[^/]*tosspayments\.com\//, providerGuard);
  await page.goto(baseUrl + "/home");
}
