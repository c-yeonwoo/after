import Anthropic from "npm:@anthropic-ai/sdk@0.124.0";
import { zodOutputFormat } from "npm:@anthropic-ai/sdk@0.124.0/helpers/zod";
import { z } from "npm:zod@4.6.7";
import { createClient } from "npm:@supabase/supabase-js@2.111.0";
import { corsHeaders } from "../_shared/cors.ts";
import { DEFAULT_TEXT_MODEL } from "../_shared/ai-models.ts";
import { containsContact, sourceHash } from "../_shared/ai-grounding.ts";
import {
  PROFILE_REVISION_VERIFY,
  PROFILE_REVISION_VOICE,
  REVISION_QUESTIONS,
  revisionBase,
  revisionChanged,
  validRevisionStory,
  type RevisionSource,
} from "../_shared/profile-revision.ts";

const MODEL =
  Deno.env.get("PROFILE_REVISION_MODEL") ||
  Deno.env.get("PROFILE_EDITOR_MODEL") ||
  DEFAULT_TEXT_MODEL;
const VERIFY_MODEL = Deno.env.get("PROFILE_VERIFIER_MODEL") || MODEL;
const VERSION = "profile-revision-v3-member-copy";
const Input = z.object({
  requestId: z.string().uuid(),
  instruction: z.string().trim().min(3).max(1000),
  consent: z.literal(true),
});
const Draft = z.object({
  headline: z.string().min(3).max(35),
  summary: z.string().min(5).max(300),
  sections: z
    .array(
      z.object({
        id: z.enum(["daily_life", "getting_closer", "conversation"]),
        answer: z.string().min(5).max(240),
      }),
    )
    .min(1)
    .max(3),
  conversationHooks: z.array(z.string().max(100)).max(2),
  note: z.string().min(3).max(300),
});
const Check = z.object({
  pass: z.boolean(),
  reason: z.enum([
    "none",
    "unsupported_fact",
    "meaning_changed",
    "unrelated_removal",
    "requested_change_missing",
    "unsafe_content",
  ]),
});

Deno.serve(async (req) => {
  const json = (value: unknown, status = 200) =>
    new Response(JSON.stringify(value), {
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
    if (containsContact(input.instruction)) return json({ code: "contact_not_allowed" }, 422);
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
  const { data: started, error: startError } = await caller.rpc("begin_profile_revision", {
    p_id: input.requestId,
    p_instruction: input.instruction,
    p_consent: input.consent,
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
  // Only a newly-created receipt can call a provider. Lost responses are recovered
  // through the same request ID and owner-scoped state RPC.
  if (!started?.created) return json({ id: input.requestId, state: started?.state, reused: true });
  const db = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    { auth: { persistSession: false } },
  );
  let reserved = false,
    finished = false,
    inputTokens = 0,
    outputTokens = 0;
  const start = Date.now();
  const fail = async () => {
    await db.rpc("fail_profile_revision", { p_owner: user.id, p_id: input.requestId });
  };
  const finish = async (status: "success" | "invalid" | "error") => {
    if (!reserved || finished) return;
    const { error } = await db.rpc("finish_ai_run", {
      p_request_id: input.requestId,
      p_status: status,
      p_latency_ms: Date.now() - start,
      p_input_tokens: inputTokens,
      p_output_tokens: outputTokens,
    });
    if (!error) finished = true;
  };
  try {
    const before = revisionBase(started.source as RevisionSource);
    if (!before) {
      await fail();
      return json({ code: "needs_material" }, 422);
    }
    const key = Deno.env.get("ANTHROPIC_API_KEY");
    if (!key) {
      await fail();
      return json({ code: "not_configured" }, 503);
    }
    const { data: reservation, error: reserveError } = await db.rpc("reserve_ai_run", {
      p_user: user.id,
      p_feature: "profile_revision",
      p_source_hash: await sourceHash({
        before,
        instruction: input.instruction,
        version: VERSION,
        model: MODEL,
        verifier: VERIFY_MODEL,
      }),
      p_request_id: input.requestId,
      p_prompt_version: VERSION,
      p_model: MODEL,
    });
    if (reserveError || !reservation?.reserved) {
      await fail();
      return json({ code: reservation?.reason ?? "unavailable" }, 429);
    }
    reserved = true;
    const ai = new Anthropic({ apiKey: key, timeout: 20000, maxRetries: 0 });
    const generated = await ai.messages.parse({
      model: MODEL,
      max_tokens: 2200,
      output_config: { effort: "low", format: zodOutputFormat(Draft) },
      system: PROFILE_REVISION_VOICE,
      messages: [
        { role: "user", content: JSON.stringify({ before, instruction: input.instruction }) },
      ],
    });
    inputTokens += generated.usage.input_tokens;
    outputTokens += generated.usage.output_tokens;
    const result = generated.parsed_output;
    if (!result) {
      await fail();
      await finish("invalid");
      return json({ code: "quality_failed", stage: "parse" }, 502);
    }
    const after = {
      version: 3,
      headline: result.headline,
      summary: result.summary,
      sections: result.sections.map((section) => ({
        ...section,
        questionId: `${section.id}_v1`,
        questionVersion: 1,
        question: REVISION_QUESTIONS.find((item) => item.id === section.id)!.question,
      })),
      conversationHooks: result.conversationHooks,
      publishedRevision: before.publishedRevision,
    };
    if (
      !validRevisionStory(after) ||
      !revisionChanged(before, after) ||
      containsContact(result.note)
    ) {
      await fail();
      await finish("invalid");
      return json(
        {
          code: "quality_failed",
          stage:
            !validRevisionStory(after) || containsContact(result.note) ? "structure" : "no_change",
        },
        502,
      );
    }
    const verified = await ai.messages.parse({
      model: VERIFY_MODEL,
      max_tokens: 200,
      output_config: { effort: "low", format: zodOutputFormat(Check) },
      system: PROFILE_REVISION_VERIFY,
      messages: [
        {
          role: "user",
          content: JSON.stringify({
            before,
            instruction: input.instruction,
            after,
            note: result.note,
          }),
        },
      ],
    });
    inputTokens += verified.usage.input_tokens;
    outputTokens += verified.usage.output_tokens;
    if (!verified.parsed_output?.pass) {
      await fail();
      await finish("invalid");
      return json(
        {
          code: "quality_failed",
          stage: "semantics",
          reason: verified.parsed_output?.reason ?? "unavailable",
        },
        502,
      );
    }
    const { data: stored, error: storeError } = await db.rpc("store_profile_revision", {
      p_owner: user.id,
      p_id: input.requestId,
      p_before: before,
      p_after: after,
      p_note: result.note,
    });
    if (storeError || stored !== true) {
      await fail();
      await finish("invalid");
      return json({ code: "context_changed" }, 409);
    }
    await finish("success");
    return json({ id: input.requestId, state: "ready", reused: false });
  } catch {
    await fail();
    await finish("error");
    return json({ code: "generation_failed" }, 502);
  }
});
