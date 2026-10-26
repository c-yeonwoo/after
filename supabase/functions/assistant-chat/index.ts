import Anthropic from "npm:@anthropic-ai/sdk@0.124.0";
import { zodOutputFormat } from "npm:@anthropic-ai/sdk@0.124.0/helpers/zod";
import { z } from "npm:zod@4.6.7";
import { createClient } from "npm:@supabase/supabase-js@2.111.0";
import { corsHeaders } from "../_shared/cors.ts";
import { DEFAULT_TEXT_MODEL } from "../_shared/ai-models.ts";
import { sourceHash } from "../_shared/ai-grounding.ts";
import { privateAssistantSafety, validPrivateAdvice } from "../_shared/assistant-private.ts";
import { assistantIntent, assistantServiceReply } from "../_shared/assistant-workflow.ts";
import {
  privateAssistantModelContext,
  PRIVATE_ASSISTANT_SYSTEM,
  PRIVATE_ASSISTANT_CHECK,
} from "../_shared/assistant-context.ts";

const Input = z.object({
  requestId: z.string().uuid(),
  question: z.string().trim().min(1).max(1000),
  revision: z.number().int().positive(),
});
const Output = z.object({ reply: z.string().min(10).max(1000) });
const Check = z.object({ pass: z.boolean() });
const MODEL = Deno.env.get("ASSISTANT_COACH_MODEL") || DEFAULT_TEXT_MODEL;
const VERSION = "assistant-private-v3-session-provenance";

Deno.serve(async (req) => {
  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), {
      status,
      headers: { ...corsHeaders, "Content-Type": "application/json", "Cache-Control": "no-store" },
    });
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ code: "method" }, 405);
  let input: z.infer<typeof Input>;
  try {
    const raw = await req.text();
    if (raw.length > 5000) return json({ code: "invalid_request" }, 400);
    input = Input.parse(JSON.parse(raw));
  } catch {
    return json({ code: "invalid_request" }, 400);
  }
  const authorization = req.headers.get("Authorization");
  if (!authorization) return json({ code: "unauthorized" }, 401);
  const caller = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!, {
    global: { headers: { Authorization: authorization } },
    auth: { persistSession: false },
  });
  const {
    data: { user },
    error: authError,
  } = await caller.auth.getUser();
  if (authError || !user) return json({ code: "unauthorized" }, 401);
  const { data: started, error: startError } = await caller.rpc("assistant_begin_turn", {
    p_id: input.requestId,
    p_question: input.question,
    p_expected_revision: input.revision,
  });
  if (startError)
    return json(
      {
        code:
          startError.code === "PT429"
            ? "daily_limit"
            : startError.code === "PT409"
              ? "in_progress"
              : "disabled_or_no_consent",
      },
      startError.code === "PT429" ? 429 : 403,
    );
  // A retried HTTP request reads its existing receipt; it NEVER repeats a model call.
  if (!started.created)
    return json({
      id: input.requestId,
      sessionId: started.session_id,
      state: started.state,
      reused: true,
    });
  const db = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    { auth: { persistSession: false } },
  );
  let reserved = false,
    inputTokens = 0,
    outputTokens = 0;
  const start = Date.now();
  const store = async (answer: string | null) => {
    const result = await db.rpc("assistant_finish_turn", {
      p_owner: user.id,
      p_id: input.requestId,
      p_revision: started.revision,
      p_answer: answer,
    });
    return !result.error && result.data === true;
  };
  const finish = async (status: string) => {
    if (reserved)
      await db.rpc("finish_ai_run", {
        p_request_id: input.requestId,
        p_status: status,
        p_latency_ms: Date.now() - start,
        p_input_tokens: inputTokens,
        p_output_tokens: outputTokens,
      });
  };
  try {
    const { data: context, error } = await caller.rpc("assistant_turn_context", {
      p_id: input.requestId,
    });
    if (error || !context) throw Error("context unavailable");
    let reply = privateAssistantSafety(input.question, { execution: false });
    if (!reply) {
      // Service facts are answered without a model, including when callers bypass
      // the UI router. Never put a full home response or counterpart in AI context.
      let state: string | undefined;
      const intent = assistantIntent(input.question);
      if (intent === "status") {
        const home = await caller.rpc("home_state_v2");
        if (!home.error && home.data?.schema_version === 2) state = home.data.primary_state;
      }
      let gender: string | undefined;
      if (intent === "payment") {
        const profile = await caller.from("profiles").select("gender").eq("id", user.id).single();
        if (!profile.error) gender = profile.data?.gender;
      }
      reply =
        assistantServiceReply(input.question, state, gender) ??
        privateAssistantSafety(input.question);
    }
    if (!reply) {
      const modelContext = privateAssistantModelContext(context);
      if (!modelContext) throw Error("invalid private context");
      const key = Deno.env.get("ANTHROPIC_API_KEY");
      if (!key) {
        await store(null);
        return json({ code: "not_configured" }, 503);
      }
      const { data: reservation, error: reserveError } = await db.rpc("reserve_ai_run", {
        p_user: user.id,
        p_feature: "assistant_chat",
        p_source_hash: await sourceHash({ context: modelContext, version: VERSION }),
        p_request_id: input.requestId,
        p_prompt_version: VERSION,
        p_model: MODEL,
      });
      if (reserveError || !reservation?.reserved) {
        await store(null);
        return json({ code: reservation?.reason ?? "unavailable" }, 429);
      }
      reserved = true;
      const ai = new Anthropic({ apiKey: key, timeout: 20000, maxRetries: 0 });
      const generated = await ai.messages.parse({
        model: MODEL,
        max_tokens: 800,
        output_config: { effort: "low", format: zodOutputFormat(Output) },
        system: PRIVATE_ASSISTANT_SYSTEM,
        messages: [{ role: "user", content: JSON.stringify(modelContext) }],
      });
      inputTokens += generated.usage.input_tokens;
      outputTokens += generated.usage.output_tokens;
      if (!validPrivateAdvice(generated.parsed_output)) {
        await store(null);
        await finish("invalid");
        return json({ code: "quality_failed" }, 502);
      }
      const verified = await ai.messages.parse({
        model: MODEL,
        max_tokens: 200,
        output_config: { effort: "low", format: zodOutputFormat(Check) },
        system: PRIVATE_ASSISTANT_CHECK,
        messages: [
          {
            role: "user",
            content: JSON.stringify({
              context: modelContext,
              reply: generated.parsed_output.reply,
            }),
          },
        ],
      });
      inputTokens += verified.usage.input_tokens;
      outputTokens += verified.usage.output_tokens;
      if (!verified.parsed_output?.pass) {
        await store(null);
        await finish("invalid");
        return json({ code: "quality_failed" }, 502);
      }
      reply = generated.parsed_output.reply;
    }
    if (!(await store(reply))) {
      await finish("invalid");
      return json({ code: "context_changed" }, 409);
    }
    await finish("success");
    // Client reloads through caller-scoped RPC instead of receiving stale private text.
    return json({ id: input.requestId, sessionId: started.session_id, state: "complete" });
  } catch {
    await store(null);
    await finish("error");
    return json({ code: "generation_failed" }, 502);
  }
});
