import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { writeFile } from "node:fs/promises";
import { createClient } from "@supabase/supabase-js";

if (process.env.AFTER_LOCAL_AI_CONFIRM !== "synthetic-only")
  throw Error("Opt in with AFTER_LOCAL_AI_CONFIRM=synthetic-only");
const env = JSON.parse(
  execFileSync("npx", ["supabase", "status", "-o", "json"], {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  }),
);
if (!/^http:\/\/127\.0\.0\.1:\d+$/.test(env.API_URL) || !env.DB_URL.includes("@127.0.0.1:"))
  throw Error("Local only");
const service = createClient(env.API_URL, env.SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});
const sql = (statement) =>
  execFileSync("psql", [env.DB_URL, "-v", "ON_ERROR_STOP=1", "-Atc", statement], {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  }).trim();
const ids = [],
  emails = [],
  password = randomUUID() + "Aa1!";
const report = { scope: "local synthetic only; one generation + verifier maximum", cases: [] };
const call = async (target, token, consent = true) => {
  const response = await fetch(`${env.API_URL}/functions/v1/prepare-conversation`, {
    method: "POST",
    headers: {
      apikey: env.ANON_KEY,
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ target, requestId: randomUUID(), consent }),
    signal: AbortSignal.timeout(60000),
  });
  return { status: response.status, body: await response.json() };
};
try {
  for (let index = 0; index < 2; index++) {
    const email = `prep-live-${randomUUID()}@verify.local`;
    const created = await service.auth.admin.createUser({ email, password, email_confirm: true });
    assert.ifError(created.error);
    ids.push(created.data.user.id);
    emails.push(email);
    const id = ids[index];
    sql(`insert into profiles(id,gender,hub_id,company_email,email_verified_at,name,job,birth,onboarding_step,terms_agreed_at,privacy_agreed_at,agreed_policy_version,phone_verified_at,photo_paths,photo_state,intro,headline,profile_preferences)
      values('${id}','${index ? "male" : "female"}','gangnam','${email}',now(),'가상검증','기획','1996-01-01',7,now(),now(),'2026-10-17.3',now(),array['${id}/1.png','${id}/2.png','${id}/3.png'],'approved',
      '퇴근 후 동네를 걸으며 작은 카페를 찾아요. 주말에는 독립영화를 보고 기억에 남는 장면을 기록해요. 최근에는 수영을 배우기 시작했어요.',
      '일상에서 작은 즐거움을 찾는 편이에요','{"private":"PRIVATE-NEVER-SEND"}');`);
  }
  const member = createClient(env.API_URL, env.ANON_KEY, { auth: { persistSession: false } });
  const { data, error } = await member.auth.signInWithPassword({ email: emails[0], password });
  assert.ifError(error);
  const token = data.session.access_token;
  assert.equal((await call(ids[1], "invalid-token")).status, 401);
  assert.equal((await call(ids[0], token)).status, 403);
  assert.equal((await call(ids[1], token, false)).status, 400);
  assert.equal((await call(randomUUID(), token)).status, 403);
  assert.equal(
    sql(`select count(*) from ai_runs where user_id='${ids[0]}'`),
    "0",
    "denied requests never consume provider calls",
  );
  const first = await call(ids[1], token);
  report.cases.push({ name: "real generated questions", ...first });
  assert.equal(first.status, 200, JSON.stringify(first.body));
  assert.ok(first.body.topics.length >= 1 && first.body.topics.length <= 3);
  assert.equal(first.body.advice.length, 3, "three personalized pre-date tips");
  assert.deepEqual(
    new Set(first.body.advice.map((t) => t.kind)),
    new Set(["start", "respect", "pace"]),
  );
  assert.equal(/MBTI|ISFP|회피형|궁합|성공률/i.test(JSON.stringify(first.body)), false);
  assert.equal(JSON.stringify(first.body).includes("PRIVATE-NEVER-SEND"), false);
  const cached = await call(ids[1], token);
  report.cases.push({ name: "same source cached", ...cached });
  assert.equal(cached.body.cached, true);
  assert.equal(sql(`select count(*) from ai_runs where user_id='${ids[0]}'`), "1");
  const direct = await member.from("conversation_preparations").select("*");
  assert.ok(direct.error, "no direct cache access");
  sql(`select public.exclude_pair('${ids[0]}','${ids[1]}','blocked')`);
  const denied = await call(ids[1], token);
  assert.equal(denied.status, 403, "blocked target cannot receive cached preparation");
  report.cases.push({ name: "blocked cached target", ...denied });
  report.usage = JSON.parse(
    sql(
      `select json_agg(json_build_object('model',model,'status',status,'input_tokens',input_tokens,'output_tokens',output_tokens)) from ai_runs where user_id='${ids[0]}'`,
    ),
  );
  report.pass = true;
} finally {
  await writeFile("/tmp/after-conversation-prep-live.json", JSON.stringify(report, null, 2));
  for (const id of ids) await service.auth.admin.deleteUser(id);
}
console.log(JSON.stringify(report, null, 2));
