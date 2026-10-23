import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";

import { AppScreen } from "@/components/app/AppScreen";
import { PaymentState } from "@/components/app/PaymentState";
import { Button } from "@/components/ui/button";
import { getTicketOrder, type TicketOrder } from "@/lib/api";
import { BRAND } from "@/lib/brand";
import { useMe } from "@/lib/me";

export const Route = createFileRoute("/payment/fail")({
  validateSearch: (q: Record<string, unknown>) => ({
    code: typeof q.code === "string" ? q.code : "",
    orderId: typeof q.orderId === "string" ? q.orderId : "",
  }),
  head: () => ({ meta: [{ title: `결제 중단 — ${BRAND.name}` }] }),
  component: PaymentFailPage,
});

function PaymentFailPage() {
  const { code, orderId } = Route.useSearch();
  const { me } = useMe();
  return (
    <PaymentInterrupted
      key={`${me?.id}:${orderId}:${code}`}
      code={code}
      orderId={orderId}
      userId={me?.id}
    />
  );
}

function PaymentInterrupted({
  code,
  orderId,
  userId,
}: {
  code: string;
  orderId: string;
  userId?: string;
}) {
  const [order, setOrder] = useState<TicketOrder | null>(null);
  const [checking, setChecking] = useState(Boolean(orderId && userId));
  useEffect(() => {
    if (!orderId || !userId) return;
    let active = true;
    void getTicketOrder(orderId)
      .then((found) => {
        if (active && found?.user_id === userId && found.payment_required) setOrder(found);
      })
      .catch(() => {
        /* Keep the safe history action when the order cannot be verified. */
      })
      .finally(() => {
        if (active) setChecking(false);
      });
    return () => {
      active = false;
    };
  }, [orderId, userId]);
  const resume = order?.state === "pending" && !order.payment_attention;
  const confirmed = order?.state === "confirmed";
  return (
    <AppScreen
      title="결제 중단"
      hideTabs
      back="/store"
      footer={
        checking ? (
          <Button className="w-full" size="lg" disabled>
            주문을 확인하는 중…
          </Button>
        ) : resume ? (
          <Button asChild className="w-full" size="lg">
            <Link to="/checkout" search={{ orderId }}>
              결제 이어하기
            </Link>
          </Button>
        ) : (
          <Button asChild className="w-full" size="lg">
            <Link to="/orders">결제 내역 보기</Link>
          </Button>
        )
      }
    >
      <PaymentState
        tone={confirmed ? "success" : "notice"}
        title={
          confirmed
            ? "이미 결제가 완료된 주문입니다"
            : checking
              ? "주문을 확인하고 있어요"
              : order?.payment_attention
                ? "결제 상태를 확인해 주세요"
                : code === "USER_CANCEL"
                  ? "결제창을 닫았어요"
                  : "결제를 완료하지 못했습니다"
        }
      >
        {checking ? (
          <p role="status">주문 상태를 확인하고 있어요.</p>
        ) : confirmed ? (
          <p>추가 결제 없이 결제 내역에서 확인해 주세요.</p>
        ) : order?.payment_attention ? (
          <p>
            결제 상태 확인이 필요해요. 중복 결제하지 마시고 결제 내역을 확인하거나 고객센터에 문의해
            주세요.
          </p>
        ) : order && order.state !== "pending" ? (
          <p>이 주문은 종료되었어요. 결제 내역에서 상태를 확인해 주세요.</p>
        ) : (
          <>
            <p>
              {code === "USER_CANCEL"
                ? resume
                  ? "준비되면 같은 주문으로 이어갈 수 있어요."
                  : "주문 상태는 결제 내역에서 확인할 수 있어요."
                : "카드 정보와 결제수단을 확인한 뒤 다시 시도해 주세요."}
            </p>
            <p className="mt-3">
              이미 결제 알림을 받았다면 다시 결제하지 말고 내역을 먼저 확인해 주세요.
            </p>
          </>
        )}
      </PaymentState>
      <div className={resume ? "mt-4 grid grid-cols-2 gap-2" : "mt-4 flex justify-center"}>
        {resume ? (
          <Button asChild variant="outline">
            <Link to="/orders">이용 내역</Link>
          </Button>
        ) : null}
        <Button asChild variant="ghost">
          <Link to="/support">고객센터</Link>
        </Button>
      </div>
    </AppScreen>
  );
}
