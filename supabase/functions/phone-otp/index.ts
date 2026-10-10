// 휴대폰 인증 문자 — 코드를 만들고(issue_phone_code) 솔라피로 보낸다(s54).
//
// ── 왜 Edge Function 인가 ──
// 코드 원문을 다루는 곳이 서버 한 곳이어야 한다. 회원이 코드를 받아 볼 수 있는
// 경로가 하나라도 있으면 문자 없이 인증이 끝난다. issue_phone_code 는 service_role
// 만 부를 수 있고, 이 함수는 원문을 응답에 싣지 않는다(로컬 개발 예외 아래).
//
// ── 솔라피 ──
// https://developers.solapi.com — HMAC-SHA256 서명 헤더로 인증한다.
// 필요한 시크릿: SOLAPI_API_KEY, SOLAPI_API_SECRET, SOLAPI_SENDER(등록된 발신번호).
// 2026-10-10 기준 키가 아직 없다. 키 없이 운영에서 부르면 503 으로 끝난다.
//
// ── 로컬 ──
// 로컬 Supabase(SUPABASE_URL 이 kong/127.0.0.1)에서 키가 없으면 문자를 보내지 않고
// 코드를 응답에 싣는다. 운영 URL 은 이 조건에 걸리지 않는다.

import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders } from "../_shared/cors.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
const SOLAPI_API_KEY = Deno.env.get("SOLAPI_API_KEY");
const SOLAPI_API_SECRET = Deno.env.get("SOLAPI_API_SECRET");
const SOLAPI_SENDER = Deno.env.get("SOLAPI_SENDER");
const IS_LOCAL = /kong|127\.0\.0\.1|localhost/.test(SUPABASE_URL);

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

/** 010-1234-5678 · 01012345678 · +82 10… → +821012345678. 휴대폰 번호만 받는다. */
export function normalizeKoreanMobile(raw: string): string | null {
  const digits = raw.replace(/[^0-9+]/g, "");
  const local = digits.startsWith("+82") ? `0${digits.slice(3)}` : digits;
  if (!/^01[016789][0-9]{7,8}$/.test(local)) return null;
  return `+82${local.slice(1)}`;
}

async function hmacHex(secret: string, message: string) {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(message));
  return Array.from(new Uint8Array(sig))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

async function sendSms(to: string, text: string) {
  const date = new Date().toISOString();
  const salt = crypto.randomUUID().replace(/-/g, "");
  const signature = await hmacHex(SOLAPI_API_SECRET!, date + salt);
  const res = await fetch("https://api.solapi.com/messages/v4/send", {
    method: "POST",
    headers: {
      Authorization: `HMAC-SHA256 apiKey=${SOLAPI_API_KEY}, date=${date}, salt=${salt}, signature=${signature}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      // 솔라피는 국내 번호를 0으로 시작하는 형태로 받는다.
      message: { to: `0${to.slice(3)}`, from: SOLAPI_SENDER, text },
    }),
  });
  if (!res.ok) throw new Error(`solapi ${res.status}`);
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "method not allowed" }, 405);

  // 신원 확인이 설정 확인보다 먼저다(compose-profile 과 같은 이유).
  const authHeader = req.headers.get("Authorization");
  if (!authHeader) return json({ error: "unauthenticated" }, 401);
  const caller = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    global: { headers: { Authorization: authHeader } },
  });
  const {
    data: { user },
    error: userError,
  } = await caller.auth.getUser();
  if (userError || !user) return json({ error: "unauthenticated" }, 401);

  const smsReady = Boolean(SOLAPI_API_KEY && SOLAPI_API_SECRET && SOLAPI_SENDER);
  if (!SERVICE_ROLE_KEY || (!smsReady && !IS_LOCAL)) {
    return json({ error: "not configured" }, 503);
  }

  let body: { phone?: string };
  try {
    body = await req.json();
  } catch {
    return json({ error: "invalid json body" }, 400);
  }
  const phone = normalizeKoreanMobile(body.phone ?? "");
  if (!phone) return json({ error: "invalid phone" }, 400);

  const db = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);
  const { data: code, error } = await db.rpc("issue_phone_code", {
    p_user: user.id,
    p_phone: phone,
  });
  if (error) {
    // 서버가 정한 거절 사유만 그대로 넘긴다(화면이 문장으로 바꾼다).
    const known = ["phone in use", "too soon", "daily limit", "invalid phone"];
    const reason = known.find((k) => error.message?.includes(k)) ?? "issue failed";
    return json({ error: reason }, reason === "issue failed" ? 502 : 409);
  }

  const text = `[애프터] 인증번호 ${code}. 3분 안에 입력해 주세요.`;
  if (!smsReady) return json({ sent: false, phone, devCode: code });

  try {
    await sendSms(phone, text);
  } catch (err) {
    console.error("phone-otp send failed", err instanceof Error ? err.message : "unknown");
    return json({ error: "send failed" }, 502);
  }
  return json({ sent: true, phone });
});
