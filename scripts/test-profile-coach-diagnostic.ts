import assert from "node:assert/strict";
import { readFile, mkdir, writeFile } from "node:fs/promises";
import {
  PRIVATE_ASSISTANT_SYSTEM,
  PRIVATE_ASSISTANT_CHECK,
} from "../supabase/functions/_shared/assistant-context";
import {
  PROFILE_COACH_SYSTEM,
  PROFILE_COACH_CHECK,
} from "../supabase/functions/_shared/profile-coach";
import { DEFAULT_TEXT_MODEL } from "../supabase/functions/_shared/ai-models";

// Synthetic-only investigation of rejected output. No DB/member reads, no automatic retry.
assert.equal(process.env.AFTER_LOCAL_AI_CONFIRM, "synthetic-only");
const dir = "/tmp/after-profile-coach-diagnostic-v4";
await mkdir(dir, { recursive: true, mode: 0o700 });
await writeFile(
  `${dir}/started.json`,
  JSON.stringify({ maxProviderCalls: 2, at: new Date().toISOString() }),
  { flag: "wx", mode: 0o600 },
);
const local = await readFile("supabase/functions/.env", "utf8");
const value = (key: string) =>
  local
    .match(new RegExp(`^${key}=(.*)$`, "m"))?.[1]
    ?.trim()
    .replace(/^['"]|['"]$/g, "");
const key = value("ANTHROPIC_API_KEY");
assert.ok(key);
const model = value("ASSISTANT_COACH_MODEL") || DEFAULT_TEXT_MODEL;
const context = {
  current_user_message:
    "내 프로필의 장점과 아쉬운 표현을 코칭해줘. 상대가 읽기 편하도록 원문에 근거한 수정 예시도 알려줘.",
  conversation_history: [],
  user_confirmed_memories: [],
  owner_public_profile: [
    { field: "headline", text: "내 일상을 나눠요" },
    {
      field: "intro",
      text: "주말에는 요리를 해요. 최근에는 토마토 파스타를 만들었어요. 연락은 업무 중엔 늦게 확인해요. 서로 시간을 존중하는 만남을 원해요.",
    },
  ],
};
const call = async (
  stage: string,
  system: string,
  input: unknown,
  schema: unknown,
  max_tokens: number,
) => {
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "x-api-key": key!,
      "anthropic-version": "2023-06-01",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model,
      max_tokens,
      output_config: { effort: "low", format: { type: "json_schema", schema } },
      system,
      messages: [{ role: "user", content: JSON.stringify(input) }],
    }),
    signal: AbortSignal.timeout(45000),
  });
  assert.ok(res.ok, `${stage} HTTP ${res.status}`);
  const response = (await res.json()) as { content: { type: string; text?: string }[] };
  await writeFile(
    `${dir}/${stage}.json`,
    JSON.stringify({ synthetic: true, model, context, response }, null, 2),
    { flag: "wx", mode: 0o600 },
  );
  const text = response.content.find((b) => b.type === "text")?.text;
  assert.ok(text);
  return JSON.parse(text);
};
const generated = await call(
  "generation",
  PRIVATE_ASSISTANT_SYSTEM + "\n" + PROFILE_COACH_SYSTEM,
  context,
  {
    type: "object",
    properties: { reply: { type: "string" } },
    required: ["reply"],
    additionalProperties: false,
  },
  1200,
);
const verified = await call(
  "verification",
  PRIVATE_ASSISTANT_CHECK +
    "\n" +
    PROFILE_COACH_CHECK +
    "\nreason은 ok/ungrounded/unsafe/false_execution/insufficient_coaching. diagnostic에는 원문과 답변을 비교한 짧은 판정 이유를 씁니다.",
  { context, reply: generated.reply },
  {
    type: "object",
    properties: {
      pass: { type: "boolean" },
      reason: { type: "string" },
      diagnostic: { type: "string" },
    },
    required: ["pass", "reason", "diagnostic"],
    additionalProperties: false,
  },
  500,
);
console.log(JSON.stringify({ synthetic: true, generated, verified }));
