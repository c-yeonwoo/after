/**
 * 운영 Supabase Auth 의 인증 메일을 저장소와 맞춘다.
 *
 * ── 왜 스크립트인가 ──
 * 운영의 메일 템플릿·OTP 길이·발신자 이름은 대시보드(Authentication → Emails)가
 * 정본이고 config.toml 을 읽지 않는다. `supabase config push` 는 Auth 설정 전체를
 * 덮어써서 쓰지 않는다(after-deploy 메모). 그 사이에 운영만 옛 이름(이클립스·세라)과
 * 8자리 코드로 남았다(2026-10-10). 바꿀 항목만 Management API 로 PATCH 한다.
 *
 * 사용:
 *   SUPABASE_ACCESS_TOKEN=... node scripts/sync-auth-email.mjs          # 바뀔 값만 출력
 *   SUPABASE_ACCESS_TOKEN=... node scripts/sync-auth-email.mjs --apply  # 실제 반영
 *
 * 토큰: supabase.com → Account → Access Tokens.
 */
import { readFileSync } from "node:fs";

const REF = process.env.SUPABASE_PROJECT_REF ?? "tsytwxtuczceyojkiaty";
const TOKEN = process.env.SUPABASE_ACCESS_TOKEN;
const APPLY = process.argv.includes("--apply");

if (!TOKEN) {
  console.error("SUPABASE_ACCESS_TOKEN 이 필요합니다.");
  process.exit(1);
}

/* 파일 머리의 설명 주석은 메일에 실을 이유가 없다. */
const template = (name) =>
  readFileSync(new URL(`../supabase/templates/${name}`, import.meta.url), "utf8")
    .replace(/^<!--[\s\S]*?-->\s*/, "")
    .trim();

const desired = {
  // 제목·본문은 config.toml 의 로컬 설정과 같은 값이다.
  mailer_subjects_magic_link: "인증 코드 {{ .Token }} — 애프터",
  mailer_templates_magic_link_content: template("magic_link.html"),
  mailer_subjects_confirmation: "가입 인증 코드 {{ .Token }} — 애프터",
  mailer_templates_confirmation_content: template("confirm_signup.html"),
  // 앱은 6~10자리를 다 받는다(api.ts OTP_MIN_LENGTH). 6자리가 입력하기 쉽다.
  mailer_otp_length: 6,
  smtp_sender_name: "애프터",
};

const url = `https://api.supabase.com/v1/projects/${REF}/config/auth`;
const headers = { Authorization: `Bearer ${TOKEN}`, "Content-Type": "application/json" };

const current = await fetch(url, { headers }).then((r) => {
  if (!r.ok) throw new Error(`auth config 조회 실패: HTTP ${r.status}`);
  return r.json();
});

const changes = Object.fromEntries(
  Object.entries(desired).filter(([key, value]) => current[key] !== value),
);
const preview = (v) => (typeof v === "string" && v.length > 70 ? `${v.slice(0, 70)}…` : v);

if (Object.keys(changes).length === 0) {
  console.log("이미 저장소와 같습니다.");
  process.exit(0);
}
for (const [key, value] of Object.entries(changes)) {
  console.log(`· ${key}\n    지금: ${preview(current[key])}\n    바꿀: ${preview(value)}`);
}

if (!APPLY) {
  console.log("\n--apply 를 붙이면 반영합니다.");
  process.exit(0);
}

const res = await fetch(url, { method: "PATCH", headers, body: JSON.stringify(changes) });
if (!res.ok) throw new Error(`반영 실패: HTTP ${res.status} ${await res.text()}`);
console.log(`\n${Object.keys(changes).length}개 항목을 반영했습니다.`);
