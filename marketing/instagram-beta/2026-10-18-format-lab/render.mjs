import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { copyFile, mkdir, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { chromium } from "playwright";

const folder = dirname(fileURLToPath(import.meta.url));
const temporary = join(tmpdir(), "after-format-lab-20261018");
const appUrl = process.env.AFTER_CAPTURE_URL ?? "http://127.0.0.1:5180";
assert.match(appUrl, /^http:\/\/127\.0\.0\.1:\d+$/, "Capture a local app only");
const feeds = [
  ["01-manifesto", "타이포 포스터"],
  ["02-interview", "문답 에디토리얼"],
  ["03-carousel-1", "소개장 캐러셀 · 1"],
  ["03-carousel-2", "소개장 캐러셀 · 2"],
  ["03-carousel-3", "소개장 캐러셀 · 3"],
  ["04-product", "실제 화면"],
  ["05-letter", "브랜드 레터"],
];
await mkdir(temporary, { recursive: true });
await copyFile(
  join(folder, "../../../public/brand/after-hours.jpg"),
  join(folder, "reel-background.jpg"),
);
const browser = await chromium.launch();
try {
  const app = await browser.newPage({
    viewport: { width: 390, height: 844 },
    deviceScaleFactor: 3,
    locale: "ko-KR",
  });
  await app.goto(appUrl);
  await app.locator("figure").waitFor();
  await app.evaluate(() => document.fonts.ready);
  assert.match(await app.locator("figure").innerText(), /가상의 프로필/);
  await app.locator("figure").screenshot({ path: join(folder, "app-profile-example.png") });
  await app.close();
  const page = await browser.newPage({
    viewport: { width: 1080, height: 1920 },
    deviceScaleFactor: 1,
  });
  for (const id of [...feeds.map(([id]) => id), "reel-1", "reel-2", "reel-3", "reel-4"]) {
    await page.goto(`${pathToFileURL(join(folder, "artboards.html"))}?frame=${id}`);
    await page.evaluate(() => document.fonts.ready);
    await page.evaluate(() => Promise.all([...document.images].map((image) => image.decode())));
    const dimensions = await page.locator(".active").evaluate((element) => ({
      width: element.clientWidth,
      height: element.clientHeight,
      scroll: element.scrollHeight,
    }));
    assert.equal(dimensions.width, 1080);
    assert.equal(dimensions.height, id.startsWith("reel-") ? 1920 : 1350);
    assert.ok(dimensions.scroll <= dimensions.height, `${id}: overflow`);
    await page
      .locator(".active")
      .screenshot({ path: join(id.startsWith("reel-") ? temporary : folder, `${id}.png`) });
  }
} finally {
  await browser.close();
}

const durations = [3, 7, 8, 4];
const inputs = durations.flatMap((duration, index) => [
  "-loop",
  "1",
  "-t",
  String(duration),
  "-i",
  join(temporary, `reel-${index + 1}.png`),
]);
const output = join(folder, "06-interview-reel.mp4");
await copyFile(join(temporary, "reel-1.png"), join(folder, "06-reel-cover.png"));
execFileSync(
  "ffmpeg",
  [
    "-hide_banner",
    "-loglevel",
    "error",
    "-y",
    ...inputs,
    "-filter_complex",
    "[0:v]fps=30,format=yuv420p[a];[1:v]fps=30,format=yuv420p[b];[2:v]fps=30,format=yuv420p[c];[3:v]fps=30,format=yuv420p[d];[a][b]xfade=transition=fade:duration=0.5:offset=2.5[ab];[ab][c]xfade=transition=fade:duration=0.5:offset=9[abc];[abc][d]xfade=transition=fade:duration=0.5:offset=16.5[v]",
    "-map",
    "[v]",
    "-c:v",
    "libx264",
    "-preset",
    "fast",
    "-crf",
    "20",
    "-pix_fmt",
    "yuv420p",
    "-movflags",
    "+faststart",
    "-an",
    output,
  ],
  { stdio: "inherit" },
);
const metadata = JSON.parse(
  execFileSync("ffprobe", ["-v", "quiet", "-show_streams", "-show_format", "-of", "json", output], {
    encoding: "utf8",
  }),
);
const video = metadata.streams.find((stream) => stream.codec_type === "video");
assert.equal(video.width, 1080);
assert.equal(video.height, 1920);
assert.equal(video.pix_fmt, "yuv420p");
assert.ok(Number(metadata.format.duration) >= 20 && Number(metadata.format.duration) <= 21);
const captions = await readFile(join(folder, "captions.txt"), "utf8");
const escape = (value) =>
  value.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");
await writeFile(
  join(folder, "preview.html"),
  `<!doctype html><html lang="ko"><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>애프터 SNS · 형식 다양화</title><style>body{margin:0;padding:40px 24px;background:#faf8f3;color:#23302b;font-family:system-ui,sans-serif}main{max-width:1200px;margin:auto}h1{font-size:30px;word-break:keep-all}p{line-height:1.7}.grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(240px,1fr));gap:32px}figure{margin:0}img{width:100%;height:auto}figcaption{margin:10px 0 20px}video{max-width:360px;width:100%}pre{white-space:pre-wrap;line-height:1.8;font:inherit}a{color:#38594f}summary{padding:20px 0;cursor:pointer}</style><main><h1>같은 브랜드, 다른 읽는 방식.</h1><p>타이포 · 문답 · 3장 캐러셀 · 실제 화면 · 브랜드 레터 · 20.5초 세로 영상<br>신규 콘텐츠는 아직 게시하지 않았습니다. 아래 03의 세 장은 하나의 캐러셀입니다.</p><div class="grid">${feeds.map(([id, title]) => `<figure><a href="${id}.png"><img src="${id}.png" alt="${title}"></a><figcaption>${title} · <a href="${id}.png" download>PNG 저장</a></figcaption></figure>`).join("")}</div><h2>세로 영상 · 1080 × 1920</h2><video controls preload="metadata" poster="06-reel-cover.png" src="06-interview-reel.mp4"></video><p>20.5초 · 소리 없음 · 가상 답변과 편집 예시를 표시했습니다.<br><a href="06-interview-reel.mp4" download>MP4 저장</a></p><details><summary>전체 캡션 · 게시 구성 · 출처</summary><pre>${escape(captions)}</pre></details></main></html>`,
);
console.log(
  `Rendered ${feeds.length} feed images and a ${metadata.format.duration}s vertical video. Preview: ${join(folder, "preview.html")}`,
);
