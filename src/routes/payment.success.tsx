import { createFileRoute, Link } from "@tanstack/react-router";
import { useCallback, useEffect, useRef, useState } from "react";

import { AppScreen } from "@/components/app/AppScreen";
import { PaymentState } from "@/components/app/PaymentState";
import { Button } from "@/components/ui/button";
import { confirmTicketPayment, getTicketOrder, type TicketOrder } from "@/lib/api";
import { BRAND } from "@/lib/brand";
import { useMe } from "@/lib/me";

export const Route = createFileRoute("/payment/success")({
  validateSearch: (q: Record<string, unknown>) => ({
    orderId: typeof q.orderId === "string" ? q.orderId : "",
    paymentKey: typeof q.paymentKey === "string" ? q.paymentKey : "",
    amount: Number(q.amount),
  }),
  head: () => ({ meta: [{ title: `결제 결과 — ${BRAND.name}` }] }),
  component: PaymentSuccessPage,
});

function PaymentSuccessPage() {
  const search = Route.useSearch();
  const { me, ready } = useMe();
  return ready && me ? (
    <PaymentConfirmation
      key={`${me.id}:${search.orderId}:${search.paymentKey}:${search.amount}`}
      {...search}
      userId={me.id}
    />
  ) : (
    <AppScreen title="결제 결과" hideTabs back="/store">
      <PaymentState
        title={ready ? "로그인 후 결제 내역을 확인해 주세요" : "결제 정보를 불러오고 있어요"}
        tone="checking"
      >
        {ready ? (
          <>
            <p>결제한 계정으로 로그인해 주세요. 중복 결제는 하지 마세요.</p>
            <Button asChild className="mt-5 w-full">
              <Link to="/login">로그인하기</Link>
            </Button>
          </>
        ) : (
          <p role="status">잠시만 기다려 주세요.</p>
        )}
      </PaymentState>
    </AppScreen>
  );
}

function PaymentConfirmation({
  orderId,
  paymentKey,
  amount,
  userId,
}: {
  orderId: string;
  paymentKey: string;
  amount: number;
  userId: string;
}) {
  const [order, setOrder] = useState<TicketOrder | null>(null);
  const [busy, setBusy] = useState(true);
  const [invalid, setInvalid] = useState(!orderId);
  const active = useRef(false);
  const lock = useRef(false);
  const approved = useRef(false);

  const confirm = useCallback(async () => {
    if (lock.current) return;
    lock.current = true;
    setBusy(true);
    try {
      if (!orderId) throw new Error("order required");
      let found = await getTicketOrder(orderId);
      if (!active.current) return;
      if (
        !found ||
        found.user_id !== userId ||
        !found.payment_required ||
        !["pending", "confirmed"].includes(found.state)
      ) {
        setInvalid(true);
        throw new Error("not your payable order");
      }
      if (
        found.state === "pending" &&
        paymentKey &&
        (!Number.isInteger(amount) || amount !== found.amount || amount <= 0)
      ) {
        setInvalid(true);
        throw new Error("amount mismatch");
      }
      if (
        found.state === "pending" &&
        paymentKey &&
        Number.isInteger(amount) &&
        amount > 0 &&
        !approved.current
      ) {
        try {
          await confirmTicketPayment(orderId, paymentKey, amount);
          approved.current = true;
        } catch {
          // A lost approval response is not a failed charge. Read the authoritative order.
        }
        if (!active.current) return;
        found = await getTicketOrder(orderId);
      }
      if (!active.current) return;
      if (found?.state !== "confirmed" || !found.payment_key || found.user_id !== userId)
        throw new Error("not confirmed");
      window.history.replaceState(
        window.history.state,
        "",
        `/payment/success?orderId=${encodeURIComponent(orderId)}`,
      );
      setOrder(found);
    } catch {
      if (active.current) setOrder(null);
    } finally {
      lock.current = false;
      if (active.current) setBusy(false);
    }
  }, [orderId, paymentKey, amount, userId]);

  useEffect(() => {
    active.current = true;
    void confirm();
    return () => {
      active.current = false;
    };
  }, [confirm]);

  return (
    <AppScreen
      title="결제 결과"
      hideTabs
      back="/store"
      footer={
        order || (!busy && invalid) ? (
          <Button asChild className="w-full" size="lg">
            <Link to="/orders">결제 내역 보기</Link>
          </Button>
        ) : (
          <Button className="w-full" size="lg" disabled={busy} onClick={() => void confirm()}>
            {busy ? "결제를 확인하는 중…" : "다시 확인하기"}
          </Button>
        )
      }
    >
      <PaymentState
        tone={busy ? "checking" : order ? "success" : "notice"}
        title={
          busy
            ? "결제를 확인하고 있어요"
            : order
              ? "결제가 완료되었습니다"
              : invalid
                ? "결제할 주문을 확인해 주세요"
                : "결제 확인이 지연되고 있습니다"
        }
      >
        {busy ? (
          <p role="status">결제를 확인하고 티켓을 넣는 중입니다…</p>
        ) : order ? (
          <>
            <p>구매한 티켓을 바로 사용할 수 있습니다.</p>
            <p className="mt-5 text-base font-semibold text-foreground">
              {order.kind === "intro" ? "소개 티켓" : "만남 티켓"} {order.quantity}장
            </p>
            <p className="mt-1 tabular-nums">{order.amount.toLocaleString("ko-KR")}원</p>
            <p className="mt-2 text-xs">발급일부터 12개월 동안 사용할 수 있어요.</p>
          </>
        ) : (
          <p>
            {invalid
              ? "주문 정보가 올바르지 않거나 결제할 수 없는 상태예요. 결제 내역을 확인하거나 고객센터에 문의해 주세요."
              : "중복 결제하지 마시고 먼저 결과를 다시 확인해 주세요."}
          </p>
        )}
      </PaymentState>
      {!busy && !order && !invalid ? (
        <div className="mt-4 grid grid-cols-2 gap-2">
          <Button asChild variant="outline">
            <Link to="/orders">결제 내역 보기</Link>
          </Button>
          <Button asChild variant="ghost">
            <Link to="/support">고객센터</Link>
          </Button>
        </div>
      ) : !busy && invalid ? (
        <Button asChild variant="ghost" className="mt-4 w-full">
          <Link to="/support">고객센터</Link>
        </Button>
      ) : order ? (
        <Button asChild variant="ghost" className="mt-4 w-full">
          <Link to="/home">홈으로</Link>
        </Button>
      ) : null}
    </AppScreen>
  );
}
