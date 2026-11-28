import { createClient } from "npm:@supabase/supabase-js@2";
import { handleKcpReturn } from "../_shared/kcp-return.ts";
import { kcpAppOrigin, kcpConfig } from "../_shared/kcp-direct.ts";
Deno.serve(async (req) => {
  const get = (key: string) => Deno.env.get(key);
  if (get("CARRIER_IDENTITY_PROVIDER") !== "kcp_direct") return new Response(null, { status: 404 });
  try {
    const config = kcpConfig(get);
    const db = createClient(get("SUPABASE_URL")!, get("SUPABASE_SERVICE_ROLE_KEY")!);
    return await handleKcpReturn(req, async (id, flow, key) => {
      // Keep the registration key out of PostgREST URLs and access logs.
      const { data, error } = await db
        .from("kcp_direct_registrations")
        .select("registration_key,app_origin")
        .eq("id", id)
        .eq("flow", flow)
        .gt("expires_at", new Date().toISOString())
        .maybeSingle();
      if (error) throw Error("receipt unavailable");
      if (!data) return null;
      const appOrigin = kcpAppOrigin(config, data.app_origin, get);
      if (!key || data.registration_key !== key) return { appOrigin, accepted: false };
      const saved = await db
        .from("kcp_direct_registrations")
        .update({ returned_at: new Date().toISOString() })
        .eq("id", id)
        .eq("flow", flow)
        .gt("expires_at", new Date().toISOString())
        .select("id")
        .maybeSingle();
      if (saved.error) throw Error("receipt unavailable");
      return { appOrigin, accepted: Boolean(saved.data) };
    });
  } catch {
    return new Response("잠시 후 인증 결과를 다시 확인해 주세요.", {
      status: 503,
      headers: { "Cache-Control": "no-store" },
    });
  }
});
