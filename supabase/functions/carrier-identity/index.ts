// KCP 휴대폰 본인확인 via PortOne V2. 브라우저 응답은 인증 증거가 아니다.
// 서버가 PortOne API의 VERIFIED 결과와 검증된 생년월일/번호/DI를 직접 조회한다.
import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders } from "../_shared/cors.ts";

const url = Deno.env.get("SUPABASE_URL")!;
const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
const storeId = Deno.env.get("PORTONE_STORE_ID");
const channelKey = Deno.env.get("PORTONE_KCP_IDENTITY_CHANNEL_KEY");
const apiSecret = Deno.env.get("PORTONE_API_SECRET");

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function normalizePhone(value: string): string | null {
  const digits = value.replace(/[^0-9+]/g, "");
  const local = digits.startsWith("+82") ? `0${digits.slice(3)}` : digits;
  return /^01[016789][0-9]{7,8}$/.test(local) ? `+82${local.slice(1)}` : null;
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
  if (!serviceKey || !storeId || !channelKey || !apiSecret) {
    return json({ error: "not configured" }, 503);
  }

  let body: { action?: string; identityVerificationId?: string };
  try {
    body = await req.json();
  } catch {
    return json({ error: "invalid json" }, 400);
  }
  const db = createClient(url, serviceKey);

  if (body.action === "start") {
    const { data: profile } = await db
      .from("profiles")
      .select("id, account_state, identity_verified_at")
      .eq("id", user.id)
      .maybeSingle();
    if (!profile || profile.account_state !== "active")
      return json({ error: "no active profile" }, 403);
    if (profile.identity_verified_at) return json({ error: "already verified" }, 409);

    const { count, error: countError } = await db
      .from("identity_verification_attempts")
      .select("id", { head: true, count: "exact" })
      .eq("user_id", user.id)
      .gte("created_at", new Date(Date.now() - 86_400_000).toISOString());
    if (countError) return json({ error: "verification unavailable" }, 503);
    if ((count ?? 0) >= 5) return json({ error: "daily limit" }, 429);

    // KCP V2: 영문/숫자 40자 이하. id는 서버에서 만들고 user_id에 묶는다.
    const id = `av${crypto.randomUUID().replaceAll("-", "")}`;
    const { error } = await db
      .from("identity_verification_attempts")
      .insert({ id, user_id: user.id });
    if (error) return json({ error: "verification unavailable" }, 503);
    return json({ identityVerificationId: id, storeId, channelKey });
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
  if (
    !attempt ||
    attempt.user_id !== user.id ||
    attempt.consumed_at ||
    Date.now() - new Date(attempt.created_at).getTime() > 15 * 60_000
  ) {
    return json({ error: "verification expired" }, 409);
  }

  let verification: {
    id?: string;
    status?: string;
    channel?: { key?: string; type?: string };
    verifiedCustomer?: { birthDate?: string; phoneNumber?: string; di?: string };
  };
  try {
    const response = await fetch(
      `https://api.portone.io/identity-verifications/${encodeURIComponent(id)}`,
      { headers: { Authorization: `PortOne ${apiSecret}` } },
    );
    if (!response.ok) return json({ error: "provider verification unavailable" }, 502);
    verification = await response.json();
  } catch {
    return json({ error: "provider verification unavailable" }, 502);
  }
  const customer = verification.verifiedCustomer;
  if (verification.status !== "VERIFIED" || !customer) {
    return json({ error: "not verified" }, 409);
  }
  // A VERIFIED result from another channel (or a test channel) is not production proof.
  if (
    verification.id !== id ||
    verification.channel?.key !== channelKey ||
    verification.channel?.type !== "LIVE"
  ) {
    return json({ error: "verification channel mismatch" }, 409);
  }
  const birth = customer.birthDate;
  const phone = normalizePhone(customer.phoneNumber ?? "");
  if (!birth || !/^\d{4}-\d{2}-\d{2}$/.test(birth) || !phone || !customer.di) {
    return json({ error: "incomplete verified identity" }, 409);
  }

  const { error } = await db.rpc("finish_carrier_identity", {
    p_user: user.id,
    p_id: id,
    p_birth: birth,
    p_phone: phone,
    p_di: customer.di,
  });
  if (error) {
    const known = [
      "adult only",
      "phone in use",
      "identity already in use",
      "verification attempt expired",
    ].find((key) => error.message?.includes(key));
    return json({ error: known ?? "verification unavailable" }, known ? 409 : 503);
  }
  return json({ verified: true, birth });
});
