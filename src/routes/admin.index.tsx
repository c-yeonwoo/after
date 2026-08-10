import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";

import { fetchDashboard, type AdminDashboard } from "@/lib/admin";

export const Route = createFileRoute("/admin/")({ component: DashboardTab });

/**
 * 지표 배치가 의도적이다 — 규모(가입·활성)보다 **적체와 품질**을 위에 둔다.
 * 운영자가 매일 확인해야 하는 것은 "밀리고 있는가"이지 "몇 명인가"가 아니다.
 */
function DashboardTab() {
  const [d, setD] = useState<AdminDashboard | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetchDashboard().then((v) => {
      if (!cancelled) setD(v);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  if (!d) return <p className="text-sm text-muted-foreground">불러오는 중…</p>;

  const passRate =
    d.quality.intros_total > 0
      ? Math.round((d.quality.intros_passed / d.quality.intros_total) * 100)
      : null;

  return (
    <>
      <section>
        <h2 className="text-lg font-semibold">적체</h2>
        <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Stat
            label="미처리 신고"
            value={d.backlog.pending_reports}
            alert={d.backlog.pending_reports > 0}
          />
          <Stat
            label="미처리 노쇼"
            value={d.backlog.pending_no_shows}
            alert={d.backlog.pending_no_shows > 0}
          />
          <Stat label="소개 안 된 호감" value={d.backlog.unmatched_likes} />
          <Stat
            label="가장 오래 기다린 호감"
            value={d.backlog.oldest_like_hours}
            unit="시간"
            alert={(d.backlog.oldest_like_hours ?? 0) > 72}
          />
        </div>
      </section>

      <section className="mt-8">
        <h2 className="text-lg font-semibold">품질</h2>
        <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Stat label="소개 넘김 비율" value={passRate} unit="%" alert={(passRate ?? 0) > 60} />
          <Stat label="소개 전체" value={d.quality.intros_total} />
          <Stat label="티켓 사용" value={d.quality.intros_used} />
          <Stat label="완료된 만남" value={d.flow.completed} />
        </div>
      </section>

      <section className="mt-8">
        <h2 className="text-lg font-semibold">규모</h2>
        <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Stat label="여성" value={d.members.female} />
          <Stat label="남성" value={d.members.male} />
          <Stat label="잠시 쉬는 중" value={d.members.paused} />
          <Stat label="정지" value={d.members.banned} alert={d.members.banned > 0} />
        </div>
        <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Stat label="열린 소개" value={d.flow.open_intros} />
          <Stat label="진행 중 만남" value={d.flow.active_meetings} />
          <Stat label="확정" value={d.flow.confirmed} />
        </div>
      </section>
    </>
  );
}

function Stat({
  label,
  value,
  unit,
  alert,
}: {
  label: string;
  value: number | null;
  unit?: string;
  alert?: boolean;
}) {
  return (
    <div className="rounded-surface border border-border px-4 py-3">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p
        className={`mt-1 text-2xl font-semibold tabular-nums ${alert ? "text-primary-strong" : ""}`}
      >
        {value ?? "—"}
        {unit && value !== null ? <span className="ml-0.5 text-sm">{unit}</span> : null}
      </p>
    </div>
  );
}
