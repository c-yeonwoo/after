import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useCallback, useEffect, useRef, useState } from "react";
import { Receipt, Ticket as TicketIcon } from "lucide-react";
import { toast } from "sonner";

import { AppScreen } from "@/components/app/AppScreen";
import { Button } from "@/components/ui/button";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  cancelTicketPayment,
  listMyTickets,
  myPaidTicketOrders,
  type Ticket,
  type TicketOrder,
} from "@/lib/api";
import { BRAND } from "@/lib/brand";
import { useMe } from "@/lib/me";

export const Route = createFileRoute("/orders")({
  head: () => ({ meta: [{ title: `티켓 이용 내역 — ${BRAND.name}` }] }),
  component: OrdersPage,
});

const won = (amount: number) => `${amount.toLocaleString("ko-KR")}원`;

function OrdersPage() {
  const { me, ready } = useMe();
  const navigate = useNavigate();
  const [orders, setOrders] = useState<TicketOrder[] | null>(null);
  const [tickets, setTickets] = useState<Ticket[] | null>(null);
  const [loadError, setLoadError] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [confirmCancel, setConfirmCancel] = useState<TicketOrder | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const activeUser = useRef<string | null>(null);
  const sequence = useRef(0);
  const cancelLock = useRef(false);
  const userId = me?.id;

  const load = useCallback(async (owner: string) => {
    if (activeUser.current !== owner) return;
    const request = ++sequence.current;
    setRefreshing(true);
    setLoadError(false);
    try {
      const [paidOrders, ticketHistory] = await Promise.all([
        myPaidTicketOrders(),
        listMyTickets(),
      ]);
      if (activeUser.current !== owner || request !== sequence.current) return;
      setOrders(paidOrders);
      setTickets(ticketHistory);
      setLoadError(false);
    } catch {
      if (activeUser.current !== owner || request !== sequence.current) return;
      setLoadError(true);
    } finally {
      if (activeUser.current === owner && request === sequence.current) setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    if (!ready) return;
    if (!userId) {
      void navigate({ to: "/login", replace: true });
      return;
    }
    activeUser.current = userId;
    setOrders(null);
    setTickets(null);
    setConfirmCancel(null);
    void load(userId);
    return () => {
      activeUser.current = null;
      sequence.current += 1;
    };
  }, [ready, userId, navigate, load]);

  async function cancel(order: TicketOrder) {
    const owner = activeUser.current;
    if (!owner || cancelLock.current) return;
    cancelLock.current = true;
    setBusy(order.order_id);
    try {
      await cancelTicketPayment(order.order_id);
      if (activeUser.current !== owner) return;
      toast.success("결제 취소를 확인했습니다.");
      await load(owner);
    } catch {
      if (activeUser.current === owner)
        toast.error("취소를 완료하지 못했습니다. 미사용 상태를 확인하거나 문의해 주세요.");
    } finally {
      cancelLock.current = false;
      if (activeUser.current === owner) setBusy(null);
    }
  }

  return (
    <AppScreen
      title="티켓 이용 내역"
      back="/me"
      action={
        me ? (
          <Button
            variant="ghost"
            size="sm"
            disabled={refreshing || busy !== null}
            onClick={() => void load(me.id)}
          >
            새로고침
          </Button>
        ) : undefined
      }
    >
      {loadError ? (
        <div role="alert" className="app-elevated mt-3 rounded-surface bg-card p-5">
          <p className="text-sm text-muted-foreground">
            {orders === null
              ? "내역을 불러오지 못했어요."
              : "새로고침하지 못했어요. 이전 내역을 표시하고 있어요."}
          </p>
          <Button
            variant="outline"
            className="mt-3"
            disabled={refreshing || busy !== null || !me}
            onClick={() => me && void load(me.id)}
          >
            다시 불러오기
          </Button>
        </div>
      ) : null}
      {orders === null ? (
        loadError ? null : (
          <p role="status" className="mt-16 text-center text-sm text-muted-foreground">
            불러오는 중입니다…
          </p>
        )
      ) : orders.length === 0 ? (
        <div className="app-elevated mt-3 rounded-surface bg-card px-5 py-8 text-center">
          <Receipt
            className="mx-auto mb-4 size-7 text-primary"
            strokeWidth={1.5}
            aria-hidden="true"
          />
          <p className="text-sm text-muted-foreground">유료 결제 내역이 없습니다.</p>
          <Button variant="outline" className="mt-4" asChild>
            <Link to="/store">티켓 보러 가기</Link>
          </Button>
        </div>
      ) : (
        <ul className="mt-4 space-y-3" aria-label="결제 내역">
          {orders.map((order) => (
            <li key={order.order_id} className="app-elevated rounded-surface bg-card p-5">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="font-semibold">
                    {order.kind === "intro" ? "소개" : "만남"} 티켓 {order.quantity}장
                  </p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {new Date(order.created_at).toLocaleDateString("ko-KR")}
                  </p>
                </div>
                <p className="shrink-0 font-semibold tabular-nums">{won(order.amount)}</p>
              </div>
              <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
                <p className="rounded-control bg-surface-subtle px-2.5 py-1 text-xs font-medium text-foreground">
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
                    disabled={busy !== null || refreshing}
                    onClick={() =>
                      order.state === "confirmed" ? setConfirmCancel(order) : void cancel(order)
                    }
                  >
                    {busy === order.order_id
                      ? "확인 중…"
                      : order.state === "canceling"
                        ? "취소 결과 다시 확인"
                        : "미사용 주문 취소"}
                  </Button>
                ) : null}
              </div>
              {order.state === "confirmed" && order.quantity > 1 ? (
                <p className="mt-3 text-xs leading-relaxed text-muted-foreground">
                  일부 사용 후 남은 티켓의 청약철회는 문의 메일로 주문번호를 보내주세요.
                </p>
              ) : null}
            </li>
          ))}
        </ul>
      )}
      {tickets && tickets.length > 0 ? (
        <section className="mt-7">
          <h2 className="text-base font-semibold">티켓 사용 내역</h2>
          <p className="mt-1 text-xs text-muted-foreground">
            발급, 사용, 반환 기록을 확인할 수 있습니다.
          </p>
          <ul
            className="app-elevated mt-4 divide-y divide-border/60 overflow-hidden rounded-surface bg-card"
            aria-label="티켓 사용 내역"
          >
            {tickets.map((ticket) => {
              const expired =
                ticket.state === "unused" && new Date(ticket.expires_at) <= new Date();
              const state =
                ticket.state === "used"
                  ? "사용"
                  : ticket.state === "refunded"
                    ? "반환·취소"
                    : expired
                      ? "기간 만료"
                      : "사용 가능";
              const date =
                ticket.state === "refunded"
                  ? (ticket.refunded_at ?? ticket.issued_at)
                  : (ticket.used_at ?? ticket.issued_at);
              return (
                <li key={ticket.id} className="flex items-start gap-3 p-4 text-sm">
                  <TicketIcon className="mt-0.5 size-5 shrink-0 text-primary" aria-hidden="true" />
                  <div className="min-w-0 flex-1">
                    <p className="font-medium">
                      {ticket.kind === "intro" ? "소개 열람" : "만남 조율"} 티켓 · {state}
                    </p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {ticket.restored_from_ticket_id
                        ? "반환 재발급"
                        : ticket.price_krw === 0
                          ? "무료 발급"
                          : "구매 발급"}
                      {ticket.state === "unused" && !expired
                        ? ` · ${new Date(ticket.expires_at).toLocaleDateString("ko-KR")}까지`
                        : ""}
                    </p>
                    <time className="mt-2 block text-xs text-muted-foreground" dateTime={date}>
                      {new Date(date).toLocaleDateString("ko-KR")}
                    </time>
                  </div>
                </li>
              );
            })}
          </ul>
        </section>
      ) : null}
      <AlertDialog
        open={confirmCancel !== null}
        onOpenChange={(open) => !open && setConfirmCancel(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>미사용 티켓 주문 전체를 취소할까요?</AlertDialogTitle>
            <AlertDialogDescription>
              {confirmCancel
                ? `${confirmCancel.kind === "intro" ? "소개" : "만남"} 티켓 ${confirmCancel.quantity}장 · ${won(confirmCancel.amount)} 주문입니다. `
                : ""}
              사용한 티켓이 있으면 자동 취소되지 않습니다. 일부 사용 후 남은 티켓은 고객센터로
              문의해 주세요.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>돌아가기</AlertDialogCancel>
            <AlertDialogAction
              disabled={busy !== null}
              onClick={() => confirmCancel && void cancel(confirmCancel)}
            >
              주문 취소하기
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </AppScreen>
  );
}
