import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { createServer } from "node:net";
import { setTimeout as delay } from "node:timers/promises";
import { chromium, webkit } from "playwright";

// Standalone synthetic UI test: no DB, provider keys or real member requests.
const base = "http://127.0.0.1:4296";
const api = "http://127.0.0.1:59999";
const ids = ["11111111-1111-4111-8111-111111111111", "22222222-2222-4222-8222-222222222222"];
const session = (id) => {
  const user = { id, aud: "authenticated", email: "synthetic@verify.local", role: "authenticated" };
  const expires = Math.floor(Date.now() / 1000) + 3600;
  const encode = (data) => Buffer.from(JSON.stringify(data)).toString("base64url");
  return {
    access_token: `${encode({ alg: "HS256", typ: "JWT" })}.${encode({ ...user, sub: id, exp: expires })}.${Buffer.from("synthetic-signature").toString("base64url")}`,
    refresh_token: `synthetic-${id}`,
    expires_at: expires,
    expires_in: 3600,
    token_type: "bearer",
    user,
  };
};
const sessions = new Map(ids.map((id) => [id, session(id)]));
await new Promise((resolve, reject) => {
  const probe = createServer();
  probe.once("error", reject);
  probe.listen(4296, "127.0.0.1", () =>
    probe.close((error) => (error ? reject(error) : resolve())),
  );
});
const server = spawn(
  process.execPath,
  ["node_modules/vite/bin/vite.js", "--host", "127.0.0.1", "--port", "4296", "--strictPort"],
  {
    env: { ...process.env, VITE_SUPABASE_URL: api, VITE_SUPABASE_ANON_KEY: "synthetic-public-key" },
    stdio: "ignore",
  },
);
let browser;
try {
  let started = false;
  for (let i = 0; i < 100; i++) {
    assert.equal(server.exitCode, null, "owned test server must start on a free port");
    try {
      if ((await fetch(base)).ok) {
        started = true;
        break;
      }
    } catch {
      // Wait for this test's server, never reuse another process on its port.
    }
    await delay(200);
  }
  assert.ok(started);
  browser = await (process.env.AFTER_TEST_BROWSER === "webkit" ? webkit : chromium).launch();
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
    locale: "ko-KR",
  });
  let owner = ids[0];
  let holdProfile;
  let releaseProfile;
  let releaseList;
  let submissions = 0;
  const unexpected = [];
  await context.addInitScript((value) => {
    localStorage.setItem("sb-127-auth-token", JSON.stringify(value));
  }, sessions.get(owner));
  await context.routeWebSocket("**", (socket) => socket.close());
  await context.route("**/*", async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const path = url.pathname;
    const json = (value) => route.fulfill({ status: 200, json: value });
    if (url.origin === api) {
      if (path === "/auth/v1/user") return json(sessions.get(owner).user);
      if (path === "/rest/v1/profiles") {
        if (holdProfile) await holdProfile;
        return json({
          id: owner,
          name: "합성 회원",
          gender: "female",
          account_state: "active",
          role: "member",
          onboarding_step: 7,
          photo_state: "approved",
          photo_paths: [],
        });
      }
      if (path.endsWith("/rpc/my_support_requests")) {
        await new Promise((resolve) => {
          releaseList = resolve;
        });
        return json([]);
      }
      if (path.endsWith("/rpc/create_support_request")) {
        assert.match(request.postDataJSON().p_body, /합성 문의/);
        assert.equal(request.headers().authorization, `Bearer ${sessions.get(owner).access_token}`);
        submissions++;
        return json(null);
      }
      if (path.endsWith("/rpc/unread_notification_count")) return json(0);
      if (path.endsWith("/app_settings")) return json({ payments_enabled: false });
      unexpected.push(path);
      return route.fulfill({ status: 503, json: { message: "unmocked synthetic request" } });
    }
    if (url.origin === base) return route.continue();
    if (url.hostname === "fonts.googleapis.com")
      return route.fulfill({ status: 200, contentType: "text/css", body: "" });
    unexpected.push(url.origin);
    return route.abort();
  });
  const page = await context.newPage();
  const body = page.getByLabel("문의 내용", { exact: true });
  const send = page.getByRole("button", { name: "문의 보내기", exact: true });
  for (let attempt = 0; attempt < 3; attempt++) {
    holdProfile = new Promise((resolve) => {
      releaseProfile = resolve;
    });
    await page.goto(`${base}/support`);
    releaseProfile();
    const draft = `합성 문의 ${attempt}: 화면이 열리자마자 작성한 내용입니다.`;
    await body.fill(draft);
    for (let i = 0; i < 100 && !releaseList; i++) await delay(10);
    assert.ok(releaseList, "the list request starts separately from composing");
    assert.equal(await body.inputValue(), draft, "initial auth/list effects cannot erase typing");
    releaseList();
    releaseList = undefined;
    await page.getByText("아직 접수된 문의가 없어요.", { exact: true }).waitFor();
    assert.equal(await body.inputValue(), draft, "list completion preserves the draft");
    assert.equal(await send.isEnabled(), true);
  }
  const draftBeforeReauth = await body.inputValue();
  await page.evaluate(async (value) => {
    const { supabase } = await import("/src/lib/supabase.ts");
    const result = await supabase.auth.setSession(value);
    if (result.error) throw result.error;
  }, sessions.get(owner));
  assert.equal(await body.inputValue(), draftBeforeReauth, "same-account auth keeps the draft");
  // Exercise a real SDK auth event while React's profile for B is still delayed.
  owner = ids[1];
  holdProfile = new Promise((resolve) => {
    releaseProfile = resolve;
  });
  await page.evaluate(async (value) => {
    const { supabase } = await import("/src/lib/supabase.ts");
    const result = await supabase.auth.setSession(value);
    if (result.error) throw result.error;
  }, sessions.get(owner));
  releaseProfile();
  await body.waitFor();
  await page.waitForFunction(() => document.querySelector("#support-body")?.value === "");
  await body.fill("합성 문의: 새 계정의 내용만 전송합니다.");
  if (releaseList) {
    releaseList();
    releaseList = undefined;
  }
  await send.click();
  await page.getByRole("status").filter({ hasText: "문의가 접수되었습니다." }).waitFor();
  assert.equal(await body.inputValue(), "");
  assert.equal(submissions, 1);
  assert.deepEqual(unexpected, []);
  releaseList?.();
  await context.close();
  console.log(
    "Support: fast typing/auth delay/list refresh/account isolation/submission PASS; real backend calls 0",
  );
} finally {
  await browser?.close();
  server.kill("SIGTERM");
}
