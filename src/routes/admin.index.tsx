import { createFileRoute, Link } from "@tanstack/react-router";
import { ChevronRight } from "lucide-react";
import { useEffect, useState } from "react";

import { CuratorTable } from "@/components/admin/CuratorTable";
import {
  fetchDashboard,
  fetchMarketplaceHealth,
  fetchOperationalHealth,
  type AdminDashboard,
  type AdminMarketplaceHealth,
  type AdminOperationalHealth,
} from "@/lib/admin";

export const Route = createFileRoute("/admin/")({ component: DashboardTab });

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

  useEffect(() => {
    let cancelled = false;
    Promise.all([fetchDashboard(), fetchOperationalHealth(), fetchMarketplaceHealth()]).then(
      ([dashboard, ops, marketplace]) => {
        if (!cancelled) {
          setD(dashboard);
          setHealth(ops);
          setMarket(marketplace);
        }
      },
    );
    return () => {
      cancelled = true;
    };
  }, []);

  if (!d || !health || !market)
    return <p className="text-sm text-muted-foreground">불러오는 중…</p>;

  const passRate =
    d.quality.intros_total > 0
      ? Math.round((d.quality.intros_passed / d.quality.intros_total) * 100)
      : null;

  return (
    <>
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
        <Stat label="소개 안 된 호감" value={d.backlog.unmatched_likes} />
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

      <Group title="실측 대기" hint="중앙값 · 느린 10% (표본이 적으면 방향만 봅니다)">
        <Stat
          label={`남성 가입→첫 노출 · n=${market.male_first_exposure.sample}`}
          value={market.male_first_exposure.p50_hours}
          unit="시간"
        />
        <Stat
          label="남성 첫 노출 · p90"
          value={market.male_first_exposure.p90_hours}
          unit="시간"
          alert={(market.male_first_exposure.p90_hours ?? 0) > 168}
        />
        <Stat
          label={`여성 호감→큐 · n=${market.female_like_to_queue.sample}`}
          value={market.female_like_to_queue.p50_hours}
          unit="시간"
        />
        <Stat
          label="여성 호감→큐 · p90"
          value={market.female_like_to_queue.p90_hours}
          unit="시간"
          alert={(market.female_like_to_queue.p90_hours ?? 0) > 72}
        />
        <Stat
          label={`남성 가입→첫 호감 · n=${market.male_first_like.sample}`}
          value={market.male_first_like.p50_hours}
          unit="시간"
        />
        <Stat
          label="남성 첫 호감 · p90"
          value={market.male_first_like.p90_hours}
          unit="시간"
          alert={(market.male_first_like.p90_hours ?? 0) > 336}
        />
        <Stat
          label={`여성 호감→소개 열림 · n=${market.female_like_to_open.sample}`}
          value={market.female_like_to_open.p50_hours}
          unit="시간"
        />
        <Stat
          label="여성 소개 열림 · p90"
          value={market.female_like_to_open.p90_hours}
          unit="시간"
          alert={(market.female_like_to_open.p90_hours ?? 0) > 336}
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
    </>
  );
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
