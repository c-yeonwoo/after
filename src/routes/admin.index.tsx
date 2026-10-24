import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowUpRight, RefreshCw } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";

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
  notification_failure: "알림 결과 확인",
  meeting_followup: "약속 참석 확인 연락",
  response_review: "반복 미응답 검토",
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
  const active = useRef(false);
  const request = useRef(0);
  const loading = useRef<number | null>(null);

  const load = useCallback(async () => {
    if (loading.current !== null) return;
    const id = ++request.current;
    loading.current = id;
    setRefreshing(true);
    try {
      const result = await Promise.allSettled([
        fetchOpsOverview(),
        fetchOpsCases({ limit: 5 }),
        fetchOperationalHealth(),
        fetchMarketplaceHealth(),
      ]);
      if (!active.current || id !== request.current) return;
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
      setNow(Date.now());
    } finally {
      if (loading.current === id) loading.current = null;
      if (active.current && id === request.current) setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    active.current = true;
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
      active.current = false;
      request.current += 1;
      loading.current = null;
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
          <h1 className="text-2xl font-semibold tracking-tight">오늘, 먼저 볼 것</h1>
          <p className="mt-2 text-xs text-muted-foreground">
            {checkedAt
              ? `${timeLabel(checkedAt.toISOString())} 확인 · 1분마다 갱신`
              : "운영 현황을 확인하고 있어요"}
          </p>
        </div>
        <Button
          type="button"
          onClick={() => void load()}
          disabled={refreshing}
          variant="outline"
          size="sm"
        >
          <RefreshCw
            className={`size-3.5 motion-reduce:animate-none ${refreshing ? "animate-spin" : ""}`}
            aria-hidden="true"
          />
          새로고침
        </Button>
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

      <div
        aria-label="운영 작업 요약"
        className="grid grid-cols-2 gap-x-6 gap-y-5 border-y border-border py-5 xl:grid-cols-4"
      >
        <Summary label="미처리 작업" value={overview?.total} to="/admin/tasks" />
        <Summary
          label="기한 초과"
          value={overview?.overdue}
          tone="alert"
          to="/admin/tasks"
          focus="overdue"
        />
        <Summary label="오늘 기한" value={overview?.due_today} to="/admin/tasks" focus="today" />
        <Summary
          label="높은 우선순위"
          value={overview ? overview.critical + overview.high : null}
          to="/admin/tasks"
        />
      </div>

      <div className="grid items-start gap-5 xl:grid-cols-[minmax(0,1.7fr)_minmax(260px,1fr)]">
        <section className="app-elevated min-w-0 overflow-hidden rounded-surface bg-card">
          <div className="flex items-center justify-between border-b border-border px-5 py-4">
            <h2 className="text-sm font-semibold">지금 처리할 일</h2>
            <Link
              to="/admin/tasks"
              className="pressable inline-flex min-h-11 items-center rounded-control px-2 text-xs text-primary-strong focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
            >
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
                    className="pressable flex min-h-16 items-center gap-3 px-5 py-3.5 transition-colors hover:bg-muted/40 focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring focus-visible:outline-none"
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
          <section className="app-elevated rounded-surface bg-card p-5">
            <h2 className="text-sm font-semibold">운영 상태</h2>
            {health ? (
              <dl className="mt-4 space-y-3 text-sm">
                <Metric label="알림 최종 실패" value={health.notifications.failed} />
                <Metric label="알림 결과 미상" value={health.notifications.unknown} />
                <Metric label="일정 확정 지연" value={health.scheduling.stale_confirmation} />
              </dl>
            ) : (
              <p className="mt-4 text-sm text-muted-foreground">
                {errors.includes("운영 상태")
                  ? "상태를 확인할 수 없습니다."
                  : "상태를 불러오는 중입니다."}
              </p>
            )}
            <Link
              to="/admin/system"
              className="pressable mt-3 inline-flex min-h-11 items-center rounded-control px-1 text-xs text-primary-strong focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
            >
              시스템 상태 보기
            </Link>
          </section>
          <section className="app-elevated rounded-surface bg-card p-5">
            <h2 className="text-sm font-semibold">소개 가능한 회원</h2>
            {market ? (
              <dl className="mt-4 space-y-3 text-sm">
                <Metric label="여성" value={market.pool.eligible_female} />
                <Metric label="남성" value={market.pool.eligible_male} />
              </dl>
            ) : (
              <p className="mt-4 text-sm text-muted-foreground">
                {errors.includes("수급")
                  ? "수급을 확인할 수 없습니다."
                  : "수급을 불러오는 중입니다."}
              </p>
            )}
            <Link
              to="/admin/insights"
              className="pressable mt-3 inline-flex min-h-11 items-center rounded-control px-1 text-xs text-primary-strong focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
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
  focus,
}: {
  label: string;
  value: number | null | undefined;
  tone?: "alert";
  to: "/admin/tasks";
  focus?: "overdue" | "today";
}) {
  return (
    <Link
      to={to}
      search={{ focus }}
      className="pressable min-w-0 rounded-control px-1 py-1 transition-colors hover:bg-surface-subtle focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
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
