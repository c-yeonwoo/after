import { createFileRoute, Link } from "@tanstack/react-router";
import { ExternalLink, RefreshCw } from "lucide-react";
import { useCallback, useEffect, useState } from "react";

import { NoteAction } from "@/components/admin/NoteAction";
import { Tag } from "@/components/admin/ui";
import { assistantRpc, type AssistantHealth } from "@/lib/privateAssistant";
import {
  fetchDashboard,
  fetchAiQuality,
  fetchSystemOverview,
  retryNotifications,
  type AdminSystemOverview,
  type AdminAiQuality,
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
  automation_reminder_tick: "미응답 요청 리마인드 점검",
  meeting_lifecycle_5m: "참석 확인·자동취소·후기 점검",
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
  automation_rule: "자동화 설정",
  admin_security: "관리자 MFA 설정",
  automation_approval: "알림 승인",
  policy_activation: "정책 재동의 예약",
};

const JOB_INTERVAL_MINUTES: Record<string, number> = {
  drain_notification_outbox_5m: 5,
  expire_unanswered_meetings_15m: 15,
  expire_unanswered_no_show_reports_15m: 15,
  expire_intro_queue_15m: 15,
  enqueue_feedback_due_hourly: 60,
  automation_reminder_tick: 5,
  meeting_lifecycle_5m: 5,
};

function jobHealth(job: AdminSystemOverview["jobs"][number], now: number) {
  if (!job.schedule) return { label: "미등록", alert: true };
  if (!job.active) return { label: "비활성", alert: false };
  if (job.rule_mode === "off") return { label: "규칙 중지", alert: false };
  if (job.rule_paused) return { label: "일시 중지", alert: false };
  if (!job.last_status || !job.last_started_at) return { label: "미실행", alert: true };
  if (job.last_status === "failed") return { label: "실패", alert: true };
  const interval = JOB_INTERVAL_MINUTES[job.jobname];
  const completed = job.last_finished_at ? Date.parse(job.last_finished_at) : NaN;
  if (!interval || (job.last_status === "succeeded" && !Number.isFinite(completed))) {
    return { label: "관측 불가", alert: true };
  }
  const age = (now - completed) / 60_000;
  if (job.last_status === "running") {
    const started = Date.parse(job.last_started_at);
    return Number.isFinite(started) && (now - started) / 60_000 < interval * 3
      ? { label: "실행 중", alert: false }
      : { label: "지연", alert: true };
  }
  if (job.last_status !== "succeeded" || !Number.isFinite(age) || age < 0) {
    return { label: "관측 불가", alert: true };
  }
  return age >= interval * 3 ? { label: "지연", alert: true } : { label: "정상", alert: false };
}

function SystemTab() {
  const [data, setData] = useState<AdminSystemOverview | null>(null);
  const [paymentsEnabled, setPaymentsEnabled] = useState<boolean | null>(null);
  const [aiQuality, setAiQuality] = useState<AdminAiQuality | null>(null);
  const [assistant, setAssistant] = useState<AssistantHealth | null>(null);
  const [busy, setBusy] = useState(false);
  const [errors, setErrors] = useState<string[]>([]);
  const [checkedAt, setCheckedAt] = useState<Date | null>(null);
  const [now, setNow] = useState(Date.now());

  const load = useCallback(async () => {
    setBusy(true);
    try {
      const [overview, dashboard, ai, assistantStatus] = await Promise.allSettled([
        fetchSystemOverview(),
        fetchDashboard(),
        fetchAiQuality(),
        assistantRpc<AssistantHealth>("admin_assistant_health"),
      ]);
      const failed: string[] = [];
      if (overview.status === "fulfilled") setData(overview.value);
      else failed.push("시스템 현황");
      if (dashboard.status === "fulfilled") setPaymentsEnabled(dashboard.value.payments_enabled);
      else failed.push("결제 설정");
      if (ai.status === "fulfilled") setAiQuality(ai.value);
      else failed.push("AI 성과");
      if (assistantStatus.status === "fulfilled") setAssistant(assistantStatus.value);
      else {
        setAssistant(null);
        failed.push("매니저 운영 현황");
      }
      setErrors(failed);
      setCheckedAt(new Date());
    } finally {
      setBusy(false);
    }
  }, []);

  useEffect(() => {
    void load();
    const refresh = window.setInterval(() => {
      setNow(Date.now());
      if (document.visibilityState === "visible") void load();
    }, 60_000);
    return () => window.clearInterval(refresh);
  }, [load]);

  if (!data && !checkedAt) return <p className="text-sm text-muted-foreground">불러오는 중…</p>;
  if (!data)
    return (
      <div role="alert" className="rounded-surface border border-destructive/30 p-4 text-sm">
        시스템 현황을 확인할 수 없습니다.
        <button className="ml-3 underline" onClick={() => void load()} disabled={busy}>
          다시 확인
        </button>
      </div>
    );

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

      {errors.length > 0 ? (
        <p
          role="alert"
          className="mt-4 rounded-surface border border-destructive/30 px-4 py-3 text-sm"
        >
          {errors.join("·")} 조회 실패 · 마지막 성공 데이터가 표시될 수 있습니다.
        </p>
      ) : null}

      {assistant ? (
        <Section
          title="개인 매니저 · 최근 24시간"
          hint="상담·기억 원문은 운영자에게 표시하지 않습니다. 초안 만료는 자동 실행 실패가 아닙니다."
        >
          <div className="mb-4 flex flex-wrap gap-2">
            {(
              [
                ["chat", "상담"],
                ["memory", "기억 저장"],
                ["schedule", "일정 실행"],
              ] as const
            ).map(([key, label]) => (
              <Tag key={key} tone={assistant.flags[key] ? "alert" : "muted"}>
                {label} {assistant.flags[key] ? "켜짐" : "꺼짐"}
              </Tag>
            ))}
          </div>
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <Summary label="답변 생성 중" value={assistant.turnsPending} />
            <Summary
              label="2분 이상 미완료"
              value={assistant.turnsStalled}
              alert={assistant.turnsStalled > 0}
            />
            <Summary label="승인 대기 초안" value={assistant.actionsAwaiting} />
            <Summary label="승인 후 실행 완료" value={assistant.actionsSucceeded} />
          </div>
          <p className="mt-3 text-xs text-muted-foreground">
            만료된 미승인 초안 {assistant.actionsExpired}건 · 실행 없이 종료됩니다.
          </p>
          <ul className="mt-4 space-y-2 text-sm">
            {assistant.runs24h.map((run) => (
              <li key={run.feature + run.status}>
                {run.feature === "assistant_chat" ? "비공개 상담" : "만남 전 준비"} · {run.status}{" "}
                {run.count}건 · 입력/출력 {run.input_tokens ?? 0}/{run.output_tokens ?? 0} 토큰
              </li>
            ))}
          </ul>
          <div className="mt-4 space-y-2 text-xs text-muted-foreground">
            {assistant.cleanup.map((job) => (
              <p key={job.name}>
                {job.name === "expire-private-assistant"
                  ? "개인 기록 보관기한 정리"
                  : "일정 초안 보관기한 정리"}{" "}
                ·{" "}
                {!job.active
                  ? "비활성"
                  : job.lastStatus === "succeeded"
                    ? "최근 정리 완료"
                    : job.lastStatus === "failed"
                      ? "실패 — 확인 필요"
                      : job.lastStatus === "running"
                        ? "실행 중"
                        : "실행 기록 없음"}
              </p>
            ))}
          </div>
        </Section>
      ) : null}

      <section className="mt-7">
        <div className="grid gap-3 sm:grid-cols-3">
          <Summary label="푸시 대기" value={data.notifications.pending} />
          <Summary label="푸시 실패" value={data.notifications.failed} alert />
          <Summary label="결과 미상" value={data.notifications.unknown} alert />
          <Summary label="푸시 접수 · 24시간" value={data.notifications.submitted_24h} />
          <Summary label="푸시 불가 · 24시간" value={data.notifications.unavailable_24h} />
          <Summary
            label="최근 24시간 알림 중 앱 내 확인"
            value={`${data.notifications.in_app_read_24h}/${data.notifications.in_app_available_24h}`}
          />
          {paymentsEnabled === null ? (
            <Summary label="결제 모드" value="확인 불가" />
          ) : (
            <Link
              to="/admin/orders"
              className="rounded-surface border border-border bg-card px-4 py-3 transition-colors hover:bg-muted/40"
            >
              <p className="text-xs text-muted-foreground">결제 모드</p>
              <p className="mt-1 flex items-center gap-1 text-lg font-semibold">
                {paymentsEnabled ? "실결제" : "무료 베타"}
                <ExternalLink className="size-3.5 text-muted-foreground" aria-hidden="true" />
              </p>
            </Link>
          )}
        </div>
      </section>

      {data.notifications.legacy_unverified > 0 ? (
        <p className="mt-3 text-xs text-muted-foreground">
          이전 발송 {data.notifications.legacy_unverified}건은 공급자 접수 여부를 확인할 수
          없습니다.
        </p>
      ) : null}
      {data.notifications.worker_stale ? (
        <p className="mt-3 rounded-md border border-destructive/30 px-3 py-2 text-sm" role="alert">
          푸시 대기 건이 있지만 워커 완료 기록이 15분 넘게 없습니다. 예약 작업과 함수 상태를 확인해
          주세요.
        </p>
      ) : (
        <p className="mt-3 text-xs text-muted-foreground">
          {data.notifications.last_worker_at
            ? `마지막 알림 워커 완료 ${formatDate(data.notifications.last_worker_at)}`
            : "아직 알림 워커 실행 기록이 없습니다."}
        </p>
      )}

      {data.notifications.unknown_rows.length > 0 ? (
        <Section
          title={`결과를 확인할 수 없는 푸시 ${data.notifications.unknown}건`}
          hint="공급자가 접수했을 수 있어 자동 재전송하지 않습니다. 회원의 앱 내 알림은 그대로 확인할 수 있습니다."
        >
          <ul className="space-y-2 text-sm">
            {data.notifications.unknown_rows.map((row) => (
              <li key={row.id} className="rounded-md border border-border px-3 py-2">
                <Link
                  to="/admin/members/$id"
                  params={{ id: row.user_id }}
                  className="font-medium hover:underline"
                >
                  {row.user_name ?? "회원 확인 필요"}
                </Link>
                <span className="ml-2 text-xs text-muted-foreground">
                  {row.kind} · {formatDate(row.created_at)} · {row.last_error ?? "결과 없음"}
                </span>
              </li>
            ))}
          </ul>
        </Section>
      ) : null}

      <Section
        title="실패한 알림"
        hint="공급자에게 거절된 건만 사유를 남기고 재시도할 수 있습니다. 결과 미상 건은 재전송하지 않습니다."
      >
        {data.notifications.failed_rows.length === 0 ? (
          <Empty>최종 실패한 알림이 없습니다.</Empty>
        ) : (
          <>
            <div
              role="region"
              aria-label="실패한 알림 표"
              tabIndex={0}
              className="overflow-x-auto rounded-surface border border-border focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
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
                placeholder="재시도 사유 (예: APNs 설정 복구 확인)"
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
        <div
          role="region"
          aria-label="자동화 실행 표"
          tabIndex={0}
          className="overflow-x-auto rounded-surface border border-border focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
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
                const health = jobHealth(job, now);
                return (
                  <tr key={job.jobname}>
                    <Td className="font-semibold">{JOB_LABELS[job.jobname] ?? job.jobname}</Td>
                    <Td className="font-mono text-xs text-muted-foreground">
                      {job.schedule ?? "미등록"}
                    </Td>
                    <Td>
                      <Tag tone={health.alert ? "alert" : "muted"}>{health.label}</Tag>
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

      <Section
        title="AI 품질 · 최근 14일"
        hint="초안 생성과 실제 선택은 다릅니다. 원문·생성문은 이 기록에 남기지 않습니다."
      >
        {aiQuality ? (
          <div className="mb-4 grid gap-3 sm:grid-cols-3">
            <Summary label="호출" value={aiQuality.runs} />
            <Summary label="성공" value={aiQuality.success} />
            <Summary label="실패 · 거절" value={aiQuality.failed} alert={aiQuality.failed > 0} />
            <Summary
              label="완료 기록 없음"
              value={aiQuality.reserved}
              alert={aiQuality.reserved > 0}
            />
            <Summary label="채택 · 수정" value={`${aiQuality.accepted} · ${aiQuality.edited}`} />
            <Summary label="사용 안 함" value={aiQuality.discarded} />
          </div>
        ) : (
          <p className="mb-4 text-sm text-muted-foreground">AI 성과를 확인할 수 없습니다.</p>
        )}
        <p className="mb-3 text-xs text-muted-foreground">
          선택 기록은 의견을 남긴 초안만 포함합니다. 미기록을 채택으로 간주하지 않습니다. 완료 기록
          없음에는 중단된 요청도 포함될 수 있습니다.
        </p>
        {data.ai.length === 0 ? (
          <Empty>아직 기록된 AI 실행이 없습니다.</Empty>
        ) : (
          <div
            role="region"
            aria-label="AI 실행 표"
            tabIndex={0}
            className="overflow-x-auto rounded-surface border border-border focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
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
                      {run.feature === "profile_copy"
                        ? "프로필 생성·검토"
                        : run.feature === "profile_followup"
                          ? "인터뷰 분석"
                          : run.feature === "conversation_prep"
                            ? "회원 대화 준비"
                            : run.feature === "assistant_chat"
                              ? "비공개 상담"
                              : "페어 브리프"}
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
  value: number | string;
  alert?: boolean;
}) {
  return (
    <div className="rounded-surface border border-border bg-card px-4 py-3">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p
        className={`mt-1 text-2xl font-semibold tabular-nums ${alert && typeof value === "number" && value > 0 ? "text-destructive" : ""}`}
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
