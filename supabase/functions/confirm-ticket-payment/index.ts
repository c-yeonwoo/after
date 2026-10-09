// S5 — 토스페이먼츠 결제 승인 콜백.
//
// 토스페이먼츠 표준 카드결제는 "웹훅"이 1차 신호가 아니다 — 체크아웃 위젯이
// 성공 리다이렉트로 {paymentKey, orderId, amount}를 클라이언트에 돌려주면,
// 그걸 반드시 서버가 자기 시크릿 키로 POST /v1/payments/confirm 을 호출해
// 승인을 "확정"해야 실제로 돈이 잡힌다. (PAYMENT_STATUS_CHANGED 웹훅은 가상계좌
// 입금 등 이후의 비동기 상태 변화용이라 이번 범위에 없다 — docs.tosspayments.com
// /reference/using-api/webhook-events)
//
// N1(서버 권위)에 따라 클라이언트는 orderId·amount를 스스로 주장하지 못한다:
// - orderId ↔ user_id 매핑은 create_ticket_order() RPC가 체크아웃 시작 시
//   서버에서 미리 만들어 둔다(ticket_orders 테이블).
// - 이 함수는 그 매핑을 조회해서 얻은 user_id·amount로만 issue_ticket()을
//   부른다. 호출자가 다른 사람 주문을 승인 요청하면 403.
//
// payment_id는 `<orderId>#<ticket number>` 형식이며 UNIQUE이다.
// 최종 승인과 묶음 티켓 발급은 fulfill_paid_ticket_order() 한 트랜잭션에서
// 처리한다. 같은 orderId·paymentKey 재요청은 기존 결과를 돌려준다.

import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders } from "../_shared/cors.ts";

const TOSS_API_BASE_URL = Deno.env.get("TOSS_API_BASE_URL") ?? "https://api.tosspayments.com";
const TOSS_SECRET_KEY = Deno.env.get("TOSS_SECRET_KEY");

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), {
      status,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  if (req.method !== "POST") {
    return json({ error: "method not allowed" }, 405);
  }
  if (!TOSS_SECRET_KEY) {
    return json({ error: "TOSS_SECRET_KEY not configured" }, 500);
  }

  let body: { orderId?: string; paymentKey?: string; amount?: number };
  try {
    body = await req.json();
  } catch {
    return json({ error: "invalid json body" }, 400);
  }
  const { orderId, paymentKey, amount } = body;
  if (!orderId || !paymentKey || typeof amount !== "number") {
    return json({ error: "orderId, paymentKey, amount are required" }, 400);
  }

  const authHeader = req.headers.get("Authorization");
  if (!authHeader) {
    return json({ error: "unauthenticated" }, 401);
  }

  // 호출자 신원 확인용 — anon 키 + 호출자 JWT (RLS 그대로 적용됨)
  const callerClient = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_ANON_KEY")!,
    { global: { headers: { Authorization: authHeader } } },
  );
  const {
    data: { user },
    error: userError,
  } = await callerClient.auth.getUser();
  if (userError || !user) {
    return json({ error: "unauthenticated" }, 401);
  }

  // 이후 조회·갱신·issue_ticket 호출은 service_role로 — RLS를 우회해
  // ticket_orders.user_id 를 신뢰된 값으로 직접 조회한다.
  const adminClient = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  const { data: order, error: orderError } = await adminClient
    .from("ticket_orders")
    .select("*")
    .eq("order_id", orderId)
    .maybeSingle();
  if (orderError) {
    return json({ error: orderError.message }, 500);
  }
  if (!order) {
    return json({ error: "order not found" }, 404);
  }
  if (order.user_id !== user.id) {
    return json({ error: "not your order" }, 403);
  }
  if (order.amount !== amount) {
    return json({ error: "amount mismatch" }, 400);
  }
  if (!order.payment_required) {
    return json({ error: "this order was created in free beta" }, 409);
  }

  const ticketIds = Array.from({ length: order.quantity }, (_, i) => `${orderId}#${i + 1}`);

  if (order.state === "confirmed") {
    if (order.payment_key !== paymentKey) {
      return json({ error: "payment key mismatch" }, 409);
    }
    const { data: existing } = await adminClient
      .from("tickets")
      .select("*")
      .in("payment_id", ticketIds);
    return json({ tickets: existing ?? [] });
  }
  if (order.state !== "pending") {
    return json({ error: "order is not pending" }, 409);
  }

  let tossRes: Response;
  let tossBody: Record<string, unknown>;
  try {
    tossRes = await fetch(`${TOSS_API_BASE_URL}/v1/payments/confirm`, {
      method: "POST",
      headers: {
        Authorization: `Basic ${btoa(`${TOSS_SECRET_KEY}:`)}`,
        "Content-Type": "application/json",
        "Idempotency-Key": `confirm-${orderId}`,
      },
      body: JSON.stringify({ paymentKey, orderId, amount: order.amount }),
    });
    tossBody = await tossRes.json();
  } catch {
    // An interrupted network response does not prove the charge failed.
    // Keep the order pending so the same idempotency key can be retried.
    return json({ error: "payment confirmation status is unknown; retry" }, 502);
  }

  if (!tossRes.ok) {
    // 5xx and rate limits may be transient. A definitive 4xx means the buyer
    // must start a new order, but never treat a transport error as a decline.
    if (tossRes.status >= 400 && tossRes.status < 500 && tossRes.status !== 429) {
      await adminClient.from("ticket_orders").update({ state: "failed" }).eq("order_id", orderId);
    }
    return json({ error: "payment confirmation failed" }, tossRes.status >= 500 ? 502 : 402);
  }
  if (
    tossBody.status !== "DONE" ||
    tossBody.orderId !== orderId ||
    tossBody.paymentKey !== paymentKey ||
    tossBody.totalAmount !== order.amount
  ) {
    // A charge may have succeeded. Keep the order pending for reconciliation.
    return json({ error: "payment response did not match the order" }, 502);
  }

  // 수량만큼 발급하고 주문을 confirmed 로 넘기는 것까지 한 함수가 한 트랜잭션에서
  // 한다(S13). 예전에는 여기서 state 를 먼저 바꾸고 issue_ticket 을 따로 불러서,
  // 그 사이에 죽으면 "결제는 확정인데 티켓은 없는" 주문이 남을 수 있었다.
  const { data: issued, error: issueError } = await adminClient.rpc("fulfill_paid_ticket_order", {
    p_order_id: orderId,
    p_payment_key: paymentKey,
    p_method: typeof tossBody.method === "string" ? tossBody.method : null,
  });
  if (issueError) {
    return json({ error: issueError.message }, 500);
  }

  const { data: tickets } = await adminClient
    .from("tickets")
    .select("*")
    .in("payment_id", ticketIds);

  return json({ issued, tickets: tickets ?? [] });
});
