import { createFileRoute, Link } from "@tanstack/react-router";
import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";

import {
  approveAutomationRun,
  fetchAutomationOverview,
  fetchPolicyPreview,
  updateAutomationRule,
  type AutomationOverview,
  type AutomationRule,
  type AdminPolicyPreview,
} from "@/lib/admin";

export const Route = createFileRoute("/admin/settings")({ component: AdminSettingsPage });

const MODE_LABEL: Record<AutomationRule["mode"], string> = {
  off: "중지",
  observe: "관찰",
  approval: "건별 승인",
  auto: "제한적 자동",
};

function AdminSettingsPage() {
  const [data, setData] = useState<AutomationOverview | null>(null);
  const [policy, setPolicy] = useState<AdminPolicyPreview | null>(null);
  const [policyError, setPolicyError] = useState(false);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [mode, setMode] = useState<AutomationRule["mode"]>("off");
  const [limit, setLimit] = useState(20);
  const [interval, setIntervalHours] = useState(24);
  const [pause, setPause] = useState("");
  const [reason, setReason] = useState("");
  const [approvalReason, setApprovalReason] = useState("");
  const [error, setError] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const overview = await fetchAutomationOverview();
      setData(overview);
      setMode(overview.rule.mode);
      setLimit(overview.rule.daily_limit);
      setIntervalHours(overview.rule.min_interval_hours);
      setPause(overview.rule.paused_reason ?? "");
      setError(false);
    } catch {
      setError(true);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    void fetchPolicyPreview()
      .then((value) => {
        setPolicy(value);
        setPolicyError(false);
      })
      .catch(() => setPolicyError(true));
  }, []);

  async function save() {
    if (!data || reason.trim().length < 3) return;
    setBusy(true);
    try {
      await updateAutomationRule(
        data.rule,
        {
          mode,
          daily_limit: limit,
          min_interval_hours: interval,
          paused_reason: pause.trim() || null,
        },
        reason.trim(),
      );
      toast.success("운영 규칙을 저장했습니다.");
      setReason("");
      await load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "규칙을 저장하지 못했습니다.");
      await load();
    } finally {
      setBusy(false);
    }
  }

  async function approve(run: AutomationOverview["runs"][number]) {
    if (approvalReason.trim().length < 3) return;
    setBusy(true);
    try {
      const result = await approveAutomationRun(run, approvalReason.trim());
      toast[result === "succeeded" ? "success" : "message"](
        result === "succeeded"
          ? "알림 대기열에 등록했습니다."
          : "대상 상태가 바뀌어 보내지 않았습니다.",
      );
      setApprovalReason("");
      await load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "승인하지 못했습니다.");
      await load();
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="max-w-4xl pb-16">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">운영 설정</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            새 알림은 기본 중지입니다. 관찰 결과를 확인한 뒤 단계적으로 켜세요.
          </p>
        </div>
        <button
          type="button"
          onClick={() => void load()}
          disabled={loading || busy}
          className="rounded-control border border-border px-3 py-2 text-sm disabled:opacity-50"
        >
          새로고침
        </button>
      </div>

      {error ? (
        <p role="alert" className="mt-6 rounded-surface border border-destructive/30 p-4 text-sm">
          설정을 불러오지 못했습니다. 이전 수치를 현재 상태로 사용하지 마세요.
        </p>
      ) : null}
      {loading && !data ? <p className="mt-6 text-sm text-muted-foreground">불러오는 중…</p> : null}
      {data ? (
        <>
          <section className="mt-7 rounded-surface border border-border bg-card p-5">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <h2 className="text-base font-semibold">미응답 만남 요청 리마인드</h2>
                <p className="mt-1 text-sm text-muted-foreground">
                  요청 후 12시간이 지나고 아직 답변이 없을 때 한 번만 제안합니다.
                </p>
              </div>
              <span className="rounded-full bg-muted px-3 py-1 text-xs">
                현재 {MODE_LABEL[data.rule.mode]}
              </span>
            </div>
            <p className="mt-3 text-xs text-muted-foreground">
              버전 {data.rule.version} · 관찰 시작{" "}
              {data.rule.observed_since ? formatDate(data.rule.observed_since) : "없음"} · 마지막
              변경 {formatDate(data.rule.updated_at)}
            </p>
            <div className="mt-5 grid gap-4 sm:grid-cols-3">
              <label className="text-sm">
                운영 모드
                <select
                  value={mode}
                  onChange={(e) => setMode(e.target.value as AutomationRule["mode"])}
                  disabled={busy}
                  className="mt-1 block min-h-11 w-full rounded-control border border-border bg-background px-3"
                >
                  {Object.entries(MODE_LABEL).map(([key, label]) => (
                    <option key={key} value={key}>
                      {label}
                    </option>
                  ))}
                </select>
              </label>
              <label className="text-sm">
                하루 최대 건수
                <input
                  type="number"
                  min={1}
                  max={100}
                  value={limit}
                  onChange={(e) => setLimit(Number(e.target.value))}
                  disabled={busy}
                  className="mt-1 block min-h-11 w-full rounded-control border border-border bg-background px-3"
                />
              </label>
              <label className="text-sm">
                같은 회원 최소 간격 · 시간
                <input
                  type="number"
                  min={12}
                  max={168}
                  value={interval}
                  onChange={(e) => setIntervalHours(Number(e.target.value))}
                  disabled={busy}
                  className="mt-1 block min-h-11 w-full rounded-control border border-border bg-background px-3"
                />
              </label>
            </div>
            <label className="mt-4 block text-sm">
              일시 중지 사유 · 비우면 재개
              <input
                value={pause}
                onChange={(e) => setPause(e.target.value)}
                maxLength={500}
                disabled={busy}
                placeholder="예: 알림 전달 결과 확인 중"
                className="mt-1 block min-h-11 w-full rounded-control border border-border bg-background px-3"
              />
            </label>
            <label className="mt-4 block text-sm">
              변경 사유
              <input
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                maxLength={500}
                disabled={busy}
                placeholder="변경 이유를 남겨 주세요"
                className="mt-1 block min-h-11 w-full rounded-control border border-border bg-background px-3"
              />
            </label>
            <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
              <p className="max-w-xl text-xs leading-relaxed text-muted-foreground">
                관찰 모드는 발송하지 않습니다. 자동 모드는 서버에서 48시간 관찰과 대상 기록을
                확인하기 전에는 거절합니다. 중지는 기존 만료·티켓 반환을 멈추지 않습니다.
              </p>
              <button
                type="button"
                onClick={() => void save()}
                disabled={busy || loading || error || reason.trim().length < 3}
                className="min-h-11 rounded-control bg-primary px-5 text-sm font-semibold text-primary-foreground disabled:opacity-50"
              >
                설정 저장
              </button>
            </div>
          </section>

          <section className="mt-8">
            <div className="flex flex-wrap items-end justify-between gap-2">
              <h2 className="text-base font-semibold">최근 실행 · 최대 30건</h2>
              <span className="text-xs text-muted-foreground">기준 {formatDate(data.as_of)}</span>
            </div>
            <p className="mt-1 text-xs text-muted-foreground">
              관찰은 실제 발송이 아닙니다. 승인은 알림 대기열 등록이며, 푸시 접수·열람은 시스템
              화면에서 별도로 확인하세요.
            </p>
            {data.runs.length === 0 ? (
              <p className="mt-4 rounded-surface border border-border p-5 text-sm text-muted-foreground">
                아직 관찰한 대상이 없습니다.
              </p>
            ) : (
              <div className="mt-4 space-y-2">
                {data.runs.map((run) => (
                  <div key={run.id} className="rounded-surface border border-border bg-card p-4">
                    <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
                      <span className="font-medium">
                        {run.status === "approval_required" ? "승인 대기" : statusLabel(run.status)}
                      </span>
                      <span className="text-xs text-muted-foreground">
                        {formatDate(run.created_at)}
                      </span>
                    </div>
                    <p className="mt-2 text-sm">아직 답하지 않은 만남 요청을 다시 안내합니다.</p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      승인 유효 기한 {formatDate(run.preview_expires_at)} · 결과{" "}
                      {run.result_code ?? "—"}
                    </p>
                    {run.user_id ? (
                      <Link
                        to="/admin/members/$id"
                        params={{ id: run.user_id }}
                        className="mt-2 inline-block text-xs text-primary underline"
                      >
                        받는 회원 확인
                      </Link>
                    ) : null}
                    {run.status === "approval_required" && data.rule.mode === "approval" ? (
                      <div className="mt-3 flex flex-wrap gap-2">
                        <input
                          aria-label="승인 사유"
                          value={approvalReason}
                          onChange={(e) => setApprovalReason(e.target.value)}
                          maxLength={500}
                          placeholder="승인 사유"
                          className="min-h-11 min-w-44 flex-1 rounded-control border border-border bg-background px-3 text-sm"
                        />
                        <button
                          type="button"
                          onClick={() => void approve(run)}
                          disabled={
                            busy ||
                            approvalReason.trim().length < 3 ||
                            Date.parse(run.preview_expires_at) <= Date.now()
                          }
                          className="min-h-11 rounded-control border border-border px-4 text-sm disabled:opacity-50"
                        >
                          이 건 승인
                        </button>
                      </div>
                    ) : null}
                  </div>
                ))}
              </div>
            )}
          </section>
        </>
      ) : null}

      <section className="mt-9 rounded-surface border border-border bg-card p-5">
        <h2 className="text-base font-semibold">정책 재동의</h2>
        {policyError ? (
          <p role="alert" className="mt-2 text-sm text-destructive">
            적용 대상을 확인할 수 없습니다.
          </p>
        ) : null}
        {policy ? (
          <>
            <p className="mt-2 text-sm">
              현재 문서 {policy.signup_version} · 재동의{" "}
              {policy.required_version ? "예약됨" : "비활성"}
            </p>
            <p className="mt-1 text-sm text-muted-foreground">
              재동의 적용 시 영향을 받을 활성 회원 {policy.affected_active_members}명
            </p>
            <p className="mt-3 text-xs leading-relaxed text-muted-foreground">
              법률 검토와 운영자 강화 인증을 마치기 전에는 적용하지 않습니다. 적용되더라도 진행 중인
              약속·문의·탈퇴 경로는 유지됩니다.
            </p>
          </>
        ) : !policyError ? (
          <p className="mt-2 text-sm text-muted-foreground">불러오는 중…</p>
        ) : null}
      </section>
    </div>
  );
}

function formatDate(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? "확인 불가"
    : new Intl.DateTimeFormat("ko-KR", {
        month: "numeric",
        day: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      }).format(date);
}

function statusLabel(status: string) {
  return (
    (
      {
        observed: "관찰만",
        succeeded: "대기열 등록",
        skipped: "보내지 않음",
        failed: "실패",
        unknown: "결과 미상",
      } as Record<string, string>
    )[status] ?? status
  );
}
