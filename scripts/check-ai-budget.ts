import assert from "node:assert/strict";
import { budgetEstimate, budgetedAnthropicFetch } from "../supabase/functions/_shared/ai-budget";
const payload = {
  model: "claude-sonnet-5-5",
  max_tokens: 100,
  system: "자료",
  messages: [{ role: "user", content: "안녕" }],
};
assert.ok(budgetEstimate(payload, 200));
assert.equal(budgetEstimate({ ...payload, model: "unknown" }, 200), null);
assert.equal(budgetEstimate({ ...payload, stream: true }, 200), null);
assert.equal(budgetEstimate({ ...payload, tools: [{}] }, 200), null);
assert.equal(budgetEstimate({ ...payload, max_tokens: 100000 }, 200), null);
assert.equal(
  budgetEstimate({ ...payload, messages: [{ content: [{ type: "image" }] }] }, 200),
  null,
);
let providerCalls = 0;
const provider: typeof fetch = async () => {
  providerCalls++;
  return new Response(JSON.stringify({ usage: { input_tokens: 50, output_tokens: 20 } }), {
    status: 200,
  });
};
const request = () =>
  new Request("https://api.anthropic.com/v1/messages", {
    method: "POST",
    body: JSON.stringify(payload),
  });
const denied = budgetedAnthropicFetch(
  { rpc: async () => ({ data: false, error: null }) },
  provider,
);
assert.equal((await denied(request())).status, 429);
assert.equal(providerCalls, 0);
const broken = budgetedAnthropicFetch(
  { rpc: async () => ({ data: null, error: { message: "DB unavailable" } }) },
  provider,
);
assert.equal((await broken(request())).status, 429);
assert.equal(providerCalls, 0);
const reservations: Record<string, unknown>[] = [];
const settlements: Record<string, unknown>[] = [];
const allowed = budgetedAnthropicFetch(
  {
    rpc: async (name, args) => {
      (name === "reserve_ai_budget" ? reservations : settlements).push(args);
      return { data: true, error: null };
    },
  },
  provider,
);
assert.equal((await allowed(request())).status, 200);
assert.equal(providerCalls, 1);
assert.equal(settlements.length, 1);
assert.ok(Number(settlements[0].p_krw) <= Number(reservations[0].p_krw));
await allowed(request());
assert.equal(reservations.length, 2);
assert.notEqual(reservations[0].p_id, reservations[1].p_id);
const count = settlements.length;
const timeout = budgetedAnthropicFetch(
  {
    rpc: async (name, args) => {
      if (name === "settle_ai_budget") settlements.push(args);
      return { data: true, error: null };
    },
  },
  async () => {
    throw new Error("timeout");
  },
);
await assert.rejects(() => timeout(request()));
assert.equal(settlements.length, count);
const badUsage = budgetedAnthropicFetch(
  {
    rpc: async (name, args) => {
      if (name === "settle_ai_budget") settlements.push(args);
      return { data: true, error: null };
    },
  },
  async () => new Response(JSON.stringify({ usage: { input_tokens: -1, output_tokens: 1 } })),
);
await badUsage(request());
assert.equal(settlements.length, count);
const errorReply = budgetedAnthropicFetch(
  {
    rpc: async (name, args) => {
      if (name === "settle_ai_budget") settlements.push(args);
      return { data: true, error: null };
    },
  },
  async () => new Response("failure", { status: 503 }),
);
await errorReply(request());
assert.equal(settlements.length, count);
console.log("AI budget: reject/allow/settle/retry/timeout/invalid usage PASS");
