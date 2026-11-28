import type { SupabaseClient } from "npm:@supabase/supabase-js@2";
import {
  kcpAppOrigin,
  kcpConfig,
  queryKcp,
  registerKcp,
  type KcpConfig,
  type KcpFlow,
} from "./kcp-direct.ts";
import { readVerifiedCarrierIdentity } from "./verified-carrier.ts";

type Config =
  | { direct: true; kcp: KcpConfig }
  | { direct: false; apiSecret: string; channelKey: string; storeId: string };
export function carrierConfig(): Config | null {
  const get = (key: string) => Deno.env.get(key);
  const provider = get("CARRIER_IDENTITY_PROVIDER") ?? "portone";
  if (provider === "kcp_direct") {
    try {
      return { direct: true, kcp: kcpConfig(get) };
    } catch {
      return null;
    }
  }
  const apiSecret = get("PORTONE_API_SECRET"),
    channelKey = get("PORTONE_KCP_IDENTITY_CHANNEL_KEY"),
    storeId = get("PORTONE_STORE_ID");
  return provider === "portone" && apiSecret && channelKey && storeId
    ? { direct: false, apiSecret, channelKey, storeId }
    : null;
}
// LIVE stays restricted until a separate, explicit rollout. Missing settings deny access.
export function isKcpDevicePreview(config: Config) {
  return config.direct && !config.kcp.sandbox && Deno.env.get("KCP_LIVE_ACCESS") !== "public";
}

export function isDeviceTester(email?: string) {
  const allowed = Deno.env.get("KCP_DEVICE_TESTER_EMAIL")?.trim().toLowerCase();
  return Boolean(allowed && email && email.trim().toLowerCase() === allowed);
}

export async function startCarrierProvider(
  db: SupabaseClient,
  config: Config,
  id: string,
  flow: KcpFlow,
  requestOrigin: string | null,
) {
  if (!config.direct)
    return { identityVerificationId: id, storeId: config.storeId, channelKey: config.channelKey };
  try {
    const appOrigin = kcpAppOrigin(config.kcp, requestOrigin, (key) => Deno.env.get(key));
    const settings = isKcpDevicePreview(config)
      ? { ...config.kcp, callback: config.kcp.callback + "?preview=1" }
      : config.kcp;
    const registered = await registerKcp(settings, id, flow);
    const { error } = await db
      .from("kcp_direct_registrations")
      .insert({ id, flow, app_origin: appOrigin, registration_key: registered.registrationKey });
    if (error) throw Error("provider verification unavailable");
    return { identityVerificationId: id, provider: "kcp_direct", ...registered };
  } catch (error) {
    // No browser received a launch. Release this server-generated attempt's quota.
    const table = flow === "signup" ? "signup_identity_attempts" : "identity_verification_attempts";
    const cleanup = await db.from(table).delete().eq("id", id).is("consumed_at", null);
    if (cleanup.error) throw Error("verification unavailable", { cause: error });
    throw error;
  }
}
export async function finishCarrierProvider(
  db: SupabaseClient,
  config: Config,
  id: string,
  flow: KcpFlow,
) {
  if (!config.direct) return readVerifiedCarrierIdentity(id, config);
  const { data, error } = await db
    .from("kcp_direct_registrations")
    .select("registration_key,returned_at")
    .eq("id", id)
    .eq("flow", flow)
    .gt("expires_at", new Date().toISOString())
    .maybeSingle();
  if (error) throw Error("provider verification unavailable");
  if (!data?.returned_at) throw Error("not verified");
  return queryKcp(config.kcp, id, data.registration_key);
}
