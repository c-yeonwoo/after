import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { Check, Ticket } from "lucide-react";
import { toast } from "sonner";

import { AppScreen } from "@/components/app/AppScreen";
import { Button } from "@/components/ui/button";
import { GuideNote } from "@/components/app/GuideNote";
import { BRAND } from "@/lib/brand";
import {
  myPendingTicketOrder,
  requestTicketOrder,
  ticketBundles,
  unusedTicketCount,
  paymentsEnabled,
  type TicketBundle,
  type TicketKind,
  type TicketOrder,
} from "@/lib/api";
import { useMe } from "@/lib/me";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/store")({
  validateSearch: (q: Record<string, unknown>): { kind?: TicketKind } => ({
    kind: q.kind === "intro" || q.kind === "meeting" ? q.kind : undefined,
  }),
  head: () => ({
    meta: [
      { title: `티켓 받기 — ${BRAND.name}` },
      { name: "description", content: "소개 티켓과 만남 티켓을 확인하고 신청합니다." },
    ],
  }),
  component: StorePage,
});

const KINDS = [
  {
    v: "intro",
    label: "소개 티켓",
    guide: "도착한 소개의 프로필을 열 때 1장이 사용됩니다.",
    terms: [
      "새로 받는 티켓은 발급일부터 12개월 동안 사용할 수 있습니다",
      "열람에 사용하면 돌려받을 수 없습니다",
      "열어 본 뒤 만남으로 이어갈지는 자유입니다",
    ],
  },
  {
    v: "meeting",
    label: "만남 티켓",
    guide: "티켓 한 장이 만남 한 번입니다. 상대가 24시간 안에 답하지 않으면 티켓을 돌려드립니다.",
    terms: [
      "새로 받는 티켓은 발급일부터 12개월 동안 사용할 수 있습니다",
      "상대가 24시간 안에 답하지 않으면 티켓 자동 반환",
      "상대 사유로 약속이 취소된 경우에도 반환",
    ],
  },
] as const;
const won = (n: number) => `${n.toLocaleString("ko-KR")}원`;
type StoreData = {
  key: string;
  paid: boolean;
  owned: number;
  bundles: TicketBundle[];
  order: TicketOrder | null;
};

function StorePage() {
  const { me, ready } = useMe();
  const navigate = useNavigate();
  const { kind: fromLink } = Route.useSearch();
  const kind = fromLink ?? "meeting";
  const key = `${me?.id}:${kind}`;
  const allowed = ready && me?.gender === "male";
  const [data, setData] = useState<StoreData | null>(null);
  const [errorKey, setErrorKey] = useState<string | null>(null);
  const [retry, setRetry] = useState(0);
  const [picked, setPicked] = useState(1);
  const [busy, setBusy] = useState(false);
  const submitting = useRef(false);
  const activeKey = useRef("");
  const current = data?.key === key ? data : null;
  const spec = KINDS.find((item) => item.v === kind)!;
  const kindPicker = (
    <div className="mt-3 flex gap-2" role="group" aria-label="티켓 종류">
      {KINDS.map((item) => (
        <button
          key={item.v}
          type="button"
          aria-pressed={kind === item.v}
          disabled={busy}
          onClick={() => void navigate({ to: "/store", search: { kind: item.v }, replace: true })}
          className={cn(
            "pressable min-h-12 flex-1 rounded-control px-3 py-2 text-sm font-semibold focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none disabled:opacity-60",
            kind === item.v
              ? "bg-selection text-selection-foreground"
              : "bg-surface-subtle text-foreground",
          )}
        >
          {item.label}
        </button>
      ))}
    </div>
  );

  useEffect(() => {
    if (!ready) return;
    if (!me) void navigate({ to: "/login", replace: true });
    else if (me.gender !== "male") void navigate({ to: "/me", replace: true });
  }, [ready, me, navigate]);

  useEffect(() => {
    if (!allowed) return;
    let active = true;
    activeKey.current = key;
    setErrorKey(null);
    void (async () => {
      try {
        const paid = await paymentsEnabled();
        if (!active) return;
        if (!paid) {
          setData({ key, paid: false, owned: 0, bundles: [], order: null });
          return;
        }
        const [owned, bundles, order] = await Promise.all([
          unusedTicketCount(kind),
          ticketBundles(kind),
          myPendingTicketOrder(kind, true),
        ]);
        if (!active) return;
        setPicked(bundles[0]?.quantity ?? 1);
        setData({ key, paid, owned, bundles, order });
      } catch {
        if (active) setErrorKey(key);
      }
    })();
    return () => {
      active = false;
      activeKey.current = "";
    };
  }, [allowed, key, kind, retry]);

  if (allowed && errorKey === key)
    return (
      <AppScreen title="티켓 받기" back="/me">
        <div
          role="alert"
          className="app-elevated mt-3 rounded-surface bg-card px-5 py-8 text-center"
        >
          <p className="text-sm text-muted-foreground">티켓 정보를 불러오지 못했어요.</p>
          <Button variant="outline" className="mt-4" onClick={() => setRetry((v) => v + 1)}>
            다시 불러오기
          </Button>
        </div>
      </AppScreen>
    );
  if (!allowed || !current)
    return (
      <AppScreen title="티켓 받기" back="/me">
        {allowed && data?.paid ? kindPicker : null}
        <p role="status" className="mt-16 text-center text-sm text-muted-foreground">
          불러오는 중입니다…
        </p>
      </AppScreen>
    );
  if (!current.paid)
    return (
      <AppScreen title="베타 이용 안내" back="/me">
        <div className="mt-3 mb-5">
          <GuideNote assistant>
            지금은 무료 베타예요. 자동 결제 없이 소개와 만남 조율을 이용해요.
          </GuideNote>
        </div>
        <div className="app-elevated mt-3 rounded-surface bg-card px-6 py-8">
          <Ticket className="mb-5 size-7 text-primary" strokeWidth={1.5} aria-hidden="true" />
          <h2 className="text-xl font-semibold">지금은 티켓 신청 없이 이용해요</h2>
          <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
            소개가 도착하면 무료로 열어보고, 마음이 가는 분에게 만남을 요청할 수 있습니다. 유료로
            자동 전환되거나 결제되지 않습니다.
          </p>
          <Button className="mt-6 w-full" size="lg" onClick={() => void navigate({ to: "/intro" })}>
            소개 확인하기
          </Button>
        </div>
      </AppScreen>
    );

  const { bundles, order, owned } = current;
  const selected = bundles.find((bundle) => bundle.quantity === picked);
  const single = bundles.find((bundle) => bundle.quantity === 1)?.amount ?? 0;
  const checkoutReady = Boolean(selected && import.meta.env.VITE_TOSS_CLIENT_KEY);
  async function requestOrder() {
    if (submitting.current || !checkoutReady) return;
    submitting.current = true;
    setBusy(true);
    try {
      const created = await requestTicketOrder(picked, kind);
      if (activeKey.current !== key) return;
      if (created.payment_required) {
        void navigate({ to: "/checkout", search: { orderId: created.order_id } });
      } else {
        setData((previous) => (previous?.key === key ? { ...previous, order: created } : previous));
        toast.success("신청을 받았습니다.");
      }
    } catch (err) {
      if (activeKey.current !== key) return;
      if (err instanceof Error && err.message.includes("policy_reconsent_required")) {
        toast.message("새 티켓을 신청하려면 약관을 확인해 주세요.");
        void navigate({ to: "/consent" });
      } else {
        toast.error(err instanceof Error ? err.message : "신청에 실패했습니다.");
      }
    } finally {
      submitting.current = false;
      if (activeKey.current) setBusy(false);
    }
  }

  return (
    <AppScreen
      title="티켓 받기"
      back="/me"
      action={
        <Button variant="ghost" size="sm" asChild>
          <Link to="/orders">이용 내역</Link>
        </Button>
      }
      footer={
        !order && selected ? (
          <div>
            <div className="mb-3 flex items-baseline justify-between gap-3 text-sm">
              <span className="text-muted-foreground">
                {spec.label} {picked}장
              </span>
              <span className="text-lg font-semibold tabular-nums">{won(selected.amount)}</span>
            </div>
            <Button
              className="w-full"
              size="lg"
              disabled={busy || !checkoutReady}
              onClick={() => void requestOrder()}
            >
              {busy ? "처리하는 중…" : `${picked}장 결제하기`}
            </Button>
            <p className="mt-2 text-center text-xs text-muted-foreground">
              {checkoutReady
                ? "결제를 마치면 티켓이 바로 들어옵니다."
                : "결제창을 준비하고 있습니다."}
            </p>
          </div>
        ) : undefined
      }
    >
      <div className="mt-3 mb-5">
        <GuideNote assistant>
          필요한 티켓만 골라주세요. 금액을 확인한 뒤 결제창에서 직접 승인해요.
        </GuideNote>
      </div>
      {kindPicker}
      <p className="mt-5 text-sm leading-relaxed text-muted-foreground">{spec.guide}</p>
      <p className="mt-5 text-sm text-muted-foreground">
        보유 {spec.label}{" "}
        <span className="font-semibold text-foreground tabular-nums">{owned}장</span>
      </p>
      {bundles.length === 0 ? (
        <div
          className="app-elevated mt-3 rounded-surface bg-card p-5 text-sm text-muted-foreground"
          role="status"
        >
          지금은 신청할 수 있는 티켓 상품이 없어요. 잠시 후 다시 확인해 주세요.
        </div>
      ) : (
        <ul className="mt-3 space-y-3" aria-label="티켓 상품">
          {bundles.map(({ quantity, amount }) => {
            const on = picked === quantity;
            const saved = single * quantity - amount;
            return (
              <li key={quantity}>
                <button
                  type="button"
                  aria-pressed={on}
                  disabled={busy}
                  onClick={() => setPicked(quantity)}
                  className={cn(
                    "app-elevated pressable flex min-h-24 w-full items-center gap-3 rounded-surface px-4 py-4 text-left focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none disabled:opacity-60",
                    on
                      ? "bg-selection text-selection-foreground"
                      : "bg-card text-foreground hover:bg-muted/40",
                  )}
                >
                  <Ticket className="size-5 shrink-0" aria-hidden="true" />
                  <span className="min-w-0 flex-1">
                    <span className="block text-base font-semibold">
                      {spec.label} {quantity}장
                    </span>
                    <span
                      className={cn(
                        "mt-1 block text-xs",
                        on ? "text-selection-foreground" : "text-muted-foreground",
                      )}
                    >
                      장당 {won(Math.round(amount / quantity))}
                      {saved > 0 ? ` · ${won(saved)} 아낌` : ""}
                    </span>
                  </span>
                  <span className="shrink-0 text-sm font-semibold tabular-nums">{won(amount)}</span>
                  {on ? <Check className="size-4 shrink-0" aria-hidden="true" /> : null}
                </button>
              </li>
            );
          })}
        </ul>
      )}
      {order ? (
        <div className="app-elevated mt-6 rounded-surface bg-card px-5 py-6 text-center">
          <p className="text-sm font-semibold">
            {order.payment_required ? "결제를 기다리는 주문이 있습니다" : "신청을 받았습니다"}
          </p>
          <p className="mt-2 text-xs text-muted-foreground">
            {spec.label} {order.quantity}장 · {won(order.amount)}
          </p>
          {order.payment_required ? (
            <Button
              className="mt-4 w-full"
              onClick={() =>
                void navigate({ to: "/checkout", search: { orderId: order.order_id } })
              }
            >
              결제 이어하기
            </Button>
          ) : (
            <p className="mt-3 text-xs text-muted-foreground">
              확인이 끝나면 보유 티켓에 들어옵니다.
            </p>
          )}
        </div>
      ) : null}
      <ul className="mt-7 space-y-3 border-t border-border pt-5 text-xs">
        {spec.terms.map((term) => (
          <li key={term} className="flex gap-2.5 text-muted-foreground">
            <Check className="mt-0.5 size-4 shrink-0 text-primary" aria-hidden="true" />
            <span className="leading-relaxed">{term}</span>
          </li>
        ))}
      </ul>
      <p className="mt-4 text-xs leading-relaxed text-muted-foreground">
        미사용분은 법정 청약철회가 가능합니다. 묶음 상품의 일부 사용 후 남은 분량은 문의해 주세요.
      </p>
    </AppScreen>
  );
}
