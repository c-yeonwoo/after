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
  type TicketKind,
  type TicketOrder,
} from "@/lib/api";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/store")({
  // 소개 화면에서 "소개 티켓 사기" 로 넘어올 때 그 탭이 바로 열려야 한다.
  validateSearch: (q: Record<string, unknown>): { kind?: TicketKind } => ({
    kind: q.kind === "intro" || q.kind === "meeting" ? q.kind : undefined,
  }),
  head: () => ({
    meta: [
      { title: `티켓 상점 — ${BRAND.short}` },
      { name: "description", content: "소개 티켓과 만남 티켓을 구매합니다." },
    ],
  }),
  component: StorePage,
});

/**
 * 티켓이 두 종류다(v2). 화면마다 어느 티켓인지 분명해야 한다 — 값도 성격도
 * 다르다. 소개 티켓은 **소멸**이고 만남 티켓은 조건부 환불이다.
 */
const KINDS: {
  v: TicketKind;
  label: string;
  unit: string;
  guide: string;
  terms: string[];
}[] = [
  {
    v: "intro",
    label: "소개 티켓",
    unit: "소개 프로필 열람 1회",
    guide: "도착한 소개의 프로필을 열 때 1장이 사용됩니다.",
    terms: [
      "티켓은 만료되지 않습니다",
      "열람에 사용하면 돌려받을 수 없습니다",
      "열어 본 뒤 만남으로 이어갈지는 자유입니다",
    ],
  },
  {
    v: "meeting",
    label: "만남 티켓",
    unit: "만남 주선 1회",
    guide: "티켓 한 장이 만남 한 번입니다. 상대가 24시간 안에 답하지 않으면 전액 돌려드립니다.",
    terms: [
      "티켓은 만료되지 않습니다",
      "상대가 24시간 안에 답하지 않으면 전액 환불",
      "상대 사유로 약속이 취소된 경우에도 환불",
    ],
  },
];

const won = (n: number) => `${n.toLocaleString("ko-KR")}원`;

/**
 * 티켓 상점 — 구매 전용(S13).
 *
 * /ticket 과 역할이 다르다. /ticket 은 "지금 열린 이 소개에 티켓을 쓴다"이고
 * 소개에 묶여 있다. 둘을 한 화면에 두면 티켓 0장인 사람에게 "쓰기"와 "사기"가
 * 섞여 보인다.
 */
function StorePage() {
  const { kind: fromLink } = Route.useSearch();
  const [kind, setKind] = useState<TicketKind>(fromLink ?? "meeting");
  const [owned, setOwned] = useState<number | null>(null);
  const [order, setOrder] = useState<TicketOrder | null>(null);
  /* 가격을 클라이언트에 두면 서버와 어긋난다 — 실제로 3장 가격을 바꾸며 겪었다. */
  const [bundles, setBundles] = useState<TicketBundle[]>([]);
  const [picked, setPicked] = useState<number>(1);
  const [busy, setBusy] = useState(false);

  const spec = KINDS.find((k) => k.v === kind)!;

  async function load(k: TicketKind) {
    const [count, pending, list] = await Promise.all([
      unusedTicketCount(k),
      myPendingTicketOrder(k),
      ticketBundles(k),
    ]);
    setOwned(count);
    setOrder(pending);
    setBundles(list);
    // 번들 구성이 종류마다 다르다(만남 1·3 / 소개 1·5) — 선택을 되돌려 놓는다.
    setPicked(list[0]?.quantity ?? 1);
  }

  useEffect(() => {
    void load(kind);
  }, [kind]);

  const single = bundles.find((b) => b.quantity === 1)?.amount ?? 0;

  return (
    <AppScreen title="티켓 상점" back="/me">
      <div className="mt-3 flex gap-2">
        {KINDS.map((k) => (
          <button
            key={k.v}
            type="button"
            aria-pressed={kind === k.v}
            onClick={() => setKind(k.v)}
            className={cn(
              "flex-1 rounded-control border-2 px-3 py-2 text-sm font-medium transition-colors",
              kind === k.v ? "border-primary bg-primary/8" : "border-border bg-card",
            )}
          >
            {k.label}
          </button>
        ))}
      </div>

      <div className="mt-3">
        <GuideNote introduce>{spec.guide}</GuideNote>
      </div>

      <p className="mt-5 text-sm text-muted-foreground">
        보유 {spec.label}{" "}
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
                onClick={() => setPicked(quantity)}
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
                  <span className="headline block text-lg">
                    {spec.label} {quantity}장
                  </span>
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
            {spec.label} {order.quantity}장 · {won(order.amount)}. 준비되면 보유 티켓에 바로
            들어옵니다.
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
                setOrder(await requestTicketOrder(picked, kind));
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
        {spec.terms.map((t) => (
          <li key={t} className="flex gap-2.5 text-muted-foreground">
            <Check className="mt-0.5 size-4 shrink-0 text-primary-strong" aria-hidden="true" />
            <span className="leading-relaxed">{t}</span>
          </li>
        ))}
      </ul>
    </AppScreen>
  );
}
