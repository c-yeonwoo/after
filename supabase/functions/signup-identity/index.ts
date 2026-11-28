import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders } from "../_shared/cors.ts";
import {
  carrierConfig,
  isKcpDevicePreview,
  isDeviceTester,
  startCarrierProvider,
  finishCarrierProvider,
} from "../_shared/carrier-provider.ts";
import { localAuthBypassAllowed } from "../_shared/local-auth.ts";

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json", "Cache-Control": "no-store" },
  });
}

// The caller has no account yet. A random signup capability and its prior
// server-side consent record authorize only this one registration attempt.
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "method not allowed" }, 405);
  if (Number(req.headers.get("content-length") ?? 0) > 4096)
    return json({ error: "invalid request" }, 413);
  let body: { action?: string; email?: string; token?: string; identityVerificationId?: string };
  try {
    const raw = await req.text();
    if (raw.length > 4096) return json({ error: "invalid request" }, 413);
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed))
      return json({ error: "invalid json" }, 400);
    body = parsed;
  } catch {
    return json({ error: "invalid json" }, 400);
  }
  if (body.action === "dev-status") {
    const enabled = localAuthBypassAllowed(
      Deno.env.get("DEV_AUTH_BYPASS"),
      Deno.env.get("SUPABASE_URL"),
    );
    return json(
      enabled ? { enabled: true } : { error: "dev bypass disabled" },
      enabled ? 200 : 403,
    );
  }
  const url = Deno.env.get("SUPABASE_URL");
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  const config = carrierConfig();
  if (!url || !serviceKey || !config) return json({ error: "not configured" }, 503);
  const preview = isKcpDevicePreview(config);
  const isPreviewAction = body.action === "preview-email" || body.action === "preview-access";
  if (isPreviewAction && !preview) return json({ error: "preview closed" }, 403);
  if (preview) {
    const anon = Deno.env.get("SUPABASE_ANON_KEY");
    if (!anon || !Deno.env.get("KCP_DEVICE_TESTER_EMAIL")?.trim())
      return json({ error: "preview closed" }, 403);
    const auth = createClient(url, anon, {
      auth: { persistSession: false, autoRefreshToken: false },
    }).auth;
    if (body.action === "preview-email") {
      if (typeof body.email !== "string" || body.email.length > 254)
        return json({ error: "invalid request" }, 400);
      // Send only after an explicit user action, and only to the server allowlist.
      if (isDeviceTester(body.email)) {
        const { error } = await auth.signInWithOtp({ email: body.email.trim().toLowerCase() });
        if (error) return json({ error: "email unavailable" }, error.status === 429 ? 429 : 503);
      }
      return json({ requested: true });
    }
    const bearer = req.headers.get("Authorization")?.match(/^Bearer ([^ ]+)$/i)?.[1];
    if (!bearer || bearer === anon) return json({ error: "preview denied" }, 403);
    const {
      data: { user },
      error,
    } = await auth.getUser(bearer);
    if (error || !user?.email_confirmed_at || !isDeviceTester(user.email))
      return json({ error: "preview denied" }, 403);
    if (body.action === "preview-access") return json({ allowed: true });
  }
  if (
    typeof body.token !== "string" ||
    !/^[0-9a-f]{64}$/.test(body.token) ||
    !["start", "complete"].includes(body.action ?? "")
  )
    return json({ error: "invalid request" }, 400);
  const db = createClient(url, serviceKey);
  try {
    if (body.action === "start") {
      const id = `av${crypto.randomUUID().replaceAll("-", "")}`;
      const { error } = await db.rpc("start_signup_identity", { p_token: body.token, p_id: id });
      if (error) throw new Error(error.message);
      return json(await startCarrierProvider(db, config, id, "signup", req.headers.get("origin")));
    }
    const id = body.identityVerificationId;
    if (!id || !/^av[0-9a-f]{32}$/.test(id)) return json({ error: "invalid id" }, 400);
    // Validate the capability before querying a paid external provider.
    const { data: status, error: statusError } = await db.rpc("signup_session_status", {
      p_token: body.token,
    });
    if (statusError || !status) throw new Error("signup expired");
    const { data: attempt, error: attemptError } = await db
      .from("signup_identity_attempts")
      .select("session_id, created_at, consumed_at")
      .eq("id", id)
      .maybeSingle();
    const { data: ownedSession } = await db
      .from("signup_sessions")
      .select("id, verification_id")
      .eq("token_hash", await sha256(body.token))
      .maybeSingle();
    if (attemptError || !attempt || attempt.session_id !== ownedSession?.id) {
      throw new Error("verification expired");
    }
    // A lost successful response must not consume another paid provider lookup.
    if (attempt.consumed_at && ownedSession?.verification_id === id && status.verified)
      return json(status);
    if (attempt.consumed_at || Date.now() - new Date(attempt.created_at).getTime() > 15 * 60_000)
      throw new Error("verification expired");
    const verified = await finishCarrierProvider(db, config, id, "signup");
    const { data, error } = await db.rpc("finish_signup_identity", {
      p_token: body.token,
      p_id: id,
      p_gender: verified.gender,
      p_birth: verified.birth,
      p_phone: verified.phone,
      p_di: verified.di,
    });
    if (error) throw new Error(error.message);
    return json(data);
  } catch (cause) {
    const message = cause instanceof Error ? cause.message : "";
    const known = [
      "adult only",
      "identity already in use",
      "daily limit",
      "signup expired",
      "verification expired",
      "not verified",
      "verification channel mismatch",
      "incomplete verified identity",
      "policy_version_mismatch",
    ].find((key) => message.includes(key));
    return json({ error: known ?? "verification unavailable" }, known ? 409 : 503);
  }
});

async function sha256(value: string) {
  const hash = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return Array.from(new Uint8Array(hash), (b) => b.toString(16).padStart(2, "0")).join("");
}
