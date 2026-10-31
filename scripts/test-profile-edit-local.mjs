import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import { chromium } from "playwright";
import {
  localEnvironment,
  existingPublicRecordHashes,
  assertExistingPublicRecordsPreserved,
} from "./lib/manual-cycle-fixtures.mjs";

// Isolated new synthetic user only. Never reset shared records, flags or workers.
const env = localEnvironment();
const base = process.env.AFTER_PROFILE_EDIT_BASE ?? "http://127.0.0.1:5191";
assert.ok(["127.0.0.1", "localhost"].includes(new URL(base).hostname));
const previous = existingPublicRecordHashes(env);
const service = createClient(env.API_URL, env.SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});
const email = `profile-edit-${randomUUID()}@verify.local`;
const password = "AfterLocal!2026";
const created = await service.auth.admin.createUser({
  email,
  password,
  email_confirm: true,
  app_metadata: { fixture: "profile-edit-local" },
});
assert.ifError(created.error);
const id = created.data.user.id;
const photos = [];
let browser;
let modelRequests = 0;
const preferences = {
  version: 1,
  choices: { planning: ["상대와 함께 맞추기"] },
  choiceCustom: { contact: "일할 때는 답이 늦을 수 있어요." },
};
try {
  const png = Buffer.from(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR4nGO4NK3pPwAHEgLqTt8GBgAAAABJRU5ErkJggg==",
    "base64",
  );
  for (let i = 0; i < 3; i++) {
    const path = `${id}/profile-edit-${i}.png`;
    const upload = await service.storage
      .from("profile-photos")
      .upload(path, png, { contentType: "image/png" });
    assert.ifError(upload.error);
    photos.push(path);
  }
  const time = new Date().toISOString();
  const seeded = await service.from("profiles").upsert({
    id,
    company_email: email,
    gender: "female",
    hub_id: "gangnam",
    email_verified_at: time,
    phone_verified_at: time,
    terms_agreed_at: time,
    privacy_agreed_at: time,
    agreed_policy_version: "2026-10-17.2",
    onboarding_step: 7,
    name: "수정 검증",
    birth: "1997-04-12",
    job: "제품 기획자",
    photo_paths: photos,
    headline: "일상의 작은 이야기를 나누고 싶어요",
    intro: "퇴근 후에는 책을 읽고 동네를 산책해요. 주말에 본 전시 이야기를 나누고 싶어요.",
    smoking: "none",
    drinking: "none",
    mbti: "ENFP",
    profile_preferences: preferences,
  });
  assert.ifError(seeded.error);
  const owner = createClient(env.API_URL, env.ANON_KEY, { auth: { persistSession: false } });
  const login = await owner.auth.signInWithPassword({ email, password });
  assert.ifError(login.error);
  const original = (await service.from("profiles").select("*").eq("id", id).single()).data;
  browser = await chromium.launch();
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
    locale: "ko-KR",
    timezoneId: "Asia/Seoul",
    reducedMotion: "reduce",
  });
  await context.addInitScript(
    ({ session, key }) => localStorage.setItem(key, JSON.stringify(session)),
    { session: login.data.session, key: "sb-127-auth-token" },
  );
  await context.route("**/functions/v1/**", (route) => {
    modelRequests++;
    return route.fulfill({ status: 409, json: { code: "disabled" } });
  });
  const page = await context.newPage();
  page.setDefaultTimeout(15000);
  await page.goto(base + "/signup?edit=1");
  await page.waitForURL("**/profile-edit");
  const job = page.getByLabel("직업", { exact: true });
  await job.fill("사용자 경험 기획자");
  await page.getByRole("button", { name: "취소", exact: true }).click();
  await page.getByRole("button", { name: "계속 수정", exact: true }).click();
  assert.equal(await job.inputValue(), "사용자 경험 기획자");
  assert.equal(
    (await service.from("profiles").select("job").eq("id", id).single()).data.job,
    original.job,
  );
  await page.getByRole("button", { name: "취소", exact: true }).click();
  await page.getByRole("button", { name: "저장하지 않고 나가기", exact: true }).click();
  await page.waitForURL("**/profile");
  await page.getByRole("link", { name: "프로필 수정", exact: true }).click();
  assert.equal(await job.inputValue(), original.job);
  await job.fill("사용자 경험 기획자");
  await page.getByLabel("한 줄 소개", { exact: true }).fill("작은 일상에 다정한 관심이 있는 사람");
  await page
    .getByLabel("어떤 만남에서 편해지나요?", { exact: true })
    .fill("조용한 카페에서 천천히 이야기를 나눌 때 편해요.");
  const publicBeforeSave = (
    await service.from("profiles").select("job,headline").eq("id", id).single()
  ).data;
  assert.equal(publicBeforeSave.job, original.job);
  assert.equal(publicBeforeSave.headline, original.headline);
  await page.getByRole("button", { name: "변경사항 저장", exact: true }).click();
  await page.waitForURL("**/profile");
  const after = (await service.from("profiles").select("*").eq("id", id).single()).data;
  assert.equal(after.job, "사용자 경험 기획자");
  assert.equal(after.headline, "작은 일상에 다정한 관심이 있는 사람");
  assert.equal(after.onboarding_step, 7);
  assert.equal(after.company_email, original.company_email);
  assert.equal(after.gender, original.gender);
  assert.deepEqual(after.profile_preferences, preferences);
  assert.deepEqual(after.photo_paths, photos);
  assert.equal(
    (await owner.from("profile_interview_drafts").select("revision").eq("user_id", id)).data.length,
    0,
  );
  await page.getByRole("link", { name: "프로필 수정", exact: true }).click();
  await page.getByLabel("퇴근 후에는 어떻게 보내세요?", { exact: true }).fill("");
  await page.getByRole("button", { name: "변경사항 저장", exact: true }).click();
  await page.waitForURL("**/profile");
  const deleted = (
    await service
      .from("profiles")
      .select("evening_note,profile_story,profile_preferences")
      .eq("id", id)
      .single()
  ).data;
  assert.equal(
    deleted.evening_note,
    null,
    "removed public answers are not left in old public fields",
  );
  assert.equal(
    deleted.profile_story.sections.some((section) => section.id === "daily_life"),
    false,
  );
  assert.deepEqual(deleted.profile_preferences, preferences);
  await page.goto(base + "/signup");
  await page.getByRole("heading", { name: "이미 가입된 계정이 있어요", exact: true }).waitFor();
  assert.equal(
    await page.getByLabel("직업", { exact: true }).count(),
    0,
    "signup never restores a completed member's edit form",
  );
  const anonymous = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const anonymousPage = await anonymous.newPage();
  await anonymousPage.goto(base + "/profile-edit");
  await anonymousPage.waitForURL("**/login");
  assert.equal(await anonymousPage.getByLabel("직업", { exact: true }).count(), 0);
  await anonymous.close();
  assert.equal(modelRequests, 0, "direct edit needs no LLM calls");
  console.log(
    "PASS actual local DB: legacy redirect, cancel/resume/discard, explicit save, story publication, preferences/photos/account/eligibility preservation, zero LLM calls",
  );
} finally {
  await browser?.close();
  if (photos.length) {
    const removed = await service.storage.from("profile-photos").remove(photos);
    assert.ifError(removed.error);
  }
  const removed = await service.auth.admin.deleteUser(id);
  assert.ifError(removed.error);
  assertExistingPublicRecordsPreserved(previous, existingPublicRecordHashes(env));
  console.log(
    "PASS all pre-existing public rows/settings unchanged; only this disposable fixture cleaned up",
  );
}
