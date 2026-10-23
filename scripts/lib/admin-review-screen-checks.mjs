import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { join } from "node:path";
import { setTimeout as delay } from "node:timers/promises";

// Read real local-only synthetic photos; all moderation and reply mutations below
// are scoped fixtures. The SQL suite separately checks the actual snapshot RPC.
export async function checkAdminReviewScreens({
  page,
  baseUrl,
  checkPage,
  screenshotDir,
  male,
  female,
}) {
  const rpc = (name) => "**/rest/v1/rpc/" + name;
  const outage = (route) => route.fulfill({ status: 503, json: { message: "Synthetic outage" } });
  const capture = async (name) => {
    await page.bringToFront();
    await page.mouse.move(0, 0);
    await page.locator("[data-sonner-toast]").last().waitFor({ state: "hidden" });
    if (await page.getByRole("main").count())
      await page.getByRole("main").evaluate((main) => main.scrollTo(0, 0));
    await checkPage(page, name);
    if (screenshotDir) await page.screenshot({ path: join(screenshotDir, name + ".png") });
    if (name.endsWith("mobile")) {
      await page.setViewportSize({ width: 320, height: 480 });
      await page.emulateMedia({ colorScheme: "dark", reducedMotion: "reduce" });
      await checkPage(page, `compact dark populated ${name}`);
      await page.emulateMedia({ colorScheme: "light", reducedMotion: "no-preference" });
      await page.setViewportSize({ width: 390, height: 844 });
    }
  };
  await page.setViewportSize({ width: 1440, height: 900 });
  const actual = {
    id: male.id,
    name: male.name,
    photo_paths: male.photoPaths,
    photo_url: male.photoPaths[0],
    gender: "male",
    hub_id: "gangnam",
    account_state: "active",
    onboarding_step: 7,
    updated_at: new Date().toISOString(),
    reject_reason: null,
  };
  assert.ok(actual?.photo_paths.length >= 3, "synthetic photo fixture has a whole set");
  let photoState = "pending";
  await page.route(rpc("admin_photo_queue"), (route) =>
    route.fulfill({ json: [{ ...actual, photo_state: photoState }] }),
  );
  await page.goto(baseUrl + "/admin/photos");
  const photos = page.getByRole("list", { name: "사진 검수 목록" });
  await photos.getByRole("button", { name: "승인", exact: true }).waitFor();
  await page.waitForFunction(() =>
    [...document.querySelectorAll("main img")].every(
      (image) => image.complete && image.naturalWidth > 0,
    ),
  );
  await capture("admin-photos-desktop");
  await page.setViewportSize({ width: 390, height: 844 });
  await capture("admin-photos-mobile");
  const enlarge = photos.getByRole("button", { name: `${male.name} 1번 사진 확대`, exact: true });
  await enlarge.click();
  await page.getByRole("dialog").getByRole("heading", { name: /1\/3/ }).waitFor();
  await page.getByRole("button", { name: "다음 사진", exact: true }).click();
  await page.getByRole("dialog").getByRole("heading", { name: /2\/3/ }).waitFor();
  await capture("admin-photo-original-mobile");
  await page.keyboard.press("Escape");
  await page.waitForFunction(
    (label) => document.activeElement?.getAttribute("aria-label") === label,
    `${male.name} 1번 사진 확대`,
  );
  await photos.getByRole("button", { name: "반려", exact: true }).click();
  await photos.getByRole("alert").waitFor();
  const photoNote = photos.getByLabel("반려 사유", { exact: true });
  await photoNote.fill("3번 사진을 밝은 사진으로 바꿔 주세요.");
  await photos.getByRole("button", { name: "반려", exact: true }).click();
  const confirm = page.getByRole("alertdialog");
  await confirm.getByText("3번 사진을 밝은 사진으로 바꿔 주세요.", { exact: true }).waitFor();
  let photoCalls = 0;
  await page.route(rpc("admin_review_photo_set"), async (route) => {
    photoCalls += 1;
    const args = route.request().postDataJSON();
    assert.equal(args.p_user, male.id);
    assert.deepEqual(args.p_expected_paths, actual.photo_paths);
    assert.equal(args.p_expected_state, photoState);
    assert.equal(args.p_expected_updated_at, actual.updated_at);
    await delay(180);
    if (photoCalls === 1) return outage(route);
    photoState = "rejected";
    return route.fulfill({ status: 204, body: "" });
  });
  await confirm.getByRole("button", { name: "돌아가기", exact: true }).click();
  assert.equal(photoCalls, 0, "cancelled photo confirmation never mutates");
  await photos.getByRole("button", { name: "반려", exact: true }).click();
  await confirm.getByRole("button", { name: "확인하고 처리", exact: true }).dblclick();
  await page
    .getByText("처리하지 못했습니다. 입력한 사유는 유지했습니다.", { exact: true })
    .waitFor();
  assert.equal(photoCalls, 1, "photo double-click submits once");
  await confirm.getByRole("button", { name: "돌아가기", exact: true }).click();
  assert.equal(await photoNote.inputValue(), "3번 사진을 밝은 사진으로 바꿔 주세요.");
  await photos.getByRole("button", { name: "반려", exact: true }).click();
  await confirm.getByRole("button", { name: "확인하고 처리", exact: true }).click();
  await confirm.waitFor({ state: "hidden" });
  assert.equal(photoCalls, 2);
  await page.unroute(rpc("admin_review_photo_set"));
  photoState = "approved";
  await page.goto(baseUrl + "/admin/photos?state=approved");
  await photos.getByRole("button", { name: "승인 취소", exact: true }).click();
  await photos.getByRole("alert").waitFor();
  await photos.getByLabel("승인 취소 사유", { exact: true }).fill("바뀐 묶음을 검토하는 합성 사례");
  await photos.getByRole("button", { name: "승인 취소", exact: true }).click();
  let staleCalls = 0;
  await page.route(rpc("admin_review_photo_set"), (route) => {
    staleCalls += 1;
    assert.equal(route.request().postDataJSON().p_expected_state, "approved");
    photoState = "pending";
    return route.fulfill({ status: 409, json: { code: "PT409", message: "photo changed" } });
  });
  await confirm.getByRole("button", { name: "확인하고 처리", exact: true }).click();
  await confirm.waitFor({ state: "hidden" });
  await photos.getByRole("button", { name: "승인", exact: true }).waitFor();
  assert.equal(staleCalls, 1, "changed set is refreshed without retrying the stale decision");
  await page.unroute(rpc("admin_review_photo_set"));
  await page.unroute(rpc("admin_photo_queue"));

  const now = new Date().toISOString();
  const reportId = randomUUID();
  const report = {
    id: reportId,
    reporter_id: female.id,
    reporter_name: female.name,
    accused_id: male.id,
    accused_name: male.name,
    accused_state: "active",
    created_at: now,
    detail:
      "합성 신고입니다. 양쪽 기록을 확인하기 위한 긴 내용입니다.\n연락처 등 실제 회원 정보는 없습니다.",
    kind: "message",
    message_body: "합성 메시지 확인용입니다.",
    meeting_id: null,
    refundable: true,
    resolve_note: null,
    resolved_at: null,
    state: "pending",
  };
  let reportState = "pending";
  let requestedFilter;
  await page.route(rpc("admin_reports"), (route) => {
    requestedFilter = route.request().postDataJSON().p_state;
    return route.fulfill({ json: [{ ...report, state: reportState }] });
  });
  await page.goto(baseUrl + "/admin/reports");
  const reportList = page.getByRole("list", { name: "신고 목록" });
  await reportList.getByRole("button", { name: "검토하기", exact: true }).click();
  await reportList.getByRole("button", { name: "인정 · 티켓 환불", exact: true }).click();
  await reportList.getByRole("alert").waitFor();
  await reportList
    .getByRole("textbox", { name: "사유", exact: true })
    .fill("양쪽 기록을 확인한 합성 판정입니다.");
  await page.getByRole("button", { name: "노쇼 신고", exact: true }).click();
  await confirm.getByRole("heading", { name: "작성 중인 내용이 있어요", exact: true }).waitFor();
  await confirm.getByRole("button", { name: "계속 작성하기", exact: true }).click();
  assert.equal(
    await reportList.getByRole("textbox", { name: "사유", exact: true }).inputValue(),
    "양쪽 기록을 확인한 합성 판정입니다.",
  );
  await capture("admin-reports-mobile");
  await page.setViewportSize({ width: 1440, height: 900 });
  await capture("admin-reports-desktop");
  await reportList.getByRole("checkbox").check();
  await reportList.getByRole("button", { name: "인정 · 티켓 환불", exact: true }).click();
  await confirm.getByText(new RegExp(`${male.name}.*계정도 정지`)).waitFor();
  await checkPage(page, "report confirmation");
  let reportCalls = 0;
  await page.route(rpc("resolve_content_report"), async (route) => {
    reportCalls += 1;
    assert.deepEqual(route.request().postDataJSON(), {
      p_report_id: reportId,
      p_upheld: true,
      p_note: "양쪽 기록을 확인한 합성 판정입니다.",
      p_ban: true,
    });
    await delay(180);
    reportState = "confirmed";
    return route.fulfill({ status: 204, body: "" });
  });
  await confirm.getByRole("button", { name: "확인하고 처리", exact: true }).dblclick();
  await confirm.waitFor({ state: "hidden" });
  assert.equal(reportCalls, 1, "one report decision despite double click");
  await page.getByRole("button", { name: "전체", exact: true }).click();
  await page.waitForURL("**state=all*");
  await reportList.getByRole("button", { name: "처리 내역", exact: true }).waitFor();
  assert.equal(requestedFilter, undefined, "all filter sends no pending constraint");
  await page.unroute(rpc("admin_reports"));
  await page.route(rpc("admin_reports"), outage);
  await page.getByRole("button", { name: "새로고침", exact: true }).click();
  await page.getByRole("alert").getByRole("button", { name: "다시 시도", exact: true }).waitFor();
  assert.equal(
    await reportList.getByRole("button", { name: "처리 내역", exact: true }).count(),
    1,
    "failed report refresh retains last result",
  );
  await page.unroute(rpc("admin_reports"));
  await page.unroute(rpc("resolve_content_report"));

  const noShow = {
    id: randomUUID(),
    reporter_id: female.id,
    reporter_name: female.name,
    accused_id: male.id,
    accused_name: male.name,
    accused_state: "active",
    state: "pending",
    created_at: now,
    scheduled_at: now,
    confirm_by: "2020-01-01T00:00:00Z",
    place_name: "합성 카페",
    meeting_id: null,
    compensated: false,
    reporter_note: "신고자 합성 후기입니다.",
    accused_note: "피신고자 합성 후기입니다.",
    accused_admitted: false,
    responded_at: null,
    resolved_at: null,
    resolution_note: null,
  };
  await page.route(rpc("admin_no_show_reports"), (route) => route.fulfill({ json: [noShow] }));
  await page.goto(baseUrl + "/admin/reports?kind=no_show");
  await reportList.getByRole("button", { name: "검토하기", exact: true }).click();
  await reportList.getByText("신고자 합성 후기입니다.", { exact: true }).waitFor();
  await reportList.getByText("피신고자 합성 후기입니다.", { exact: true }).waitFor();
  await reportList
    .getByRole("textbox", { name: "사유", exact: true })
    .fill("양쪽 후기를 확인한 합성 노쇼 판정");
  await reportList.getByRole("button", { name: "인정 · 제명 + 보상 티켓", exact: true }).click();
  await confirm.getByText(/계정을 제명하고.*보상 티켓/).waitFor();
  await confirm.getByRole("button", { name: "돌아가기", exact: true }).click();
  await reportList.getByRole("textbox", { name: "사유", exact: true }).fill("");
  await page.setViewportSize({ width: 390, height: 844 });
  await capture("admin-noshow-mobile");
  await page.setViewportSize({ width: 1440, height: 900 });
  await capture("admin-noshow-desktop");
  noShow.state = "confirmed";
  noShow.compensated = true;
  noShow.resolution_note = "이전 판정 기록";
  await page.getByRole("button", { name: "새로고침", exact: true }).click();
  await reportList.getByText("이전 판정 기록", { exact: true }).waitFor();
  await reportList.getByRole("textbox", { name: "사유", exact: true }).fill("합성 번복 사유");
  await reportList.getByRole("button", { name: "기각으로 번복 · 제명 해제", exact: true }).click();
  await confirm.getByText(/제명을 해제합니다.*보상 티켓은 회수하지/).waitFor();
  await confirm.getByRole("button", { name: "돌아가기", exact: true }).click();
  await reportList.getByRole("textbox", { name: "사유", exact: true }).fill("");
  await page.unroute(rpc("admin_no_show_reports"));

  const inquiries = [male, female].map((person, index) => ({
    id: randomUUID(),
    user_id: person.id,
    member_name: person.name,
    category: "other",
    body: `합성 문의 ${index + 1}입니다. 실제 발송은 하지 않습니다.`,
    created_at: now,
    status: "open",
    response: null,
    responded_at: null,
  }));
  const extraInquiry = { ...inquiries[0], id: randomUUID(), body: "합성 문의 다음 페이지입니다." };
  const supportReply = (route) =>
    route.fulfill({
      json: {
        items: route.request().postDataJSON().p_before ? [inquiries[0], extraInquiry] : inquiries,
        total: inquiries.length + 1,
        next_cursor: route.request().postDataJSON().p_before
          ? null
          : { created_at: now, id: inquiries.at(-1).id },
        as_of: now,
      },
    });
  await page.route(rpc("admin_support_page"), supportReply);
  await page.goto(baseUrl + "/admin/support");
  const first = page.getByRole("article").filter({ hasText: "합성 문의 1입니다." });
  const second = page.getByRole("article").filter({ hasText: "합성 문의 2입니다." });
  await page.getByRole("button", { name: "더 보기", exact: true }).click();
  const extra = page.getByRole("article").filter({ hasText: "합성 문의 다음 페이지입니다." });
  await extra.waitFor();
  assert.equal(await page.getByRole("article").count(), 3, "cursor pages deduplicate rows");
  await extra.getByRole("button", { name: "답변하기", exact: true }).click();
  await extra.getByLabel("답변", { exact: true }).fill("다음 페이지 임시 답변");
  await page.getByRole("button", { name: "새로고침", exact: true }).click();
  await extra.waitFor({ state: "hidden" });
  await page.getByRole("button", { name: "더 보기", exact: true }).click();
  assert.equal(
    await extra.getByLabel("답변", { exact: true }).inputValue(),
    "다음 페이지 임시 답변",
    "draft survives refresh and cursor round trip",
  );
  await extra.getByLabel("답변", { exact: true }).fill("");
  await first.getByRole("button", { name: "답변하기", exact: true }).click();
  await first.getByLabel("답변", { exact: true }).fill("첫 번째 회원님께 드리는 합성 답변입니다.");
  await second.getByRole("button", { name: "답변하기", exact: true }).click();
  assert.equal(
    await second.getByLabel("답변", { exact: true }).inputValue(),
    "",
    "answer never leaks to a different recipient",
  );
  await second.getByLabel("답변", { exact: true }).fill("두 번째 회원님께 드리는 합성 답변입니다.");
  await first.getByRole("button", { name: "답변 이어 쓰기", exact: true }).click();
  assert.equal(
    await first.getByLabel("답변", { exact: true }).inputValue(),
    "첫 번째 회원님께 드리는 합성 답변입니다.",
    "each inquiry retains its own draft",
  );
  await page.unroute(rpc("admin_support_page"));
  await page.route(rpc("admin_support_page"), outage);
  await page.getByRole("button", { name: "새로고침", exact: true }).click();
  await page.getByRole("alert").getByRole("button", { name: "다시 시도", exact: true }).waitFor();
  assert.equal(
    await first.getByLabel("답변", { exact: true }).inputValue(),
    "첫 번째 회원님께 드리는 합성 답변입니다.",
    "failed refresh retains the per-recipient draft",
  );
  await page.unroute(rpc("admin_support_page"));
  await page.route(rpc("admin_support_page"), supportReply);
  await page.getByRole("alert").getByRole("button", { name: "다시 시도", exact: true }).click();
  await page.getByRole("alert").waitFor({ state: "hidden" });
  await page.getByRole("button", { name: "답변 완료", exact: true }).click();
  await confirm.getByRole("heading", { name: "작성 중인 내용이 있어요", exact: true }).waitFor();
  await confirm.getByRole("button", { name: "계속 작성하기", exact: true }).click();
  await capture("admin-support-desktop");
  await page.setViewportSize({ width: 390, height: 844 });
  await capture("admin-support-mobile");
  let replyCalls = 0;
  await page.route(rpc("respond_support_request"), async (route) => {
    replyCalls += 1;
    assert.deepEqual(route.request().postDataJSON(), {
      p_id: inquiries[0].id,
      p_response: "첫 번째 회원님께 드리는 합성 답변입니다.",
    });
    await delay(180);
    if (replyCalls === 1) return outage(route);
    inquiries.shift();
    return route.fulfill({ status: 204, body: "" });
  });
  await first.getByRole("button", { name: "답변 등록", exact: true }).dblclick();
  await first.getByRole("alert").waitFor();
  assert.equal(replyCalls, 1);
  assert.equal(
    await first.getByLabel("답변", { exact: true }).inputValue(),
    "첫 번째 회원님께 드리는 합성 답변입니다.",
  );
  await first.getByRole("button", { name: "답변 등록", exact: true }).click();
  await first.waitFor({ state: "hidden" });
  assert.equal(replyCalls, 2);
  await second.getByRole("button", { name: "답변 이어 쓰기", exact: true }).click();
  assert.equal(
    await second.getByLabel("답변", { exact: true }).inputValue(),
    "두 번째 회원님께 드리는 합성 답변입니다.",
  );
  await page.getByRole("button", { name: "답변 완료", exact: true }).click();
  await confirm.getByRole("button", { name: "내용 버리고 이동", exact: true }).click();
  await page.unroute(rpc("admin_support_page"));
  await page.unroute(rpc("respond_support_request"));

  for (const path of ["/admin/photos", "/admin/reports", "/admin/support"]) {
    await page.goto(baseUrl + path);
    await page.getByRole("heading", { level: 1 }).waitFor();
    await page.setViewportSize({ width: 320, height: 480 });
    await page.emulateMedia({ colorScheme: "dark", reducedMotion: "reduce" });
    await checkPage(page, `compact dark ${path}`);
  }
  await page.emulateMedia({ colorScheme: "light", reducedMotion: "no-preference" });
  await page.setViewportSize({ width: 1440, height: 900 });
  console.log(
    "Admin review screens: photos, decisions, recipient drafts, failures, mobile/desktop PASS",
  );
}
