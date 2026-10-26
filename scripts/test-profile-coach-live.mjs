import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { existsSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { createClient } from "@supabase/supabase-js";
import { localEnvironment, database, quote } from "./lib/manual-cycle-fixtures.mjs";
import {
  fileGenerationReceipts,
  recordedGeneration,
} from "./lib/concierge-generation-receipts.mjs";

// Two synthetic owners, at most one generation + verification each. Never automatically repeat.
assert.equal(process.env.AFTER_LOCAL_AI_CONFIRM, "synthetic-only");
const output = "/tmp/after-profile-coach-live-v5";
const remaining = process.env.AFTER_COACH_REMAINING === "1";
if (remaining) {
  // A diagnosed failure does not get retried. Only the originally budgeted second case.
  const first = JSON.parse(await readFile(`${output}/receipts/profile-coach-0.json`, "utf8"));
  assert.equal(first.response?.status, 502);
  assert.equal(first.response?.data?.code, "quality_failed");
  assert.equal(existsSync(`${output}/remaining-started.json`), false);
  assert.equal(existsSync(`${output}/receipts/profile-coach-1.json`), false);
} else {
  assert.equal(
    existsSync(`${output}/started.json`),
    false,
    "Existing live run: inspect receipts instead of retrying",
  );
}
const env = localEnvironment();
const service = createClient(env.API_URL, env.SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});
const enabled = database(env, "select assistant_chat_enabled from app_settings");
assert.equal(enabled, "t", "Only run against an explicitly enabled LOCAL chat environment");
await mkdir(output, { recursive: true, mode: 0o700 });
await writeFile(
  `${output}/${remaining ? "remaining-started" : "started"}.json`,
  JSON.stringify({ at: new Date().toISOString(), maxGenerations: remaining ? 1 : 2 }),
  { flag: "wx", mode: 0o600 },
);
const store = fileGenerationReceipts(`${output}/receipts`);
const results = [];
const owners = [];
try {
  for (const [index, intro] of [
    "처음에는 낯을 많이 가려요. 술은 마시지 않아요. 가끔 동네를 산책해요. 말이 너무 많은 자리는 조금 피곤해요.",
    "주말에는 요리를 해요. 최근에는 토마토 파스타를 만들었어요. 연락은 업무 중엔 늦게 확인해요. 서로 시간을 존중하는 만남을 원해요.",
  ].entries()) {
    if (remaining && index !== 1) continue;
    const email = `coach-${randomUUID()}@verify.local`,
      password = randomUUID() + "Aa1!";
    const created = await service.auth.admin.createUser({ email, password, email_confirm: true });
    assert.ifError(created.error);
    const owner = created.data.user.id;
    owners.push(owner);
    database(
      env,
      `insert into profiles(id,gender,hub_id,company_email,name,birth,job,onboarding_step,terms_agreed_at,privacy_agreed_at,phone_verified_at,headline,intro) values(${quote(owner)},${quote(index ? "female" : "male")},'gangnam',${quote(email)},'합성 코칭 QA','1996-01-01','기획',7,now(),now(),now(),'내 일상을 나눠요',${quote(intro)})`,
    );
    const client = createClient(env.API_URL, env.ANON_KEY, { auth: { persistSession: false } });
    const login = await client.auth.signInWithPassword({ email, password });
    assert.ifError(login.error);
    const consent = await client.rpc("assistant_consent", { p_agree: true });
    assert.ifError(consent.error);
    const before = await client.rpc("my_assistant_state");
    assert.ifError(before.error);
    const result = await recordedGeneration({
      operation: `profile-coach-${index}`,
      feature: "assistant-chat",
      store,
      body: {
        question:
          "내 프로필의 장점과 아쉬운 표현을 코칭해줘. 상대가 읽기 편하도록 원문에 근거한 수정 예시도 알려줘.",
        revision: before.data.revision,
      },
      send: async (body) => {
        const response = await fetch(`${env.API_URL}/functions/v1/assistant-chat`, {
          method: "POST",
          headers: {
            apikey: env.ANON_KEY,
            Authorization: `Bearer ${login.data.session.access_token}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify(body),
          signal: AbortSignal.timeout(65000),
        });
        return { status: response.status, data: await response.json() };
      },
    });
    assert.equal(result.response.status, 200, JSON.stringify(result.response.data));
    const state = await client.rpc("my_assistant_state");
    assert.ifError(state.error);
    const turn = state.data.turns.find((t) => t.id === result.requestId);
    assert.equal(turn?.state, "complete");
    assert.match(turn.answer, /살릴 매력/);
    assert.match(turn.answer, /다듬을 표현/);
    assert.match(turn.answer, /이렇게 써보세요/);
    assert.doesNotMatch(turn.answer, /남자들은|여자들은|반드시.*좋아|저장했/);
    const runs = JSON.parse(
      database(
        env,
        `select coalesce(json_agg(json_build_object('model',model,'status',status,'inputTokens',input_tokens,'outputTokens',output_tokens,'version',prompt_version)),'[]') from ai_runs where user_id=${quote(owner)}`,
      ),
    );
    assert.equal(runs.length, 1);
    assert.equal(runs[0].status, "success");
    assert.equal(runs[0].version, "assistant-private-v5-profile-coach");
    results.push({ synthetic: true, intro, reply: turn.answer, requestId: result.requestId, runs });
    await writeFile(`${output}/results.json`, JSON.stringify(results, null, 2), { mode: 0o600 });
    console.log(JSON.stringify(results.at(-1)));
  }
} finally {
  for (const owner of owners) assert.ifError((await service.auth.admin.deleteUser(owner)).error);
}
console.log(
  `PASS ${results.length} real local profile coaching outputs in this invocation; prior receipts preserved; synthetic accounts removed; production unchanged`,
);
