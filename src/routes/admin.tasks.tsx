import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useCallback, useEffect, useRef, useState } from "react";
import { supabase } from "@/lib/supabase";
import { Button } from "@/components/ui/button";

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

type TaskSearch = {
  caseId?: string;
  status?: string;
  type?: string;
  focus?: "overdue" | "today" | "followup";
};
const STATES = ["open", "in_progress", "waiting", "snoozed", "resolved"];
const TYPES = [
  "support",
  "photo_review",
  "content_report",
  "no_show_report",
  "payment_unknown",
  "notification_failure",
  "meeting_followup",
  "response_review",
];
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
  meeting_followup: "/admin/meetings",
  response_review: "/admin/members",
};

export const Route = createFileRoute("/admin/tasks")({
  validateSearch: (search: Record<string, unknown>): TaskSearch => ({
    caseId: typeof search.caseId === "string" ? search.caseId : undefined,
    status: STATES.includes(search.status as string) ? (search.status as string) : undefined,
    type: TYPES.includes(search.type as string) ? (search.type as string) : undefined,
    focus: ["overdue", "today", "followup"].includes(search.focus as string)
      ? (search.focus as TaskSearch["focus"])
      : undefined,
  }),
  component: TasksTab,
});

function dateTime(iso: string) {
  return new Intl.DateTimeFormat("ko-KR", {
    timeZone: "Asia/Seoul",
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
  const [bothConfirmed, setBothConfirmed] = useState(false);
  const [contacts, setContacts] = useState<
    { userId: string; name: string; allowed: boolean; phone: string | null }[] | null
  >(null);
  const epoch = useRef(0);
  const loadedCount = useRef(0);
  loadedCount.current = rows?.length ?? 0;
  const listRef = useRef<HTMLElement>(null);
  const detailRef = useRef<HTMLElement>(null);
  const lastSelected = useRef<string | undefined>(undefined);
  const listScrollTop = useRef(0);
  const invalidate = useCallback(() => {
    epoch.current++;
  }, []);

  const load = useCallback(
    async (append = false) => {
      const request = ++epoch.current;
      setLoading(true);
      setError(null);
      try {
        const params = {
          status: search.status,
          type: search.type,
          focus: search.focus,
          cursor: append ? cursor : null,
          limit: 30,
        };
        const keepCount = append ? 30 : Math.max(30, loadedCount.current);
        let page = await fetchOpsCases(params);
        const items = [...page.items];
        while (!append && page.next_cursor && items.length < keepCount) {
          if (request !== epoch.current) return;
          page = await fetchOpsCases({ ...params, cursor: page.next_cursor });
          items.push(...page.items);
        }
        if (request !== epoch.current) return;
        setRows((current) => (append && current ? [...current, ...items] : items));
        setTotal(page.total);
        setCursor(page.next_cursor);
      } catch {
        if (request === epoch.current)
          setError("작업 목록을 확인할 수 없습니다. 다시 시도해 주세요.");
      } finally {
        if (request === epoch.current) setLoading(false);
      }
    },
    [search.status, search.type, search.focus, cursor],
  );

  useEffect(() => {
    void load(false);
    return () => {
      invalidate();
    };
    // A changed filter starts a new list; cursor is intentionally ignored.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search.status, search.type, search.focus, invalidate]);

  useEffect(() => {
    // The mobile workbench swaps panes inside the admin shell's scroll area.
    // Preserve the list position, but always enter a detail at its heading.
    const scroller = listRef.current?.closest("main");
    if (scroller && !window.matchMedia("(min-width: 1024px)").matches)
      scroller.scrollTop = search.caseId ? 0 : listScrollTop.current;
    if (search.caseId) {
      lastSelected.current = search.caseId;
      detailRef.current?.focus({ preventScroll: true });
    } else if (lastSelected.current) {
      const previous = listRef.current?.querySelector<HTMLButtonElement>(
        `[data-case-id="${CSS.escape(lastSelected.current)}"]`,
      );
      (previous ?? listRef.current)?.focus({ preventScroll: true });
    }
  }, [search.caseId]);

  const live = useRef({ load, count: rows?.length ?? 0, loading, acting });
  live.current = { load, count: rows?.length ?? 0, loading, acting };
  useEffect(() => {
    const tick = () => {
      const s = live.current;
      if (document.visibilityState === "visible" && s.count <= 30 && !s.loading && !s.acting)
        void s.load(false);
    };
    const timer = setInterval(tick, 30_000);
    document.addEventListener("visibilitychange", tick);
    return () => {
      clearInterval(timer);
      document.removeEventListener("visibilitychange", tick);
    };
  }, []);

  useEffect(() => {
    setContacts(null);
    setBothConfirmed(false);
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
    if (acting) return;
    if (id && !search.caseId)
      listScrollTop.current = listRef.current?.closest("main")?.scrollTop ?? 0;
    setReason("");
    setNextCheck("");
    void navigate({ search: { ...search, caseId: id }, replace: true, resetScroll: false });
  };

  const changeFilter = (part: Partial<TaskSearch>) => {
    if (acting) return;
    const next = { ...search, ...part, caseId: undefined };
    if (next.status === search.status && next.type === search.type && next.focus === search.focus) {
      void load(false);
      return;
    }
    setRows(null);
    listScrollTop.current = 0;
    loadedCount.current = 0;
    setCursor(null);
    setDetail(null);
    setDetailError(false);
    setReason("");
    setNextCheck("");
    void navigate({ search: next, replace: true, resetScroll: false });
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

  const completeMeetingOperation = async () => {
    if (!detail || reason.trim().length < 3) {
      setError("처리 사유를 3자 이상 입력해 주세요.");
      return;
    }
    setActing(true);
    setError(null);
    try {
      const r = await supabase.rpc("admin_complete_meeting_operation", {
        p_case_id: detail.case.id,
        p_expected_version: detail.case.version,
        p_note: reason.trim(),
        p_request_id: crypto.randomUUID(),
        p_both_confirmed: bothConfirmed,
      });
      if (r.error) throw r.error;
      setContacts(null);
      setReason("");
      setBothConfirmed(false);
      setDetail(await fetchOpsCaseDetail(detail.case.id));
      await load(false);
    } catch {
      setError("상태가 바뀌었거나 확인이 부족합니다. 최신 작업을 다시 확인해 주세요.");
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

      <div
        className={`${search.caseId ? "hidden lg:flex" : "flex"} flex-wrap gap-2`}
        role="group"
        aria-label="기한 필터"
      >
        <Filter
          label="모든 기한"
          active={!search.focus}
          onClick={() => changeFilter({ focus: undefined })}
        />
        <Filter
          label="기한 초과"
          active={search.focus === "overdue"}
          onClick={() => changeFilter({ focus: "overdue", status: undefined })}
        />
        <Filter
          label="오늘 기한"
          active={search.focus === "today"}
          onClick={() => changeFilter({ focus: "today", status: undefined })}
        />
        <Filter
          label="지금 재확인"
          active={search.focus === "followup"}
          onClick={() => changeFilter({ focus: "followup", status: undefined })}
        />
      </div>
      <div
        className={`${search.caseId ? "hidden lg:flex" : "flex"} flex-wrap gap-2`}
        role="group"
        aria-label="작업 필터"
      >
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
        <Filter
          label="완료"
          active={search.status === "resolved"}
          onClick={() => changeFilter({ status: "resolved", focus: undefined })}
        />
        <span className="mx-1 h-7 w-px bg-border" aria-hidden="true" />
        <select
          aria-label="작업 유형"
          value={search.type ?? ""}
          onChange={(e) => changeFilter({ type: e.target.value || undefined })}
          className="min-h-11 rounded-full border border-border bg-card px-3 text-xs"
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
        <section
          ref={listRef}
          tabIndex={-1}
          aria-label="작업 목록"
          className={`${search.caseId ? "hidden lg:block" : ""} min-w-0 self-start overflow-y-auto overscroll-contain rounded-surface border border-border bg-card lg:sticky lg:top-4 lg:max-h-[calc(100dvh-8rem)]`}
        >
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
                    data-case-id={item.id}
                    aria-pressed={search.caseId === item.id}
                    disabled={acting}
                    onClick={() => choose(item.id)}
                    className={`w-full px-4 py-3.5 text-left transition-colors hover:bg-muted/40 ${search.caseId === item.id ? "bg-muted/60" : ""}`}
                  >
                    <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
                      <p className="min-w-0 break-words text-sm font-medium">
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
                    {item.next_check_at ? (
                      <p className="mt-1 text-xs text-muted-foreground">
                        다음 확인 {dateTime(item.next_check_at)}
                      </p>
                    ) : null}
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

        <section
          ref={detailRef}
          tabIndex={-1}
          aria-label="작업 상세"
          className={`${!search.caseId ? "hidden lg:block" : ""} min-w-0 self-start rounded-surface border border-border bg-card p-4 sm:p-5`}
        >
          {search.caseId ? (
            <button
              type="button"
              disabled={acting}
              onClick={() => choose()}
              className="mb-3 inline-flex min-h-11 items-center text-sm font-medium text-primary-strong"
            >
              목록으로 돌아가기
            </button>
          ) : null}
          {!search.caseId ? (
            <p className="text-sm text-muted-foreground">
              작업을 선택하면 근거와 처리 내역을 볼 수 있습니다.
            </p>
          ) : detailError ? (
            <div className="space-y-2 text-sm">
              <p role="alert">작업 상세를 확인할 수 없습니다.</p>
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
                  {detail.case.next_check_at ? (
                    <p className="mt-2 text-sm font-medium">
                      다음 확인 {dateTime(detail.case.next_check_at)}
                    </p>
                  ) : null}
                </div>
                {detail.context?.meetingId ? (
                  <Link
                    to="/admin/meetings"
                    search={{ meeting: detail.context.meetingId }}
                    className="inline-flex min-h-11 items-center text-xs text-primary-strong hover:underline"
                  >
                    연결된 약속 보기
                  </Link>
                ) : (
                  <Link
                    to={SOURCE_LINK[detail.case.case_type] ?? "/admin"}
                    className="text-xs text-primary-strong hover:underline"
                  >
                    원본 업무 보기
                  </Link>
                )}
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
              {detail.context?.femaleId ? (
                <Link
                  to="/admin/members/$id"
                  params={{ id: detail.context.femaleId }}
                  className="ml-3 mt-2 inline-flex min-h-11 items-center text-xs text-primary-strong hover:underline"
                >
                  상대 회원 보기
                </Link>
              ) : null}
              {detail.case.case_type === "response_review" ? (
                <p className="mt-3 text-sm text-muted-foreground">
                  최근 90일 경고 {detail.context?.warningCount ?? 0}건. 양측 기록을 확인하고 판단
                  근거를 남겨 주세요. 검토 완료는 경고 삭제·이용 제한을 뜻하지 않습니다.
                </p>
              ) : null}
              {detail.case.case_type === "meeting_followup" ? (
                <div className="mt-4 space-y-2 text-sm">
                  <p className="text-muted-foreground">
                    앱 참석 확인이 부족한 약속입니다. 연락 시도와 결과는 아래 사유에 기록하고, 답이
                    없으면 다음 확인 시각을 정해 보류하세요.
                  </p>
                  {detail.source_open ? (
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={acting}
                      onClick={async () => {
                        setActing(true);
                        setError(null);
                        try {
                          const r = await supabase.rpc("admin_meeting_contact_details", {
                            p_case_id: detail.case.id,
                            p_expected_version: detail.case.version,
                            p_request_id: crypto.randomUUID(),
                          });
                          if (r.error) throw r.error;
                          setContacts(r.data as unknown as NonNullable<typeof contacts>);
                          setDetail(await fetchOpsCaseDetail(detail.case.id));
                        } catch {
                          setError(
                            "연락처를 확인할 수 없습니다. 최신 작업과 관리자 인증 상태를 확인하세요.",
                          );
                        } finally {
                          setActing(false);
                        }
                      }}
                    >
                      동의한 회원 연락처 확인
                    </Button>
                  ) : null}
                  {contacts ? (
                    <ul className="rounded-control bg-muted p-3 text-xs">
                      {contacts.map((p) => (
                        <li key={p.userId} className="py-1">
                          {p.name} ·{" "}
                          {p.allowed && p.phone ? (
                            <a
                              className="inline-flex min-h-11 items-center text-primary-strong underline"
                              href={`tel:${p.phone}`}
                            >
                              {p.phone}
                            </a>
                          ) : (
                            "운영 연락 미동의 · 앱 문의로 조율"
                          )}
                        </li>
                      ))}
                    </ul>
                  ) : null}
                </div>
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
                  {detail.source_open &&
                  detail.case.case_type === "meeting_followup" &&
                  detail.context?.canConfirm ? (
                    <>
                      <label className="mt-4 flex min-h-11 items-center gap-2 text-xs">
                        <input
                          type="checkbox"
                          className="size-5 shrink-0"
                          checked={bothConfirmed}
                          onChange={(e) => setBothConfirmed(e.target.checked)}
                        />
                        두 분 모두에게 현재 약속의 참석 의사를 직접 확인했어요
                      </label>
                      <Button
                        className="mt-2"
                        disabled={acting || !bothConfirmed}
                        onClick={() => void completeMeetingOperation()}
                      >
                        양측 참석 확인 기록
                      </Button>
                    </>
                  ) : null}
                  {detail.source_open && detail.case.case_type === "response_review" ? (
                    <Button
                      className="mt-3"
                      disabled={acting}
                      onClick={() => void completeMeetingOperation()}
                    >
                      검토 완료
                    </Button>
                  ) : null}
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
      aria-pressed={active}
      onClick={onClick}
      className={`min-h-11 rounded-control px-3 py-1.5 text-xs ${active ? "bg-selection text-selection-foreground" : "border border-border text-muted-foreground hover:bg-muted"}`}
    >
      {label}
    </button>
  );
}
