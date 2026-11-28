import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import ts from "typescript";
import { chromium, webkit } from "playwright";

// Intercept every request, including the simulated provider. No account, SMS or network needed.
const app = "https://www.aftersunset.kr";
const provider = "https://cert.kcp.co.kr";
const modules = new Map();
for (const file of ["hostedIdentity", "portoneIdentityResult"]) {
  const source = (
    await readFile(new URL(`../src/lib/${file}.ts`, import.meta.url), "utf8")
  ).replace("import.meta.env.DEV", "false");
  modules.set(
    "/" + file,
    ts.transpileModule(source, {
      compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext },
    }).outputText,
  );
}

const browser = await (process.env.AFTER_TEST_BROWSER === "webkit" ? webkit : chromium).launch();
try {
  for (const path of ["/signup", "/verify-phone"]) {
    const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
    context.setDefaultTimeout(8_000);
    let submitted;
    await context.route("**/*", async (route) => {
      const request = route.request(),
        url = new URL(request.url());
      if (url.origin === app && modules.has(url.pathname)) {
        return route.fulfill({ contentType: "text/javascript", body: modules.get(url.pathname) });
      }
      if (url.origin === app && url.pathname === path)
        return route.fulfill({
          contentType: "text/html; charset=utf-8",
          body: "<!doctype html><title>After</title>",
        });
      if (url.href === provider + "/hosted") {
        submitted = {
          method: request.method(),
          data: Object.fromEntries(new URLSearchParams(request.postData())),
        };
        return route.fulfill({
          contentType: "text/html; charset=utf-8",
          body: `<a href="${app}${path}">복귀</a>`,
        });
      }
      return route.abort();
    });
    const page = await context.newPage();
    await page.goto(app + path);
    const navigation = page.waitForURL(provider + "/hosted");
    await page.evaluate(async (returnPath) => {
      const { launchHostedIdentity } = await import("/hostedIdentity");
      sessionStorage.setItem("kcp-test", returnPath);
      try {
        await launchHostedIdentity(
          {
            identityVerificationId: "av" + "1".repeat(32),
            provider: "kcp_direct",
            callUrl: "https://cert.kcp.co.kr/hosted",
            registrationKey: "fixture",
          },
          returnPath,
          () => {},
        );
      } catch (error) {
        if (error.message !== "verification redirecting") throw error;
      }
    }, path);
    await navigation;
    assert.deepEqual(submitted, {
      method: "POST",
      data: { reg_cert_key: "fixture", kcp_page_submit_yn: "Y" },
    });
    assert.equal(await page.locator("a").count(), 1, await page.content());
    await page.locator("a").click();
    await page.waitForURL(app + path);
    assert.equal(await page.evaluate(() => sessionStorage.getItem("kcp-test")), path);
    await context.close();
  }
  console.log("KCP hosted mobile form: signup and member same-tab POST and return pass");
} finally {
  await browser.close();
}
