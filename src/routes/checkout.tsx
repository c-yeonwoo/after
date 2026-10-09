import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { loadTossPayments } from "@tosspayments/tosspayments-sdk";
import { useEffect, useState } from "react";

import { AppScreen } from "@/components/app/AppScreen";
import { Button } from "@/components/ui/button";
import { getTicketOrder, type TicketOrder } from "@/lib/api";
import { BRAND } from "@/lib/brand";
import { useMe } from "@/lib/me";

type Widgets = ReturnType<Awaited<ReturnType<typeof loadTossPayments>>["widgets"]>;

export const Route = createFileRoute("/checkout")({
  validateSearch: (q: Record<string, unknown>): { orderId: string } => ({
    orderId: typeof q.orderId === "string" ? q.orderId : "",
  }),
  head: () => ({ meta: [{ title: `결제 — ${BRAND.name}` }] }),
  component: CheckoutPage,
});

const won = (amount: number) => `${amount.toLocaleString("ko-KR")}원`;

function CheckoutPage() {
  const { orderId } = Route.useSearch();
  const { me, ready } = useMe();
  const navigate = useNavigate();
  const [order, setOrder] = useState<TicketOrder | null>(null);
  const [loading, setLoading] = useState(true);
  const [widgets, setWidgets] = useState<Widgets | null>(null);
  const [widgetReady, setWidgetReady] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [paymentError, setPaymentError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!ready) return;
    if (!me) {
      void navigate({ to: "/login", replace: true });
      return;
    }
    if (!orderId) {
      setError("주문번호가 없습니다.");
      setLoading(false);
      return;
    }
    let active = true;
    getTicketOrder(orderId)
      .then((found) => {
        if (!active) return;
        if (!found || found.user_id !== me.id || !found.payment_required) {
          setError("결제할 주문을 찾을 수 없습니다.");
        } else {
          setOrder(found);
        }
      })
      .catch(() => {
        if (active) setError("주문을 불러오지 못했습니다. 다시 시도해 주세요.");
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [ready, me, orderId, navigate]);

  useEffect(() => {
    const clientKey = import.meta.env.VITE_TOSS_CLIENT_KEY;
    if (!order || order.state !== "pending" || !me) return;
    if (!clientKey) {
      setError("결제 준비 중입니다. 잠시 후 다시 시도해 주세요.");
      return;
    }
    let active = true;
    let methodControl: { destroy: () => Promise<void> } | null = null;
    let agreementControl: { destroy: () => Promise<void> } | null = null;

    (async () => {
      try {
        const toss = await loadTossPayments(clientKey);
        if (!active) return;
        const nextWidgets = toss.widgets({ customerKey: me.id });
        await nextWidgets.setAmount({ currency: "KRW", value: order.amount });
        if (!active) return;
        methodControl = await nextWidgets.renderPaymentMethods({ selector: "#payment-methods" });
        if (!active) return;
        agreementControl = await nextWidgets.renderAgreement({ selector: "#payment-agreement" });
        if (!active) return;
        setWidgets(nextWidgets);
        setWidgetReady(true);
      } catch {
        if (active) setError("결제 화면을 불러오지 못했습니다. 다시 시도해 주세요.");
      }
    })();

    return () => {
      active = false;
      setWidgets(null);
      setWidgetReady(false);
      if (methodControl) void methodControl.destroy();
      if (agreementControl) void agreementControl.destroy();
    };
  }, [order, me]);

  const label = order?.kind === "intro" ? "소개 티켓" : "만남 티켓";

  return (
    <AppScreen title="결제" hideTabs back="/store">
      {loading ? (
        <p className="mt-16 text-center text-sm text-muted-foreground">주문을 불러오는 중입니다…</p>
      ) : error ? (
        <div className="mt-10 text-center">
          <p className="text-sm text-destructive">{error}</p>
          <Link to="/store" className="mt-4 inline-block text-sm font-semibold underline">
            티켓 화면으로
          </Link>
        </div>
      ) : order ? (
        <>
          <div className="mt-3 rounded-surface border border-border bg-card p-5">
            <p className="text-sm text-muted-foreground">구매 상품</p>
            <div className="mt-2 flex items-baseline justify-between gap-4">
              <p className="font-semibold">
                {label} {order.quantity}장
              </p>
              <p className="text-xl font-semibold tabular-nums">{won(order.amount)}</p>
            </div>
            <p className="mt-2 text-xs text-muted-foreground">
              {order.kind === "intro"
                ? "도착한 소개 프로필을 여는 데 1장씩 사용합니다."
                : "상대와 만남을 조율할 때 1장씩 사용합니다."}
            </p>
            <p className="mt-1 text-xs text-muted-foreground">
              결제 후 발급되는 티켓의 사용기한은 12개월입니다.
            </p>
          </div>

          {order.state === "confirmed" ? (
            <div className="mt-8 text-center">
              <p className="font-semibold">이미 결제가 완료된 주문입니다.</p>
              <Link to="/orders" className="mt-4 inline-block text-sm underline">
                결제 내역 보기
              </Link>
            </div>
          ) : order.state !== "pending" ? (
            <div className="mt-8 text-center">
              <p className="font-semibold">이 주문은 결제를 진행할 수 없습니다.</p>
              <Link to="/store" className="mt-4 inline-block text-sm underline">
                새 주문 만들기
              </Link>
            </div>
          ) : (
            <>
              <div className="mt-5 text-xs leading-relaxed text-muted-foreground">
                <Link to="/terms" className="underline">
                  서비스 이용 및 환불 조건
                </Link>
                을 확인한 뒤 결제해 주세요.
              </div>
              <div id="payment-methods" className="mt-4 min-h-32" />
              <div id="payment-agreement" className="mt-2 min-h-16" />
              {paymentError ? (
                <p role="alert" className="mt-3 text-sm text-destructive">
                  {paymentError}
                </p>
              ) : null}
              <Button
                size="lg"
                className="mt-5 w-full"
                disabled={!widgetReady || busy}
                onClick={async () => {
                  if (!widgets) return;
                  setBusy(true);
                  setPaymentError(null);
                  try {
                    await widgets.requestPayment({
                      orderId: order.order_id,
                      orderName: `${BRAND.name} ${label} ${order.quantity}장`,
                      customerEmail: me?.company_email ?? undefined,
                      customerName: me?.name ?? undefined,
                      successUrl: `${window.location.origin}/payment/success`,
                      failUrl: `${window.location.origin}/payment/fail`,
                    });
                  } catch (cause) {
                    const code =
                      cause && typeof cause === "object" && "code" in cause ? cause.code : null;
                    if (code === "NEED_CARD_PAYMENT_DETAIL") {
                      setPaymentError("카드사를 선택한 뒤 다시 결제해 주세요.");
                    } else if (code !== "USER_CANCEL") {
                      setPaymentError("결제창을 열지 못했습니다. 다시 시도해 주세요.");
                    }
                    setBusy(false);
                  }
                }}
              >
                {busy ? "결제창을 여는 중…" : `${won(order.amount)} 결제하기`}
              </Button>
            </>
          )}
        </>
      ) : null}
    </AppScreen>
  );
}
