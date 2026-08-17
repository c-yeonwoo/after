/**
 * 앱스토어 스크린샷용 목데이터.
 *
 *   bun scripts/screenshot-seed.mjs
 *
 * 로컬 Supabase 에만 쓴다. 하는 일이 둘이다.
 *
 * 1. **프로필 사진을 만들어 올린다.** 검증용 시드는 photo_url 만 채워 두고
 *    스토리지에는 아무것도 없었다(objects 0건). 그 상태로 캡처하면 스토어
 *    스크린샷에 빈 회색 원이 늘어선다.
 *
 * 2. **보여줄 만한 상태로 옮긴다.** 소개 도착 · 확정된 만남 · 오간 대화까지.
 *    빈 화면을 찍으면 앱이 뭘 하는지 안 보인다.
 *
 * ── 왜 실제 인물 사진이 아닌가 ──
 * 스톡 사진은 라이선스가 필요하고, 생성한 얼굴은 "실제 사용자처럼" 보이는 것이
 * 문제다. 그래서 **브랜드 색 그라디언트 + 이니셜**로 명백히 도안임을 드러낸다.
 * 실제 제출 전에 라이선스 있는 사진으로 갈아끼우려면 avatarSvg 만 바꾸면 된다.
 */
import { execFileSync } from "node:child_process";
import { mkdtempSync, writeFileSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const DB = ["-h", "127.0.0.1", "-p", "55322", "-U", "postgres", "-d", "postgres", "-qtA"];
const STORAGE = "http://127.0.0.1:55321/storage/v1";
const CHROME = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";

function sql(text) {
  return execFileSync("psql", [...DB, "-c", text], {
    env: { ...process.env, PGPASSWORD: "postgres" },
    encoding: "utf8",
  }).trim();
}

/** 로컬 스택의 service_role 키. supabase status 가 유일하게 믿을 수 있는 출처다. */
function serviceKey() {
  const out = execFileSync("npx", ["supabase", "status", "-o", "env"], { encoding: "utf8" });
  const m = out.match(/SERVICE_ROLE_KEY="?([^"\n]+)"?/);
  if (!m) throw new Error("service_role 키를 찾지 못했습니다. supabase 가 떠 있나요?");
  return m[1];
}

/**
 * 아바타 도안.
 *
 * 사람 얼굴을 흉내내지 않는다 — 부드러운 듀오톤 바탕에 이니셜 하나. 자두-로즈
 * 계열 안에서 사람마다 색상을 돌려 서로 구분되게 한다.
 */
function avatarSvg(initial, hueShift) {
  const a = `hsl(${(345 + hueShift) % 360} 55% 62%)`;
  const b = `hsl(${(316 + hueShift) % 360} 42% 26%)`;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 640 640">
  <defs>
    <linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="${a}"/>
      <stop offset="1" stop-color="${b}"/>
    </linearGradient>
  </defs>
  <rect width="640" height="640" fill="url(#g)"/>
  <circle cx="320" cy="250" r="96" fill="#ffffff" opacity="0.22"/>
  <path d="M320 372c-104 0-188 70-188 156v112h376V528c0-86-84-156-188-156Z" fill="#ffffff" opacity="0.22"/>
  <text x="320" y="352" text-anchor="middle" font-size="150" font-weight="700"
        fill="#ffffff" opacity="0.92"
        font-family="-apple-system, 'Apple SD Gothic Neo', sans-serif">${initial}</text>
</svg>`;
}

const PEOPLE = [
  { email: "f1@verify.local", initial: "서", hue: 0 },
  { email: "f2@verify.local", initial: "지", hue: 24 },
  { email: "f3@verify.local", initial: "하", hue: -22 },
  { email: "m1@verify.local", initial: "연", hue: 12 },
  { email: "m2@verify.local", initial: "민", hue: -12 },
  { email: "m3@verify.local", initial: "지", hue: 36 },
];

const tmp = mkdtempSync(join(tmpdir(), "eclipse-shots-"));
const key = serviceKey();

console.log("· 아바타 생성·업로드");
for (const p of PEOPLE) {
  const id = sql(`select id from profiles where company_email = '${p.email}'`);
  if (!id) {
    console.log(`  건너뜀 — ${p.email} 없음`);
    continue;
  }
  const svgPath = join(tmp, `${p.initial}.svg`);
  const pngPath = join(tmp, `${p.initial}.png`);
  writeFileSync(svgPath, avatarSvg(p.initial, p.hue));
  execFileSync(CHROME, [
    "--headless",
    "--disable-gpu",
    "--force-device-scale-factor=1",
    `--screenshot=${pngPath}`,
    "--window-size=640,640",
    "--default-background-color=ffffffff",
    `file://${svgPath}`,
  ]);

  const objectPath = `${id}/portrait.png`;
  execFileSync("curl", [
    "-s",
    "-X",
    "POST",
    `${STORAGE}/object/profile-photos/${objectPath}`,
    "-H",
    `Authorization: Bearer ${key}`,
    "-H",
    "Content-Type: image/png",
    "-H",
    "x-upsert: true",
    "--data-binary",
    `@${pngPath}`,
  ]);
  sql(`update profiles set photo_url = '${objectPath}' where id = '${id}'`);
  console.log(`  ${p.email} → ${objectPath} (${readFileSync(pngPath).length}바이트)`);
}

console.log("· 상태 구성 — demo-state.mjs 로 확정 상태까지 전진");
execFileSync("bun", ["scripts/demo-state.mjs", "confirmed"], {
  env: {
    ...process.env,
    DEMO_MALE: "m1@verify.local",
    DEMO_FEMALE: "f1@verify.local",
    DEMO_ADMIN: "admin@verify.local",
  },
  stdio: "inherit",
});

console.log("· 대화 채우기");
const male = sql(`select id from profiles where company_email = 'm1@verify.local'`);
const female = sql(`select id from profiles where company_email = 'f1@verify.local'`);
const meetingId = sql(`
  select m.id from meetings m
    join intros i on i.id = m.intro_id
   where i.male_id = '${male}' and m.confirmed_at is not null
   order by m.created_at desc limit 1;
`);
if (!meetingId) throw new Error("확정된 만남을 찾지 못했습니다.");

sql(`delete from messages where meeting_id = '${meetingId}'`);
/*
  채널이 둘이다(msg_channel: coord · private). 확정 전의 조율 대화가 coord 이고,
  확정 뒤 private_opens_at 을 지나면 private 이 열린다. 스크린샷은 확정 상태를
  보여주므로 조율 대화(coord)를 채운다 — 사적 대화는 만남 직전에야 열린다.
*/
/*
  시각은 **어제 저녁**에 고정한다. "now() - N분" 으로 두면 스크립트를 돌린 시각에
  따라 새벽 3시 대화가 되어 스크린샷에 그대로 찍힌다 — 퇴근 후 서비스의 대화가
  오전 8시로 보이면 앞뒤가 안 맞는다.
*/
const evening = (h, m) =>
  `((date_trunc('day', (now() at time zone 'Asia/Seoul')) - interval '1 day'` +
  ` + interval '${h} hours ${m} minutes') at time zone 'Asia/Seoul')`;
const line = (who, body, h, m) =>
  `insert into messages (meeting_id, sender_id, channel, body, created_at) values ` +
  `('${meetingId}', '${who}', 'coord', $$${body}$$, ${evening(h, m)});`;
sql(
  [
    line(female, "안녕하세요! 프로필 잘 봤어요. 전시 좋아하신다고 하셨죠?", 20, 12),
    line(male, "네 맞아요. 요즘은 사진전 위주로 다니고 있어요.", 20, 28),
    line(female, "저도요. 지난주에 성수 쪽 전시 다녀왔어요.", 20, 41),
    line(male, "그날 저녁에 뵈어요. 역삼역 근처면 편하실까요?", 21, 3),
    line(female, "네, 거기 좋아요. 그때 뵈어요 :)", 21, 9),
  ].join("\n"),
);

/*
  티켓을 종류별로 한 장씩 남겨 둔다. 소개를 여느라 intro 티켓이 소진되는데,
  "보유 0장" 이 찍힌 화면은 앱이 비어 보인다.
*/
for (const [kind, price] of [
  ["intro", 3000],
  ["meeting", 30000],
]) {
  sql(`
    select issue_ticket('${male}', 'shots_${kind}_${Date.now()}', ${price}, '${kind}')
     where not exists (
       select 1 from tickets
        where user_id = '${male}' and state = 'unused' and kind = '${kind}');
  `);
}

console.log("· 완료 — m1@verify.local(연우)로 로그인하면 확정된 만남과 대화가 보입니다.");
