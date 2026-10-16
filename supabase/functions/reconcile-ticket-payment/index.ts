// Operator-only reconciliation of an unresolved Toss result. Reads the
// provider; never invents a paid/canceled status from a timeout or 404.
import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders } from "../_shared/cors.ts";

const TOSS_API_BASE_URL = Deno.env.get("TOSS_API_BASE_URL") ?? "https://api.tosspayments.com";
const TOSS_SECRET_KEY = Deno.env.get("TOSS_SECRET_KEY");

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "method not allowed" }, 405);
  if (!TOSS_SECRET_KEY) return json({ error: "payment provider not configured" }, 503);

  let body: { orderId?: string };
  try {
    body = await req.json();
  } catch {
    return json({ error: "invalid JSON" }, 400);
  }
  if (!body.orderId || !/^ticket_[a-f0-9]{32}$/.test(body.orderId)) {
    return json({ error: "valid orderId required" }, 400);
  }

  const authorization = req.headers.get("Authorization");
  if (!authorization) return json({ error: "unauthenticated" }, 401);
  const callerClient = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_ANON_KEY")!,
    { global: { headers: { Authorization: authorization } } },
  );
  const {
    data: { user },
    error: userError,
  } = await callerClient.auth.getUser();
  if (userError || !user) return json({ error: "unauthenticated" }, 401);
  const { data: isAdmin, error: adminError } = await callerClient.rpc("is_admin");
  if (adminError || !isAdmin) return json({ error: "admin only" }, 403);
  const { data: mfaAllowed, error: mfaError } = await callerClient.rpc("admin_sensitive_auth_ok");
  if (mfaError || !mfaAllowed)
    return json({ error: "stronger admin authentication required" }, 403);

  const adminClient = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );
  const { data: order, error: orderError } = await adminClient
    .from("ticket_orders")
    .select("order_id,state,amount,payment_key,payment_required")
    .eq("order_id", body.orderId)
    .maybeSingle();
  if (orderError) return json({ error: "order lookup failed" }, 500);
  if (!order || !order.payment_required) return json({ error: "paid order not found" }, 404);
  if (order.state !== "pending" && order.state !== "canceling") {
    return json({ state: order.state, result: "already_settled" });
  }
  if (order.state === "canceling" && !order.payment_key) {
    return json({ error: "canceling order has no payment key" }, 409);
  }

  const path =
    order.state === "canceling"
      ? `/v1/payments/${encodeURIComponent(order.payment_key)}`
      : `/v1/payments/orders/${encodeURIComponent(order.order_id)}`;
  let provider: Record<string, unknown>;
  try {
    const response = await fetch(`${TOSS_API_BASE_URL}${path}`, {
      method: "GET",
      headers: { Authorization: `Basic ${btoa(`${TOSS_SECRET_KEY}:`)}` },
      signal: AbortSignal.timeout(10000),
    });
    if (!response.ok) {
      await adminClient.rpc("record_payment_provider_check", {
        p_order_id: order.order_id,
        p_attention: order.state === "pending" ? "confirm_unknown" : "cancel_unknown",
        p_checked: response.status === 404,
      });
      return json({ state: order.state, result: "provider_unresolved" }, 409);
    }
    provider = await response.json();
  } catch {
    return json({ state: order.state, result: "provider_unreachable" }, 502);
  }

  if (
    provider.orderId !== order.order_id ||
    provider.totalAmount !== order.amount ||
    typeof provider.paymentKey !== "string" ||
    (order.payment_key && provider.paymentKey !== order.payment_key)
  ) {
    await adminClient.rpc("record_payment_provider_check", {
      p_order_id: order.order_id,
      p_attention: "provider_mismatch",
      p_checked: true,
    });
    return json({ state: order.state, result: "provider_mismatch" }, 409);
  }

  if (
    (order.state === "pending" && provider.status === "DONE") ||
    (order.state === "canceling" && provider.status === "CANCELED")
  ) {
    const { data: result, error } = await adminClient.rpc("apply_payment_reconciliation", {
      p_order_id: order.order_id,
      p_actor: user.id,
      p_provider_status: provider.status,
      p_payment_key: provider.paymentKey,
      p_total_amount: provider.totalAmount,
      p_balance_amount: provider.balanceAmount,
      p_method: typeof provider.method === "string" ? provider.method : null,
    });
    if (error) return json({ state: order.state, result: "local_reconciliation_failed" }, 409);
    return json({ state: result === "fulfilled" ? "confirmed" : "canceled", result });
  }

  await adminClient.rpc("record_payment_provider_check", {
    p_order_id: order.order_id,
    p_attention: order.state === "pending" ? "confirm_unknown" : "cancel_unknown",
    p_checked: true,
  });
  return json({ state: order.state, result: "provider_not_terminal" }, 409);
});
