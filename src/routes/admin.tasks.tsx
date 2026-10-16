import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useCallback, useEffect, useState } from "react";

import {
  applyOpsBackfill,
  fetchOpsCaseDetail,
  fetchOpsCases,
  previewOpsBackfill,
  transitionOpsCase,
  type OpsBackfillPreview,
  type OpsCaseDetail,
  type OpsCaseItem,
  type OpsCursor,
} from "@/lib/admin";

type TaskSearch = { caseId?: string; status?: string; type?: string };
const STATES = ["open", "in_progress", "waiting", "snoozed"];
const TYPES = [
  "support",
  "photo_review",
  "content_report",
  "no_show_report",
  "payment_unknown",
  "notification_failure",
];
const TYPE_LABEL: Record<string, string> = {
  support: "고객 문의",
  photo_review: "사진 검수",
  content_report: "안전 신고",
  no_show_report: "노쇼 신고",
  payment_unknown: "결제 확인",
  notification_failure: "알림 결과 확인",
};
const ACTION_LABEL: Record<string, string> = {
  start: "처리 시작",
  wait: "답변 대기",
  snooze: "나중에 재확인",
  reopen: "다시 열기",
  resolve: "해결 확인",
};
const STATUS_LABEL: Record<string, string> = {
  open: "새 작업",
  in_progress: "처리 중",
  waiting: "답변 대기",
  snoozed: "재확인 예정",
  resolved: "해결",
  superseded: "종료",
};
const SOURCE_LINK: Record<string, string> = {
  support: "/admin/support",
  photo_review: "/admin/photos",
  content_report: "/admin/reports",
  no_show_report: "/admin/reports",
  payment_unknown: "/admin/orders",
  notification_failure: "/admin/system",
};

export const Route = createFileRoute("/admin/tasks")({
  validateSearch: (search: Record<string, unknown>): TaskSearch => ({
    caseId: typeof search.caseId === "string" ? search.caseId : undefined,
    status: STATES.includes(search.status as string) ? (search.status as string) : undefined,
    type: TYPES.includes(search.type as string) ? (search.type as string) : undefined,
  }),
  component: TasksTab,
});

function dateTime(iso: string) {
  return new Intl.DateTimeFormat("ko-KR", {
    month: "numeric",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(iso));
}

function TasksTab() {
  const search = Route.useSearch();
  const navigate = useNavigate({ from: Route.fullPath });
  const [rows, setRows] = useState<OpsCaseItem[] | null>(null);
  const [cursor, setCursor] = useState<OpsCursor | null>(null);
  const [total, setTotal] = useState<number | null>(null);
  const [detail, setDetail] = useState<OpsCaseDetail | null>(null);
  const [detailError, setDetailError] = useState(false);
  const [preview, setPreview] = useState<OpsBackfillPreview | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [reason, setReason] = useState("");
  const [nextCheck, setNextCheck] = useState("");
  const [acting, setActing] = useState(false);

  const load = useCallback(
    async (append = false) => {
      setLoading(true);
      setError(null);
      try {
        const page = await fetchOpsCases({
          status: search.status,
          type: search.type,
          cursor: append ? cursor : null,
          limit: 30,
        });
        setRows((current) => (append && current ? [...current, ...page.items] : page.items));
        setTotal(page.total);
        setCursor(page.next_cursor);
      } catch {
        setError("작업 목록을 확인할 수 없습니다. 다시 시도해 주세요.");
      } finally {
        setLoading(false);
      }
    },
    [search.status, search.type, cursor],
  );

  useEffect(() => {
    void load(false);
    // A changed filter starts a new list; cursor is intentionally ignored.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search.status, search.type]);

  useEffect(() => {
    if (!search.caseId) {
      setDetail(null);
      setDetailError(false);
      return;
    }
    setDetailError(false);
    let active = true;
    void fetchOpsCaseDetail(search.caseId)
      .then((item) => {
        if (active) setDetail(item);
      })
      .catch(() => {
        if (active) setDetailError(true);
      });
    return () => {
      active = false;
    };
  }, [search.caseId]);

  useEffect(() => {
    void previewOpsBackfill()
      .then(setPreview)
      .catch(() => setPreview(null));
  }, []);

  const choose = (id?: string) => {
    setReason("");
    setNextCheck("");
    void navigate({ search: { ...search, caseId: id }, replace: true });
  };

  const changeFilter = (part: Partial<TaskSearch>) => {
    const next = { ...search, ...part, caseId: undefined };
    if (next.status === search.status && next.type === search.type) {
      void load(false);
      return;
    }
    setRows(null);
    setCursor(null);
    setDetail(null);
    setDetailError(false);
    setReason("");
    setNextCheck("");
    void navigate({ search: next, replace: true });
  };

  const applyBackfill = async () => {
    if (!preview || preview.missing_total <= 0) return;
    setActing(true);
    try {
      await applyOpsBackfill(preview.missing_total, "현재 미처리 건 작업함 이전");
      setPreview(await previewOpsBackfill());
      await load(false);
    } catch {
      setError("기존 건이 바뀌었습니다. 미리보기를 다시 확인해 주세요.");
      setPreview(await previewOpsBackfill().catch(() => null));
    } finally {
      setActing(false);
    }
  };

  const act = async (action: string) => {
    if (!detail || reason.trim().length < 3) {
      setError("처리 사유를 3자 이상 입력해 주세요.");
      return;
    }
    if ((action === "wait" || action === "snooze") && !nextCheck) {
      setError("다음 확인 시각을 선택해 주세요.");
      return;
    }
    setActing(true);
    setError(null);
    try {
      await transitionOpsCase({
        id: detail.case.id,
        action,
        version: detail.case.version,
        reason: reason.trim(),
        nextCheckAt: nextCheck ? new Date(nextCheck).toISOString() : undefined,
      });
      setReason("");
      setNextCheck("");
      setDetail(await fetchOpsCaseDetail(detail.case.id));
      await load(false);
    } catch {
      setError("원본 상태나 작업 버전이 바뀌었습니다. 새로고침 후 다시 확인해 주세요.");
      setDetail(await fetchOpsCaseDetail(detail.case.id).catch(() => null));
    } finally {
      setActing(false);
    }
  };

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-xs font-medium text-muted-foreground">오늘</p>
          <h1 className="mt-1 text-2xl font-semibold tracking-tight">작업함</h1>
        </div>
        <button
          type="button"
          onClick={() => void load(false)}
          disabled={loading}
          className="rounded-md border border-border px-3 py-2 text-xs text-muted-foreground hover:bg-muted disabled:opacity-50"
        >
          새로고침
        </button>
      </div>

      {preview && preview.missing_total > 0 ? (
        <div className="flex flex-wrap items-center gap-3 rounded-surface border border-primary/20 bg-primary/5 px-4 py-3 text-sm">
          <p className="min-w-0 flex-1">
            기존 미처리 건 {preview.missing_total}건이 아직 작업함에 없습니다. 현재 상태를 확인한 뒤
            반영할 수 있습니다.
            <span className="mt-1 block text-xs text-muted-foreground">
              {preview.by_type
                .filter((item) => item.missing_count > 0)
                .map(
                  (item) =>
                    `${TYPE_LABEL[item.case_type] ?? item.case_type} ${item.missing_count}건`,
                )
                .join(" · ")}
            </span>
          </p>
          <button
            type="button"
            onClick={() => void applyBackfill()}
            disabled={acting}
            className="rounded-md border border-border bg-card px-3 py-1.5 text-xs font-medium hover:bg-muted disabled:opacity-50"
          >
            {acting ? "반영 중…" : "현재 건 반영"}
          </button>
        </div>
      ) : null}
      {error ? (
        <p className="rounded-surface border border-destructive/30 px-4 py-3 text-sm" role="alert">
          {error}
        </p>
      ) : null}

      <div className="flex flex-wrap gap-2" aria-label="작업 필터">
        <Filter
          label="진행 중 전체"
          active={!search.status}
          onClick={() => changeFilter({ status: undefined })}
        />
        <Filter
          label="새 작업"
          active={search.status === "open"}
          onClick={() => changeFilter({ status: "open" })}
        />
        <Filter
          label="처리 중"
          active={search.status === "in_progress"}
          onClick={() => changeFilter({ status: "in_progress" })}
        />
        <Filter
          label="답변 대기"
          active={search.status === "waiting"}
          onClick={() => changeFilter({ status: "waiting" })}
        />
        <Filter
          label="재확인 예정"
          active={search.status === "snoozed"}
          onClick={() => changeFilter({ status: "snoozed" })}
        />
        <span className="mx-1 h-7 w-px bg-border" aria-hidden="true" />
        <select
          aria-label="작업 유형"
          value={search.type ?? ""}
          onChange={(e) => changeFilter({ type: e.target.value || undefined })}
          className="h-8 rounded-full border border-border bg-card px-3 text-xs"
        >
          <option value="">모든 유형</option>
          {TYPES.map((type) => (
            <option value={type} key={type}>
              {TYPE_LABEL[type]}
            </option>
          ))}
        </select>
      </div>

      <div className="grid min-h-[430px] gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(320px,0.95fr)]">
        <section className="min-w-0 rounded-surface border border-border bg-card">
          <div className="border-b border-border px-4 py-3 text-xs text-muted-foreground">
            {total === null ? "작업 확인 중" : `해당 작업 ${total}건`}
          </div>
          {rows === null ? (
            <p className="px-4 py-8 text-sm text-muted-foreground">
              {error ? "목록을 확인할 수 없습니다." : "목록을 불러오는 중입니다."}
            </p>
          ) : rows.length === 0 && !error ? (
            <p className="px-4 py-8 text-sm text-muted-foreground">
              이 조건에 해당하는 작업이 없습니다.
            </p>
          ) : (
            <ul className="divide-y divide-border">
              {rows.map((item) => (
                <li key={item.id}>
                  <button
                    type="button"
                    onClick={() => choose(item.id)}
                    className={`w-full px-4 py-3.5 text-left transition-colors hover:bg-muted/40 ${search.caseId === item.id ? "bg-muted/60" : ""}`}
                  >
                    <div className="flex items-baseline justify-between gap-3">
                      <p className="truncate text-sm font-medium">
                        {TYPE_LABEL[item.case_type] ?? item.case_type}
                        <span className="ml-2 font-normal text-muted-foreground">
                          {item.subject_name ?? "회원 확인 필요"}
                        </span>
                      </p>
                      <span
                        className={`shrink-0 text-xs ${new Date(item.due_at).getTime() < Date.now() ? "text-destructive" : "text-muted-foreground"}`}
                      >
                        {dateTime(item.due_at)}
                      </span>
                    </div>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {STATUS_LABEL[item.status] ?? item.status} · {item.hub_id ?? "권역 없음"}
                    </p>
                  </button>
                </li>
              ))}
            </ul>
          )}
          {cursor ? (
            <button
              type="button"
              onClick={() => void load(true)}
              disabled={loading}
              className="w-full border-t border-border px-4 py-3 text-xs text-muted-foreground hover:bg-muted disabled:opacity-50"
            >
              {loading ? "불러오는 중…" : "더 보기"}
            </button>
          ) : null}
        </section>

        <section className="min-w-0 rounded-surface border border-border bg-card p-4 sm:p-5">
          {!search.caseId ? (
            <p className="text-sm text-muted-foreground">
              작업을 선택하면 근거와 처리 내역을 볼 수 있습니다.
            </p>
          ) : detailError ? (
            <div className="space-y-2 text-sm">
              <p role="alert">작업 상세를 확인할 수 없습니다.</p>
              <button
                type="button"
                onClick={() => choose()}
                className="text-primary-strong underline"
              >
                목록으로 돌아가기
              </button>
            </div>
          ) : !detail || detail.case.id !== search.caseId ? (
            <p className="text-sm text-muted-foreground">작업을 확인하는 중입니다.</p>
          ) : (
            <>
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="text-xs text-muted-foreground">
                    {STATUS_LABEL[detail.case.status] ?? detail.case.status}
                  </p>
                  <h2 className="mt-1 text-lg font-semibold">
                    {TYPE_LABEL[detail.case.case_type] ?? detail.case.case_type}
                  </h2>
                  <p className="mt-1 text-xs text-muted-foreground">
                    발생 {dateTime(detail.case.opened_at)} · 기한 {dateTime(detail.case.due_at)}
                  </p>
                </div>
                <Link
                  to={SOURCE_LINK[detail.case.case_type] ?? "/admin"}
                  className="text-xs text-primary-strong hover:underline"
                >
                  원본 업무 보기
                </Link>
              </div>
              {detail.case.subject_id ? (
                <Link
                  to="/admin/members/$id"
                  params={{ id: detail.case.subject_id }}
                  className="mt-2 inline-block text-xs text-primary-strong hover:underline"
                >
                  관련 회원 보기
                </Link>
              ) : null}
              {!detail.source_open && detail.case.status !== "resolved" ? (
                <p className="mt-4 rounded-md bg-muted px-3 py-2 text-xs">
                  원본 문제는 해결됐습니다. 최신 상태를 확인해 마무리하세요.
                </p>
              ) : null}
              <div className="mt-5 border-t border-border pt-4">
                <h3 className="text-xs font-semibold">처리 이력</h3>
                <ol className="mt-3 space-y-3">
                  {detail.events.map((event) => (
                    <li key={event.id} className="border-l border-border pl-3 text-xs">
                      <p className="font-medium">
                        {STATUS_LABEL[event.to_status] ?? event.event_type}
                      </p>
                      <p className="mt-0.5 text-muted-foreground">
                        {dateTime(event.created_at)}
                        {event.note ? ` · ${event.note}` : ""}
                      </p>
                    </li>
                  ))}
                </ol>
              </div>
              {detail.allowed_actions.length > 0 ? (
                <div className="mt-5 border-t border-border pt-4">
                  <label htmlFor="case-reason" className="text-xs font-semibold">
                    처리 사유
                  </label>
                  <textarea
                    id="case-reason"
                    value={reason}
                    onChange={(e) => setReason(e.target.value)}
                    maxLength={500}
                    rows={2}
                    placeholder="판단 근거만 간단히 기록하세요. 연락처·인증 원문은 적지 마세요."
                    className="mt-2 w-full resize-y rounded-md border border-border bg-background px-3 py-2 text-sm"
                  />
                  {detail.allowed_actions.some((a) => a === "wait" || a === "snooze") ? (
                    <div className="mt-3">
                      <label htmlFor="case-next" className="text-xs text-muted-foreground">
                        보류 시 다음 확인 시각
                      </label>
                      <input
                        id="case-next"
                        type="datetime-local"
                        value={nextCheck}
                        onChange={(e) => setNextCheck(e.target.value)}
                        className="mt-1 block rounded-md border border-border bg-background px-3 py-2 text-sm"
                      />
                    </div>
                  ) : null}
                  <div className="mt-3 flex flex-wrap gap-2">
                    {detail.allowed_actions.map((action) => (
                      <button
                        key={action}
                        type="button"
                        disabled={acting}
                        onClick={() => void act(action)}
                        className="rounded-md border border-border px-3 py-2 text-xs font-medium hover:bg-muted disabled:opacity-50"
                      >
                        {ACTION_LABEL[action] ?? action}
                      </button>
                    ))}
                  </div>
                </div>
              ) : null}
            </>
          )}
        </section>
      </div>
    </div>
  );
}

function Filter({
  label,
  active,
  onClick,
}: {
  label: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-full px-3 py-1.5 text-xs transition-colors ${active ? "bg-primary text-primary-foreground" : "border border-border text-muted-foreground hover:bg-muted"}`}
    >
      {label}
    </button>
  );
}
