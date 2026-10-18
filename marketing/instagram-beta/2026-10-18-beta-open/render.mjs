import assert from "node:assert/strict";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { chromium } from "playwright";

// Static marketing artwork only. No member data, account or external posting API.
const folder = dirname(fileURLToPath(import.meta.url));
const frames = ["01-cover", "02-one-person", "03-profile", "04-planning", "05-invitation"];
const browser = await chromium.launch();
try {
  const page = await browser.newPage({
    viewport: { width: 1080, height: 1350 },
    deviceScaleFactor: 1,
  });
  for (const frame of frames) {
    await page.goto(`${pathToFileURL(join(folder, "artboards.html"))}?frame=${frame}`);
    await page.evaluate(async () => {
      await document.fonts.ready;
      await Promise.all([...document.images].map((image) => image.decode()));
      if (!document.fonts.check('650 88px "Pretendard Variable"'))
        throw new Error("Brand font did not load");
    });
    const size = await page.locator(".active").evaluate((element) => ({
      width: element.clientWidth,
      height: element.clientHeight,
      scrollHeight: element.scrollHeight,
      children: [...element.children].map((child) => ({
        top: child.getBoundingClientRect().top,
        bottom: child.getBoundingClientRect().bottom,
        left: child.getBoundingClientRect().left,
        right: child.getBoundingClientRect().right,
      })),
    }));
    assert.equal(size.width, 1080);
    assert.equal(size.height, 1350);
    assert.ok(size.scrollHeight <= size.height, `${frame}: vertical overflow`);
    // Full-bleed photography intentionally crosses the padded content area;
    // inspect actual bounds, not scrollWidth (which counts trailing padding).
    for (const child of size.children) {
      assert.ok(child.left >= 0 && child.right <= size.width, `${frame}: horizontal overflow`);
    }
    for (let index = 1; index < size.children.length; index += 1) {
      assert.ok(
        size.children[index].top >= size.children[index - 1].bottom - 1,
        `${frame}: overlapping blocks`,
      );
    }
    await page.locator(".active").screenshot({ path: join(folder, `${frame}.png`) });
    console.log(`${frame}: 1080×1350 PASS`);
  }
} finally {
  await browser.close();
}
