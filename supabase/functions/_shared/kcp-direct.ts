// NHN KCP 본인확인 V2. Only the encrypted server-to-server query can attest identity.
import type { VerifiedCarrierIdentity } from "./verified-carrier.ts";

export type KcpFlow = "signup" | "member";
export type KcpConfig = { site: string; key: string; sandbox: boolean; callback: string };
const encoder = new TextEncoder();

export function kcpConfig(get: (key: string) => string | undefined): KcpConfig {
  const site = get("KCP_SITE_CODE");
  const key = get("KCP_ENC_KEY");
  const serverUrl = get("SUPABASE_URL");
  if (!serverUrl) throw Error("not configured");
  const supabase = new URL(serverUrl);
  const local = ["kong", "localhost", "127.0.0.1", "[::1]"].includes(supabase.hostname);
  const sandbox = get("KCP_TEST_MODE") === "true";
  if (
    !site ||
    !/^[A-Z0-9]{5}$/.test(site) ||
    !key ||
    sandbox !== local ||
    (!sandbox && (site === "AO7F3" || supabase.protocol !== "https:"))
  )
    throw Error("not configured");
  const base = sandbox ? get("KCP_TEST_RETURN_ORIGIN") : supabase.origin;
  if (!base || !/^https:\/\//.test(base)) throw Error("not configured");
  return { site, key, sandbox, callback: new URL("/functions/v1/kcp-identity-return", base).href };
}

// The signup capability and the member's auth session belong to the browser origin.
export function kcpAppOrigin(
  config: KcpConfig,
  origin: string | null,
  get: (key: string) => string | undefined,
) {
  if (config.sandbox) {
    if (origin && origin === get("KCP_TEST_APP_ORIGIN")) return origin;
  } else if (origin === "https://aftersunset.kr" || origin === "https://www.aftersunset.kr") {
    return origin;
  } else if (
    origin &&
    origin === get("KCP_PREVIEW_APP_ORIGIN") &&
    /^https:\/\/[a-z0-9-]+\.aftersunset\.kr$/.test(origin)
  ) {
    return origin;
  }
  throw Error("invalid application origin");
}

function origin(config: KcpConfig) {
  return config.sandbox ? "https://testcert.kcp.co.kr" : "https://cert.kcp.co.kr";
}

function base64(bytes: Uint8Array) {
  return btoa(Array.from(bytes, (v) => String.fromCharCode(v)).join(""));
}

function decode(value: unknown, max: number) {
  if (
    typeof value !== "string" ||
    !value.length ||
    value.length > max ||
    !/^[A-Za-z0-9+/]+={0,2}$/.test(value)
  )
    throw Error("invalid provider response");
  return Uint8Array.from(atob(value), (c) => c.charCodeAt(0));
}

// Wire compatibility with NHN KCP's encryptJson/decryptJson format.
async function cipher(config: KcpConfig, salt: Uint8Array<ArrayBuffer>) {
  if (salt.length !== 16) throw Error("invalid provider response");
  async function derive(password: string, bits: number) {
    const input = await crypto.subtle.importKey("raw", encoder.encode(password), "PBKDF2", false, [
      "deriveBits",
    ]);
    return crypto.subtle.deriveBits(
      { name: "PBKDF2", hash: "SHA-256", iterations: 10000, salt },
      input,
      bits,
    );
  }
  const [keyBytes, iv] = await Promise.all([derive(config.key, 256), derive(config.site, 128)]);
  const key = await crypto.subtle.importKey("raw", keyBytes, "AES-CBC", false, [
    "encrypt",
    "decrypt",
  ]);
  return { key, params: { name: "AES-CBC", iv } };
}

export async function encryptKcp(
  data: unknown,
  config: KcpConfig,
  salt = crypto.getRandomValues(new Uint8Array(16)),
) {
  const { key, params } = await cipher(config, salt);
  const bytes = await crypto.subtle.encrypt(params, key, encoder.encode(JSON.stringify(data)));
  return { encData: base64(new Uint8Array(bytes)), rv: base64(salt) };
}

async function post(config: KcpConfig, path: string, body: string, rv?: string, fetcher = fetch) {
  const response = await fetcher(origin(config) + path, {
    method: "POST",
    redirect: "error",
    signal: AbortSignal.timeout(12000),
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      site_cd: config.site,
      ...(rv ? { rv } : {}),
    },
    body,
  });
  if (!response.ok) throw Error("provider verification unavailable");
  const data = await response.json();
  if (data?.res_cd !== "0000") throw Error("provider verification unavailable");
  return data;
}

export async function registerKcp(config: KcpConfig, id: string, flow: KcpFlow, fetcher = fetch) {
  const callback = new URL(config.callback);
  callback.searchParams.set("id", id);
  callback.searchParams.set("flow", flow);
  const { encData, rv } = await encryptKcp(
    { site_cd: config.site, ordr_idxx: id, Ret_URL: callback.href, param_opt_1: id },
    config,
  );
  const data = await post(config, "/api/reg/certDataReg.do", encData, rv, fetcher);
  const callUrl = new URL(data.call_url);
  if (
    callUrl.origin !== origin(config) ||
    callUrl.username ||
    callUrl.password ||
    typeof data.reg_cert_key !== "string" ||
    !/^[\x21-\x7e]{1,20}$/.test(data.reg_cert_key)
  )
    throw Error("invalid provider response");
  return { callUrl: callUrl.href, registrationKey: data.reg_cert_key as string };
}

export async function queryKcp(
  config: KcpConfig,
  id: string,
  registrationKey: string,
  fetcher = fetch,
): Promise<VerifiedCarrierIdentity> {
  const data = await post(
    config,
    "/api/query/getCertData.do",
    JSON.stringify({ reg_cert_key: registrationKey, ordr_idxx: id }),
    undefined,
    fetcher,
  );
  const { key, params } = await cipher(config, decode(data.rv, 32));
  const clear = await crypto.subtle.decrypt(params, key, decode(data.enc_cert_data, 32768));
  const value = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(clear));
  const birth =
    typeof value.birth_day === "string" && /^(\d{4})(\d{2})(\d{2})$/.exec(value.birth_day);
  const isoBirth = birth && birth.slice(1).join("-");
  const timestamp = isoBirth ? Date.parse(isoBirth + "T00:00:00Z") : NaN;
  const gender = value.sex_code === "01" ? "male" : value.sex_code === "02" ? "female" : null;
  if (
    value.res_cd !== "0000" ||
    !isoBirth ||
    !Number.isFinite(timestamp) ||
    new Date(timestamp).toISOString().slice(0, 10) !== isoBirth ||
    !gender ||
    typeof value.phone_no !== "string" ||
    !/^01[016789]\d{7,8}$/.test(value.phone_no) ||
    typeof value.DI !== "string" ||
    !value.DI.trim()
  )
    throw Error("incomplete verified identity");
  return {
    gender,
    birth: isoBirth,
    phone: "+82" + value.phone_no.slice(1),
    di: value.DI,
  };
}
