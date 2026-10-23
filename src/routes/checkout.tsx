import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { loadTossPayments } from "@tosspayments/tosspayments-sdk";
import { useEffect, useRef, useState } from "react";
import { Ticket } from "lucide-react";

import { AppScreen } from "@/components/app/AppScreen";
import { PaymentState } from "@/components/app/PaymentState";
import { Button } from "@/components/ui/button";
import { getTicketOrder, type Profile, type TicketOrder } from "@/lib/api";
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
  useEffect(() => {
    if (ready && !me) void navigate({ to: "/login", replace: true });
  }, [ready, me, navigate]);
  // A different actor/order must not inherit a provider instance or click lock.
  return ready && me ? (
    <OrderCheckout key={`${me.id}:${orderId}`} me={me} orderId={orderId} />
  ) : (
    <AppScreen title="결제" hideTabs back="/store">
      <p role="status" className="mt-10 text-center text-sm text-muted-foreground">
        불러오는 중입니다…
      </p>
    </AppScreen>
  );
}

function OrderCheckout({ me, orderId }: { me: Profile; orderId: string }) {
  const [order, setOrder] = useState<TicketOrder | null>(null);
  const [error, setError] = useState(false);
  const [retry, setRetry] = useState(0);
  useEffect(() => {
    let active = true;
    setError(false);
    void getTicketOrder(orderId)
      .then((found) => {
        if (!active) return;
        if (!found || found.user_id !== me.id || !found.payment_required) setError(true);
        else setOrder(found);
      })
      .catch(() => {
        if (active) setError(true);
      });
    return () => {
      active = false;
    };
  }, [orderId, me.id, retry]);

  if (order && order.state === "pending" && !order.payment_attention)
    return <PaymentForm order={order} me={me} />;
  return (
    <AppScreen
      title="결제"
      hideTabs
      back="/store"
      footer={
        error ? (
          <Button className="w-full" size="lg" onClick={() => setRetry((n) => n + 1)}>
            다시 불러오기
          </Button>
        ) : order ? (
          <Button asChild className="w-full" size="lg">
            <Link to="/orders">결제 내역 보기</Link>
          </Button>
        ) : undefined
      }
    >
      {error ? (
        <PaymentState tone="error" title="주문을 불러오지 못했어요">
          주문번호와 로그인 계정을 확인한 뒤 다시 불러와 주세요.
          <Button asChild variant="ghost" className="mt-4 w-full">
            <Link to="/store">티켓 화면으로</Link>
          </Button>
        </PaymentState>
      ) : order ? (
        <PaymentState
          tone={order.state === "confirmed" ? "success" : "notice"}
          title={
            order.state === "confirmed"
              ? "이미 결제가 완료된 주문입니다"
              : order.payment_attention
                ? "결제 상태를 확인해 주세요"
                : "이 주문은 결제를 진행할 수 없어요"
          }
        >
          {order.payment_attention
            ? "중복 결제하지 마시고 결제 내역을 확인하거나 고객센터에 문의해 주세요."
            : "결제 내역에서 주문 상태를 확인할 수 있어요."}
        </PaymentState>
      ) : (
        <p role="status" className="mt-10 text-center text-sm text-muted-foreground">
          주문을 불러오는 중입니다…
        </p>
      )}
    </AppScreen>
  );
}

function PaymentForm({ order, me }: { order: TicketOrder; me: Profile }) {
  const [widgets, setWidgets] = useState<Widgets | null>(null);
  const [widgetError, setWidgetError] = useState(false);
  const [retry, setRetry] = useState(0);
  const [paymentError, setPaymentError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const lock = useRef(false);
  const active = useRef(false);
  const label = order.kind === "intro" ? "소개 티켓" : "만남 티켓";

  useEffect(() => {
    let alive = true;
    active.current = true;
    const controls: { destroy: () => Promise<void> }[] = [];
    const dispose = (control: { destroy: () => Promise<void> }) => {
      void control.destroy().catch(() => {
        /* A removed provider frame is already disposed. */
      });
    };
    setWidgets(null);
    setWidgetError(false);
    void (async () => {
      try {
        const key = import.meta.env.VITE_TOSS_CLIENT_KEY;
        if (!key) throw new Error("unavailable");
        const toss = await loadTossPayments(key);
        if (!alive) return;
        const next = toss.widgets({ customerKey: me.id });
        await next.setAmount({ currency: "KRW", value: order.amount });
        if (!alive) return;
        for (const render of [
          () => next.renderPaymentMethods({ selector: "#payment-methods" }),
          () => next.renderAgreement({ selector: "#payment-agreement" }),
        ]) {
          const control = await render();
          if (!alive) {
            dispose(control);
            return;
          }
          controls.push(control);
        }
        setWidgets(next);
      } catch {
        controls.splice(0).forEach(dispose);
        if (alive) setWidgetError(true);
      }
    })();
    return () => {
      alive = false;
      active.current = false;
      controls.splice(0).forEach(dispose);
    };
  }, [me.id, order.amount, retry]);

  async function pay() {
    if (!widgets || lock.current) return;
    lock.current = true;
    setBusy(true);
    setPaymentError(null);
    try {
      const failUrl = new URL("/payment/fail", window.location.origin);
      failUrl.searchParams.set("orderId", order.order_id);
      await widgets.requestPayment({
        orderId: order.order_id,
        orderName: `${BRAND.name} ${label} ${order.quantity}장`,
        customerEmail: me.company_email ?? undefined,
        customerName: me.name ?? undefined,
        successUrl: `${window.location.origin}/payment/success`,
        failUrl: failUrl.href,
      });
    } catch (cause) {
      if (!active.current) return;
      const code = cause && typeof cause === "object" && "code" in cause ? cause.code : null;
      setPaymentError(
        code === "NEED_CARD_PAYMENT_DETAIL"
          ? "카드사를 선택한 뒤 다시 결제해 주세요."
          : code === "USER_CANCEL"
            ? "결제창을 닫았어요. 준비되면 다시 이어갈 수 있어요."
            : "결제창을 열지 못했습니다. 다시 시도해 주세요.",
      );
      // Redirect-mode requests remain locked until navigation, even if the SDK
      // resolves before the browser commits the result URL. Only rejection is retryable here.
      lock.current = false;
      if (active.current) setBusy(false);
    }
  }

  return (
    <AppScreen
      title="결제"
      hideTabs
      back="/store"
      footer={
        <>
          {paymentError ? (
            <p role="alert" className="mb-3 text-sm leading-relaxed text-destructive">
              {paymentError}
            </p>
          ) : null}
          <Button
            size="lg"
            className="w-full"
            disabled={!widgets || busy}
            onClick={() => void pay()}
          >
            {busy ? "결제창을 여는 중…" : `${won(order.amount)} 결제하기`}
          </Button>
        </>
      }
    >
      <section aria-label="주문 상품" className="app-elevated mt-3 rounded-surface bg-card p-5">
        <div className="flex items-center gap-3">
          <Ticket className="size-6 shrink-0 text-primary" aria-hidden="true" />
          <h2 className="text-base font-semibold">
            {label} {order.quantity}장
          </h2>
        </div>
        <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
          {order.kind === "intro"
            ? "도착한 소개 프로필을 여는 데 1장씩 사용합니다."
            : "상대와 만남을 조율할 때 1장씩 사용합니다."}
        </p>
        <dl className="mt-4 flex items-baseline justify-between gap-3 border-t border-border pt-4">
          <dt className="text-sm text-muted-foreground">총 결제 금액</dt>
          <dd className="text-2xl font-semibold tracking-tight tabular-nums">
            {won(order.amount)}
          </dd>
        </dl>
        <p className="mt-2 text-xs text-muted-foreground">티켓 사용기한 · 발급일부터 12개월</p>
      </section>
      <section aria-labelledby="payment-method-title" className="mt-7">
        <h2 id="payment-method-title" className="text-base font-semibold">
          결제 수단
        </h2>
        {widgetError ? (
          <div role="alert" className="mt-3 rounded-surface bg-surface-subtle p-4">
            <p className="text-sm leading-relaxed text-muted-foreground">
              결제 수단을 불러오지 못했어요. 잠시 후 다시 시도해 주세요.
            </p>
            <Button variant="outline" className="mt-3" onClick={() => setRetry((n) => n + 1)}>
              다시 불러오기
            </Button>
          </div>
        ) : !widgets ? (
          <p role="status" className="mt-3 text-sm text-muted-foreground">
            안전한 결제창을 준비하고 있어요…
          </p>
        ) : null}
        <div id="payment-methods" className="mt-3 min-h-20" />
        <div id="payment-agreement" className="mt-2 min-h-12" />
      </section>
      <p className="mt-4 text-xs leading-relaxed text-muted-foreground">
        결제 전 서비스 이용 및 환불 조건을 확인해 주세요.
      </p>
      <Button asChild variant="ghost" className="-ml-3">
        <Link to="/terms">이용 및 환불 조건 보기</Link>
      </Button>
    </AppScreen>
  );
}
