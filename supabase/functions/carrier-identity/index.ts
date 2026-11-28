import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders } from "../_shared/cors.ts";
import {
  carrierConfig,
  startCarrierProvider,
  finishCarrierProvider,
} from "../_shared/carrier-provider.ts";

const url = Deno.env.get("SUPABASE_URL")!;
const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
const config = carrierConfig();

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json", "Cache-Control": "no-store" },
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "method not allowed" }, 405);

  const authorization = req.headers.get("Authorization");
  if (!authorization) return json({ error: "unauthenticated" }, 401);
  const caller = createClient(url, anonKey, {
    global: { headers: { Authorization: authorization } },
  });
  const {
    data: { user },
    error: authError,
  } = await caller.auth.getUser();
  if (authError || !user) return json({ error: "unauthenticated" }, 401);
  if (!serviceKey || !config) {
    return json({ error: "not configured" }, 503);
  }

  let body: { action?: string; identityVerificationId?: string };
  try {
    body = await req.json();
  } catch {
    return json({ error: "invalid json" }, 400);
  }
  const db = createClient(url, serviceKey);

  if (!body || typeof body !== "object") return json({ error: "invalid json" }, 400);
  if (body.action === "start") {
    const { data: profile } = await db
      .from("profiles")
      .select("id, account_state, identity_verified_at")
      .eq("id", user.id)
      .maybeSingle();
    if (!profile || profile.account_state !== "active")
      return json({ error: "no active profile" }, 403);
    if (profile.identity_verified_at) return json({ error: "already verified" }, 409);

    // KCP V2: 영문/숫자 40자 이하. id는 서버에서 만들고 user_id에 묶는다.
    const id = `av${crypto.randomUUID().replaceAll("-", "")}`;
    const { error } = await db
      .from("identity_verification_attempts")
      .insert({ id, user_id: user.id });
    if (error?.message.includes("daily limit")) return json({ error: "daily limit" }, 429);
    if (error) return json({ error: "verification unavailable" }, 503);
    try {
      return json(await startCarrierProvider(db, config, id, "member", req.headers.get("origin")));
    } catch {
      return json({ error: "verification unavailable" }, 503);
    }
  }

  if (body.action !== "complete") return json({ error: "invalid action" }, 400);
  const id = body.identityVerificationId;
  if (!id || !/^av[0-9a-f]{32}$/.test(id)) return json({ error: "invalid id" }, 400);
  const { data: attempt, error: attemptError } = await db
    .from("identity_verification_attempts")
    .select("user_id, created_at, consumed_at")
    .eq("id", id)
    .maybeSingle();
  if (attemptError) return json({ error: "verification unavailable" }, 503);
  if (!attempt || attempt.user_id !== user.id) {
    return json({ error: "verification expired" }, 409);
  }

  if (attempt.consumed_at) {
    const { data: receipt, error } = await db
      .from("profiles")
      .select("birth, identity_verified_at")
      .eq("id", user.id)
      .eq("account_state", "active")
      .eq("identity_verification_id", id)
      .maybeSingle();
    if (error) return json({ error: "verification unavailable" }, 503);
    if (receipt?.identity_verified_at && receipt.birth)
      return json({ verified: true, birth: receipt.birth });
    return json({ error: "verification expired" }, 409);
  }
  if (Date.now() - new Date(attempt.created_at).getTime() > 15 * 60_000)
    return json({ error: "verification expired" }, 409);
  try {
    const verified = await finishCarrierProvider(db, config, id, "member");
    const { error } = await db.rpc("finish_carrier_identity", {
      p_user: user.id,
      p_id: id,
      p_birth: verified.birth,
      p_phone: verified.phone,
      p_di: verified.di,
      p_gender: verified.gender,
    });
    if (error) throw new Error(error.message);
    return json({ verified: true, birth: verified.birth });
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    const known = [
      "adult only",
      "phone in use",
      "identity already in use",
      "verification attempt expired",
      "identity gender mismatch",
      "not verified",
      "verification channel mismatch",
      "incomplete verified identity",
    ].find((key) => message.includes(key));
    return json({ error: known ?? "verification unavailable" }, known ? 409 : 503);
  }
});
