import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowUpRight, RefreshCw } from "lucide-react";
import { useCallback, useEffect, useState } from "react";

import {
  fetchMarketplaceHealth,
  fetchOperationalHealth,
  fetchOpsCases,
  fetchOpsOverview,
  type AdminMarketplaceHealth,
  type AdminOperationalHealth,
  type OpsCaseItem,
  type OpsOverview,
} from "@/lib/admin";

export const Route = createFileRoute("/admin/")({ component: OperationsHome });

const TYPE_LABEL: Record<string, string> = {
  support: "고객 문의",
  photo_review: "사진 검수",
  content_report: "안전 신고",
  no_show_report: "노쇼 신고",
  payment_unknown: "결제 확인",
};

function timeLabel(iso: string) {
  return new Intl.DateTimeFormat("ko-KR", {
    month: "numeric",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(iso));
}

function OperationsHome() {
  const [overview, setOverview] = useState<OpsOverview | null>(null);
  const [cases, setCases] = useState<OpsCaseItem[] | null>(null);
  const [health, setHealth] = useState<AdminOperationalHealth | null>(null);
  const [market, setMarket] = useState<AdminMarketplaceHealth | null>(null);
  const [errors, setErrors] = useState<string[]>([]);
  const [checkedAt, setCheckedAt] = useState<Date | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [now, setNow] = useState(Date.now());

  const load = useCallback(async () => {
    setRefreshing(true);
    try {
      const result = await Promise.allSettled([
        fetchOpsOverview(),
        fetchOpsCases({ limit: 5 }),
        fetchOperationalHealth(),
        fetchMarketplaceHealth(),
      ]);
      const failed: string[] = [];
      if (result[0].status === "fulfilled") setOverview(result[0].value);
      else failed.push("작업 현황");
      if (result[1].status === "fulfilled") setCases(result[1].value.items);
      else failed.push("작업 목록");
      if (result[2].status === "fulfilled") setHealth(result[2].value);
      else failed.push("운영 상태");
      if (result[3].status === "fulfilled") setMarket(result[3].value);
      else failed.push("수급");
      setErrors(failed);
      if (failed.length < result.length) setCheckedAt(new Date());
    } finally {
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    void load();
    const timer = window.setInterval(() => {
      setNow(Date.now());
      if (document.visibilityState === "visible") void load();
    }, 60_000);
    const onVisible = () => {
      if (document.visibilityState === "visible") void load();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [load]);

  const age = checkedAt ? Math.floor((now - checkedAt.getTime()) / 60_000) : null;
  const stale = age !== null && age >= 2;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-xs font-medium text-muted-foreground">운영 홈</p>
          <h1 className="mt-1 text-2xl font-semibold tracking-tight">오늘, 먼저 볼 것</h1>
        </div>
        <button
          type="button"
          onClick={() => void load()}
          disabled={refreshing}
          className="inline-flex items-center gap-2 rounded-md border border-border px-3 py-2 text-xs text-muted-foreground transition-colors hover:bg-muted disabled:opacity-50"
        >
          <RefreshCw
            className={`size-3.5 ${refreshing ? "animate-spin" : ""}`}
            aria-hidden="true"
          />
          {checkedAt ? `${timeLabel(checkedAt.toISOString())} 확인` : "새로고침"}
        </button>
      </div>

      {errors.length === 4 ? (
        <p className="rounded-surface border border-destructive/30 px-4 py-3 text-sm" role="alert">
          운영 현황을 확인할 수 없습니다. 마지막 성공 자료가 있다면 아래에 표시됩니다.
        </p>
      ) : errors.length > 0 ? (
        <p className="rounded-surface border border-destructive/30 px-4 py-3 text-sm" role="alert">
          {errors.join("·")}을 확인하지 못했습니다. 보이는 값은 마지막 성공 시점 기준입니다.
        </p>
      ) : null}
      {stale ? (
        <p className="text-xs text-muted-foreground" role="status">
          마지막 확인 {age}분 전 · 새로고침이 필요합니다.
        </p>
      ) : null}

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Summary label="미처리 작업" value={overview?.total} to="/admin/tasks" />
        <Summary label="기한 초과" value={overview?.overdue} tone="alert" to="/admin/tasks" />
        <Summary label="오늘 기한" value={overview?.due_today} to="/admin/tasks" />
        <Summary
          label="높은 우선순위"
          value={overview ? overview.critical + overview.high : null}
          to="/admin/tasks"
        />
      </div>

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1.7fr)_minmax(260px,1fr)]">
        <section className="min-w-0 rounded-surface border border-border bg-card">
          <div className="flex items-center justify-between border-b border-border px-5 py-4">
            <h2 className="text-sm font-semibold">지금 처리할 일</h2>
            <Link to="/admin/tasks" className="text-xs text-primary-strong hover:underline">
              전체 작업함
            </Link>
          </div>
          {cases === null && errors.includes("작업 목록") ? (
            <p className="px-5 py-8 text-sm text-muted-foreground">
              작업 목록을 확인할 수 없습니다.
            </p>
          ) : cases === null ? (
            <p className="px-5 py-8 text-sm text-muted-foreground">작업을 불러오는 중입니다.</p>
          ) : cases.length === 0 && !errors.includes("작업 목록") ? (
            <p className="px-5 py-8 text-sm text-muted-foreground">지금 처리할 작업이 없습니다.</p>
          ) : (
            <ul className="divide-y divide-border">
              {cases.map((item) => (
                <li key={item.id}>
                  <Link
                    to="/admin/tasks"
                    search={{ caseId: item.id }}
                    className="flex items-center gap-3 px-5 py-3.5 transition-colors hover:bg-muted/40"
                  >
                    <span
                      className={`size-2 shrink-0 rounded-full ${item.priority === "critical" ? "bg-destructive" : item.priority === "high" ? "bg-primary-strong" : "bg-border"}`}
                    />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium">
                        {TYPE_LABEL[item.case_type] ?? item.case_type}
                        <span className="ml-2 font-normal text-muted-foreground">
                          {item.subject_name ?? "회원 확인 필요"}
                        </span>
                      </p>
                      <p className="mt-0.5 text-xs text-muted-foreground">
                        기한 {timeLabel(item.due_at)} ·{" "}
                        {item.status === "waiting"
                          ? "응답 대기"
                          : item.status === "snoozed"
                            ? "재확인 예정"
                            : "확인 필요"}
                      </p>
                    </div>
                    <ArrowUpRight
                      className="size-4 shrink-0 text-muted-foreground"
                      aria-hidden="true"
                    />
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>

        <aside className="space-y-5">
          <section className="rounded-surface border border-border bg-card p-5">
            <h2 className="text-sm font-semibold">운영 상태</h2>
            {health ? (
              <dl className="mt-4 space-y-3 text-sm">
                <Metric label="알림 최종 실패" value={health.notifications.failed} />
                <Metric label="일정 확정 지연" value={health.scheduling.stale_confirmation} />
              </dl>
            ) : (
              <p className="mt-4 text-sm text-muted-foreground">상태를 확인할 수 없습니다.</p>
            )}
            <Link
              to="/admin/system"
              className="mt-4 inline-block text-xs text-primary-strong hover:underline"
            >
              시스템 상태 보기
            </Link>
          </section>
          <section className="rounded-surface border border-border bg-card p-5">
            <h2 className="text-sm font-semibold">소개 가능한 회원</h2>
            {market ? (
              <dl className="mt-4 space-y-3 text-sm">
                <Metric label="여성" value={market.pool.eligible_female} />
                <Metric label="남성" value={market.pool.eligible_male} />
              </dl>
            ) : (
              <p className="mt-4 text-sm text-muted-foreground">수급을 확인할 수 없습니다.</p>
            )}
            <Link
              to="/admin/insights"
              className="mt-4 inline-block text-xs text-primary-strong hover:underline"
            >
              수급·성과 자세히
            </Link>
          </section>
        </aside>
      </div>
    </div>
  );
}

function Summary({
  label,
  value,
  tone,
  to,
}: {
  label: string;
  value: number | null | undefined;
  tone?: "alert";
  to: "/admin/tasks";
}) {
  return (
    <Link
      to={to}
      className="rounded-surface border border-border bg-card px-5 py-4 transition-colors hover:border-foreground/25"
    >
      <p className="text-xs text-muted-foreground">{label}</p>
      <p
        className={`mt-2 text-2xl font-semibold tabular-nums ${tone === "alert" && value ? "text-destructive" : ""}`}
      >
        {value ?? "—"}
      </p>
    </Link>
  );
}

function Metric({ label, value }: { label: string; value: number }) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="font-medium tabular-nums">{value}</dd>
    </div>
  );
}
