import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";

const folder = dirname(fileURLToPath(import.meta.url));
const framesDir = join(folder, "frames");
await mkdir(framesDir, { recursive: true });

const slides = [
  {
    id: "01-hook",
    image: "01-crowded-mixer.png",
    kicker: "AFTER WORK, AFTER YOU.",
    title: "모임은 많아졌는데\n좋은 만남은 더\n어려워진 것 같다면.",
    note: "새로운 사람을 만나는 일도, 내 리듬대로.",
    theme: "photo",
  },
  {
    id: "02-one-person",
    image: "02-one-person.png",
    kicker: "ONE PERSON AT A TIME",
    title: "이번엔 여러 사람보다\n한 사람의 이야기를\n천천히.",
    note: "서로 알아가는 속도도 함께 맞춰가요.",
    theme: "photo",
  },
  {
    id: "03-product",
    image: "03-product-example.png",
    kicker: "INTRODUCTIONS, WITH CARE",
    title: "내 이야기를 듣고\n한 사람씩 소개해요.",
    note: "소개장도, 만날 일정도 차분하게.",
    theme: "product",
  },
  {
    id: "04-cta",
    kicker: "AFTER · 직장인 소개팅",
    title: "하루 끝에,\n설레는 시작.",
    note: "베타 참여는 프로필 링크에서",
    theme: "endcard",
  },
];
const mediaData = new Map();
for (const name of ["01-crowded-mixer.png", "02-one-person.png", "03-product-example.png"]) {
  mediaData.set(name, `data:image/png;base64,${(await readFile(join(folder, name))).toString("base64")}`);
}

const escapeHtml = (value) =>
  value.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");
const htmlFor = (slide) => {
  const photo = slide.image
    ? `<img class="${slide.theme === "product" ? "product" : "background"}" src="${mediaData.get(slide.image)}" />`
    : "";
  const label = slide.theme === "product" ? "<div class=\"disclosure\">소개장 예시 · 가상 프로필</div>" : "";
  return `<!doctype html><html lang="ko"><meta charset="utf-8"><style>
    *{box-sizing:border-box}html,body{margin:0;width:1080px;height:1920px;overflow:hidden}
    body{font-family:-apple-system,"Apple SD Gothic Neo","Malgun Gothic",sans-serif;color:#FAF8F3}
    .frame{position:relative;width:1080px;height:1920px;overflow:hidden;background:#23302B}
    .background{position:absolute;inset:0;width:100%;height:100%;object-fit:cover}
    .shade{position:absolute;inset:0;background:linear-gradient(180deg,rgba(18,30,27,.72) 0%,rgba(18,30,27,.24) 34%,rgba(18,30,27,.04) 60%,rgba(18,30,27,.48) 100%)}
    .brand{position:absolute;top:100px;left:90px;font-size:34px;font-weight:700;letter-spacing:-.04em}.dot{color:#B75B52}
    .kicker{position:absolute;left:94px;top:280px;font-size:25px;font-weight:650;letter-spacing:.09em;color:#F0CDB7}
    .title{position:absolute;left:90px;right:80px;top:350px;font-size:84px;line-height:1.22;letter-spacing:-.055em;font-weight:720;white-space:pre-line;word-break:keep-all;text-wrap:balance}
    .note{position:absolute;left:94px;right:80px;bottom:154px;font-size:34px;line-height:1.45;letter-spacing:-.035em;font-weight:520;word-break:keep-all}
    .product-frame{background:#FAF8F3;color:#23302B}.product-frame .brand{top:34px}.product-frame .kicker{top:84px;color:#8E514B}.product-frame .title{top:145px;font-size:73px;line-height:1.2}.product{position:absolute;top:435px;left:130px;width:820px;height:1025px;object-fit:contain;border-radius:28px;box-shadow:0 28px 70px rgba(35,48,43,.18)}
    .product-frame .note{bottom:174px;font-size:31px;color:#526B75}.disclosure{position:absolute;bottom:90px;left:0;right:0;text-align:center;color:#6C7773;font-size:23px}
    .endcard{background:#23302B}.endcard:before{content:"";position:absolute;width:900px;height:900px;right:-510px;top:160px;border:1px solid rgba(240,205,183,.28);border-radius:50%;box-shadow:0 0 0 60px rgba(240,205,183,.04),0 0 0 120px rgba(240,205,183,.025)}
    .endcard .brand{top:150px}.endcard .kicker{top:595px;left:100px;color:#F0CDB7;letter-spacing:.02em;font-size:31px}
    .endcard .title{top:685px;left:94px;right:50px;font-size:112px;line-height:1.2}
    .cta{position:absolute;left:94px;top:1190px;padding:25px 34px;border-radius:999px;background:#FAF8F3;color:#23302B;font-size:34px;font-weight:700;letter-spacing:-.03em}
    .endcard .note{left:98px;bottom:250px;font-size:31px;color:rgba(250,248,243,.78)}
  </style><div class="frame ${slide.theme === "product" ? "product-frame" : slide.theme === "endcard" ? "endcard" : "photo"}">
    ${photo}${slide.theme === "photo" ? '<div class="shade"></div>' : ""}
    <div class="brand">after<span class="dot">.</span></div>
    <div class="kicker">${escapeHtml(slide.kicker)}</div>
    <div class="title">${escapeHtml(slide.title)}</div>
    ${slide.theme === "endcard" ? '<div class="cta">베타 참여 · 프로필 링크</div>' : ""}
    <div class="note">${escapeHtml(slide.note)}</div>${label}
  </div></html>`;
};

const browser = await chromium.launch();
try {
  const page = await browser.newPage({ viewport: { width: 1080, height: 1920 }, deviceScaleFactor: 1 });
  for (const slide of slides) {
    await page.setContent(htmlFor(slide));
    await page.evaluate(() => Promise.all([...document.images].map((image) => image.decode())));
    await page.screenshot({ path: join(framesDir, `${slide.id}.png`) });
  }
} finally {
  await browser.close();
}

const durations = [4.2, 3.8, 3.8, 4.2];
const inputs = durations.flatMap((duration, index) => [
  "-loop",
  "1",
  "-t",
  String(duration),
  "-i",
  join(framesDir, `${slides[index].id}.png`),
]);
const filters = slides.map((_, index) =>
  `[${index}:v]fps=30,zoompan=z='min(zoom+0.00035,1.045)':x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':d=1:s=1080x1920:fps=30,setsar=1,format=yuv420p[v${index}]`,
);
filters.push(
  "[v0][v1]xfade=transition=fade:duration=0.3:offset=3.9[v01]",
  "[v01][v2]xfade=transition=fade:duration=0.3:offset=7.4[v012]",
  "[v012][v3]xfade=transition=fade:duration=0.3:offset=10.9[out]",
);
const output = join(folder, "after-one-person-beta-reel.mp4");
execFileSync(
  "ffmpeg",
  ["-hide_banner", "-loglevel", "error", "-y", ...inputs, "-filter_complex", filters.join(";"), "-map", "[out]", "-c:v", "libx264", "-preset", "fast", "-crf", "20", "-pix_fmt", "yuv420p", "-movflags", "+faststart", "-an", output],
  { stdio: "inherit" },
);
await writeFile(join(folder, "after-one-person-beta-reel-cover.png"), await readFile(join(framesDir, "01-hook.png")));
const metadata = JSON.parse(execFileSync("ffprobe", ["-v", "quiet", "-show_streams", "-show_format", "-of", "json", output], { encoding: "utf8" }));
const video = metadata.streams.find((stream) => stream.codec_type === "video");
assert.equal(video.width, 1080);
assert.equal(video.height, 1920);
assert.equal(video.codec_name, "h264");
assert.ok(Number(metadata.format.duration) >= 14 && Number(metadata.format.duration) <= 16);
console.log(`Rendered ${metadata.format.duration}s vertical reel: ${output}`);
