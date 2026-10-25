import { createFileRoute, Link } from "@tanstack/react-router";
import { CheckCircle2, ChevronRight, RefreshCw } from "lucide-react";
import { useCallback, useEffect, useState } from "react";

import { CuratorTable } from "@/components/admin/CuratorTable";
import {
  fetchDashboard,
  fetchMarketplaceHealth,
  fetchMarketplaceHealthV2,
  fetchOperationalHealth,
  fetchOpenSupportCount,
  type AdminDashboard,
  type AdminMarketplaceHealth,
  type AdminOperationalHealth,
  type MarketplaceHealthV2,
} from "@/lib/admin";

export const Route = createFileRoute("/admin/insights")({ component: DashboardTab });

/**
 * 지표 배치가 의도적이다 — 규모(가입·활성)보다 **적체와 품질**을 위에 둔다.
 * 운영자가 매일 확인해야 하는 것은 "밀리고 있는가"이지 "몇 명인가"가 아니다.
 *
 * 숫자를 누르면 그 모집단의 목록으로 넘어간다. 숫자만 있고 갈 곳이 없으면
 * 운영자는 탭을 옮겨 필터를 다시 잡아야 하는데, 그 사이에 방금 본 숫자가
 * 무엇이었는지 잃는다. 목적지가 아직 없는 지표(큐레이션·소개)는 링크를 걸지
 * 않고, 눌러도 반응이 없는 것처럼 보이지 않게 시각도 다르게 둔다.
 */
function DashboardTab() {
  const [d, setD] = useState<AdminDashboard | null>(null);
  const [health, setHealth] = useState<AdminOperationalHealth | null>(null);
  const [market, setMarket] = useState<AdminMarketplaceHealth | null>(null);
  const [updatedAt, setUpdatedAt] = useState<Date | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [openSupport, setOpenSupport] = useState<number | null>(null);
  const [errors, setErrors] = useState<string[]>([]);
  const [checkedAt, setCheckedAt] = useState<Date | null>(null);
  const [now, setNow] = useState(Date.now());

  const load = useCallback(async () => {
    setRefreshing(true);
    try {
      const [dashboard, ops, marketplace, supportCount] = await Promise.allSettled([
        fetchDashboard(),
        fetchOperationalHealth(),
        fetchMarketplaceHealth(),
        fetchOpenSupportCount(),
      ]);
      const failed: string[] = [];
      if (dashboard.status === "fulfilled") setD(dashboard.value);
      else failed.push("운영 현황");
      if (ops.status === "fulfilled") setHealth(ops.value);
      else failed.push("처리 지표");
      if (marketplace.status === "fulfilled") setMarket(marketplace.value);
      else failed.push("수급 지표");
      if (supportCount.status === "fulfilled") setOpenSupport(supportCount.value);
      else failed.push("고객 문의");
      setErrors(failed);
      setCheckedAt(new Date());
      if (failed.length === 0) setUpdatedAt(new Date());
    } finally {
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    void load();
    const refresh = window.setInterval(() => {
      setNow(Date.now());
      if (document.visibilityState === "visible") void load();
    }, 60_000);
    const onVisible = () => {
      if (document.visibilityState === "visible") void load();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      window.clearInterval(refresh);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [load]);

  if (!d || !health || !market || openSupport === null) {
    if (!checkedAt) return <p className="text-sm text-muted-foreground">불러오는 중…</p>;
    return (
      <section className="space-y-4" aria-live="polite">
        <h1 className="text-2xl font-semibold">수급·성과</h1>
        <div role="alert" className="rounded-surface border border-destructive/30 p-4 text-sm">
          {errors.join("·")}을 확인할 수 없습니다. 일부 현황만 표시합니다.
          <button className="ml-3 underline" onClick={() => void load()} disabled={refreshing}>
            다시 확인
          </button>
        </div>
        {d ? (
          <p className="text-sm">
            미처리 신고 {d.backlog.pending_reports}건 · 사진 검수 {d.backlog.pending_photos}건
          </p>
        ) : null}
        {health ? (
          <p className="text-sm">
            실패 알림 {health.notifications.failed}건 · 일정 지연{" "}
            {health.scheduling.stale_confirmation}건
          </p>
        ) : null}
        {openSupport !== null ? <p className="text-sm">미답변 고객 문의 {openSupport}건</p> : null}
        {market ? (
          <p className="text-sm">
            소개 가능 회원 여성 {market.pool.eligible_female}명 · 남성 {market.pool.eligible_male}명
          </p>
        ) : null}
      </section>
    );
  }

  const staleMinutes = updatedAt ? Math.floor((now - updatedAt.getTime()) / 60_000) : null;

  const passRate =
    d.quality.intros_total > 0
      ? Math.round((d.quality.intros_passed / d.quality.intros_total) * 100)
      : null;

  const work = [
    {
      priority: "P0",
      label: "노쇼 검토 SLA 초과",
      count: health.no_show.overdue,
      to: "/admin/reports",
      search: { kind: "no_show" as const, state: "pending" as const },
    },
    {
      priority: "P0",
      label: "발송 최종 실패 알림",
      count: health.notifications.failed,
      to: "/admin/system",
    },
    {
      priority: "P0",
      label: "미처리 콘텐츠 신고",
      count: d.backlog.pending_reports,
      to: "/admin/reports",
      search: { state: "pending" as const },
    },
    {
      priority: "P1",
      label: "미답변 고객 문의",
      count: openSupport,
      to: "/admin/support",
    },
    {
      priority: "P1",
      label: "노쇼 검토 대기",
      count: Math.max(0, d.backlog.pending_no_shows - health.no_show.overdue),
      to: "/admin/reports",
      search: { kind: "no_show" as const, state: "pending" as const },
    },
    {
      priority: "P1",
      label: "일정 확정 48시간 지연",
      count: health.scheduling.stale_confirmation,
      to: "/admin/meetings",
      search: { state: "active" as const },
    },
    {
      priority: "P1",
      label: "사진 검수 대기",
      count: d.backlog.pending_photos,
      to: "/admin/photos",
      search: { state: "pending" as const },
    },
    {
      priority: "P1",
      label: "AI 실행 실패 · 24시간",
      count: health.ai.failures_24h,
      to: "/admin/system",
    },
    {
      priority: "P1",
      label: "발급 대기 주문",
      count: d.backlog.pending_orders,
      to: "/admin/orders",
      search: { state: "pending" as const },
    },
    {
      priority: "P1",
      label: "큐레이션 가능한 호감",
      count: d.backlog.unmatched_likes,
      to: "/admin/curation",
    },
    {
      priority: "P1",
      label: "자격 대기 호감",
      count: d.backlog.blocked_likes,
      to: "/admin/curation",
    },
    {
      priority: "P1",
      label: "소개 공급 없는 활성 남성",
      count: d.backlog.starved_males,
      to: "/admin/curation",
    },
  ].filter((item) => item.count > 0);

  return (
    <>
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-sm font-medium text-muted-foreground">수급·성과</p>
          <h1 className="mt-1 text-2xl font-semibold">운영 병목과 흐름</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            처리할 일을 먼저 보고, 아래에서 수급과 결과를 확인합니다.
          </p>
        </div>
        <button
          onClick={() => void load()}
          disabled={refreshing}
          className="flex items-center gap-2 rounded-md border border-border px-3 py-2 text-sm text-muted-foreground transition-colors hover:bg-muted hover:text-foreground disabled:opacity-50"
        >
          <RefreshCw className={`size-4 ${refreshing ? "animate-spin" : ""}`} aria-hidden="true" />
          {updatedAt
            ? `${updatedAt.toLocaleTimeString("ko-KR", { hour: "2-digit", minute: "2-digit" })} 갱신`
            : "새로고침"}
        </button>
      </div>

      {errors.length > 0 ? (
        <p
          role="alert"
          className="mt-4 rounded-surface border border-destructive/30 px-4 py-3 text-sm"
        >
          {errors.join("·")} 조회에 실패했습니다. 표시된 값은 마지막 성공 시점 기준입니다.
        </p>
      ) : null}
      {staleMinutes !== null && staleMinutes >= 2 ? (
        <p className="mt-3 text-xs text-muted-foreground" role="status">
          마지막 전체 확인 {staleMinutes}분 전{staleMinutes >= 5 ? " · 최신 상태 확인 필요" : ""}
        </p>
      ) : null}

      {work.length === 0 ? (
        <div className="mt-5 flex items-center gap-3 rounded-surface border border-border bg-card px-5 py-5">
          <CheckCircle2 className="size-5 text-emerald-700" aria-hidden="true" />
          <div>
            <p className="text-sm font-semibold">지금 바로 처리할 일이 없습니다.</p>
            <p className="mt-0.5 text-xs text-muted-foreground">
              자동화와 수급 지표만 가볍게 확인하면 됩니다.
            </p>
          </div>
        </div>
      ) : (
        <ol className="mt-5 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {work.map((item) => (
            <li key={item.label}>
              <Link
                to={item.to}
                search={item.search}
                className="flex h-full items-center gap-4 rounded-surface border border-border bg-card px-4 py-4 transition-colors hover:border-foreground/25 hover:bg-muted/40"
              >
                <span
                  className={`rounded-full px-2 py-1 text-2xs font-bold ${
                    item.priority === "P0"
                      ? "bg-destructive/10 text-destructive"
                      : "bg-selection text-primary-strong"
                  }`}
                >
                  {item.priority}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold">{item.label}</p>
                  <p className="mt-0.5 text-xs text-muted-foreground">{item.count}건 처리 대기</p>
                </div>
                <ChevronRight className="size-4 text-muted-foreground" aria-hidden="true" />
              </Link>
            </li>
          ))}
        </ol>
      )}

      <MarketplaceV2Panel />

      <details open className="mt-8 border-t border-border pt-5">
        <summary className="cursor-pointer text-sm font-semibold marker:text-muted-foreground">
          세부 운영 지표 보기
        </summary>
        <Group title="오늘 확인" hint="사람이 놓치면 사용자 경험이 멈추는 것">
          <Stat
            label="노쇼 검토 SLA 초과"
            value={health.no_show.overdue}
            alert={health.no_show.overdue > 0}
            to="/admin/reports"
            search={{ kind: "no_show" as const, state: "pending" as const }}
          />
          <Stat
            label="일정 확정 48시간 지연"
            value={health.scheduling.stale_confirmation}
            alert={health.scheduling.stale_confirmation > 0}
            to="/admin/meetings"
            search={{ state: "active" as const }}
          />
          <Stat
            label="알림 최종 실패"
            value={health.notifications.failed}
            alert={health.notifications.failed > 0}
          />
          <Stat
            label="AI 실패 · 24시간"
            value={health.ai.failures_24h}
            alert={health.ai.failures_24h > 0}
          />
          <Stat
            label="AI p95 응답"
            value={
              health.ai.p95_latency_ms === null
                ? null
                : Math.round(health.ai.p95_latency_ms / 100) / 10
            }
            unit="초"
            alert={(health.ai.p95_latency_ms ?? 0) > 12_000}
          />
        </Group>

        <Group title="적체" hint="운영자가 밀리고 있는가">
          <Stat
            label="미답변 고객 문의"
            value={openSupport}
            alert={openSupport > 0}
            to="/admin/support"
          />
          <Stat
            label="미처리 신고"
            value={d.backlog.pending_reports}
            alert={d.backlog.pending_reports > 0}
            to="/admin/reports"
            search={{ state: "pending" as const }}
          />
          {/*
          검수 대기는 "지금 아무에게도 보이지 않는 회원 수" 다. 검수 전 후보 풀에서
          빼기로 했으므로(s18) 이 숫자가 쌓이면 그만큼 매칭이 멈춘다.
        */}
          <Stat
            label="사진 검수 대기"
            value={d.backlog.pending_photos}
            alert={d.backlog.pending_photos > 0}
            to="/admin/photos"
            search={{ state: "pending" as const }}
          />
          {/* s21 에서 판정 화면이 생겼다 — 그전까지는 셀 뿐 갈 곳이 없는 숫자였다. */}
          <Stat
            label="미처리 노쇼"
            value={d.backlog.pending_no_shows}
            alert={d.backlog.pending_no_shows > 0}
            to="/admin/reports"
            search={{ kind: "no_show" as const, state: "pending" as const }}
          />
          {/*
          베타(결제 OFF)에서 주문은 사람이 승인해야 티켓이 된다(s27). 여기 없으면
          운영자가 상점 쪽을 따로 들여다봐야 하고, 그러면 놓친다. 결제를 켠 뒤에는
          토스가 처리하므로 이 숫자는 자연히 0 에 머문다.
        */}
          <Stat
            label="발급 대기 주문"
            value={d.backlog.pending_orders}
            alert={d.backlog.pending_orders > 0}
            to="/admin/orders"
            search={{ state: "pending" as const }}
          />
          <Stat label="큐레이션 가능 호감" value={d.backlog.unmatched_likes} />
          <Stat label="자격 대기 호감" value={d.backlog.blocked_likes} />
          <Stat
            label="가장 오래 기다린 호감"
            value={d.backlog.oldest_like_hours}
            unit="시간"
            alert={(d.backlog.oldest_like_hours ?? 0) > 72}
          />
        </Group>

        <Group title="수급" hint="한쪽이 오래 기다리기 전에 모집을 조절합니다">
          <Stat label="활성 여성" value={market.pool.eligible_female} />
          <Stat label="활성 남성" value={market.pool.eligible_male} />
          <Stat
            label="아직 노출 0회 남성"
            value={market.pool.males_never_shown}
            alert={market.pool.males_never_shown > 0}
          />
          <Stat
            label="아직 호감 0건 남성"
            value={market.pool.males_without_like}
            alert={market.pool.males_without_like > 0}
          />
        </Group>

        <Group title="품질" hint="큐레이션이 좋은가">
          <Stat label="소개 넘김 비율" value={passRate} unit="%" alert={(passRate ?? 0) > 60} />
          <Stat label="소개 전체" value={d.quality.intros_total} />
          <Stat label="티켓 사용" value={d.quality.intros_used} />
          <Stat
            label="완료된 만남"
            value={d.flow.completed}
            to="/admin/meetings"
            search={{ state: "completed" as const }}
          />
        </Group>

        <Group title="규모" hint="회원 수 — 운영자는 빠진다">
          <Stat
            label="여성"
            value={d.members.female}
            to="/admin/members"
            search={{ gender: "female" as const }}
          />
          <Stat
            label="남성"
            value={d.members.male}
            to="/admin/members"
            search={{ gender: "male" as const }}
          />
          <Stat
            label="잠시 쉬는 중"
            value={d.members.paused}
            to="/admin/members"
            search={{ paused: true }}
          />
          <Stat
            label="정지"
            value={d.members.banned}
            alert={d.members.banned > 0}
            to="/admin/members"
            search={{ state: "banned" as const }}
          />
        </Group>

        <Group title="진행" hint="지금 돌고 있는 것">
          <Stat label="열린 소개" value={d.flow.open_intros} />
          <Stat
            label="진행 중 만남"
            value={d.flow.active_meetings}
            to="/admin/meetings"
            search={{ state: "active" as const }}
          />
          <Stat
            label="확정"
            value={d.flow.confirmed}
            to="/admin/meetings"
            search={{ state: "confirmed" as const }}
          />
        </Group>

        {/*
        큐레이터 지표는 대시보드에 둔다. 이 화면이 이미 "적체와 품질" 을 답하는
        자리이고, 이건 그 품질의 내역이다 — 탭을 하나 더 늘리면 어디를 봐야
        하는지가 흐려진다.
      */}
        <CuratorTable />
      </details>
    </>
  );
}

function MarketplaceV2Panel() {
  const [hub, setHub] = useState<string | null>(null);
  const [days, setDays] = useState<7 | 14 | 28>(14);
  const [data, setData] = useState<MarketplaceHealthV2 | null>(null);
  const [error, setError] = useState(false);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    setBusy(true);
    try {
      setData(await fetchMarketplaceHealthV2(hub, days));
      setError(false);
    } catch {
      setError(true);
    } finally {
      setBusy(false);
    }
  }, [hub, days]);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <section className="mt-9 border-t border-border pt-6" aria-labelledby="market-v2-title">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h2 id="market-v2-title" className="text-lg font-semibold">
            실제 수급과 대기
          </h2>
          <p className="mt-1 text-xs text-muted-foreground">
            지금 기다리는 사람과 이미 완료한 표본을 나눠 봅니다.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <label className="text-xs text-muted-foreground">
            권역
            <select
              value={hub ?? ""}
              onChange={(e) => setHub(e.target.value || null)}
              className="mt-1 block min-h-10 rounded-control border border-border bg-card px-2 text-sm text-foreground"
            >
              <option value="">전체</option>
              <option value="gangnam">강남</option>
              <option value="pangyo">판교</option>
              <option value="jongno">종로</option>
              <option value="yeouido">여의도</option>
            </select>
          </label>
          <label className="text-xs text-muted-foreground">
            관측 기간
            <select
              value={days}
              onChange={(e) => setDays(Number(e.target.value) as 7 | 14 | 28)}
              className="mt-1 block min-h-10 rounded-control border border-border bg-card px-2 text-sm text-foreground"
            >
              <option value={7}>7일</option>
              <option value={14}>14일</option>
              <option value={28}>28일</option>
            </select>
          </label>
        </div>
      </div>
      {error ? (
        <p role="alert" className="mt-4 rounded-surface border border-destructive/30 p-4 text-sm">
          새 지표를 확인하지 못했습니다. 아래 값은 마지막 조회 기준일 수 있습니다.
        </p>
      ) : null}
      {!data && !error ? <p className="mt-4 text-sm text-muted-foreground">불러오는 중…</p> : null}
      {data ? (
        <>
          <p className="mt-4 text-xs text-muted-foreground">
            기준 {formatMetricTime(data.as_of)}
            {busy ? " · 갱신 중" : ""} · 가입 시각을 소개 자격 시각으로 대체하지 않습니다.
          </p>
          <Group title="현재" hint="완료 표본과 별개인 지금의 상태">
            <Stat label="소개 가능 여성" value={data.ready_now.female} />
            <Stat label="소개 가능 남성" value={data.ready_now.male} />
            <Stat label="답변 대기 요청" value={data.pending_request.count} />
            <Stat
              label="가장 오래된 답변 대기"
              value={data.pending_request.oldest_hours}
              unit="시간"
            />
          </Group>
          <Group title="응답 속도" hint="현재 대기와 완료 건을 섞지 않습니다">
            <Stat label="현재 대기 · 중앙값" value={data.pending_request.p50_hours} unit="시간" />
            <Stat label="현재 대기 · p90" value={data.pending_request.p90_hours} unit="시간" />
            <Stat
              label={`완료 표본 ${data.completed_response.sample}건 · 중앙값`}
              value={data.completed_response.p50_hours}
              unit="시간"
            />
            <Stat label="완료 표본 · p90" value={data.completed_response.p90_hours} unit="시간" />
          </Group>
          <Group title="7일 전환" hint="관측 7일을 채운 기수만 계산">
            <Stat
              label={`남성 첫 소개 도달 ${data.first_intro_7d.numerator}/${data.first_intro_7d.denominator}`}
              value={ratePercent(data.first_intro_7d.rate)}
              unit="%"
            />
            <Stat
              label={`소개 열람 ${data.intro_open_7d.numerator}/${data.intro_open_7d.denominator}`}
              value={ratePercent(data.intro_open_7d.rate)}
              unit="%"
            />
            <Stat label="확정 약속" value={data.meeting_confirmation.confirmed} />
          </Group>
          <Group title="만남 확인" hint="확정과 실제 만남을 같은 뜻으로 쓰지 않습니다">
            <Stat label="양측 확인" value={data.meeting_confirmation.both_reported} />
            <Stat label="한쪽 확인" value={data.meeting_confirmation.one_reported} />
            <Stat label="시각 경과 · 미확인" value={data.meeting_confirmation.not_reported} />
          </Group>
          <p className="mt-4 text-xs leading-relaxed text-muted-foreground">
            자격 전이 계측 시작 {formatMetricTime(data.coverage.readiness_started_at)}. 그 이전 자격
            시점은 알 수 없어 7일 도달률에 포함하지 않습니다. 탈퇴 회원의 개별 사건은 삭제되므로
            현재 코호트는 탈퇴를 포함한 전체 성과가 아닙니다. 표본이 없으면 0%가 아니라 —로
            표시합니다.
          </p>
        </>
      ) : null}
    </section>
  );
}

function ratePercent(rate: number | null): number | null {
  return rate === null ? null : Math.round(rate * 1000) / 10;
}

function formatMetricTime(value: string): string {
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? "확인 불가"
    : date.toLocaleString("ko-KR", {
        month: "numeric",
        day: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      });
}

function Group({
  title,
  hint,
  children,
}: {
  title: string;
  hint: string;
  children: React.ReactNode;
}) {
  return (
    <section className="mt-8 first:mt-0">
      <div className="flex items-baseline gap-2">
        <h2 className="text-lg font-semibold">{title}</h2>
        <span className="text-xs text-muted-foreground">{hint}</span>
      </div>
      <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4">{children}</div>
    </section>
  );
}

type StatProps = {
  label: string;
  value: number | null;
  unit?: string;
  alert?: boolean;
  to?: string;
  search?: Record<string, unknown>;
};

function Stat({ label, value, unit, alert, to, search }: StatProps) {
  const body = (
    <>
      <p className="flex items-center gap-1 text-xs text-muted-foreground">
        {label}
        {to ? <ChevronRight className="size-3 shrink-0" aria-hidden="true" /> : null}
      </p>
      <p
        className={`mt-1 text-2xl font-semibold tabular-nums ${alert ? "text-primary-strong" : ""}`}
      >
        {value ?? "—"}
        {unit && value !== null ? <span className="ml-0.5 text-sm">{unit}</span> : null}
      </p>
    </>
  );

  if (!to) {
    return <div className="rounded-surface border border-border px-4 py-3">{body}</div>;
  }
  return (
    <Link
      to={to}
      search={search}
      className="rounded-surface border border-border px-4 py-3 transition-colors hover:border-foreground/25 hover:bg-muted/50"
    >
      {body}
    </Link>
  );
}
