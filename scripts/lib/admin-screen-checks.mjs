import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { join } from "node:path";
import { setTimeout as delay } from "node:timers/promises";

export async function checkAdminScreens({ page, baseUrl, checkPage, screenshotDir, male, female }) {
  const rpc = (name) => "**/rest/v1/rpc/" + name;
  const unavailable = (route) =>
    route.fulfill({ status: 503, json: { message: "Synthetic outage" } });
  const capture = async (name) => {
    await page.bringToFront();
    await page.mouse.move(0, 0);
    await page.locator("[data-sonner-toast]").last().waitFor({ state: "hidden" });
    await page.getByRole("main").evaluate((main) => main.scrollTo(0, 0));
    await checkPage(page, name);
    if (screenshotDir) await page.screenshot({ path: join(screenshotDir, name + ".png") });
  };
  await page.route(rpc("is_admin"), unavailable);
  await page.reload();
  await page
    .getByRole("alert")
    .getByText("운영 권한을 확인하지 못했어요.", { exact: true })
    .waitFor();
  assert.equal(
    await page.getByRole("heading", { name: "오늘, 먼저 볼 것", exact: true }).count(),
    0,
  );
  await page.unroute(rpc("is_admin"));
  await page.getByRole("button", { name: "다시 확인하기", exact: true }).click();
  await page.getByRole("heading", { name: "오늘, 먼저 볼 것", exact: true }).waitFor();
  await page.getByText("전체 작업함", { exact: true }).waitFor();
  const summary = page.getByLabel("운영 작업 요약", { exact: true });
  await page.waitForFunction(
    () => !document.querySelector('[aria-label="운영 작업 요약"]')?.textContent.includes("—"),
  );
  const before = await summary.innerText();
  await capture("admin-dashboard-desktop");
  await page.route(rpc("admin_ops_overview"), unavailable);
  await page.getByRole("button", { name: "새로고침", exact: true }).click();
  await page
    .getByRole("alert")
    .getByText(/작업 현황을 확인하지 못했습니다/)
    .waitFor();
  assert.equal(
    await summary.innerText(),
    before,
    "dashboard refresh failure retains the last values",
  );
  await page.unroute(rpc("admin_ops_overview"));
  await page.getByRole("button", { name: "새로고침", exact: true }).click();
  await page.getByRole("alert").waitFor({ state: "hidden" });
  await page.setViewportSize({ width: 390, height: 844 });
  await capture("admin-dashboard-mobile");
  const more = page.getByRole("button", { name: "더보기", exact: true });
  await more.click();
  await page.getByRole("menu").waitFor();
  await checkPage(page, "admin menu mobile");
  await page.keyboard.press("Escape");
  await page.waitForFunction(
    () => document.activeElement?.textContent?.trim() === "더보기",
    undefined,
    { timeout: 5000 },
  );
  assert.equal(await more.evaluate((button) => button === document.activeElement), true);
  await page.setViewportSize({ width: 320, height: 480 });
  await checkPage(page, "compact admin dashboard");
  const targets = await page
    .getByRole("navigation", { name: "운영 메뉴" })
    .getByRole("link")
    .evaluateAll((links) =>
      links.map((link) => ({
        width: link.getBoundingClientRect().width,
        height: link.getBoundingClientRect().height,
      })),
    );
  assert.ok(targets.every((target) => target.width >= 44 && target.height >= 44));
  await page.setViewportSize({ width: 390, height: 844 });

  await page.goto(baseUrl + "/admin/members");
  const search = page.getByRole("textbox", {
    name: "회원 검색 — 이메일은 주소에 남기지 않습니다",
    exact: true,
  });
  const read = page.waitForResponse(
    (response) =>
      response.url().endsWith("/rpc/admin_members") &&
      response.request().postDataJSON().p_query === male.email,
  );
  await search.fill(male.email);
  const data = await (await read).json();
  const row = data.find((item) => item.id === male.id);
  assert.ok(row);
  const memberLink = page
    .getByRole("list", { name: "회원 목록", exact: true })
    .locator(`a[href*="${male.id}"]`);
  await memberLink.waitFor();
  await page.getByLabel("성별", { exact: true }).selectOption("male");
  await memberLink.waitFor();
  assert.equal(decodeURIComponent(page.url()).includes(male.email), false);
  await capture("admin-members-mobile");
  await memberLink.click();
  await page.getByRole("heading", { level: 1, name: male.name, exact: true }).waitFor();
  assert.equal(new URL(page.url()).searchParams.get("gender"), "male");
  await capture("admin-member-mobile");
  await page.getByRole("link", { name: "회원 목록", exact: true }).click();
  await memberLink.waitFor();
  assert.equal(
    await search.inputValue(),
    male.email,
    "private search survives member detail round trips without URL persistence",
  );
  await page.setViewportSize({ width: 1440, height: 900 });
  await capture("admin-members-desktop");
  await page
    .getByRole("region", { name: "회원 목록 표", exact: true })
    .locator(`a[href*="${male.id}"]`)
    .click();
  await page.getByRole("heading", { level: 1, name: male.name, exact: true }).waitFor();
  await capture("admin-member-desktop");
  await page.getByRole("link", { name: "회원 목록", exact: true }).click();
  await page
    .getByRole("region", { name: "회원 목록 표", exact: true })
    .locator(`a[href*="${male.id}"]`)
    .waitFor();
  await page.route(rpc("admin_members"), unavailable);
  await page.getByRole("button", { name: "새로고침", exact: true }).click();
  await page
    .getByRole("alert")
    .getByText(/이전 조회 결과/)
    .waitFor();
  await page
    .getByRole("region", { name: "회원 목록 표", exact: true })
    .locator(`a[href*="${male.id}"]`)
    .waitFor();
  await page.unroute(rpc("admin_members"));
  await page.getByRole("button", { name: "다시 불러오기", exact: true }).click();
  await page.getByRole("alert").waitFor({ state: "hidden" });

  let started, finished;
  const slowStarted = new Promise((resolve) => {
    started = resolve;
  });
  const slowFinished = new Promise((resolve) => {
    finished = resolve;
  });
  const routeErrors = [];
  await page.route(rpc("admin_members"), async (route) => {
    try {
      if (route.request().postDataJSON().p_query === "느림") {
        started();
        await delay(1000);
        await route.fulfill({ json: [row] });
        finished();
      } else await route.fulfill({ json: [] });
    } catch (error) {
      routeErrors.push(error.message);
      finished();
    }
  });
  await search.fill("느림");
  await slowStarted;
  await search.fill("빠름");
  await page.getByText("조건에 맞는 회원이 없습니다.", { exact: true }).waitFor();
  await slowFinished;
  await page.getByText("조건에 맞는 회원이 없습니다.", { exact: true }).waitFor();
  assert.equal(await page.getByRole("region", { name: "회원 목록 표", exact: true }).count(), 0);
  assert.deepEqual(routeErrors, []);
  await page.unroute(rpc("admin_members"));

  const target = {
    id: male.id,
    name: male.name,
    hub_id: "gangnam",
    receiving: true,
    photo_url: null,
    has_open_intro: false,
    pool_count: 1,
    queued_count: 0,
    delivered_count: 0,
    blocked_count: 0,
    oldest_like_hours: 120,
  };
  const candidate = {
    id: female.id,
    name: female.name,
    hub_id: "gangnam",
    photo_url: null,
    photo_paths: [],
    birth: "1993-05-12",
    job: "제품 기획자",
    mbti: "ENFP",
    smoking: null,
    drinking: null,
    religion: null,
    headline: "서로의 하루가 궁금한 사람이에요.",
    intro: "동네를 걸으며 하루를 정리하고 편안한 대화를 나누는 시간을 좋아해요.",
    interests: ["산책"],
    topics: [],
    match_tags: [],
    details: {},
    waiting_hours: 120,
  };
  let saved = [];
  let targetFails = true,
    poolFails = true;
  let writes = 0;
  await page.route(rpc("admin_curation_targets"), (route) =>
    targetFails
      ? unavailable(route)
      : route.fulfill({
          json: [
            ...Array.from({ length: 15 }, (_, i) => ({
              ...target,
              id: randomUUID(),
              name: `검토 대상 ${i + 1}`,
            })),
            target,
          ],
        }),
  );
  await page.route(rpc("admin_like_pool"), (route) =>
    poolFails ? unavailable(route) : route.fulfill({ json: [candidate] }),
  );
  await page.route(rpc("admin_queue"), (route) => route.fulfill({ json: saved }));
  await page.route(rpc("admin_curation_recommendations"), (route) =>
    route.fulfill({
      json: { items: [{ female_id: female.id, preference_dimensions: 1 }], batch: null },
    }),
  );
  await page.route(rpc("admin_meet_windows"), (route) => route.fulfill({ json: [] }));
  await page.route(rpc("admin_set_queue"), async (route) => {
    writes += 1;
    const body = route.request().postDataJSON();
    assert.equal(body.p_male, male.id);
    assert.deepEqual(body.p_female_ids, [female.id]);
    await delay(350);
    if (writes === 1) return unavailable(route);
    saved = [
      { ...candidate, female_id: female.id, delivered_at: null, expires_at: null, reason: null },
    ];
    await route.fulfill({ json: 1 });
  });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(baseUrl + "/admin/curation");
  await page
    .getByRole("alert")
    .getByText("작업 대상을 불러오지 못했어요.", { exact: true })
    .waitFor();
  targetFails = false;
  await page.getByRole("button", { name: "다시 불러오기", exact: true }).click();
  const select = page.locator(`button[data-target-id="${male.id}"]`);
  await select.click();
  await page
    .getByRole("alert")
    .getByText("후보와 큐를 불러오지 못했어요.", { exact: true })
    .waitFor();
  poolFails = false;
  await page.getByRole("button", { name: "다시 불러오기", exact: true }).click();
  const preview = page.getByRole("button", { name: female.name + " 프로필 보기", exact: true });
  await preview.waitFor();
  assert.equal(
    await page.getByRole("region", { name: "매칭 작업 대상", exact: true }).isVisible(),
    false,
  );
  await capture("admin-curation-mobile");
  await preview.click();
  const panel = page.getByRole("complementary", { name: "후보 프로필 검토", exact: true });
  await panel.getByText(candidate.headline, { exact: true }).waitFor();
  assert.equal(
    await page.getByRole("button", { name: "큐에 추가", exact: true }).isVisible(),
    false,
  );
  await capture("admin-curation-preview-mobile");
  await panel.getByRole("button", { name: "닫기", exact: true }).click();
  await page.waitForFunction(
    (name) => document.activeElement?.getAttribute("aria-label") === name + " 프로필 보기",
    female.name,
    { timeout: 5000 },
  );
  assert.equal(await preview.evaluate((button) => button === document.activeElement), true);
  await page.getByRole("button", { name: "큐에 추가", exact: true }).click();
  await page.getByRole("button", { name: "작업 대상 목록으로", exact: true }).click();
  const dialog = page.getByRole("alertdialog");
  await dialog
    .getByRole("heading", { name: "저장하지 않은 큐 변경이 있어요", exact: true })
    .waitFor();
  await checkPage(page, "curation unsaved navigation guard");
  await dialog.getByRole("button", { name: "계속 검토하기", exact: true }).click();
  await page.waitForFunction(
    (id) => document.activeElement?.id === "curation-heading-" + id,
    male.id,
    { timeout: 5000 },
  );
  assert.equal(new URL(page.url()).searchParams.get("male"), male.id);
  const save = page.getByRole("button", { name: "큐 저장", exact: true });
  await save.click();
  await page.getByRole("alert").getByText("처리 사유를 입력해 주세요.", { exact: true }).waitFor();
  assert.equal(writes, 0);
  await page
    .getByRole("textbox", { name: "사유", exact: true })
    .fill("합성 QA: 의사와 프로필 검토");
  await save.dblclick();
  await page.getByText("처리하지 못했습니다.", { exact: true }).waitFor();
  assert.equal(writes, 1);
  assert.equal(
    await page.getByRole("textbox", { name: "사유", exact: true }).inputValue(),
    "합성 QA: 의사와 프로필 검토",
  );
  await save.click();
  await page.getByText("큐를 저장했습니다.", { exact: true }).waitFor();
  assert.equal(writes, 2);
  await page.getByRole("button", { name: "작업 대상 목록으로", exact: true }).click();
  await select.waitFor();
  await page.waitForFunction(
    (id) => document.activeElement?.getAttribute("data-target-id") === id,
    male.id,
    { timeout: 5000 },
  );
  assert.equal(await select.evaluate((button) => button === document.activeElement), true);
  await select.click();
  await page
    .locator("ol")
    .getByRole("button", { name: new RegExp(female.name) })
    .waitFor();
  await page.setViewportSize({ width: 1440, height: 900 });
  await capture("admin-curation-desktop");
  await page
    .locator("ol")
    .getByRole("button", { name: new RegExp(female.name) })
    .click();
  await panel.getByText(candidate.headline, { exact: true }).waitFor();
  assert.equal(
    await page.getByRole("region", { name: "매칭 작업 대상", exact: true }).isVisible(),
    true,
  );
  await capture("admin-curation-preview-desktop");
  await panel.getByRole("button", { name: "닫기", exact: true }).click();

  const meeting = {
    id: randomUUID(),
    male_id: male.id,
    female_id: female.id,
    male_name: male.name,
    female_name: female.name,
    created_at: new Date().toISOString(),
    cancelled_at: null,
    completed_at: null,
    confirmed_at: null,
    scheduled_at: null,
    prefs_submitted_at: null,
    proposed_slots: null,
    response_due_at: new Date(Date.now() + 3600000).toISOString(),
    place_name: null,
    ticket_state: "used",
    cancel_reason: null,
  };
  let meetings = [meeting],
    cancels = 0;
  await page.route(rpc("admin_meetings_v2"), (route) => route.fulfill({ json: meetings }));
  await page.route(rpc("admin_cancel_meeting"), async (route) => {
    cancels += 1;
    const body = route.request().postDataJSON();
    assert.equal(body.p_meeting, meeting.id);
    assert.equal(body.p_refund, true);
    await delay(350);
    if (cancels === 1) return unavailable(route);
    meetings = [
      {
        ...meeting,
        cancelled_at: new Date().toISOString(),
        cancel_reason: "합성 QA",
        ticket_state: "refunded",
      },
    ];
    await route.fulfill({ json: null });
  });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(baseUrl + "/admin/meetings?state=active");
  await page
    .getByRole("list", { name: "만남 목록", exact: true })
    .getByText("여성 응답 임박", { exact: true })
    .waitFor();
  await capture("admin-meetings-mobile");
  await page.getByRole("button", { name: "취소하기", exact: true }).click();
  await dialog.getByRole("heading", { name: "만남 취소", exact: true }).waitFor();
  await checkPage(page, "meeting cancellation guard");
  await dialog.getByRole("button", { name: "돌아가기", exact: true }).click();
  await page.waitForFunction(() => document.activeElement?.textContent === "취소하기", undefined, {
    timeout: 5000,
  });
  assert.equal(cancels, 0);
  await page.getByRole("button", { name: "취소하기", exact: true }).click();
  await dialog.getByRole("textbox", { name: "사유", exact: true }).fill("합성 QA");
  await dialog.getByRole("button", { name: "만남 강제 취소", exact: true }).dblclick();
  await page.getByText("처리하지 못했습니다.", { exact: true }).waitFor();
  assert.equal(cancels, 1);
  await dialog.getByRole("button", { name: "만남 강제 취소", exact: true }).click();
  await dialog.waitFor({ state: "hidden" });
  assert.equal(cancels, 2);
  await page
    .getByRole("list", { name: "만남 목록", exact: true })
    .getByText("반환", { exact: true })
    .waitFor();
  await page.setViewportSize({ width: 1440, height: 900 });
  await capture("admin-meetings-desktop");
  await page.emulateMedia({ colorScheme: "dark", reducedMotion: "reduce" });
  for (const path of [
    "/admin",
    "/admin/members?gender=male",
    "/admin/curation?male=" + male.id,
    "/admin/meetings?state=active",
  ]) {
    await page.goto(baseUrl + path);
    await page.getByRole("heading", { level: 1 }).waitFor();
    await checkPage(page, "dark desktop " + path);
    await page.setViewportSize({ width: 320, height: 480 });
    await checkPage(page, "dark compact " + path);
    await page.setViewportSize({ width: 1440, height: 900 });
  }
  await page.emulateMedia({ colorScheme: "light", reducedMotion: "no-preference" });
  for (const name of [
    "admin_curation_targets",
    "admin_like_pool",
    "admin_queue",
    "admin_curation_recommendations",
    "admin_meet_windows",
    "admin_set_queue",
    "admin_meetings_v2",
    "admin_cancel_meeting",
  ])
    await page.unroute(rpc(name));
  await page.goto(baseUrl + "/admin");
}
