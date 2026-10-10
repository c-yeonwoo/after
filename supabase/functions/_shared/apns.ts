// Apple Push Notification service — 토큰 기반(.p8) 인증으로 보낸다.
//
// https://developer.apple.com/documentation/usernotifications/sending-notification-requests-to-apns
// 필요한 시크릿: APNS_KEY_P8(파일 내용 그대로), APNS_KEY_ID, APNS_TEAM_ID,
// APNS_BUNDLE_ID(기본 kr.eclps.app — capacitor.config.ts 의 appId).
//
// APNs 는 HTTP/2 만 받는다. Deno 의 fetch 는 TLS ALPN 으로 h2 를 협상한다.
// 2026-10-10 기준 키가 없어 실제 발송은 확인하지 못했다 — 서명·헤더는 문서 기준이다.

export type ApnsEnv = "production" | "sandbox";
export type ApnsConfig = { keyP8: string; keyId: string; teamId: string; bundleId: string };
export type ApnsResult =
  { ok: true; env: ApnsEnv } | { ok: false; status: number; reason: string; env: ApnsEnv };

const HOST: Record<ApnsEnv, string> = {
  production: "https://api.push.apple.com",
  sandbox: "https://api.sandbox.push.apple.com",
};

export function apnsConfigFromEnv(get: (k: string) => string | undefined): ApnsConfig | null {
  const keyP8 = get("APNS_KEY_P8");
  const keyId = get("APNS_KEY_ID");
  const teamId = get("APNS_TEAM_ID");
  if (!keyP8 || !keyId || !teamId) return null;
  return { keyP8, keyId, teamId, bundleId: get("APNS_BUNDLE_ID") ?? "kr.eclps.app" };
}

const b64url = (bytes: Uint8Array) =>
  btoa(String.fromCharCode(...bytes))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
const b64urlText = (text: string) => b64url(new TextEncoder().encode(text));

let cached: { jwt: string; at: number } | null = null;

/**
 * 공급자 토큰(JWT, ES256). Apple 은 20분~60분 사이에 갱신하라고 한다 — 너무 자주
 * 새로 만들면 TooManyProviderTokenUpdates 로 거절된다. 함수 인스턴스 안에서 40분 쓴다.
 */
async function providerToken(cfg: ApnsConfig): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  if (cached && now - cached.at < 40 * 60) return cached.jwt;

  const pem = cfg.keyP8.replace(/-----[^-]+-----/g, "").replace(/\s+/g, "");
  const der = Uint8Array.from(atob(pem), (c) => c.charCodeAt(0));
  const key = await crypto.subtle.importKey(
    "pkcs8",
    der,
    { name: "ECDSA", namedCurve: "P-256" },
    false,
    ["sign"],
  );
  const unsigned = `${b64urlText(JSON.stringify({ alg: "ES256", kid: cfg.keyId }))}.${b64urlText(
    JSON.stringify({ iss: cfg.teamId, iat: now }),
  )}`;
  // WebCrypto 의 ECDSA 서명은 r||s(64바이트) 형식이라 JWS ES256 에 그대로 쓴다.
  const sig = new Uint8Array(
    await crypto.subtle.sign(
      { name: "ECDSA", hash: "SHA-256" },
      key,
      new TextEncoder().encode(unsigned),
    ),
  );
  cached = { jwt: `${unsigned}.${b64url(sig)}`, at: now };
  return cached.jwt;
}

export async function sendApns(
  cfg: ApnsConfig,
  env: ApnsEnv,
  token: string,
  alert: { title: string; body: string },
  data: Record<string, string>,
): Promise<ApnsResult> {
  const res = await fetch(`${HOST[env]}/3/device/${token}`, {
    method: "POST",
    headers: {
      authorization: `bearer ${await providerToken(cfg)}`,
      "apns-topic": cfg.bundleId,
      "apns-push-type": "alert",
      "apns-priority": "10",
      "content-type": "application/json",
    },
    body: JSON.stringify({ aps: { alert, sound: "default" }, ...data }),
  });
  if (res.ok) return { ok: true, env };
  let reason = "unknown";
  try {
    reason = (await res.json())?.reason ?? reason;
  } catch {
    // 본문이 없는 응답도 있다.
  }
  return { ok: false, status: res.status, reason, env };
}
