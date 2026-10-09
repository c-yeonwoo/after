import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { toast } from "sonner";

import { AppScreen } from "@/components/app/AppScreen";
import { Button } from "@/components/ui/button";
import { cancelTicketPayment, myPaidTicketOrders, type TicketOrder } from "@/lib/api";
import { BRAND } from "@/lib/brand";
import { useMe } from "@/lib/me";

export const Route = createFileRoute("/orders")({
  head: () => ({ meta: [{ title: `결제 내역 — ${BRAND.name}` }] }),
  component: OrdersPage,
});

const won = (amount: number) => `${amount.toLocaleString("ko-KR")}원`;

function OrdersPage() {
  const { me, ready } = useMe();
  const navigate = useNavigate();
  const [orders, setOrders] = useState<TicketOrder[] | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  async function load() {
    try {
      setOrders(await myPaidTicketOrders());
    } catch {
      toast.error("결제 내역을 불러오지 못했습니다.");
    }
  }

  useEffect(() => {
    if (!ready) return;
    if (!me) {
      void navigate({ to: "/login", replace: true });
      return;
    }
    void load();
  }, [ready, me, navigate]);

  return (
    <AppScreen title="결제 내역" back="/me">
      {orders === null ? (
        <p className="mt-16 text-center text-sm text-muted-foreground">불러오는 중입니다…</p>
      ) : orders.length === 0 ? (
        <div className="mt-16 text-center">
          <p className="text-sm text-muted-foreground">결제 내역이 없습니다.</p>
          <Link to="/store" className="mt-4 inline-block text-sm font-semibold underline">
            티켓 보러 가기
          </Link>
        </div>
      ) : (
        <ul className="mt-4 space-y-3">
          {orders.map((order) => (
            <li key={order.order_id} className="rounded-surface border border-border bg-card p-5">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="font-semibold">
                    {order.kind === "intro" ? "소개" : "만남"} 티켓 {order.quantity}장
                  </p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {new Date(order.created_at).toLocaleDateString("ko-KR")}
                  </p>
                </div>
                <p className="font-semibold tabular-nums">{won(order.amount)}</p>
              </div>
              <p className="mt-3 text-xs text-muted-foreground">
                {order.state === "canceled"
                  ? "결제 취소 완료"
                  : order.state === "canceling"
                    ? "취소 확인 중"
                    : "결제 완료"}
              </p>
              {order.state === "confirmed" || order.state === "canceling" ? (
                <Button
                  variant="outline"
                  size="sm"
                  className="mt-4"
                  disabled={busy === order.order_id}
                  onClick={async () => {
                    if (
                      order.state === "confirmed" &&
                      !window.confirm("미사용 티켓 주문 전체를 취소할까요?")
                    )
                      return;
                    setBusy(order.order_id);
                    try {
                      await cancelTicketPayment(order.order_id);
                      toast.success("결제 취소를 확인했습니다.");
                      await load();
                    } catch {
                      toast.error(
                        "취소를 완료하지 못했습니다. 미사용 상태를 확인하거나 문의해 주세요.",
                      );
                    } finally {
                      setBusy(null);
                    }
                  }}
                >
                  {order.state === "canceling" ? "취소 결과 다시 확인" : "미사용 주문 취소"}
                </Button>
              ) : null}
            </li>
          ))}
        </ul>
      )}
    </AppScreen>
  );
}
