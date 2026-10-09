// Cancel a fully unused paid ticket order. The database reserves its tickets
// before the Toss request, so they cannot be consumed while a refund is in
// flight. Retrying uses the same Toss idempotency key.

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
  if (!TOSS_SECRET_KEY) return json({ error: "TOSS_SECRET_KEY not configured" }, 500);

  let body: { orderId?: string };
  try {
    body = await req.json();
  } catch {
    return json({ error: "invalid json body" }, 400);
  }
  const orderId = body.orderId;
  if (!orderId || !/^ticket_[a-f0-9]{32}$/.test(orderId)) {
    return json({ error: "valid orderId required" }, 400);
  }

  const authHeader = req.headers.get("Authorization");
  if (!authHeader) return json({ error: "unauthenticated" }, 401);
  const callerClient = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_ANON_KEY")!,
    { global: { headers: { Authorization: authHeader } } },
  );
  const {
    data: { user },
    error: userError,
  } = await callerClient.auth.getUser();
  if (userError || !user) return json({ error: "unauthenticated" }, 401);

  const adminClient = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );
  const { data: order, error: orderError } = await adminClient
    .from("ticket_orders")
    .select("*")
    .eq("order_id", orderId)
    .maybeSingle();
  if (orderError) return json({ error: orderError.message }, 500);
  if (!order) return json({ error: "order not found" }, 404);
  if (order.user_id !== user.id) return json({ error: "not your order" }, 403);
  if (!order.payment_required || !order.payment_key) {
    return json({ error: "not a paid order" }, 409);
  }
  if (order.state === "canceled") return json({ canceled: true });
  if (order.state !== "confirmed" && order.state !== "canceling") {
    return json({ error: "order is not cancelable" }, 409);
  }

  const { data: reserved, error: reserveError } = await adminClient.rpc(
    "reserve_paid_order_cancel",
    { p_order_id: orderId },
  );
  if (reserveError) return json({ error: reserveError.message }, 409);

  const reason = "구매자 요청 - 미사용 티켓 결제 취소";
  let tossRes: Response;
  let tossBody: Record<string, unknown>;
  try {
    tossRes = await fetch(
      `${TOSS_API_BASE_URL}/v1/payments/${encodeURIComponent(reserved.payment_key)}/cancel`,
      {
        method: "POST",
        headers: {
          Authorization: `Basic ${btoa(`${TOSS_SECRET_KEY}:`)}`,
          "Content-Type": "application/json",
          "Idempotency-Key": `cancel-${orderId}`,
        },
        body: JSON.stringify({ cancelReason: reason }),
      },
    );
    tossBody = await tossRes.json();
  } catch {
    // Provider status is unknown. Keep tickets reserved and let a retry with
    // the same idempotency key reconcile the result.
    return json({ error: "cancel status is unknown; retry or contact support" }, 502);
  }

  if (!tossRes.ok) {
    if (tossRes.status >= 400 && tossRes.status < 500 && tossRes.status !== 429) {
      await adminClient.rpc("release_paid_order_cancel", { p_order_id: orderId });
    }
    return json({ error: "payment cancellation failed" }, tossRes.status >= 500 ? 502 : 409);
  }
  if (
    tossBody.paymentKey !== reserved.payment_key ||
    tossBody.orderId !== orderId ||
    tossBody.status !== "CANCELED" ||
    tossBody.balanceAmount !== 0 ||
    tossBody.totalAmount !== reserved.amount
  ) {
    return json({ error: "cancel response did not match the order" }, 502);
  }

  const { error: finalizeError } = await adminClient.rpc("finalize_paid_order_cancel", {
    p_order_id: orderId,
    p_reason: reason,
  });
  if (finalizeError) return json({ error: finalizeError.message }, 500);
  return json({ canceled: true });
});
