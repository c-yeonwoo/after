import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useCallback, useEffect, useState } from "react";

import { NoteAction } from "@/components/admin/NoteAction";
import { Tag } from "@/components/admin/ui";
import { paymentsEnabled } from "@/lib/api";
import {
  fetchOrders,
  fulfillOrder,
  setPayments,
  type AdminOrder,
  type OrderFilter,
} from "@/lib/admin";

const STATES: OrderFilter[] = ["pending", "confirmed", "failed"];

export const Route = createFileRoute("/admin/orders")({
  validateSearch: (s: Record<string, unknown>): { state?: OrderFilter } => ({
    state: STATES.includes(s.state as OrderFilter) ? (s.state as OrderFilter) : undefined,
  }),
  component: OrdersTab,
});

const FILTERS: { v: OrderFilter; label: string }[] = [
  { v: "pending", label: "발급 대기" },
  { v: "confirmed", label: "발급됨" },
  { v: "failed", label: "실패" },
];

const KIND_LABEL: Record<string, string> = { intro: "소개", meeting: "만남" };

function won(n: number) {
  return `${n.toLocaleString("ko-KR")}원`;
}

function when(iso: string) {
  const d = new Date(iso);
  return `${d.getMonth() + 1}/${d.getDate()} ${String(d.getHours()).padStart(2, "0")}:${String(
    d.getMinutes(),
  ).padStart(2, "0")}`;
}

/**
 * 주문 — 스위치와 그 결과를 **한 화면에** 둔다.
 *
 * 결제 활성화를 별도 설정 탭으로 빼면, 주문이 왜 쌓이는지(또는 왜 자동으로
 * 처리되는지)를 보려고 두 화면을 오가야 한다. 지금 무엇이 티켓을 발급하고 있고
 * 그래서 여기 무엇이 쌓였는지는 같은 질문이다.
 *
 * 베타(결제 OFF)에서 이 목록은 **사람이 손대야 하는 일**이고, 결제를 켜면 토스가
 * 처리하므로 목록은 영수증이 된다 — 그래서 스위치 상태에 따라 표의 성격을 말로
 * 바꿔 준다.
 */
function OrdersTab() {
  const { state } = Route.useSearch();
  const navigate = useNavigate({ from: Route.fullPath });
  const [rows, setRows] = useState<AdminOrder[] | null>(null);
  const [paid, setPaid] = useState<boolean | null>(null);

  const load = useCallback(async () => {
    const [list, on] = await Promise.all([fetchOrders(state ?? "pending"), paymentsEnabled()]);
    setRows(list);
    setPaid(on);
  }, [state]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (state === undefined) void navigate({ search: { state: "pending" }, replace: true });
  }, [state, navigate]);

  const current = state ?? "pending";

  return (
    <>
      {/* ── 결제 스위치 ─────────────────────────── */}
      <section className="rounded-surface border border-border bg-card p-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-sm font-semibold">
              티켓 발급 — {paid === null ? "확인 중…" : paid ? "결제(토스)" : "운영자 승인 (베타)"}
            </p>
            <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
              {paid === null
                ? ""
                : paid
                  ? "회원이 결제를 마치면 티켓이 자동으로 나갑니다. 이 화면에서는 무료 발급이 막힙니다."
                  : "결제를 받지 않습니다. 아래 주문을 승인하면 0원 티켓이 나갑니다."}
            </p>
          </div>
          {paid !== null ? (
            <Tag tone={paid ? "muted" : "alert"}>{paid ? "결제 중" : "베타"}</Tag>
          ) : null}
        </div>

        {paid !== null ? (
          <div className="mt-3 border-t border-border pt-3">
            <NoteAction
              placeholder="전환 사유 (필수 — 기록에 남습니다)"
              actions={[
                paid
                  ? {
                      label: "결제 끄기 (베타로)",
                      done: "베타 모드로 바꿨습니다.",
                      variant: "outline",
                      run: (note) => setPayments(false, note),
                    }
                  : {
                      label: "결제 켜기",
                      done: "결제를 켰습니다.",
                      run: (note) => setPayments(true, note),
                    },
              ]}
              onDone={load}
            />
          </div>
        ) : null}
      </section>

      {/* ── 주문 목록 ─────────────────────────── */}
      <div className="mt-5 flex flex-wrap gap-1">
        {FILTERS.map((f) => (
          <button
            key={f.v}
            onClick={() => void navigate({ search: { state: f.v }, replace: true })}
            className={`rounded-full px-3 py-1 text-sm transition-colors ${
              current === f.v
                ? "bg-primary text-primary-foreground"
                : "bg-muted text-muted-foreground hover:text-foreground"
            }`}
          >
            {f.label}
          </button>
        ))}
      </div>

      {rows === null ? (
        <p className="mt-6 text-sm text-muted-foreground">불러오는 중입니다…</p>
      ) : rows.length === 0 ? (
        <p className="mt-6 text-sm text-muted-foreground">
          {current === "pending" ? "발급을 기다리는 주문이 없습니다." : "해당하는 주문이 없습니다."}
        </p>
      ) : (
        <ul className="mt-3 divide-y divide-border rounded-surface border border-border bg-card">
          {rows.map((o) => (
            <OrderRow key={o.order_id} o={o} paid={paid === true} onDone={load} />
          ))}
        </ul>
      )}
    </>
  );
}

function OrderRow({ o, paid, onDone }: { o: AdminOrder; paid: boolean; onDone: () => void }) {
  const [open, setOpen] = useState(false);
  const pending = o.state === "pending";

  return (
    <li className="px-4 py-3">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm">
        <span className="font-semibold">{o.user_name ?? "이름 없음"}</span>
        <Tag tone="muted">{o.user_gender === "female" ? "여성" : "남성"}</Tag>
        <span className="text-muted-foreground">
          {KIND_LABEL[o.kind] ?? o.kind} 티켓 {o.quantity}장 · {won(o.amount)}
        </span>
        <span className="text-xs text-muted-foreground">{when(o.created_at)}</span>
        {/* 돈을 낸 주문인지 운영자가 낸 주문인지 — 목록에서 섞이면 안 된다. */}
        {o.state === "confirmed" ? (
          <Tag tone={o.by_admin ? "alert" : "muted"}>{o.by_admin ? "무료 발급" : "결제"}</Tag>
        ) : null}
        {o.state === "failed" ? <Tag tone="alert">실패</Tag> : null}

        {pending ? (
          <button
            onClick={() => setOpen((v) => !v)}
            className="ml-auto rounded-full border border-border px-3 py-1 text-xs transition-colors hover:bg-muted"
          >
            {open ? "닫기" : "발급"}
          </button>
        ) : null}
      </div>

      {o.fulfill_note ? (
        <p className="mt-1.5 text-xs text-muted-foreground">승인 사유 — {o.fulfill_note}</p>
      ) : null}

      {open && pending ? (
        <div className="mt-3 border-t border-border pt-3">
          {paid ? (
            /*
              결제가 켜져 있으면 서버가 42501 로 막는다. 눌러 보고 실패를 겪게 하는
              대신 왜 막히는지를 먼저 적는다 — 운영자가 할 일은 여기가 아니라
              결제 쪽을 확인하는 것이다.
            */
            <p className="text-sm text-muted-foreground">
              결제가 켜져 있어 무료 발급은 할 수 없습니다. 결제가 끝나면 티켓이 자동으로 나갑니다.
            </p>
          ) : (
            <NoteAction
              placeholder="발급 사유 (필수 — 기록에 남습니다)"
              actions={[
                {
                  label: `${o.quantity}장 무료 발급`,
                  done: "발급했습니다.",
                  run: (note) => fulfillOrder(o.order_id, note),
                },
              ]}
              onDone={onDone}
            />
          )}
        </div>
      ) : null}
    </li>
  );
}
