/**
 * 브랜드 컬러 대비 가드 — src/styles.css 의 실제 토큰 값을 파싱해
 * 역할별(텍스트·필·틴트 표면·그라디언트·포커스 링) WCAG 대비를 재계산한다.
 *
 * 실행: bun scripts/check-contrast.mjs   (또는 node)
 *
 * 왜 필요한가: D14(코럴 #c72b10)가 README·PRD 에는 확정으로 적혀 있었지만
 * styles.css 에는 반영되지 않아, 대비 미달(3.07)인 이전 색이 계속 쓰이고 있었다.
 * 결정과 코드가 갈라지는 걸 사람 눈으로는 못 잡으므로 스크립트로 고정한다.
 */
import { readFileSync } from "node:fs";

const cssPath = new URL("../src/styles.css", import.meta.url);
const css = readFileSync(cssPath, "utf8");

// :root 블록만
const root = css.slice(css.indexOf(":root {"), css.indexOf("\n.dark"));
function tokenRaw(name) {
  const m = root.match(new RegExp(`--${name}:\\s*([^;]+);`));
  return m ? m[1].trim() : null;
}
function resolve(v, depth = 0) {
  if (depth > 8 || !v) return v;
  const m = v.match(/^var\(--([a-z0-9-]+)\)$/i);
  return m ? resolve(tokenRaw(m[1]), depth + 1) : v;
}
function parseOklch(v) {
  const m = resolve(v)?.match(/oklch\(\s*([\d.]+)\s+([\d.]+)\s+([\d.]+)/);
  if (!m) throw new Error(`파싱 실패: ${v}`);
  return [parseFloat(m[1]), parseFloat(m[2]), parseFloat(m[3])];
}

function oklchToSrgb(L, C, hDeg) {
  const h = (hDeg * Math.PI) / 180;
  const a = C * Math.cos(h),
    b = C * Math.sin(h);
  const l_ = L + 0.3963377774 * a + 0.2158037573 * b;
  const m_ = L - 0.1055613458 * a - 0.0638541728 * b;
  const s_ = L - 0.0894841775 * a - 1.291485548 * b;
  const l = l_ ** 3,
    m = m_ ** 3,
    s = s_ ** 3;
  return [
    +4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
    -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
    -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s,
  ];
}
const lin2s = (c) =>
  Math.min(1, Math.max(0, c <= 0.0031308 ? 12.92 * c : 1.055 * Math.pow(c, 1 / 2.4) - 0.055));
const s2lin = (s) => (s <= 0.04045 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4));
const toS = (t) => oklchToSrgb(...t).map(lin2s);
const hex = (sv) =>
  "#" +
  sv
    .map((c) =>
      Math.round(c * 255)
        .toString(16)
        .padStart(2, "0"),
    )
    .join("");
const lum = (sv) => {
  const [r, g, b] = sv.map(s2lin);
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};
const cr = (a, b) => {
  const la = lum(a),
    lb = lum(b);
  const hi = Math.max(la, lb),
    lo = Math.min(la, lb);
  return (hi + 0.05) / (lo + 0.05);
};
const over = (fg, bg, al) => fg.map((f, i) => f * al + bg[i] * (1 - al));

const primary = toS(parseOklch(tokenRaw("primary")));
const strong = toS(parseOklch(tokenRaw("primary-strong")));
const primaryFg = toS(parseOklch(tokenRaw("primary-foreground")));
const bg = toS(parseOklch(tokenRaw("background")));
const card = toS(parseOklch(tokenRaw("card")));

// gradient-brand 의 두 정지점
const grad = root.match(/--gradient-brand:[^;]+;/)[0];
const stops = [...grad.matchAll(/oklch\(\s*([\d.]+)\s+([\d.]+)\s+([\d.]+)\s*\)/g)].map((m) =>
  toS([parseFloat(m[1]), parseFloat(m[2]), parseFloat(m[3])]),
);

console.log(`--primary          ${hex(primary)}`);
console.log(`--primary-strong   ${hex(strong)}`);
console.log(`gradient stops     ${stops.map(hex).join(" → ")}\n`);

let fails = 0;
const chk = (label, val, need) => {
  const ok = val >= need;
  if (!ok) fails++;
  console.log(`${ok ? "PASS" : "FAIL"}  ${label.padEnd(46)} ${val.toFixed(2)} (기준 ${need})`);
};

console.log("── 텍스트 역할 (AA 4.5) ──");
chk("primary 텍스트 / 배경", cr(primary, bg), 4.5);
chk("primary 텍스트 / 카드", cr(primary, card), 4.5);
chk("primary-strong 텍스트 / 배경", cr(strong, bg), 4.5);
chk("primary-strong 텍스트 / 카드", cr(strong, card), 4.5);

console.log("\n── 필 역할 (버튼 위 흰 글씨, 4.5) ──");
chk("primary 필 + primary-foreground", cr(primary, primaryFg), 4.5);
chk("primary-strong 필 + primary-foreground", cr(strong, primaryFg), 4.5);

console.log("\n── 틴트 표면 (GuideNote bg-primary/8, 칩 /10) ──");
chk("primary-strong / bg-primary\\8 (배경)", cr(strong, over(primary, bg, 0.08)), 4.5);
chk("primary-strong / bg-primary\\8 (카드)", cr(strong, over(primary, card, 0.08)), 4.5);
chk("primary-strong / bg-primary-strong\\10", cr(strong, over(strong, card, 0.1)), 4.5);

console.log("\n── 말풍선 (내 메시지, 4.5) ──");
chk(
  "bubble-mine-foreground / bubble-mine",
  cr(toS(parseOklch(tokenRaw("bubble-mine-foreground"))), toS(parseOklch(tokenRaw("bubble-mine")))),
  4.5,
);

console.log("\n── 그라디언트 위 흰 텍스트 (양 끝, 4.5) ──");
stops.forEach((s, i) => chk(`gradient stop ${i + 1} (${hex(s)})`, cr(s, primaryFg), 4.5));

console.log("\n── 포커스 링 (비텍스트 3.0) ──");
chk("ring / 배경", cr(toS(parseOklch(tokenRaw("ring"))), bg), 3.0);

console.log(fails === 0 ? "\n✅ 전부 통과" : `\n❌ ${fails}건 실패`);
process.exit(fails === 0 ? 0 : 1);
