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
// payment_id(=orderId)는 issue_ticket() 안에서 UNIQUE(payment_id) 위에
// on conflict do nothing 으로 멱등 처리된다 — 같은 orderId로 confirm이
// 두 번 와도(토스 쪽 재시도 포함) 티켓이 중복 발급되지 않는다.

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

  if (order.state === "confirmed") {
    // 멱등: 이미 확정된 주문이면 기존 티켓을 그대로 반환한다.
    const { data: existingTicket } = await adminClient
      .from("tickets")
      .select("*")
      .eq("payment_id", orderId)
      .maybeSingle();
    return json({ ticket: existingTicket });
  }

  const tossRes = await fetch(`${TOSS_API_BASE_URL}/v1/payments/confirm`, {
    method: "POST",
    headers: {
      Authorization: `Basic ${btoa(`${TOSS_SECRET_KEY}:`)}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ paymentKey, orderId, amount }),
  });
  const tossBody = await tossRes.json();

  if (!tossRes.ok || tossBody.status !== "DONE" || tossBody.totalAmount !== order.amount) {
    await adminClient.from("ticket_orders").update({ state: "failed" }).eq("order_id", orderId);
    return json({ error: "payment confirmation failed", toss: tossBody }, 402);
  }

  await adminClient
    .from("ticket_orders")
    .update({ state: "confirmed", confirmed_at: new Date().toISOString() })
    .eq("order_id", orderId);

  const { data: ticket, error: issueError } = await adminClient.rpc("issue_ticket", {
    p_user_id: order.user_id,
    p_payment_id: orderId,
    p_price_krw: order.amount,
  });
  if (issueError) {
    return json({ error: issueError.message }, 500);
  }

  return json({ ticket });
});
