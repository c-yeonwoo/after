import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import { createClient } from "@supabase/supabase-js";
import { estimateUsageUsd } from "./lib/ai-cost.mjs";

// Bounded, opt-in real-provider QA. Local synthetic accounts only; no real
// member copy, published profiles, outbound messages, payments or quota resets.
if (process.env.AFTER_LOCAL_AI_CONFIRM !== "synthetic-only")
  throw Error("Set AFTER_LOCAL_AI_CONFIRM=synthetic-only to authorize bounded provider QA");
const env = execFileSync("npx", ["supabase", "status", "-o", "env"], {
  encoding: "utf8",
  stdio: ["ignore", "pipe", "pipe"],
});
const value = (k) => env.match(new RegExp(`^${k}="?([^"\\n]+)"?`, "m"))?.[1];
const api = value("API_URL"),
  db = value("DB_URL");
if (!/^http:\/\/127\.0\.0\.1:\d+$/.test(api ?? "") || !db?.includes("@127.0.0.1:"))
  throw Error("Local Supabase only");
const service = createClient(api, value("SERVICE_ROLE_KEY"));
const sql = (s) =>
  execFileSync("psql", [db, "-v", "ON_ERROR_STOP=1", "-Atc", s], {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  }).trim();
const quote = (s) => String(s).replaceAll("'", "''");
const run = randomUUID().slice(0, 8),
  ids = [],
  password = randomUUID() + "Aa1!";
const output = `/tmp/after-pair-ai-live-${run}`;
const report = { environment: "local-synthetic-real-provider", cases: [] };
const story = (answers) => ({
  version: 3,
  headline: "처음에는 커피가 편해요",
  summary: answers[0],
  publishedRevision: 1,
  sections: ["daily_life", "getting_closer", "conversation"].map((id, i) => ({
    id,
    questionId: `${id}_v1`,
    questionVersion: 1,
    question: [
      "퇴근 후에는 어떻게 보내세요?",
      "어떤 만남에서 편해지나요?",
      "만나면 어떤 이야기를 나누고 싶나요?",
    ][i],
    answer: answers[i],
  })),
  conversationHooks: [],
});
const stories = [
  story([
    "퇴근 후에는 동네를 가볍게 걸어요.",
    "처음에는 조용한 카페에서 짧게 이야기하는 게 편해요.",
    "최근 본 영화나 동네에서 발견한 공간을 이야기하고 싶어요.",
  ]),
  story([
    "퇴근하고 집 근처를 걸으며 시간을 보내요.",
    "첫 만남은 커피 한 잔이 편해요. 시끄럽지 않은 곳에서 이야기하고 싶어요.",
    "최근에 본 영화와 좋아하는 카페 이야기를 나누고 싶어요.",
  ]),
  null,
];
try {
  const hub = ["yeouido", "pangyo", "jongno"].find(
    (h) => sql(`select count(*) from profiles where hub_id='${h}' and role='member'`) === "0",
  );
  if (!hub) throw Error("An empty local test zone is required; refusing to change existing users");
  for (let i = 0; i < 4; i++) {
    const email = `pair-live-${run}-${i}@verify.local`;
    const result = await service.auth.admin.createUser({ email, password, email_confirm: true });
    assert.ifError(result.error);
    const id = result.data.user.id;
    ids.push(id);
    const s = stories[i];
    sql(`insert into profiles(id,company_email,gender,hub_id,name,job,birth,role,onboarding_step,email_verified_at,
      terms_agreed_at,privacy_agreed_at,agreed_policy_version,phone_verified_at,photo_state,photo_paths,headline,intro,profile_story,profile_preferences)
      values('${id}','${email}','${i === 0 || i === 3 ? "male" : "female"}','${hub}','가상검증${i}',
      '${i === 2 ? "교육 기획" : "개발"}','1993-01-01','${i === 3 ? "admin" : "member"}',7,now(),now(),now(),'2026-10-31.1',now(),'approved',
      array['${id}/1.png','${id}/2.png','${id}/3.png'],${s ? `'${quote(s.headline)}'` : "null"},${s ? `'${quote(s.summary)}'` : "null"},${s ? `'${quote(JSON.stringify(s))}'::jsonb` : "null"},
      '{"choices":{"contact":["PRIVATE-NEVER-SEND"]}}');`);
  }
  sql(
    `insert into affinities(from_id,to_id,verdict) values('${ids[1]}','${ids[0]}','like'),('${ids[2]}','${ids[0]}','like')`,
  );
  const login = async (index) => {
    const r = await fetch(`${api}/auth/v1/token?grant_type=password`, {
      method: "POST",
      headers: { apikey: value("ANON_KEY"), "Content-Type": "application/json" },
      body: JSON.stringify({ email: `pair-live-${run}-${index}@verify.local`, password }),
    });
    const data = await r.json();
    assert.ok(r.ok && data.access_token, `Local fixture login (${r.status})`);
    return data.access_token;
  };
  const adminToken = await login(3);
  const call = async (endpoint, body, token) => {
    const started = Date.now();
    const r = await fetch(`${api}/functions/v1/${endpoint}`, {
      method: "POST",
      signal: AbortSignal.timeout(110000),
      headers: {
        apikey: value("ANON_KEY"),
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    });
    return { http: r.status, ms: Date.now() - started, data: await r.json() };
  };
  const shared = await call("compose-pair-brief", { maleId: ids[0], femaleId: ids[1] }, adminToken);
  report.cases.push({ name: "shared public interview", ...shared });
  assert.equal(shared.http, 200, `Pair provider failed: ${shared.data.error}`);
  assert.equal(shared.data.verified, true);
  assert.ok(shared.data.recommendation?.text);
  assert.ok(shared.data.recommendation.text.length <= 120);
  assert.equal(JSON.stringify(shared.data).includes("PRIVATE-NEVER-SEND"), false);
  const callsBefore = sql(`select count(*) from ai_runs where user_id='${ids[3]}'`);
  const cache = await call("compose-pair-brief", { maleId: ids[0], femaleId: ids[1] }, adminToken);
  report.cases.push({ name: "same source cache", ...cache });
  assert.equal(cache.http, 200);
  assert.equal(cache.data.meta.cached, true);
  assert.equal(cache.data.recommendation.text, shared.data.recommendation.text);
  assert.equal(sql(`select count(*) from ai_runs where user_id='${ids[3]}'`), callsBefore);
  const sparse = await call("compose-pair-brief", { maleId: ids[0], femaleId: ids[2] }, adminToken);
  report.cases.push({ name: "insufficient public evidence", ...sparse });
  assert.equal(sparse.http, 200, `Sparse provider failed: ${sparse.data.error}`);
  assert.equal(
    sparse.data.recommendation,
    null,
    "Do not invent a personalized reason without both sides' evidence",
  );
  const profile = await call(
    "compose-profile-v3",
    {
      mode: "compose",
      answers: {
        daily_life: "음.. 퇴근하면 동네 한바퀴 돌아요. 이어폰 끼고요.",
        getting_closer: "첨엔 카페에서 좀 얘기하면 편할듯. 너무 시끄러운 곳은 싫고요.",
        conversation: "요즘 본 독립영화 얘기 하고싶어요. 영화제도 언젠가 가보고 싶고요.",
      },
    },
    await login(0),
  );
  report.cases.push({ name: "warm first-person interview", ...profile });
  assert.equal(profile.http, 200, `Profile provider failed: ${profile.data.code}`);
  assert.equal(profile.data.story.sections.length, 3);
  assert.ok(profile.data.story.sections.every((s) => s.question && s.answer.length >= 5));
  for (const section of profile.data.story.sections)
    assert.doesNotMatch(
      section.answer,
      /싶대요|한다고 해요|하는 분이에요/,
      "Keep the member's first-person interview voice",
    );
  assert.ok(
    profile.data.story.sections.some((s) => /싶|언젠가/.test(s.answer)),
    "Future wish remains a wish",
  );
  if (process.env.AFTER_AI_EXTENDED === "1") {
    const memberToken = await login(0);
    const negative = await call(
      "compose-profile-v3",
      {
        mode: "compose",
        answers: {
          daily_life: "요즘 운동은 안 해요. 언젠가 등산을 시작해 보고 싶어요.",
          getting_closer: "술자리는 불편해서 첫 만남에는 커피만 마시고 싶어요.",
          conversation: "해외여행은 아직 가 본 적 없지만 여행 이야기는 좋아해요.",
        },
      },
      memberToken,
    );
    report.cases.push({ name: "negation and future wishes", ...negative });
    assert.equal(negative.http, 200, `Negation case failed: ${negative.data.code}`);
    const copy = negative.data.story.sections.map((s) => s.answer).join(" ");
    assert.match(copy, /안 |않|하지|쉬/);
    assert.match(copy, /싶|언젠가/);
    assert.match(copy, /아직|없/);
    assert.doesNotMatch(copy, /등산을 (?:즐|자주)|해외여행을 자주/);
    const analysis = await call(
      "compose-profile-v3",
      {
        mode: "analyze",
        answers: {
          daily_life: "퇴근 후에는 동네를 걸어요.",
          getting_closer: "처음에는 커피 한 잔이 편해요.",
          conversation: "최근에 본 영화 이야기를 나누고 싶어요.",
        },
      },
      memberToken,
    );
    report.cases.push({ name: "analysis fact extraction", ...analysis });
    assert.equal(analysis.http, 200, `Analysis failed: ${analysis.data.code}`);
    assert.ok(analysis.data.analysis.facts.length > 0);
    assert.doesNotMatch(
      JSON.stringify(analysis.data.analysis.summary),
      /책임감|성실한|다정한|건강한 생활/,
    );
    const legacy = await call(
      "compose-profile",
      {
        eveningNote: "퇴근하면 동네를 한 바퀴 걸어요.",
        knownAs: "처음에는 조용한 카페에서 이야기하는 게 편해요.",
        topicNote: "최근에 본 독립영화 이야기를 나누고 싶어요.",
      },
      memberToken,
    );
    report.cases.push({ name: "legacy client compatibility", ...legacy });
    assert.equal(legacy.http, 200, `Legacy compatibility failed: ${legacy.data.error}`);
    assert.ok(legacy.data.intro && legacy.data.headlines?.length);
  }
  report.pass = true;
  console.log(
    JSON.stringify({
      recommendation: shared.data.recommendation.text,
      profile: profile.data.story,
      timings: report.cases.map(({ name, ms }) => ({ name, ms })),
    }),
  );
} catch (error) {
  report.pass = false;
  report.error = error.message;
  process.exitCode = 1;
  console.error(`Real-provider synthetic QA failed: ${error.message}`);
} finally {
  if (ids.length) {
    const list = ids.map((id) => `'${id}'`).join(",");
    assert.equal(
      sql(
        `select count(*) from auth.users where id in (${list}) and email like 'pair-live-${run}-%@verify.local'`,
      ),
      String(ids.length),
      "cleanup ownership",
    );
    report.usage = JSON.parse(
      sql(
        `select coalesce(json_agg(json_build_object('feature',feature,'model',model,'status',status,'input_tokens',input_tokens,'output_tokens',output_tokens,'latency_ms',latency_ms)),'[]') from ai_runs where user_id in (${list})`,
      ),
    );
    report.estimatedUsd = report.usage.reduce((sum, row) => {
      const models = [...new Set(row.model.split("+"))];
      if (
        sum === null ||
        models.length !== 1 ||
        row.input_tokens === null ||
        row.output_tokens === null
      )
        return null;
      const cost = estimateUsageUsd({ [models[0]]: row });
      return cost === null ? null : sum + cost;
    }, 0);
    sql(`begin; delete from pair_brief_drafts where male_id in (${list}) or female_id in (${list});
      delete from profile_generation_versions where user_id in (${list});
      delete from ai_runs where user_id in (${list}); delete from events where user_id in (${list});
      delete from auth.users where id in (${list}) and email like 'pair-live-${run}-%@verify.local'; commit;`);
  }
  await mkdir(output, { recursive: true });
  await writeFile(`${output}/report.json`, JSON.stringify(report, null, 2));
  console.log(`Synthetic-only evidence: ${output}/report.json`);
  console.log(
    JSON.stringify({
      estimatedUsd: report.estimatedUsd,
      providerRuns: report.usage?.length,
      note: "Reported token usage, standard USD rates; taxes and unreported failed-call usage excluded",
    }),
  );
}
