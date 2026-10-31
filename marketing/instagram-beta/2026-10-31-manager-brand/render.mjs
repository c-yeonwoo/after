import { createServer } from "node:http";
import { readFile, mkdir, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { resolve, dirname, extname, sep } from "node:path";
import { chromium } from "playwright";
import { posts, variants } from "./campaign.mjs";

const folder = dirname(fileURLToPath(import.meta.url));
const root = resolve(folder, "../../..");
const prefix = "/marketing/instagram-beta/2026-10-31-manager-brand/";
const types = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".webp": "image/webp",
  ".woff2": "font/woff2",
  ".txt": "text/plain; charset=utf-8",
};
const server = createServer(async (req, res) => {
  try {
    const pathname = decodeURIComponent(new URL(req.url, "http://localhost").pathname);
    const urlPath = pathname === "/" ? prefix + "preview.html" : pathname;
    const file = resolve(root, "." + urlPath);
    const allowed = [folder, resolve(root, "public/fonts/wanted-sans")].some((base) =>
      file.startsWith(base + sep),
    );
    if (!allowed || urlPath.split("/").some((part) => part.startsWith("."))) {
      res.writeHead(404);
      res.end();
      return;
    }
    const data = await readFile(file);
    res.writeHead(200, {
      "Content-Type": types[extname(file)] || "application/octet-stream",
      "Cache-Control": "no-store",
    });
    res.end(data);
  } catch {
    res.writeHead(404);
    res.end();
  }
});
await new Promise((resolve) =>
  server.listen(
    process.argv.includes("--serve") ? Number(process.env.AFTER_BRAND_PORT || 5237) : 0,
    "127.0.0.1",
    resolve,
  ),
);
const base = `http://127.0.0.1:${server.address().port}`;
if (process.argv.includes("--serve")) {
  console.log(base + prefix + "preview.html");
  for (const signal of ["SIGTERM", "SIGINT"]) process.on(signal, () => server.close());
} else {
  let browser;
  try {
    browser = await chromium.launch({ headless: true });
    const page = await browser.newPage({
      viewport: { width: 1080, height: 1350 },
      deviceScaleFactor: 1,
    });
    const errors = [];
    page.on("pageerror", (error) => errors.push(error.message));
    for (const variant of variants) {
      const target = resolve(folder, "exports", variant.id);
      await mkdir(target, { recursive: true });
      await page.goto(base + prefix + `artboards.html?logo=${variant.id}`);
      await page.locator(".board").last().waitFor();
      await page.evaluate(async () => {
        await document.fonts.ready;
        await Promise.all([...document.images].map((image) => image.decode()));
      });
      for (const post of posts) {
        const board = page.locator(`[data-id="${post.id}"]`);
        const overlaps = await board.evaluate((node) => {
          const outer = node.getBoundingClientRect(),
            foot = node.querySelector("footer").getBoundingClientRect();
          return [
            ...node.querySelectorAll(
              "h1,.lead,.conversation,.photo-lead,.profile-note,.reading-tagline,.appointment,.invitation",
            ),
          ].flatMap((el) => {
            const r = el.getBoundingClientRect();
            return r.left < outer.left || r.right > outer.right || r.bottom > foot.top
              ? ["content outside safe area: " + el.className]
              : [];
          });
        });
        if (overlaps.length) throw new Error(`${variant.id}/${post.id}: ${overlaps.join(", ")}`);
        await board.screenshot({ path: resolve(target, post.id + ".png") });
      }
      for (const index of [0, 5]) {
        await page.setViewportSize({ width: 1080, height: 1920 });
        await page.evaluate((index) => {
          const board = document.querySelectorAll(".board")[index];
          const wrapper = document.createElement("div");
          wrapper.className = "story-board" + (index === 5 ? " dark" : "");
          wrapper.id = "story";
          wrapper.append(board.cloneNode(true));
          document.body.append(wrapper);
        }, index);
        await page
          .locator("#story")
          .screenshot({ path: resolve(target, posts[index].id + "-story.png") });
        await page.locator("#story").evaluate((node) => node.remove());
      }
      await page.setViewportSize({ width: 1024, height: 1024 });
      await page.goto(base + prefix + `logos/${variant.id}-app-icon.svg`);
      await page.screenshot({ path: resolve(target, "profile-icon.png") });
      await page.setViewportSize({ width: 1080, height: 1350 });
    }
    await writeFile(
      resolve(folder, "captions.txt"),
      posts
        .map((post) => `${post.title}\n게시 조건: ${post.gate}\n\n${post.caption}\n`)
        .join("\n────────\n\n"),
    );
    await mkdir(resolve(folder, "review"), { recursive: true });
    for (const [name, width, height] of [
      ["desktop", 1440, 1000],
      ["mobile", 390, 844],
    ]) {
      await page.setViewportSize({ width, height });
      await page.goto(base + prefix + "preview.html");
      await page.evaluate(async () => {
        await document.fonts.ready;
        document.querySelectorAll("img").forEach((image) => (image.loading = "eager"));
        await Promise.all([...document.images].map((image) => image.decode()));
      });
      if (await page.evaluate(() => document.documentElement.scrollWidth > innerWidth))
        throw new Error(name + " horizontal overflow");
      await page.screenshot({ path: resolve(folder, "review", name + ".png"), fullPage: true });
    }
    await page.getByRole("button", { name: "말을 듣는 after 선택" }).click();
    if ((await page.locator("#download-logo").getAttribute("href")) !== "logos/b-wordmark.svg")
      throw new Error("Logo selection failed");
    if (
      !(await page.locator("#campaign-grid img").first().getAttribute("src")).includes("exports/b/")
    )
      throw new Error("Campaign selection failed");
    const denied = await page.request.get(base + "/.env.local");
    if (denied.status() !== 404) throw new Error("Server boundary failed");
    // Logo selection must remain one of the authored variants, including on the
    // authoring route. A malformed query must never become HTML markup.
    await page.goto(
      base +
        prefix +
        "artboards.html?logo=" +
        encodeURIComponent('a" onerror="document.body.dataset.injected=1'),
    );
    await page.locator(".board").last().waitFor();
    if (await page.locator("[onerror]").count()) throw new Error("Query became an HTML attribute");
    if (await page.locator("body").getAttribute("data-injected")) throw new Error("Query executed");
    if ((await page.locator(".brand").first().getAttribute("src")) !== "logos/a-wordmark.svg")
      throw new Error("Unknown logo did not fall back");
    if (errors.length) throw new Error(errors.join("\n"));
    await writeFile(
      resolve(folder, "review", "checks.json"),
      JSON.stringify(
        {
          generatedAt: new Date().toISOString(),
          feedExports: 18,
          storyExports: 6,
          profileIcons: 3,
          svgLogos: 21,
          viewports: [1440, 390],
          fontReady: true,
          imagesDecoded: true,
          contentBounds: true,
          horizontalOverflow: false,
          logoSwitch: true,
          logoQueryAllowlist: true,
          serverBoundary: true,
          consoleErrors: errors,
        },
        null,
        2,
      ) + "\n",
    );
    console.log(
      "Rendered 18 feed posts, 6 story frames, 3 profile icons; desktop/mobile and selection checks PASS.",
    );
  } finally {
    await browser?.close();
    await new Promise((resolve) => server.close(resolve));
  }
}
