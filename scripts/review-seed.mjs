/**
 * App Store 심사용 계정과 최소 시연 상태를 운영 Supabase에 만든다.
 *
 *   APP_REVIEW_SEED_CONFIRM=tsytwxtuczceyojkiaty npm run review:seed
 *
 * 서비스 키와 비밀번호는 출력하지 않는다. 메인 심사 계정 두 개의 자격 증명은
 * gitignored `.app-review-accounts.json`에 mode 0600으로 저장한다. 여러 번 실행해도
 * 같은 계정을 새 상태로 되돌리고, 마지막에 실제 비밀번호 로그인과 RPC를 검증한다.
 */
import { execFileSync } from "node:child_process";
import { randomBytes } from "node:crypto";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const PROJECT_REF = "tsytwxtuczceyojkiaty";
const API = `https://${PROJECT_REF}.supabase.co`;
const CREDENTIALS_PATH = resolve(".app-review-accounts.json");

if (process.env.APP_REVIEW_SEED_CONFIRM !== PROJECT_REF) {
  throw new Error(
    `운영 프로젝트 확인이 필요합니다: APP_REVIEW_SEED_CONFIRM=${PROJECT_REF} npm run review:seed`,
  );
}

function projectKeys() {
  const raw = execFileSync(
    "npx",
    ["supabase", "projects", "api-keys", "--project-ref", PROJECT_REF],
    { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] },
  );
  const keys = JSON.parse(raw).keys;
  const service = keys.find((key) => key.id === "service_role")?.api_key;
  const anon = keys.find((key) => key.id === "anon")?.api_key;
  if (!service || !anon) throw new Error("Supabase API 키를 읽지 못했습니다.");
  return { service, anon };
}

const { service, anon } = projectKeys();
const serviceHeaders = {
  apikey: service,
  Authorization: `Bearer ${service}`,
  "Content-Type": "application/json",
};

async function request(path, { method = "GET", body, headers = serviceHeaders } = {}) {
  const response = await fetch(`${API}${path}`, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await response.text();
  if (!response.ok) {
    throw new Error(`${method} ${path} 실패 (${response.status}): ${text.slice(0, 500)}`);
  }
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

function newPassword() {
  return `Ec!${randomBytes(18).toString("base64url")}9a`;
}

const saved = existsSync(CREDENTIALS_PATH)
  ? JSON.parse(readFileSync(CREDENTIALS_PATH, "utf8"))
  : null;
const credentials = {
  projectRef: PROJECT_REF,
  generatedAt: saved?.generatedAt ?? new Date().toISOString(),
  note: "App Store Connect 심사 정보에만 사용. 심사 완료 후 계정을 제거하거나 비밀번호를 변경하세요.",
  male: {
    email: "review-male@eclps.kr",
    password: saved?.male?.password ?? newPassword(),
  },
  female: {
    email: "review-female@eclps.kr",
    password: saved?.female?.password ?? newPassword(),
  },
};

const people = [
  {
    key: "male",
    email: credentials.male.email,
    password: credentials.male.password,
    gender: "male",
    name: "민재",
    birth: "1991-05-18",
    job: "서비스 기획자",
    mbti: "ENFJ",
    headline: "퇴근 뒤에는 산책하며 하루를 정리합니다.",
    intro:
      "새로운 동네를 걷고 작은 식당을 찾아가는 걸 좋아합니다. 서로의 일과 일상을 편하게 나눌 수 있으면 좋겠습니다.",
    interests: ["동네 산책", "전시 보기", "맛집 탐방"],
    matchTags: ["대화를 편하게 이어가는 사람", "약속을 소중히 여기는 사람"],
    topics: ["주말에 쉬는 방법", "요즘 새로 시작한 것"],
    createdAt: "2026-01-03T00:00:00.000Z",
  },
  {
    key: "female",
    email: credentials.female.email,
    password: credentials.female.password,
    gender: "female",
    name: "하린",
    birth: "1993-10-09",
    job: "UX 디자이너",
    mbti: "INFP",
    headline: "주말에는 작은 전시와 조용한 카페를 찾습니다.",
    intro:
      "바쁜 주중에도 저녁 한 번은 천천히 대화할 시간을 만들려고 합니다. 전시와 산책 이야기를 좋아해요.",
    interests: ["전시 보기", "산책", "커피"],
    matchTags: ["질문을 잘하는 사람", "느긋하게 대화하는 사람"],
    topics: ["최근 기억에 남은 전시", "퇴근 후 루틴"],
    createdAt: "2026-01-04T00:00:00.000Z",
  },
  {
    key: "candidate1",
    email: "review-candidate-1@eclps.kr",
    password: newPassword(),
    gender: "male",
    name: "서준",
    birth: "1990-02-14",
    job: "백엔드 엔지니어",
    mbti: "ISTJ",
    headline: "일요일 아침에는 한강을 달립니다.",
    intro: "평일에는 차분히 일하고 주말에는 러닝이나 근교 나들이로 리듬을 바꿉니다.",
    interests: ["러닝", "커피", "근교 여행"],
    matchTags: ["약속 시간을 잘 지키는 사람", "건강한 취미가 있는 사람"],
    topics: ["꾸준히 하는 습관", "좋아하는 동네"],
    createdAt: "2025-01-01T00:00:00.000Z",
  },
  {
    key: "candidate2",
    email: "review-candidate-2@eclps.kr",
    password: newPassword(),
    gender: "male",
    name: "도윤",
    birth: "1992-08-27",
    job: "브랜드 마케터",
    mbti: "ENTP",
    headline: "좋은 식당을 발견하면 지도를 먼저 켭니다.",
    intro:
      "새로 생긴 공간과 오래된 맛집을 함께 찾아다니는 걸 좋아합니다. 유쾌하고 솔직한 대화를 기대해요.",
    interests: ["맛집 탐방", "영화", "사진"],
    matchTags: ["웃음이 많은 사람", "새로운 경험을 즐기는 사람"],
    topics: ["최근 본 영화", "추천하고 싶은 식당"],
    createdAt: "2025-01-02T00:00:00.000Z",
  },
];

async function authUsers() {
  const result = await request("/auth/v1/admin/users?page=1&per_page=1000");
  return Array.isArray(result) ? result : (result?.users ?? []);
}

async function upsertAuthUser(person, existing) {
  const payload = {
    email: person.email,
    password: person.password,
    email_confirm: true,
    user_metadata: { purpose: "app_store_review" },
  };
  if (existing) {
    return request(`/auth/v1/admin/users/${existing.id}`, { method: "PUT", body: payload });
  }
  return request("/auth/v1/admin/users", { method: "POST", body: payload });
}

async function resetReviewState(ids) {
  const intros = (await request(`/rest/v1/intros?male_id=eq.${ids.male}&select=id`)) ?? [];
  for (const intro of intros) {
    const meetings = (await request(`/rest/v1/meetings?intro_id=eq.${intro.id}&select=id`)) ?? [];
    for (const meeting of meetings) {
      for (const table of ["messages", "feedbacks", "no_show_reports"]) {
        await request(`/rest/v1/${table}?meeting_id=eq.${meeting.id}`, { method: "DELETE" });
      }
      await request(`/rest/v1/meetings?id=eq.${meeting.id}`, { method: "DELETE" });
    }
  }
  await request(`/rest/v1/tickets?user_id=eq.${ids.male}&payment_id=like.app_review_%25`, {
    method: "DELETE",
  });
  await request(`/rest/v1/intros?male_id=eq.${ids.male}`, { method: "DELETE" });
  await request(`/rest/v1/intro_queue?male_id=eq.${ids.male}`, { method: "DELETE" });
  await request(`/rest/v1/affinities?from_id=eq.${ids.female}&to_id=eq.${ids.male}`, {
    method: "DELETE",
  });
  await request(`/rest/v1/candidate_impressions?viewer_id=eq.${ids.female}`, {
    method: "DELETE",
  });
}

console.log("· 심사 계정 생성 또는 갱신");
const existingUsers = await authUsers();
const ids = {};
for (const person of people) {
  const existing = existingUsers.find((user) => user.email?.toLowerCase() === person.email);
  const user = await upsertAuthUser(person, existing);
  ids[person.key] = user.id;
}

const now = new Date().toISOString();
const profiles = people.map((person) => ({
  id: ids[person.key],
  gender: person.gender,
  hub_id: "gangnam",
  company_email: person.email,
  email_verified_at: now,
  account_state: "active",
  role: "member",
  name: person.name,
  birth: person.birth,
  job: person.job,
  mbti: person.mbti,
  smoking: "none",
  drinking: "social",
  religion: "none",
  headline: person.headline,
  intro: person.intro,
  interests: person.interests,
  match_tags: person.matchTags,
  topics: person.topics,
  details: {},
  onboarding_step: 7,
  terms_agreed_at: now,
  privacy_agreed_at: now,
  agreed_policy_version: "2026-09-20",
  feedback_emails: false,
  paused_at: null,
  photo_url: null,
  photo_state: "approved",
  photo_reviewed_at: now,
  created_at: person.createdAt,
  updated_at: now,
}));

await request("/rest/v1/profiles?on_conflict=id", {
  method: "POST",
  headers: {
    ...serviceHeaders,
    Prefer: "resolution=merge-duplicates,return=minimal",
  },
  body: profiles,
});

console.log("· 소개 카드와 평가 후보 구성");
await resetReviewState(ids);
const admins = await request("/rest/v1/profiles?role=eq.admin&select=id&limit=1");
if (!admins?.[0]?.id) throw new Error("큐레이션 주체로 쓸 운영자 계정이 없습니다.");

await request("/rest/v1/affinities?on_conflict=from_id,to_id", {
  method: "POST",
  headers: { ...serviceHeaders, Prefer: "resolution=merge-duplicates,return=minimal" },
  body: {
    from_id: ids.female,
    to_id: ids.male,
    verdict: "like",
    created_at: now,
  },
});

const deliveredAt = new Date();
const expiresAt = new Date(deliveredAt.getTime() + 21 * 24 * 60 * 60 * 1000);
await request("/rest/v1/intro_queue", {
  method: "POST",
  headers: { ...serviceHeaders, Prefer: "return=minimal" },
  body: {
    male_id: ids.male,
    female_id: ids.female,
    position: 1,
    curated_by: admins[0].id,
    note: "App Store 심사 시연용 소개입니다.",
    delivered_at: deliveredAt.toISOString(),
    expires_at: expiresAt.toISOString(),
  },
});

await request("/rest/v1/tickets", {
  method: "POST",
  headers: { ...serviceHeaders, Prefer: "return=minimal" },
  body: [
    {
      user_id: ids.male,
      state: "unused",
      price_krw: 0,
      payment_id: `app_review_intro_${ids.male}`,
      kind: "intro",
    },
    {
      user_id: ids.male,
      state: "unused",
      price_krw: 0,
      payment_id: `app_review_meeting_${ids.male}`,
      kind: "meeting",
    },
  ],
});

async function signIn(account) {
  const response = await fetch(`${API}/auth/v1/token?grant_type=password`, {
    method: "POST",
    headers: { apikey: anon, "Content-Type": "application/json" },
    body: JSON.stringify(account),
  });
  const body = await response.json();
  if (!response.ok || !body.access_token) {
    throw new Error(`심사 계정 로그인 검증 실패: ${account.email}`);
  }
  return body.access_token;
}

async function rpc(name, token) {
  return request(`/rest/v1/rpc/${name}`, {
    method: "POST",
    headers: {
      apikey: anon,
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: {},
  });
}

console.log("· 실제 로그인과 심사 화면 검증");
const settings = await request("/rest/v1/app_settings?id=eq.true&select=payments_enabled");
if (settings?.[0]?.payments_enabled !== false) {
  throw new Error("운영 DB의 결제 스위치가 OFF가 아닙니다.");
}
const maleToken = await signIn(credentials.male);
const femaleToken = await signIn(credentials.female);
const home = await rpc("home_state", maleToken);
if (home?.queued_intros < 1 || home?.intro_tickets < 1 || home?.meeting_tickets < 1) {
  throw new Error("남성 심사 계정에 소개 카드 또는 무료 티켓이 준비되지 않았습니다.");
}
const candidate = await rpc("next_candidate", femaleToken);
if (!Array.isArray(candidate) || candidate.length !== 1) {
  throw new Error("여성 심사 계정에 평가 가능한 후보가 준비되지 않았습니다.");
}

process.umask(0o077);
writeFileSync(CREDENTIALS_PATH, `${JSON.stringify(credentials, null, 2)}\n`, { mode: 0o600 });
console.log(`✓ 완료 — 자격 증명은 ${CREDENTIALS_PATH}에만 저장했습니다.`);
