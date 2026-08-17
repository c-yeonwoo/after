/**
 * 브랜드 컬러 대비 가드 — src/styles.css 의 실제 토큰 값을 파싱해
 * 역할별(텍스트·필·틴트 표면·그라디언트·포커스 링) WCAG 대비를 재계산한다.
 *
 * 실행: bun scripts/check-contrast.mjs   (또는 node)
 *
 * 왜 필요한가: D14(브랜드 컬러)가 README·PRD 에는 확정으로 적혀 있었지만
 * styles.css 에는 반영되지 않아, 대비 미달(3.07)인 이전 색이 계속 쓰이고 있었다.
 * 결정과 코드가 갈라지는 걸 사람 눈으로는 못 잡으므로 스크립트로 고정한다.
 */
import { readFileSync } from "node:fs";

const cssPath = new URL("../src/styles.css", import.meta.url);
const css = readFileSync(cssPath, "utf8");

/*
  테마별 블록. 다크는 라이트 토큰을 상속하므로(예: --brand-*) 못 찾으면 :root 로
  떨어진다 — 실제 CSS 캐스케이드와 같은 순서다.

  **셀렉터로 자른다.** 예전에는 `:root {` 부터 `\n.dark` 까지를 라이트로 잘랐는데,
  그 사이에 `.brand-surface` 를 추가하자 그 블록의 값이 라이트 토큰으로 읽혔다.
  검사는 통과했지만 검사한 대상이 라이트 테마가 아니었다 — 가드가 조용히 무력해지는
  종류의 실패라, 블록마다 시작 셀렉터를 지정해 다음 셀렉터 직전까지만 자른다.

  인자는 **정규식 소스**다 — 셀렉터 목록(`\\.dark,\\n\\.brand-surface`)도 받는다. 못 찾으면 던진다 — 검사가
  조용히 빈 블록을 보는 것보다 시끄럽게 깨지는 편이 낫다.
*/
function block(selectorPattern) {
  const m = css.match(new RegExp(`(^|\\n)${selectorPattern}\\s*\\{`));
  if (!m) throw new Error(`블록을 찾지 못했다: ${selectorPattern}`);
  const rest = css.slice(m.index + m[0].length);
  // 다음 최상위 셀렉터(줄 시작의 `:root`/`.`/`@`) 직전까지
  const next = rest.search(/\n(?=[.:@][a-z])/i);
  return next < 0 ? rest : rest.slice(0, next);
}

const lightBlock = block(":root");
/*
  다크와 브랜드 접점(랜딩·로그인)은 **한 규칙을 공유한다**(styles.css). 팔레트를
  한 벌로 통일하면서 합쳤다 — 따로 두면 반드시 어긋나고, 어긋난 쪽은 검사에
  안 걸린다. 그래서 여기서도 하나로 본다.
*/
const darkBlock = block("\\.dark,\\n\\.brand-surface");

let scope = lightBlock;
function readFrom(block, name) {
  const m = block.match(new RegExp(`--${name}:\\s*([^;]+);`));
  return m ? m[1].trim() : null;
}
function tokenRaw(name) {
  return readFrom(scope, name) ?? (scope === lightBlock ? null : readFrom(lightBlock, name));
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

let fails = 0;
const chk = (label, val, need) => {
  const ok = val >= need;
  if (!ok) fails++;
  console.log(`${ok ? "PASS" : "FAIL"}  ${label.padEnd(46)} ${val.toFixed(2)} (기준 ${need})`);
};

function audit(themeName, block) {
  scope = block;
  console.log(`\n${"═".repeat(58)}\n  ${themeName}\n${"═".repeat(58)}`);

  const primary = toS(parseOklch(tokenRaw("primary")));
  const strong = toS(parseOklch(tokenRaw("primary-strong")));
  const primaryFg = toS(parseOklch(tokenRaw("primary-foreground")));
  const bg = toS(parseOklch(tokenRaw("background")));
  const card = toS(parseOklch(tokenRaw("card")));

  // gradient-brand 의 두 정지점
  const grad = scope.match(/--gradient-brand:[^;]+;/)[0];
  const stops = [...grad.matchAll(/oklch\(\s*([\d.]+)\s+([\d.]+)\s+([\d.]+)\s*\)/g)].map((m) =>
    toS([parseFloat(m[1]), parseFloat(m[2]), parseFloat(m[3])]),
  );

  console.log(`--primary          ${hex(primary)}`);
  console.log(`--primary-strong   ${hex(strong)}`);
  console.log(`gradient stops     ${stops.map(hex).join(" → ")}\n`);

  /*
    역할을 나눠서 검사한다.

    예전에는 --primary 를 텍스트로도 검사했다. 그때는 한 토큰이 채움과 글자를
    겸했기 때문인데, 그 구속 때문에 채움을 밝힐 수 없었다(밝히면 글자가 미달).
    이제 --primary 는 **채움 전용**이고 글자는 --primary-strong 이 맡는다.

    검사를 느슨하게 한 것이 아니다 — 각 토큰을 **실제로 쓰이는 역할로** 본다.
    채움은 그 위의 글자와, 글자는 뒤의 배경과 겨룬다. `text-primary` 가 남아 있는
    곳은 랜딩·로그인뿐이고 거기는 항상 어두운 바탕이라, 다크 팔레트의 primary
    검사가 그 자리를 덮는다.
  */
  console.log("── 글자 역할: primary-strong (AA 4.5) ──");
  chk("primary-strong / 배경", cr(strong, bg), 4.5);
  chk("primary-strong / 카드", cr(strong, card), 4.5);

  /*
    primary-strong 을 필로는 검사하지 않는다 — **채움으로 쓰는 곳이 없다.**
    한 곳(랜딩 CTA 의 hover)에 있었는데, 밝은 테마에서 어두운 와인 위에 잉크
    글자가 얹혀 2.15 였다. hover 는 primary/90 으로 바꿨다.
  */
  console.log("\n── 채움 역할: primary (그 위의 글자, 4.5) ──");
  chk("primary 필 + primary-foreground", cr(primary, primaryFg), 4.5);

  console.log("\n── 틴트 표면 (GuideNote bg-primary/8, 칩 /10) ──");
  chk("primary-strong / bg-primary\\8 (배경)", cr(strong, over(primary, bg, 0.08)), 4.5);
  chk("primary-strong / bg-primary\\8 (카드)", cr(strong, over(primary, card, 0.08)), 4.5);
  chk("primary-strong / bg-primary-strong\\10", cr(strong, over(strong, card, 0.1)), 4.5);

  console.log("\n── 말풍선 (내 메시지, 4.5) ──");
  chk(
    "bubble-mine-foreground / bubble-mine",
    cr(
      toS(parseOklch(tokenRaw("bubble-mine-foreground"))),
      toS(parseOklch(tokenRaw("bubble-mine"))),
    ),
    4.5,
  );

  console.log("\n── 그라디언트 위 글자 (양 끝, 4.5) ──");
  stops.forEach((s, i) => chk(`gradient stop ${i + 1} (${hex(s)})`, cr(s, primaryFg), 4.5));

  console.log("\n── 포커스 링 (비텍스트 3.0) ──");
  chk("ring / 배경", cr(toS(parseOklch(tokenRaw("ring"))), bg), 3.0);
}

audit("라이트 — 블러시 페이퍼", lightBlock);
audit("자정의 자두 — 다크 & 브랜드 접점", darkBlock);

console.log(fails === 0 ? "\n✅ 전부 통과" : `\n❌ ${fails}건 실패`);
process.exit(fails === 0 ? 0 : 1);
