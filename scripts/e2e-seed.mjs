/**
 * 손으로 E2E 를 돌리기 위한 표본 데이터.
 *
 *   bun scripts/e2e-seed.mjs
 *
 * **로컬 Supabase 전용**이다(127.0.0.1:55321). 앱 번들과 dev 서버가 둘 다 로컬을
 * 보고 있어야 이 데이터가 보인다 — `npm run build:app:dev` 로 빌드했는지 확인.
 *
 * ── screenshot-seed 와 무엇이 다른가 ──
 * screenshot-seed 는 **한 계정을 가장 보기 좋은 한 지점**(확정 완료)에 놓는다.
 * 여기는 반대다. 여러 계정을 **서로 다른 단계**에 흩어 놓아서, 어느 화면을
 * 테스트하든 그 앞 단계를 손으로 만들지 않아도 되게 한다.
 *
 * 멱등하다. 몇 번 돌려도 같은 상태가 된다 — 동적 상태(소개·만남·티켓·신고·주문)를
 * 매번 걷어내고 다시 세운다.
 */
import { execFileSync } from "node:child_process";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const DB = ["-h", "127.0.0.1", "-p", "55322", "-U", "postgres", "-d", "postgres", "-qtA"];
const API = "http://127.0.0.1:55321";
const CHROME = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";

/** 전 계정 공용. 로컬 전용 값이라 코드에 둔다 — 운영 계정에는 절대 쓰지 않는다. */
const PASSWORD = "eclipse-e2e-2026";

const sql = (text) =>
  execFileSync("psql", [...DB, "-c", text], {
    env: { ...process.env, PGPASSWORD: "postgres" },
    encoding: "utf8",
  }).trim();

const q = (s) => String(s).replace(/'/g, "''");
/** text[] 리터럴. interests·match_tags·topics 는 jsonb 가 아니라 배열 컬럼이다. */
const arr = (xs) =>
  xs.length ? `array[${xs.map((x) => `'${q(x)}'`).join(",")}]::text[]` : "'{}'::text[]";

function serviceKey() {
  const out = execFileSync("npx", ["supabase", "status", "-o", "env"], { encoding: "utf8" });
  const m = out.match(/SERVICE_ROLE_KEY="?([^"\n]+)"?/);
  if (!m) throw new Error("service_role 키를 찾지 못했습니다. `npx supabase start` 했나요?");
  return m[1];
}
const KEY = serviceKey();

const api = (method, path, body) => {
  const args = [
    "-s",
    "-X",
    method,
    `${API}${path}`,
    "-H",
    `apikey: ${KEY}`,
    "-H",
    `Authorization: Bearer ${KEY}`,
    "-H",
    "Content-Type: application/json",
  ];
  if (body !== undefined) args.push("-d", JSON.stringify(body));
  const out = execFileSync("curl", args, { encoding: "utf8" });
  try {
    return JSON.parse(out);
  } catch {
    return out;
  }
};

/* ── 사람들 ────────────────────────────────────────────────────────── */

const PEOPLE = [
  {
    key: "m1",
    email: "m1@verify.local",
    gender: "male",
    name: "연우",
    initial: "연",
    hue: 12,
    birth: "1991-06-21",
    job: "백엔드 엔지니어",
    mbti: "INFP",
    headline: "코드는 조용히, 저녁은 느긋하게.",
    interests: ["동네 산책", "사진 찍기"],
    topics: ["요즘 빠져 있는 것"],
    matchTags: ["말이 느긋한 사람", "질문을 잘하는 사람"],
  },
  {
    key: "m2",
    email: "m2@verify.local",
    gender: "male",
    name: "민수",
    initial: "민",
    hue: -12,
    birth: "1990-02-08",
    job: "변호사",
    mbti: "ISTJ",
    headline: "요즘 도자기를 배우고 있습니다.",
    interests: ["도자기", "러닝"],
    topics: ["새로 배우는 것"],
    matchTags: ["차분한 사람"],
  },
  {
    key: "m3",
    email: "m3@verify.local",
    gender: "male",
    name: "지호",
    initial: "지",
    hue: 36,
    birth: "1994-11-30",
    job: "데이터 분석가",
    mbti: "ENTP",
    headline: "주말 아침 빵집 투어를 합니다.",
    interests: ["빵집 투어", "테니스"],
    topics: ["주말 루틴"],
    matchTags: ["웃음이 많은 사람"],
  },
  {
    key: "m4",
    email: "m4@verify.local",
    gender: "male",
    name: "태오",
    initial: "태",
    hue: 60,
    birth: "1992-09-03",
    job: "프로덕트 매니저",
    mbti: "ENFJ",
    headline: "퇴근길에 서점을 지나칩니다.",
    interests: ["서점 산책", "필름 카메라"],
    topics: ["요즘 읽는 책"],
    matchTags: ["이야기를 오래 하는 사람"],
  },
  {
    key: "f1",
    email: "f1@verify.local",
    gender: "female",
    name: "서연",
    initial: "서",
    hue: 0,
    birth: "1993-04-12",
    job: "UX 디자이너",
    mbti: "INFP",
    headline: "주말엔 작은 전시를 찾아다닙니다.",
    interests: ["동네 산책", "전시 보기"],
    topics: ["요즘 빠져 있는 것"],
    matchTags: ["말이 느긋한 사람", "질문을 잘하는 사람"],
  },
  {
    key: "f2",
    email: "f2@verify.local",
    gender: "female",
    name: "지우",
    initial: "지",
    hue: 24,
    birth: "1995-07-19",
    job: "마케터",
    mbti: "ENFP",
    headline: "달리기와 커피로 하루를 엽니다.",
    interests: ["러닝", "카페 투어"],
    topics: ["아침 루틴"],
    matchTags: ["부지런한 사람"],
  },
  {
    key: "f3",
    email: "f3@verify.local",
    gender: "female",
    name: "하람",
    initial: "하",
    hue: -22,
    birth: "1992-12-05",
    job: "약사",
    mbti: "ISFJ",
    headline: "조용한 동네 산책을 좋아합니다.",
    interests: ["동네 산책", "베이킹"],
    topics: ["조용한 저녁"],
    matchTags: ["말이 느긋한 사람"],
  },
  {
    key: "f4",
    email: "f4@verify.local",
    gender: "female",
    name: "나윤",
    initial: "나",
    hue: 300,
    birth: "1996-03-27",
    job: "회계사",
    mbti: "ISTP",
    headline: "요즘은 클라이밍에 빠져 있어요.",
    interests: ["클라이밍", "영화관"],
    topics: ["요즘 도전하는 것"],
    matchTags: ["운동을 같이 할 사람"],
  },
  {
    key: "f5",
    email: "f5@verify.local",
    gender: "female",
    name: "예린",
    initial: "예",
    hue: 200,
    birth: "1994-08-14",
    job: "간호사",
    mbti: "ESFJ",
    headline: "퇴근하고 요가를 갑니다.",
    interests: ["요가", "산책"],
    topics: ["몸 쓰는 취미"],
    matchTags: ["규칙적인 사람"],
  },
  {
    key: "admin",
    email: "admin@verify.local",
    gender: "male",
    name: "운영자",
    initial: "운",
    hue: 0,
    birth: "1988-01-01",
    job: "운영",
    mbti: "INTJ",
    role: "admin",
    headline: "운영 계정입니다.",
    interests: ["운영"],
    topics: [],
    matchTags: [],
  },
];

const byKey = {};
/** 표본에 속한 이메일 — 이 밖의 미완료 계정은 정리 대상이다. */
const PEOPLE_EMAILS = PEOPLE.map((p) => `'${p.email}'`).join(", ");

/* ── 1. 계정 · 프로필 ──────────────────────────────────────────────── */

console.log("· 계정과 프로필");
for (const p of PEOPLE) {
  let id = sql(`select id from auth.users where email = '${q(p.email)}'`);
  if (!id) {
    /*
      GoTrue 관리자 API 로 만든다. email_confirm 을 켜야 확인 메일 없이 바로
      로그인된다 — 로컬에는 받을 메일함이 없다.
    */
    const created = api("POST", "/auth/v1/admin/users", {
      email: p.email,
      password: PASSWORD,
      email_confirm: true,
    });
    id = created?.id;
    if (!id) throw new Error(`${p.email} 계정을 만들지 못했습니다: ${JSON.stringify(created)}`);
    console.log(`  + ${p.email} (신규)`);
  } else {
    // 비밀번호를 매번 알려진 값으로 되돌린다. 앞선 테스트에서 바꿨을 수 있다.
    api("PUT", `/auth/v1/admin/users/${id}`, { password: PASSWORD });
  }
  byKey[p.key] = id;

  sql(`
    insert into profiles (
      id, gender, hub_id, company_email, email_verified_at, account_state, role,
      name, birth, job, mbti, smoking, drinking, religion, headline,
      interests, match_tags, topics, intro, details,
      onboarding_step, terms_agreed_at, privacy_agreed_at, agreed_policy_version,
      feedback_emails, paused_at, photo_state
    ) values (
      '${id}', '${p.gender}', 'gangnam', '${q(p.email)}', now(), 'active', '${p.role ?? "member"}',
      '${q(p.name)}', '${p.birth}', '${q(p.job)}', '${p.mbti}', 'none', 'social', 'none',
      '${q(p.headline)}',
      ${arr(p.interests)}, ${arr(p.matchTags)}, ${arr(p.topics)},
      '${q(p.headline)}', '{}'::jsonb,
      7, now(), now(), '2026-08-17',
      true, null, 'approved'
    )
    on conflict (id) do update set
      name = excluded.name, birth = excluded.birth, job = excluded.job,
      mbti = excluded.mbti, headline = excluded.headline, intro = excluded.intro,
      interests = excluded.interests, match_tags = excluded.match_tags,
      topics = excluded.topics, onboarding_step = 7, account_state = 'active',
      role = excluded.role, paused_at = null, photo_state = 'approved',
      email_verified_at = coalesce(profiles.email_verified_at, now()),
      terms_agreed_at = coalesce(profiles.terms_agreed_at, now()),
      privacy_agreed_at = coalesce(profiles.privacy_agreed_at, now());
  `);
}

/* ── 2. 프로필 사진 ────────────────────────────────────────────────── */

const avatarSvg = (initial, hue) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 640 640">
  <defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
    <stop offset="0" stop-color="hsl(${(345 + hue) % 360} 55% 62%)"/>
    <stop offset="1" stop-color="hsl(${(316 + hue) % 360} 42% 26%)"/>
  </linearGradient></defs>
  <rect width="640" height="640" fill="url(#g)"/>
  <circle cx="320" cy="250" r="96" fill="#fff" opacity="0.22"/>
  <path d="M320 372c-104 0-188 70-188 156v112h376V528c0-86-84-156-188-156Z" fill="#fff" opacity="0.22"/>
  <text x="320" y="352" text-anchor="middle" font-size="150" font-weight="700" fill="#fff"
        opacity="0.92" font-family="-apple-system,'Apple SD Gothic Neo',sans-serif">${initial}</text>
</svg>`;

console.log("· 프로필 사진");
const tmp = mkdtempSync(join(tmpdir(), "eclipse-e2e-"));
for (const p of PEOPLE) {
  const id = byKey[p.key];
  const svg = join(tmp, `${p.key}.svg`);
  const png = join(tmp, `${p.key}.png`);
  writeFileSync(svg, avatarSvg(p.initial, p.hue));
  execFileSync(CHROME, [
    "--headless",
    "--disable-gpu",
    "--force-device-scale-factor=1",
    `--screenshot=${png}`,
    "--window-size=640,640",
    "--default-background-color=ffffffff",
    `file://${svg}`,
  ]);
  execFileSync("curl", [
    "-s",
    "-X",
    "POST",
    `${API}/storage/v1/object/profile-photos/${id}/portrait.png`,
    "-H",
    `Authorization: Bearer ${KEY}`,
    "-H",
    "Content-Type: image/png",
    "-H",
    "x-upsert: true",
    "--data-binary",
    `@${png}`,
  ]);
  sql(`update profiles set photo_url = '${id}/portrait.png' where id = '${id}'`);
}

/*
  photo_url 을 건드리면 트리거(profiles_photo_review)가 검수 상태를 pending 으로
  되돌린다 — 새 사진은 다시 봐야 한다는 뜻이고 앱 동작으로는 맞다. 다만 표본에서
  전원이 pending 이면 두 가지가 깨진다:
    · 남성이 여성 평가 큐에서 사라진다(is_eligible_candidate 가 approved 를 본다).
    · 소개 카드에 사진이 안 나온다.
  그래서 업로드 뒤 일괄 승인하고, **f5 예린 한 명만** 검수 대기로 남긴다.
*/
sql(`update profiles set photo_state = 'approved', photo_reviewed_at = now()
      where photo_url is not null`);
sql(`update profiles set photo_state = 'pending', photo_reviewed_at = null,
       photo_reviewed_by = null where id = '${byKey.f5}'`);

/* ── 3. 동적 상태 초기화 ───────────────────────────────────────────── */

console.log("· 진행 상태 초기화");
/*
  가입을 끝내지 않은 잡계정(onboarding_step < 7)을 걷어낸다. 손으로 가입을
  시험하다 남은 것들인데, 남겨 두면 운영자 목록과 평가 큐를 흐린다.
*/
sql(`delete from profiles
      where onboarding_step < 7 and company_email not in (${PEOPLE_EMAILS});`);
sql(`
  delete from messages;
  delete from feedbacks;
  delete from no_show_reports;
  delete from content_reports;
  delete from meetings;
  update tickets set state = 'unused', used_at = null, intro_id = null;
  delete from intros;
  delete from intro_queue;
  delete from intro_exclusions;
  delete from affinities;
  delete from ticket_orders;
  delete from tickets;
`);

const as = (id) => `set local "request.jwt.claims" to '{"sub":"${id}","role":"authenticated"}';`;
const give = (who, kind) => {
  const price = kind === "intro" ? 3000 : 30000;
  sql(
    `select issue_ticket('${byKey[who]}', 'e2e_${who}_${kind}_${Date.now()}', ${price}, '${kind}')`,
  );
};
/** 여성이 호감을 주고 → 운영자가 큐에 세우고 → 배달까지. 남성이 열 수 있는 상태. */
const queueUp = (male, female, note) => {
  sql(`insert into affinities (from_id, to_id, verdict)
       values ('${byKey[female]}','${byKey[male]}','like')
       on conflict (from_id, to_id) do update set verdict = 'like';`);
  sql(`begin; ${as(byKey.admin)} select admin_set_queue('${byKey[male]}',
        array['${byKey[female]}']::uuid[], '${q(note)}'); commit;`);
  sql(`select promote_intro_queue('${byKey[male]}');`);
};
const openIntro = (male) => {
  sql(`begin; ${as(byKey[male])} select open_intro(); commit;`);
  return sql(`select id from intros where male_id = '${byKey[male]}' and closed_at is null`);
};

/* ── 4. 단계별로 세운다 ────────────────────────────────────────────── */

console.log("· m1 연우 — 만남 확정 + 대화 열림");
give("m1", "intro");
give("m1", "meeting");
queueUp("m1", "f1", "전시·사진 취향이 겹칩니다. 활동 지역도 같아요.");
const i1 = openIntro("m1");
sql(`begin; ${as(byKey.m1)} select use_meeting_ticket('${i1}'); commit;`);
const mt1 = sql(`select id from meetings where intro_id = '${i1}'`);
sql(`begin; ${as(byKey.f1)} select submit_meeting_prefs('${mt1}',
      '{"dates":["2026-08-26"],"stations":["역삼","선릉"],"anywhere":false}'::jsonb); commit;`);
sql(`begin; ${as(byKey.m1)} select confirm_meeting('${mt1}',
      (date_trunc('day', (now() at time zone 'Asia/Seoul') + interval '5 days')
        + interval '19 hours') at time zone 'Asia/Seoul',
      '역삼역 3번 출구 근처', 'dinner'); commit;`);
const evening = (h, m) =>
  `((date_trunc('day', (now() at time zone 'Asia/Seoul')) - interval '1 day'` +
  ` + interval '${h} hours ${m} minutes') at time zone 'Asia/Seoul')`;
const msg = (who, body, h, m) =>
  `insert into messages (meeting_id, sender_id, channel, body, created_at) values ` +
  `('${mt1}', '${byKey[who]}', 'coord', $$${body}$$, ${evening(h, m)});`;
sql(
  [
    msg("f1", "안녕하세요! 프로필 잘 봤어요. 전시 좋아하신다고 하셨죠?", 20, 12),
    msg("m1", "네 맞아요. 요즘은 사진전 위주로 다니고 있어요.", 20, 28),
    msg("f1", "저도요. 지난주에 성수 쪽 전시 다녀왔어요.", 20, 41),
    msg("m1", "그날 저녁에 뵈어요. 역삼역 근처면 편하실까요?", 21, 3),
    msg("f1", "네, 거기 좋아요. 그때 뵈어요 :)", 21, 9),
  ].join("\n"),
);
give("m1", "meeting");

console.log("· m2 민수 — 소개 도착 (티켓 사용 전)");
give("m2", "intro");
give("m2", "meeting");
queueUp("m2", "f2", "아침 루틴이 비슷합니다. 러닝 이야기가 통할 것 같아요.");
openIntro("m2");

console.log("· m3 지호 — 티켓 사용, 하람 응답 대기");
give("m3", "intro");
give("m3", "meeting");
queueUp("m3", "f3", "둘 다 조용한 저녁을 좋아합니다.");
const i3 = openIntro("m3");
sql(`begin; ${as(byKey.m3)} select use_meeting_ticket('${i3}'); commit;`);

// 응답을 기다리는 동안에도 상점을 볼 수 있게 여유 티켓 한 장.
give("m3", "meeting");

console.log("· m4 태오 — 아무것도 없음 (소개 열기부터)");
give("m4", "intro");
queueUp("m4", "f4", "서점·영화 취향이 겹칩니다.");
// 일부러 열지 않는다 — open_intro 부터 손으로 해 보는 계정.

console.log("· f4 나윤 — 평가할 후보 남김");
// affinities 를 지웠으므로 f4 는 남성 전원이 미평가 상태다. next_candidate 가 준다.

console.log("· 운영자 대기열 — 신고 1건 · 주문 1건 · 사진 검수 1건");
sql(`begin; ${as(byKey.m2)} select report_content('${byKey.f3}'::uuid, 'profile'::report_kind,
      '프로필 사진이 다른 사람 같습니다. 확인 부탁드립니다. (E2E 표본)'); commit;`);
sql(
  `begin; ${as(byKey.m4)} select create_ticket_order(1::smallint, 'meeting'::ticket_kind); commit;`,
);

/* ── 5. 요약 ───────────────────────────────────────────────────────── */

const rows = [
  ["m1@verify.local", "연우 (남)", "만남 확정 · 대화 열림", "대화, 만남 후 피드백, 신고·차단"],
  ["m2@verify.local", "민수 (남)", "소개 도착, 티켓 2장", "소개 읽기 → 만남 티켓 쓰기"],
  ["m3@verify.local", "지호 (남)", "티켓 씀, 상대 응답 대기", "24시간 환불 카운트다운"],
  ["m4@verify.local", "태오 (남)", "소개 티켓 1장, 큐 대기", "소개 열기부터 끝까지"],
  ["f1@verify.local", "서연 (여)", "연우와 확정됨", "여성 쪽 확정 화면 · 대화"],
  ["f2@verify.local", "지우 (여)", "민수에게 호감 줬음", "민수 소개 카드의 상대"],
  ["f3@verify.local", "하람 (여)", "지호의 만남 선호 답할 차례", "만남 선호 입력"],
  ["f4@verify.local", "나윤 (여)", "평가할 후보 여러 명", "호감/패스 평가 큐"],
  ["f5@verify.local", "예린 (여)", "사진 검수 대기", "운영자 승인/반려가 반영되는지"],
  ["admin@verify.local", "운영자", "신고 1 · 주문 1 · 사진 1 대기", "/admin 전체"],
];
const w = [22, 12, 30];
console.log(`\n${"─".repeat(104)}`);
console.log(`비밀번호는 전 계정 공통: ${PASSWORD}`);
console.log(`${"─".repeat(104)}`);
console.log("계정".padEnd(w[0]) + "이름".padEnd(w[1]) + "지금 상태".padEnd(w[2]) + "여기서 볼 것");
console.log("─".repeat(104));
for (const r of rows) {
  console.log(r[0].padEnd(w[0]) + r[1].padEnd(w[1]) + r[2].padEnd(w[2]) + r[3]);
}
console.log("─".repeat(104));
