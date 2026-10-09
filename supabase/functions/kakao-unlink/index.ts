// Kakao Developers unlink callback.
// Kakao authenticates this endpoint with the app's primary admin key in
// `Authorization: KakaoAK ...`; Supabase JWT verification is disabled for this
// one function and replaced by that constant-time shared-secret check.

import { createClient } from "npm:@supabase/supabase-js@2";

const APP_ID = Deno.env.get("KAKAO_APP_ID");
const PRIMARY_ADMIN_KEY = Deno.env.get("KAKAO_PRIMARY_ADMIN_KEY");

function safeEqual(left: string, right: string): boolean {
  const a = new TextEncoder().encode(left);
  const b = new TextEncoder().encode(right);
  if (a.length !== b.length) return false;
  let mismatch = 0;
  for (let i = 0; i < a.length; i += 1) mismatch |= a[i] ^ b[i];
  return mismatch === 0;
}

async function readPayload(req: Request): Promise<URLSearchParams> {
  const url = new URL(req.url);
  if (req.method === "GET") return url.searchParams;

  const contentType = req.headers.get("content-type")?.split(";")[0].trim().toLowerCase();
  if (contentType === "application/x-www-form-urlencoded") {
    return new URLSearchParams(await req.text());
  }
  if (contentType === "application/json") {
    const body = await req.json();
    return new URLSearchParams(
      Object.entries(body as Record<string, unknown>).flatMap(([key, value]) =>
        typeof value === "string" || typeof value === "number" ? [[key, String(value)]] : [],
      ),
    );
  }
  return new URLSearchParams();
}

Deno.serve(async (req) => {
  if (req.method !== "GET" && req.method !== "POST") {
    return new Response(null, { status: 405, headers: { Allow: "GET, POST" } });
  }
  if (!APP_ID || !PRIMARY_ADMIN_KEY) {
    // Do not acknowledge events until the shared secret is configured.
    return new Response("Webhook is not configured", { status: 503 });
  }

  const authorization = req.headers.get("authorization") ?? "";
  const suppliedKey = authorization.startsWith("KakaoAK ")
    ? authorization.slice("KakaoAK ".length)
    : "";
  if (!safeEqual(suppliedKey, PRIMARY_ADMIN_KEY)) {
    return new Response("Unauthorized", { status: 401 });
  }

  let payload: URLSearchParams;
  try {
    payload = await readPayload(req);
  } catch {
    // Kakao requires a 200 response within 3 seconds, including when the
    // affected user is unknown or processing fails. Avoid retries and PII logs.
    return new Response("OK", { status: 200 });
  }

  const appId = payload.get("app_id");
  const providerUserId = payload.get("user_id");
  if (appId !== APP_ID || !providerUserId || !/^\d{1,32}$/.test(providerUserId)) {
    return new Response("OK", { status: 200 });
  }

  const db = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );
  const { error } = await db.rpc("unlink_kakao_identity_by_provider_id", {
    p_provider_id: providerUserId,
  });

  // Kakao's unlink callback contract requires 200 even when there is no matching
  // account. Do not log the provider ID or the incoming payload.
  if (error) console.error("Kakao unlink cleanup failed", error.code ?? "unknown");
  return new Response("OK", { status: 200 });
});
