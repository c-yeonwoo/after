import { createFileRoute, Link } from "@tanstack/react-router";
import { ExternalLink, RefreshCw } from "lucide-react";
import { useCallback, useEffect, useState } from "react";

import { NoteAction } from "@/components/admin/NoteAction";
import { Tag } from "@/components/admin/ui";
import {
  fetchDashboard,
  fetchSystemOverview,
  retryNotifications,
  type AdminSystemOverview,
} from "@/lib/admin";

export const Route = createFileRoute("/admin/system")({ component: SystemTab });

const DATE_TIME = new Intl.DateTimeFormat("ko-KR", {
  month: "short",
  day: "numeric",
  hour: "2-digit",
  minute: "2-digit",
});

const JOB_LABELS: Record<string, string> = {
  drain_notification_outbox_5m: "알림 발송",
  expire_unanswered_meetings_15m: "미응답 만남 만료",
  expire_unanswered_no_show_reports_15m: "노쇼 응답 만료",
  expire_intro_queue_15m: "소개 큐 만료",
  enqueue_feedback_due_hourly: "만남 후기 요청",
};

const ACTION_LABELS: Record<string, string> = {
  resolve_report: "신고 처리",
  ban: "회원 정지",
  unban: "정지 해제",
  refund: "환불",
  cancel_meeting: "만남 취소",
  review_photo: "사진 검수",
  reset_photo: "사진 재검수",
  set_queue: "큐 저장",
  resolve_no_show: "노쇼 처리",
  set_payments: "결제 설정",
  fulfill_order: "주문 발급",
  retry_notification: "알림 재시도",
};

function SystemTab() {
  const [data, setData] = useState<AdminSystemOverview | null>(null);
  const [paymentsEnabled, setPaymentsEnabled] = useState<boolean | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    setBusy(true);
    try {
      const [overview, dashboard] = await Promise.all([fetchSystemOverview(), fetchDashboard()]);
      setData(overview);
      setPaymentsEnabled(dashboard.payments_enabled);
    } finally {
      setBusy(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  if (!data) return <p className="text-sm text-muted-foreground">불러오는 중…</p>;

  const failedIds = data.notifications.failed_rows.map((row) => row.id);

  return (
    <>
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">시스템 운영</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            자동화가 멈춘 곳을 찾고, 실패한 작업을 안전하게 다시 보냅니다.
          </p>
        </div>
        <button
          onClick={() => void load()}
          disabled={busy}
          className="flex items-center gap-2 rounded-md border border-border px-3 py-2 text-sm text-muted-foreground hover:bg-muted hover:text-foreground disabled:opacity-50"
        >
          <RefreshCw className={`size-4 ${busy ? "animate-spin" : ""}`} aria-hidden="true" />
          새로고침
        </button>
      </div>

      <section className="mt-7">
        <div className="grid gap-3 sm:grid-cols-3">
          <Summary label="알림 발송 대기" value={data.notifications.pending} />
          <Summary label="알림 최종 실패" value={data.notifications.failed} alert />
          <Link
            to="/admin/orders"
            className="rounded-surface border border-border bg-card px-4 py-3 transition-colors hover:bg-muted/40"
          >
            <p className="text-xs text-muted-foreground">결제 모드</p>
            <p className="mt-1 flex items-center gap-1 text-lg font-semibold">
              {paymentsEnabled ? "실결제" : "베타 수동 발급"}
              <ExternalLink className="size-3.5 text-muted-foreground" aria-hidden="true" />
            </p>
          </Link>
        </div>
      </section>

      <Section
        title="실패한 알림"
        hint="발송 설정을 고친 뒤 재시도하세요. 재시도 사유는 운영 기록에 남습니다."
      >
        {data.notifications.failed_rows.length === 0 ? (
          <Empty>최종 실패한 알림이 없습니다.</Empty>
        ) : (
          <>
            <div className="overflow-x-auto rounded-surface border border-border">
              <table className="w-full min-w-[48rem] text-sm">
                <thead className="bg-muted/40 text-left text-xs text-muted-foreground">
                  <tr>
                    <Th>회원</Th>
                    <Th>알림</Th>
                    <Th>시도</Th>
                    <Th>오류</Th>
                    <Th>발생</Th>
                  </tr>
                </thead>
                <tbody>
                  {data.notifications.failed_rows.map((row) => (
                    <tr key={row.id}>
                      <Td>
                        <Link
                          to="/admin/members/$id"
                          params={{ id: row.user_id }}
                          className="font-semibold underline-offset-2 hover:underline"
                        >
                          {row.user_name ?? "(이름 없음)"}
                        </Link>
                        <p className="mt-0.5 text-xs text-muted-foreground">
                          {row.notification_email ?? "알림 이메일 없음"}
                        </p>
                      </Td>
                      <Td>{row.kind}</Td>
                      <Td className="tabular-nums">{row.attempts}회</Td>
                      <Td className="max-w-sm break-words text-xs text-destructive">
                        {row.last_error ?? "오류 내용 없음"}
                      </Td>
                      <Td className="whitespace-nowrap text-xs text-muted-foreground">
                        {formatDate(row.created_at)}
                      </Td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="mt-4 max-w-xl rounded-surface border border-border p-4">
              <p className="text-sm font-semibold">
                화면에 표시된 실패 {failedIds.length}건 재시도
              </p>
              <NoteAction
                placeholder="재시도 사유 (예: Resend 설정 복구 확인)"
                onDone={() => void load()}
                actions={[
                  {
                    label: "재시도 대기열로 보내기",
                    done: "알림을 재시도 대기열로 보냈습니다.",
                    variant: "outline",
                    run: async (note) => {
                      await retryNotifications(failedIds, note);
                    },
                  },
                ]}
              />
            </div>
          </>
        )}
      </Section>

      <Section title="자동화" hint="핵심 예약 작업의 활성 상태와 마지막 실행 결과입니다.">
        <div className="overflow-x-auto rounded-surface border border-border">
          <table className="w-full min-w-[42rem] text-sm">
            <thead className="bg-muted/40 text-left text-xs text-muted-foreground">
              <tr>
                <Th>작업</Th>
                <Th>주기</Th>
                <Th>상태</Th>
                <Th>마지막 실행</Th>
                <Th>메시지</Th>
              </tr>
            </thead>
            <tbody>
              {data.jobs.map((job) => {
                const healthy = job.active && (!job.last_status || job.last_status === "succeeded");
                return (
                  <tr key={job.jobname}>
                    <Td className="font-semibold">{JOB_LABELS[job.jobname] ?? job.jobname}</Td>
                    <Td className="font-mono text-xs text-muted-foreground">
                      {job.schedule ?? "미등록"}
                    </Td>
                    <Td>
                      <Tag tone={healthy ? "muted" : "alert"}>
                        {!job.active
                          ? "비활성"
                          : job.last_status === "failed"
                            ? "실패"
                            : job.last_status === "running"
                              ? "실행 중"
                              : "정상"}
                      </Tag>
                    </Td>
                    <Td className="whitespace-nowrap text-xs text-muted-foreground">
                      {formatDate(job.last_started_at)}
                    </Td>
                    <Td className="max-w-sm break-words text-xs text-muted-foreground">
                      {job.last_message ?? "—"}
                    </Td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Section>

      <Section title="최근 AI 실행" hint="원문 없이 성공 여부·지연·토큰만 확인합니다.">
        {data.ai.length === 0 ? (
          <Empty>아직 기록된 AI 실행이 없습니다.</Empty>
        ) : (
          <div className="overflow-x-auto rounded-surface border border-border">
            <table className="w-full min-w-[46rem] text-sm">
              <thead className="bg-muted/40 text-left text-xs text-muted-foreground">
                <tr>
                  <Th>기능</Th>
                  <Th>상태</Th>
                  <Th>모델 · 프롬프트</Th>
                  <Th>지연</Th>
                  <Th>토큰</Th>
                  <Th>시각</Th>
                </tr>
              </thead>
              <tbody>
                {data.ai.map((run) => (
                  <tr key={run.id}>
                    <Td className="font-semibold">
                      {run.feature === "profile_copy" ? "프로필 문장" : "페어 브리프"}
                    </Td>
                    <Td>
                      <Tag tone={run.status === "success" ? "muted" : "alert"}>{run.status}</Tag>
                    </Td>
                    <Td className="text-xs text-muted-foreground">
                      {run.model} · {run.prompt_version}
                    </Td>
                    <Td className="tabular-nums">{run.latency_ms ? `${run.latency_ms}ms` : "—"}</Td>
                    <Td className="tabular-nums">
                      {(run.input_tokens ?? 0) + (run.output_tokens ?? 0) || "—"}
                    </Td>
                    <Td className="whitespace-nowrap text-xs text-muted-foreground">
                      {formatDate(run.created_at)}
                    </Td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Section>

      <Section title="최근 운영 기록" hint="누가 무엇을 왜 바꿨는지 한곳에서 봅니다.">
        {data.activity.length === 0 ? (
          <Empty>아직 운영 기록이 없습니다.</Empty>
        ) : (
          <ol className="divide-y divide-border rounded-surface border border-border">
            {data.activity.map((action) => (
              <li
                key={action.id}
                className="flex flex-wrap items-start gap-x-3 gap-y-1 px-4 py-3 text-sm"
              >
                <span className="font-semibold">{ACTION_LABELS[action.kind] ?? action.kind}</span>
                {action.target_user ? (
                  <Link
                    to="/admin/members/$id"
                    params={{ id: action.target_user }}
                    className="underline-offset-2 hover:underline"
                  >
                    {action.target_name ?? "회원"}
                  </Link>
                ) : null}
                <span className="min-w-0 flex-1 text-muted-foreground">{action.note}</span>
                <span className="whitespace-nowrap text-xs text-muted-foreground">
                  {action.actor_name ?? "운영자"} · {formatDate(action.created_at)}
                </span>
              </li>
            ))}
          </ol>
        )}
      </Section>
    </>
  );
}

function Section({
  title,
  hint,
  children,
}: {
  title: string;
  hint: string;
  children: React.ReactNode;
}) {
  return (
    <section className="mt-10">
      <h2 className="text-lg font-semibold">{title}</h2>
      <p className="mt-1 text-xs text-muted-foreground">{hint}</p>
      <div className="mt-3">{children}</div>
    </section>
  );
}

function Summary({
  label,
  value,
  alert = false,
}: {
  label: string;
  value: number;
  alert?: boolean;
}) {
  return (
    <div className="rounded-surface border border-border bg-card px-4 py-3">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p
        className={`mt-1 text-2xl font-semibold tabular-nums ${alert && value > 0 ? "text-destructive" : ""}`}
      >
        {value}
      </p>
    </div>
  );
}

function Empty({ children }: { children: React.ReactNode }) {
  return (
    <p className="rounded-surface border border-dashed border-border px-4 py-6 text-center text-sm text-muted-foreground">
      {children}
    </p>
  );
}

function Th({ children }: { children: React.ReactNode }) {
  return <th className="border-b border-border px-3 py-2 font-medium">{children}</th>;
}

function Td({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return <td className={`border-b border-border px-3 py-2 align-top ${className}`}>{children}</td>;
}

function formatDate(value: string | null) {
  return value ? DATE_TIME.format(new Date(value)) : "기록 없음";
}
