import { createFileRoute, Link } from "@tanstack/react-router";
import { useCallback, useEffect, useState } from "react";

import { NoteAction } from "@/components/admin/NoteAction";
import { fetchReports, resolveReport, type AdminReport } from "@/lib/admin";

export const Route = createFileRoute("/admin/reports")({ component: ReportsTab });

function ReportsTab() {
  const [reports, setReports] = useState<AdminReport[] | null>(null);

  const load = useCallback(async () => {
    setReports(await fetchReports());
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  if (!reports) return <p className="text-sm text-muted-foreground">불러오는 중…</p>;

  const pending = reports.filter((r) => r.state === "pending");
  const resolved = reports.filter((r) => r.state !== "pending");

  return (
    <>
      <section>
        <h2 className="text-lg font-semibold">
          미처리 <span className="text-muted-foreground tabular-nums">{pending.length}</span>
        </h2>
        {pending.length === 0 ? (
          <p className="mt-3 text-sm text-muted-foreground">처리할 신고가 없습니다.</p>
        ) : (
          <ul className="mt-4 space-y-3">
            {pending.map((r) => (
              <ReportCard key={r.id} r={r} onResolved={load} />
            ))}
          </ul>
        )}
      </section>

      {resolved.length > 0 ? (
        <section className="mt-10">
          <h2 className="text-lg font-semibold">처리됨</h2>
          <ul className="mt-4 space-y-2">
            {resolved.map((r) => (
              <li
                key={r.id}
                className="rounded-surface border border-border px-4 py-3 text-sm text-muted-foreground"
              >
                <span className={r.state === "confirmed" ? "text-primary-strong" : ""}>
                  {r.state === "confirmed" ? "인정" : "기각"}
                </span>{" "}
                · {r.reporter_name} → {r.accused_name} · {r.detail}
                {/*
                  처리 사유를 반드시 같이 보여준다. 서버가 note 를 not null 로
                  강제하는 이유가 "왜 그렇게 처리했는지" 를 남기는 것인데, 그걸
                  화면에 돌려주지 않으면 DB 를 열어야만 알 수 있다.

                  생성된 타입은 RETURNS TABLE 컬럼을 전부 non-null 로 적지만
                  미처리 건에는 실제로 null 이 온다 — message_body 와 같은
                  이유로 값 검사를 한다.
                */}
                {r.resolve_note ? (
                  <p className="mt-1 text-xs">처리 사유 · {r.resolve_note}</p>
                ) : null}
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </>
  );
}

function ReportCard({ r, onResolved }: { r: AdminReport; onResolved: () => void }) {
  return (
    <li className="rounded-surface border border-border p-4">
      <div className="flex flex-wrap items-baseline gap-x-2 text-sm">
        {/* 이름에서 회원 상세로 바로 넘어간다 — 신고를 판단하려면 그 사람을 봐야 한다. */}
        <Link
          to="/admin/members/$id"
          params={{ id: r.reporter_id }}
          className="font-semibold underline-offset-2 hover:underline"
        >
          {r.reporter_name}
        </Link>
        <span className="text-muted-foreground">신고 →</span>
        <Link
          to="/admin/members/$id"
          params={{ id: r.accused_id }}
          className="font-semibold underline-offset-2 hover:underline"
        >
          {r.accused_name}
        </Link>
        <span className="rounded-full bg-muted px-2 py-0.5 text-2xs text-muted-foreground">
          {r.kind === "message" ? "메시지" : "프로필"}
        </span>
        {r.accused_state === "banned" ? (
          <span className="text-2xs text-primary-strong">이미 정지됨</span>
        ) : null}
      </div>

      <p className="mt-2 text-sm leading-relaxed">{r.detail}</p>

      {r.message_body ? (
        <blockquote className="mt-2 border-l-2 border-border pl-3 text-sm text-muted-foreground">
          {r.message_body}
        </blockquote>
      ) : null}

      {/*
        인정하면 신고자 티켓이 환불된다(서버에서) — 단 **만남이 딸린 신고만**
        이다. resolve_content_report 는 meeting_id 가 없으면 돌려줄 티켓을
        찾지 않는다. 실제로 일어나는 일만 문구에 적는다.
      */}
      <NoteAction
        placeholder="처리 사유 (필수 — 기록에 남습니다)"
        toggle={{ label: "인정과 함께 계정 정지" }}
        onDone={onResolved}
        actions={[
          {
            label: r.meeting_id ? "인정 · 티켓 환불" : "인정",
            done: "인정 처리했습니다.",
            run: (note, ban) => resolveReport(r.id, true, note, ban),
          },
          {
            label: "기각",
            done: "기각했습니다.",
            variant: "outline",
            run: (note) => resolveReport(r.id, false, note, false),
          },
        ]}
      />
    </li>
  );
}
