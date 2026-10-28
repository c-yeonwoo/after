import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import { createClient } from "@supabase/supabase-js";
import { localEnvironment, database, quote } from "./lib/manual-cycle-fixtures.mjs";
import {
  fileGenerationReceipts,
  recordedGeneration,
} from "./lib/concierge-generation-receipts.mjs";

// Explicit local synthetic opt-in. Two generations, each with its existing verifier.
// The durable start file refuses repeat paid execution; inspect receipts on failure.
assert.equal(process.env.AFTER_LOCAL_AI_CONFIRM, "synthetic-only");
const output = "/tmp/after-personal-manager-live-v6";
const env = localEnvironment();
assert.equal(
  database(
    env,
    "select assistant_chat_enabled and assistant_introduction_enabled from app_settings",
  ),
  "t",
);
await mkdir(output, { recursive: true, mode: 0o700 });
await writeFile(
  `${output}/started.json`,
  JSON.stringify({ maxGenerations: 2, at: new Date().toISOString() }),
  { flag: "wx", mode: 0o600 },
);
const receipts = fileGenerationReceipts(`${output}/receipts`);
const service = createClient(env.API_URL, env.SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});
const owners = [],
  clients = [],
  tokens = [],
  results = [];
try {
  for (const [index, intro] of [
    "주말에는 작은 전시를 보고 마음에 든 그림을 노트에 남겨요. 카페에서 서로 최근에 본 것을 이야기하고 싶어요. 술은 마시지 않아요.",
    "퇴근 후 동네를 걸으며 작은 가게를 찾아요. 주말엔 전시를 보고 가장 기억에 남은 작품 이야기를 나눠요. 첫 만남은 조용한 카페가 편해요.",
  ].entries()) {
    const email = `manager-${randomUUID()}@verify.local`,
      password = randomUUID() + "Aa1!";
    const created = await service.auth.admin.createUser({ email, password, email_confirm: true });
    assert.ifError(created.error);
    const id = created.data.user.id;
    owners.push(id);
    database(
      env,
      `insert into profiles(id,gender,hub_id,company_email,name,birth,job,mbti,onboarding_step,terms_agreed_at,privacy_agreed_at,phone_verified_at,headline,intro) values(${quote(id)},${quote(index ? "female" : "male")},'gangnam',${quote(email)},'합성 매니저 QA','1997-01-01','디자이너','INFJ',7,now(),now(),now(),'일상의 발견을 나누고 싶어요',${quote(intro)})`,
    );
    const client = createClient(env.API_URL, env.ANON_KEY, { auth: { persistSession: false } });
    clients.push(client);
    const login = await client.auth.signInWithPassword({ email, password });
    assert.ifError(login.error);
    tokens.push(login.data.session.access_token);
    assert.ifError(
      (
        await client.rpc("assistant_manager_consent", {
          p_agree: true,
          p_policy_version: "manager-continuity-v2",
        })
      ).error,
    );
  }
  database(
    env,
    `insert into intros(male_id,female_id) values(${quote(owners[0])},${quote(owners[1])})`,
  );
  const call = async (feature, body) => {
    const response = await fetch(`${env.API_URL}/functions/v1/${feature}`, {
      method: "POST",
      headers: {
        apikey: env.ANON_KEY,
        Authorization: `Bearer ${tokens[0]}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(65000),
    });
    return { status: response.status, data: await response.json() };
  };
  const state = await clients[0].rpc("my_assistant_state");
  assert.ifError(state.error);
  for (const [feature, body] of [
    [
      "assistant-chat",
      {
        question: "첫 만남이 긴장돼요. 내 일상과 취향에 맞춰 어떤 이야기를 꺼내면 좋을까요?",
        revision: state.data.revision,
      },
    ],
    ["introduce-member", { target: owners[1], consent: true }],
  ]) {
    const receipt = await recordedGeneration({
      operation: feature,
      feature,
      store: receipts,
      body,
      send: (payload) => call(feature, payload),
    });
    assert.equal(receipt.response.status, 200, JSON.stringify(receipt.response.data));
    if (feature === "assistant-chat") {
      const history = await clients[0].rpc("my_assistant_state");
      assert.ifError(history.error);
      const turn = history.data.turns.find((t) => t.id === receipt.requestId);
      assert.equal(turn?.state, "complete");
      assert.match(turn.answer, /전시|그림|작품/);
      assert.doesNotMatch(turn.answer, /기억할까요|저장할까요|INFJ라서|강남에 사/);
      const otherHistory = await clients[1].rpc("my_assistant_state");
      assert.equal(otherHistory.data.turns.length, 0);
      results.push({ feature, answer: turn.answer });
      const replay = await call(feature, { ...body, requestId: receipt.requestId });
      assert.equal(replay.data.reused, true);
    } else {
      assert.ok(receipt.response.data.portrait.length > 0);
      assert.ok(receipt.response.data.connections.length > 0);
      results.push({ feature, brief: receipt.response.data });
      const cached = await call(feature, { ...body, requestId: randomUUID() });
      assert.equal(cached.status, 200);
      assert.equal(cached.data.cached, true);
    }
  }
  const usage = JSON.parse(
    database(
      env,
      `select json_agg(json_build_object('feature',feature,'model',model,'status',status,'inputTokens',input_tokens,'outputTokens',output_tokens,'version',prompt_version)) from ai_runs where user_id in (${owners.map(quote).join(",")})`,
    ),
  );
  assert.equal(usage.length, 2, "replay/cache must not create additional provider runs");
  assert.ok(usage.every((r) => r.status === "success"));
  await writeFile(
    `${output}/result.json`,
    JSON.stringify({ syntheticOnly: true, results, usage }, null, 2),
  );
  console.log(JSON.stringify({ passed: true, results, usage }, null, 2));
} catch (error) {
  await writeFile(
    `${output}/failure.json`,
    JSON.stringify(
      { message: error instanceof Error ? error.message : "Failed", owners, results },
      null,
      2,
    ),
    { mode: 0o600 },
  );
  throw error;
} finally {
  // Delete only users created by this exact invocation, never shared manual fixtures.
  if (owners.length === 2)
    database(
      env,
      `delete from intros where male_id=${quote(owners[0])} and female_id=${quote(owners[1])}`,
    );
  for (const id of owners) assert.ifError((await service.auth.admin.deleteUser(id)).error);
}
