import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { Transpiler } from "bun";
import { z } from "zod";
import {
  privateAssistantSafety,
  validPrivateAdvice,
} from "../supabase/functions/_shared/assistant-private";
import {
  assistantIntent,
  assistantServiceReply,
} from "../supabase/functions/_shared/assistant-workflow";
import {
  profileCoachSources,
  isProfileCoaching,
  PROFILE_COACH_SYSTEM,
  PROFILE_COACH_CHECK,
} from "../supabase/functions/_shared/profile-coach";
import {
  privateAssistantModelContext,
  PRIVATE_ASSISTANT_SYSTEM,
  PRIVATE_ASSISTANT_CHECK,
} from "../supabase/functions/_shared/assistant-context";

// Execute the shipped handler, replacing transports only: zero network/provider calls.
async function invoke(
  question: string,
  options: {
    followup?: boolean;
    stale?: boolean;
    failCheck?: boolean;
    denied?: boolean;
    replay?: boolean;
  } = {},
) {
  const calls: { name: string; args: Record<string, unknown> }[] = [];
  const model: unknown[] = [];
  let reads = 0;
  let handler!: (req: Request) => Promise<Response>;
  const db = {
    auth: { getUser: async () => ({ data: { user: { id: "owner-only" } } }) },
    rpc: async (name: string, args: Record<string, unknown>) => {
      calls.push({ name, args });
      if (name === "assistant_begin_turn")
        return options.denied
          ? { error: { code: "PT403" } }
          : {
              data: {
                created: !options.replay,
                state: options.replay ? "complete" : "started",
                revision: 1,
                session_id: "session",
              },
            };
      if (name === "assistant_turn_context")
        return {
          data: {
            question,
            history: options.followup
              ? [{ question: "내 프로필 장점 코칭해줘", answer: "과거 제안은 원문이 아닙니다." }]
              : [],
            memories: [],
            owner_profile: {
              age: 29,
              job: "기획자",
              introduction_area: "종로",
              mbti: "INFJ",
              intro: "주말에는 전시를 봐요.",
              phone: "NEVER_SEND",
            },
            related_history: [],
          },
        };
      if (name === "reserve_ai_run") return { data: { reserved: true } };
      if (name === "assistant_finish_turn") return { data: true };
      return { data: null };
    },
    from: (table: string) => {
      assert.equal(table, "profiles");
      const q = {
        select: (fields: string) => {
          assert.equal(fields, "headline,intro,profile_story");
          return q;
        },
        eq: (field: string, id: string) => {
          assert.equal(field, "id");
          assert.equal(id, "owner-only");
          return q;
        },
        single: async () => ({
          data: {
            intro: ++reads > 1 && options.stale ? "변경한 문장" : "가끔 산책해요.",
            secret: "NEVER_SEND",
            gender: "female",
          },
        }),
      };
      return q;
    },
  };
  class FakeAI {
    messages = {
      parse: async (request: unknown) => {
        model.push(request);
        return {
          usage: { input_tokens: 10, output_tokens: 5 },
          parsed_output:
            model.length === 1
              ? { reply: "가끔 산책한다는 문장은 이야기를 꺼낼 소재가 돼요." }
              : { pass: !options.failCheck, reason: options.failCheck ? "ungrounded" : "ok" },
        };
      },
    };
  }
  const source = readFileSync("supabase/functions/assistant-chat/index.ts", "utf8").replace(
    /^import[\s\S]*?;\n/gm,
    "",
  );
  const code = new Transpiler({ loader: "ts" }).transformSync(source);
  const bindings = {
    Deno: {
      env: { get: () => "synthetic-key" },
      serve: (h: typeof handler) => {
        handler = h;
      },
    },
    Anthropic: FakeAI,
    z,
    zodOutputFormat: () => ({}),
    createClient: () => db,
    corsHeaders: {},
    DEFAULT_TEXT_MODEL: "synthetic",
    sourceHash: async () => "hash",
    privateAssistantSafety,
    validPrivateAdvice,
    assistantIntent,
    assistantServiceReply,
    profileCoachSources,
    isProfileCoaching,
    PROFILE_COACH_SYSTEM,
    PROFILE_COACH_CHECK,
    privateAssistantModelContext,
    PRIVATE_ASSISTANT_SYSTEM,
    PRIVATE_ASSISTANT_CHECK,
  };
  new Function(...Object.keys(bindings), code)(...Object.values(bindings));
  const response = await handler(
    new Request("http://loopback", {
      method: "POST",
      headers: { Authorization: "Bearer synthetic" },
      body: JSON.stringify({
        requestId: "11111111-1111-4111-8111-111111111111",
        question,
        revision: 1,
      }),
    }),
  );
  return { status: response.status, body: await response.json(), model, calls, reads };
}

for (const [question, options] of [
  ["내 프로필 장점 코칭해줘", {}],
  ["그럼 다른 장점도 알려줘", { followup: true }],
] as const) {
  const result = await invoke(question, options);
  assert.equal(result.status, 200);
  assert.equal(result.model.length, 2);
  assert.equal(result.reads, 2);
  for (const request of result.model) {
    assert.match(JSON.stringify(request), /owner_public_profile/);
    assert.doesNotMatch(JSON.stringify(request), /NEVER_SEND|female/);
  }
  assert.ok(result.calls.some((c) => c.name === "assistant_finish_turn" && c.args.p_answer));
}
const stale = await invoke("내 프로필 코칭해줘", { stale: true });
assert.equal(stale.body.code, "context_changed");
assert.ok(stale.calls.some((c) => c.name === "assistant_finish_turn" && c.args.p_answer === null));
const rejected = await invoke("내 프로필 코칭해줘", { failCheck: true });
assert.equal(rejected.body.code, "quality_failed");
assert.equal(rejected.body.reason, "ungrounded");
assert.ok(
  rejected.calls.some((c) => c.name === "assistant_finish_turn" && c.args.p_answer === null),
);
for (const options of [{ denied: true }, { replay: true }]) {
  const result = await invoke("내 프로필 코칭해줘", options);
  assert.equal(result.model.length, 0);
  assert.equal(result.reads, 0);
}
const generic = await invoke("첫 만남이 긴장돼요");
assert.equal(generic.reads, 0);
assert.doesNotMatch(JSON.stringify(generic.model), /owner_public_profile/);
assert.match(JSON.stringify(generic.model), /owner_profile/);
assert.match(JSON.stringify(generic.model), /주말에는 전시/);
assert.doesNotMatch(JSON.stringify(generic.model), /NEVER_SEND/);
const status = await invoke("지금 상태 알려줘");
assert.equal(status.model.length, 0);
console.log(
  "Profile coach shipped handler: owner projection, follow-up, stale gate, reject, consent/replay, non-coaching minimization PASS",
);
