import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Check, Ticket } from "lucide-react";
import { toast } from "sonner";

import { AppScreen } from "@/components/app/AppScreen";
import { GuideNote } from "@/components/app/GuideNote";
import { Button } from "@/components/ui/button";
import { BRAND } from "@/lib/brand";
import {
  myPendingTicketOrder,
  requestTicketOrder,
  ticketBundles,
  unusedTicketCount,
  type TicketBundle,
  type TicketOrder,
} from "@/lib/api";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/store")({
  head: () => ({
    meta: [
      { title: `티켓 상점 — ${BRAND.short}` },
      { name: "description", content: "만남 티켓을 구매합니다. 한 장이면 한 번의 만남." },
    ],
  }),
  component: StorePage,
});

const won = (n: number) => `${n.toLocaleString("ko-KR")}원`;

/**
 * 티켓 상점 — 구매 전용(S13).
 *
 * /ticket 과 역할이 다르다. /ticket 은 "지금 열린 이 소개에 티켓을 쓴다"이고
 * 소개에 묶여 있다. 둘을 한 화면에 두면 티켓 0장인 사람에게 "쓰기"와 "사기"가
 * 섞여 보인다.
 */
function StorePage() {
  const [owned, setOwned] = useState<number | null>(null);
  const [order, setOrder] = useState<TicketOrder | null>(null);
  /* 가격을 클라이언트에 두면 서버와 어긋난다 — 실제로 3장 가격을 바꾸며 겪었다. */
  const [bundles, setBundles] = useState<TicketBundle[]>([]);
  const [picked, setPicked] = useState<1 | 3>(1);
  const [busy, setBusy] = useState(false);

  async function load() {
    const [count, pending, list] = await Promise.all([
      unusedTicketCount(),
      myPendingTicketOrder(),
      ticketBundles(),
    ]);
    setOwned(count);
    setOrder(pending);
    setBundles(list);
  }

  useEffect(() => {
    load();
  }, []);

  const single = bundles.find((b) => b.quantity === 1)?.amount ?? 0;

  return (
    <AppScreen title="티켓 상점" back="/me">
      <div className="mt-3">
        <GuideNote introduce>
          티켓 한 장이 만남 한 번입니다. 상대가 24시간 안에 답하지 않으면 전액 돌려드립니다.
        </GuideNote>
      </div>

      <p className="mt-5 text-sm text-muted-foreground">
        보유 티켓{" "}
        <span className="font-semibold text-foreground tabular-nums">{owned ?? "—"}장</span>
      </p>

      <ul className="mt-3 space-y-2.5">
        {bundles.map(({ quantity, amount }) => {
          const perUnit = Math.round(amount / quantity);
          const saved = single * quantity - amount;
          const on = picked === quantity;
          return (
            <li key={quantity}>
              <button
                type="button"
                aria-pressed={on}
                onClick={() => setPicked(quantity === 3 ? 3 : 1)}
                className={cn(
                  "flex w-full items-center gap-4 rounded-surface border-2 px-5 py-4 text-left transition-colors",
                  "focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none",
                  on ? "border-primary bg-primary/8" : "border-border bg-card hover:bg-muted/40",
                )}
              >
                <Ticket
                  className={cn("size-5 shrink-0", on ? "text-primary" : "text-muted-foreground")}
                  aria-hidden="true"
                />
                <span className="min-w-0 flex-1">
                  <span className="headline block text-lg">만남 티켓 {quantity}장</span>
                  <span className="mt-0.5 block text-xs text-muted-foreground">
                    장당 {won(perUnit)}
                    {saved > 0 ? ` · ${won(saved)} 아낌` : ""}
                  </span>
                </span>
                <span className="shrink-0 text-right">
                  <span className="block text-base font-semibold tabular-nums">{won(amount)}</span>
                </span>
              </button>
            </li>
          );
        })}
      </ul>

      {order ? (
        <div className="mt-6 rounded-surface border border-primary/30 bg-primary/8 px-5 py-6 text-center">
          <p className="text-sm font-semibold text-primary-strong">신청을 받았습니다</p>
          <p className="mt-2 text-xs leading-relaxed text-muted-foreground">
            티켓 {order.quantity}장 · {won(order.amount)}. 준비되면 보유 티켓에 바로 들어옵니다.
          </p>
        </div>
      ) : (
        <>
          {/*
            결제 수단이 붙기 전이라 신청만 받는다. 보낼 수 없는 알림을
            약속하지 않고, 확인 가능한 사실만 적는다.
          */}
          <Button
            className="mt-6 w-full"
            size="lg"
            disabled={busy}
            onClick={async () => {
              setBusy(true);
              try {
                setOrder(await requestTicketOrder(picked));
                toast.success("신청을 받았습니다.");
              } catch (err) {
                toast.error(err instanceof Error ? err.message : "신청에 실패했습니다.");
              } finally {
                setBusy(false);
              }
            }}
          >
            {busy ? "신청하는 중…" : `${picked}장 신청하기`}
          </Button>
          <p className="mt-3 text-center text-xs leading-relaxed text-muted-foreground">
            결제 수단을 여는 중이라 지금은 신청만 받고 있습니다.
          </p>
        </>
      )}

      <ul className="mt-8 space-y-2.5 border-t border-border pt-5 text-sm">
        {[
          "티켓은 만료되지 않습니다",
          "상대가 24시간 안에 답하지 않으면 전액 환불",
          "상대 사유로 약속이 취소된 경우에도 환불",
        ].map((t) => (
          <li key={t} className="flex gap-2.5 text-muted-foreground">
            <Check className="mt-0.5 size-4 shrink-0 text-primary-strong" aria-hidden="true" />
            <span className="leading-relaxed">{t}</span>
          </li>
        ))}
      </ul>
    </AppScreen>
  );
}
