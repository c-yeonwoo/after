import { createFileRoute, Link } from "@tanstack/react-router";
import { useCallback, useEffect, useState } from "react";

import { AppScreen } from "@/components/app/AppScreen";
import { confirmTicketPayment, getTicketOrder } from "@/lib/api";
import { BRAND } from "@/lib/brand";

export const Route = createFileRoute("/payment/success")({
  validateSearch: (q: Record<string, unknown>) => ({
    orderId: typeof q.orderId === "string" ? q.orderId : "",
    paymentKey: typeof q.paymentKey === "string" ? q.paymentKey : "",
    amount: typeof q.amount === "string" ? Number(q.amount) : Number(q.amount),
  }),
  head: () => ({ meta: [{ title: `결제 결과 — ${BRAND.name}` }] }),
  component: PaymentSuccessPage,
});

function PaymentSuccessPage() {
  const { orderId, paymentKey, amount } = Route.useSearch();
  const [status, setStatus] = useState<"checking" | "confirmed" | "retry">("checking");
  const [busy, setBusy] = useState(false);

  const confirm = useCallback(async () => {
    setBusy(true);
    try {
      if (!orderId) throw new Error("order required");
      if (paymentKey && Number.isInteger(amount) && amount > 0) {
        await confirmTicketPayment(orderId, paymentKey, amount);
        window.history.replaceState(
          {},
          "",
          `/payment/success?orderId=${encodeURIComponent(orderId)}`,
        );
      }
      const order = await getTicketOrder(orderId);
      if (order?.state !== "confirmed" || !order.payment_key) throw new Error("not confirmed");
      setStatus("confirmed");
    } catch {
      setStatus("retry");
    } finally {
      setBusy(false);
    }
  }, [orderId, paymentKey, amount]);

  useEffect(() => {
    void confirm();
  }, [confirm]);

  return (
    <AppScreen title="결제 결과" hideTabs back="/store">
      <div className="mt-16 text-center">
        {status === "checking" ? (
          <p className="text-sm text-muted-foreground">결제를 확인하고 티켓을 넣는 중입니다…</p>
        ) : status === "confirmed" ? (
          <>
            <h1 className="headline text-2xl">결제가 완료되었습니다</h1>
            <p className="mt-3 text-sm text-muted-foreground">
              구매한 티켓을 바로 사용할 수 있습니다.
            </p>
            <Link to="/orders" className="mt-6 inline-block text-sm font-semibold underline">
              결제 내역 보기
            </Link>
          </>
        ) : (
          <>
            <h1 className="headline text-xl">결제 확인이 지연되고 있습니다</h1>
            <p className="mt-3 text-sm text-muted-foreground">
              중복 결제하지 마시고 먼저 결과를 다시 확인해 주세요.
            </p>
            <button
              type="button"
              disabled={busy}
              onClick={() => void confirm()}
              className="mt-6 text-sm font-semibold underline disabled:opacity-50"
            >
              다시 확인하기
            </button>
          </>
        )}
      </div>
    </AppScreen>
  );
}
