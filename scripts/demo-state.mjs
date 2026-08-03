/**
 * 디자인 확인용 — 데모 계정의 진행 상태를 원하는 지점으로 옮긴다.
 *
 *   bun scripts/demo-state.mjs <상태>
 *
 *   waiting    소개 대기 (열린 소개 없음)
 *   intro      소개 도착 (남성에게 후보 1명)
 *   pending    티켓 사용 · 상대 응답 대기 (24시간 환불 카운트다운이 보인다)
 *   scheduling 선호 응답 완료 · 남성이 날짜 고르는 중 (대화는 아직 닫힘 — S7)
 *   confirmed  만남 확정 → 이때 대화가 열린다 (날짜·장소·사적 대화 오픈 시각)
 *
 * 주의: 도메인은 의도적으로 **전진만** 가능하다(확정을 되돌리는 RPC 는 없다).
 * 그래서 이 스크립트는 되감을 때만 SQL 을 직접 쓴다 — 개발 도구 전용이며
 * 앱 코드에는 이런 경로가 없다.
 */
import { execFileSync } from "node:child_process";

const STATES = ["waiting", "intro", "pending", "scheduling", "confirmed"];
const target = process.argv[2];

if (!STATES.includes(target)) {
  console.error(`사용법: bun scripts/demo-state.mjs <${STATES.join("|")}>`);
  process.exit(1);
}

const MALE = "yeonwoo@demo.after";
const FEMALE = "hana@demo.after";

function sql(text) {
  return execFileSync(
    "psql",
    ["-h", "127.0.0.1", "-p", "55322", "-U", "postgres", "-d", "postgres", "-qtA", "-c", text],
    { env: { ...process.env, PGPASSWORD: "postgres" }, encoding: "utf8" },
  ).trim();
}

const maleId = sql(`select id from profiles where company_email = '${MALE}'`);
const femaleId = sql(`select id from profiles where company_email = '${FEMALE}'`);
if (!maleId || !femaleId) {
  console.error("데모 계정을 찾을 수 없습니다. 시드가 적용됐는지 확인하세요.");
  process.exit(1);
}

// 항상 깨끗한 지점에서 시작한다: 진행 중인 만남·소개를 걷어낸다.
sql(`
  delete from messages  where meeting_id in (
    select m.id from meetings m join intros i on i.id = m.intro_id where i.male_id = '${maleId}');
  delete from feedbacks where meeting_id in (
    select m.id from meetings m join intros i on i.id = m.intro_id where i.male_id = '${maleId}');
  delete from no_show_reports where meeting_id in (
    select m.id from meetings m join intros i on i.id = m.intro_id where i.male_id = '${maleId}');
  delete from meetings where intro_id in (select id from intros where male_id = '${maleId}');
  -- tickets.intro_id 가 intros 를 참조하므로 intros 를 지우기 전에 먼저 끊는다.
  update tickets set state = 'unused', used_at = null, intro_id = null where user_id = '${maleId}';
  delete from intros where male_id = '${maleId}';
  delete from intro_exclusions
   where user_lo = least('${maleId}'::uuid,'${femaleId}'::uuid)
     and user_hi = greatest('${maleId}'::uuid,'${femaleId}'::uuid);
`);

if (target === "waiting") {
  // 호감 자체를 지워야 소개가 안 열린다.
  sql(`delete from affinities where from_id = '${femaleId}' and to_id = '${maleId}'`);
  console.log("→ 소개 대기 상태");
  process.exit(0);
}

// 이후 상태는 전부 "여성이 호감을 줬다" 에서 출발한다.
sql(`
  insert into affinities (from_id, to_id, verdict) values ('${femaleId}','${maleId}','like')
  on conflict (from_id, to_id) do update set verdict = 'like';
`);

// 티켓 보유 보장 (없으면 결제 웹훅 경로로 발급)
const unused = sql(`select count(*) from tickets where user_id = '${maleId}' and state = 'unused'`);
if (Number(unused) === 0) {
  sql(`select issue_ticket('${maleId}', 'demo_${Date.now()}', 30000)`);
}

const asMale = `set local "request.jwt.claims" to '{"sub":"${maleId}","role":"authenticated"}';`;
const asFemale = `set local "request.jwt.claims" to '{"sub":"${femaleId}","role":"authenticated"}';`;

sql(`begin; ${asMale} select open_intro(); commit;`);
if (target === "intro") {
  console.log("→ 소개 도착 상태 (남성 홈에 후보 카드)");
  process.exit(0);
}

const introId = sql(`select id from intros where male_id = '${maleId}' and closed_at is null`);
sql(`begin; ${asMale} select use_meeting_ticket('${introId}'); commit;`);
if (target === "pending") {
  console.log("→ 응답 대기 상태 (남성 홈에 24시간 환불 카운트다운)");
  process.exit(0);
}

const meetingId = sql(`select id from meetings where intro_id = '${introId}'`);
sql(`begin; ${asFemale} select submit_meeting_prefs('${meetingId}',
      '{"dates":["2026-08-06"],"area":"역삼","food":"상관없어요"}'::jsonb); commit;`);
if (target === "scheduling") {
  console.log("→ 선호 응답 완료 · 남성이 날짜 고르는 중 (대화는 아직 닫힘)");
  process.exit(0);
}

sql(`begin; ${asMale} select confirm_meeting('${meetingId}', now() + interval '5 days',
      '역삼역 3번 출구 근처', 'dinner'); commit;`);
console.log("→ 만남 확정 상태 (날짜·장소·사적 대화 오픈 시각)");
