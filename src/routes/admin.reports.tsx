import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useCallback, useState } from "react";
import { ChevronDown } from "lucide-react";

import { NoteAction } from "@/components/admin/NoteAction";
import { ReviewError, ReviewHeader } from "@/components/admin/ReviewWorkspace";
import { useReviewGuard, useReviewQueue } from "@/components/admin/useReviewWorkspace";
import { Tag } from "@/components/admin/ui";
import { Button } from "@/components/ui/button";
import {
  fetchNoShowReports,
  fetchReports,
  resolveNoShow,
  resolveReport,
  type AdminReport,
  type NoShowReport,
  type ReportState,
} from "@/lib/admin";

const STATES = ["pending", "confirmed", "dismissed", "all"] as const;
const KINDS = ["content", "no_show"] as const;
type ReportTab = (typeof KINDS)[number];
type Filter = (typeof STATES)[number];
const FILTERS: { v: Filter; label: string }[] = [
  { v: "pending", label: "미처리" },
  { v: "confirmed", label: "인정" },
  { v: "dismissed", label: "기각" },
  { v: "all", label: "전체" },
];
const DATE = new Intl.DateTimeFormat("ko-KR", { dateStyle: "short", timeStyle: "short" });
const when = (date: string | null) => (date ? DATE.format(new Date(date)) : "—");
export const Route = createFileRoute("/admin/reports")({
  validateSearch: (search: Record<string, unknown>): { state?: Filter; kind?: ReportTab } => ({
    state: STATES.includes(search.state as Filter) ? (search.state as Filter) : undefined,
    kind: KINDS.includes(search.kind as ReportTab) ? (search.kind as ReportTab) : undefined,
  }),
  component: ReportsTab,
});
function ReportsTab() {
  const { state = "pending", kind = "content" } = Route.useSearch();
  return <ReportWorkspace key={`${kind}:${state}`} state={state} kind={kind} />;
}
function ReportWorkspace({ state, kind }: { state: Filter; kind: ReportTab }) {
  const navigate = useNavigate({ from: Route.fullPath });
  const fetchRows = useCallback(
    async (): Promise<(AdminReport | NoShowReport)[]> =>
      kind === "content"
        ? fetchReports(state === "all" ? undefined : state)
        : fetchNoShowReports(state === "all" ? undefined : state),
    [kind, state],
  );
  const { data: rows, loading, error, load } = useReviewQueue(fetchRows);
  const [openId, setOpenId] = useState<string | null>(null);
  const [editing, setEditing] = useState({ dirty: false, busy: false });
  const { ask, dialog } = useReviewGuard(editing.dirty, editing.busy);
  const resolved = async () => {
    setOpenId(null);
    setEditing({ dirty: false, busy: true });
    await load();
    setEditing({ dirty: false, busy: false });
  };
  return (
    <section>
      <ReviewHeader
        title="신고 관리"
        description="양쪽 기록과 처리 이력을 확인한 뒤 한 건씩 판정합니다."
        loading={loading}
        disabled={editing.busy || editing.dirty}
        onRefresh={() => void load()}
      />
      <div className="flex flex-wrap gap-2" aria-label="신고 종류">
        {KINDS.map((value) => (
          <Button
            key={value}
            size="sm"
            disabled={editing.busy}
            aria-pressed={kind === value}
            variant={kind === value ? "default" : "outline"}
            onClick={() => {
              if (value !== kind)
                void navigate({ search: { kind: value, state: "pending" }, replace: true });
            }}
          >
            {value === "content" ? "콘텐츠 신고" : "노쇼 신고"}
          </Button>
        ))}
      </div>
      <div className="mt-4 flex flex-wrap gap-2" aria-label="신고 상태">
        {FILTERS.map((filter) => (
          <Button
            key={filter.v}
            size="sm"
            variant={state === filter.v ? "secondary" : "ghost"}
            aria-pressed={state === filter.v}
            disabled={editing.busy}
            onClick={() => {
              if (state !== filter.v)
                void navigate({ search: { kind, state: filter.v }, replace: true });
            }}
          >
            {filter.label}
          </Button>
        ))}
      </div>
      {dialog}
      {kind === "no_show" && (
        <p className="mt-4 text-sm leading-relaxed text-muted-foreground">
          무응답은 자동 제재 사유가 아닙니다. 양쪽 후기와 확인 기한을 함께 검토해 주세요.
        </p>
      )}
      {error && <ReviewError retry={() => void load()} loading={loading} />}
      {rows === null && loading ? (
        <p role="status" className="mt-6 text-sm text-muted-foreground">
          신고를 불러오는 중…
        </p>
      ) : rows?.length === 0 ? (
        <p className="mt-6 rounded-surface bg-card p-6 text-sm text-muted-foreground">
          해당하는 신고가 없습니다.
        </p>
      ) : (
        rows && (
          <>
            <p className="mt-5 text-sm tabular-nums text-muted-foreground">{rows.length}건 표시</p>
            <ul className="mt-3 space-y-3" aria-label="신고 목록">
              {rows.map((row) => (
                <li key={row.id} className="app-elevated min-w-0 rounded-surface bg-card">
                  <div className="grid items-center gap-3 p-4 lg:grid-cols-[minmax(12rem,1fr)_minmax(0,2fr)_auto] lg:gap-5 lg:px-5">
                    <div>
                      <div className="flex flex-wrap items-center gap-2">
                        <ReportStatus state={row.state} />
                        <span className="text-xs text-muted-foreground">
                          접수 {when(row.created_at)}
                        </span>
                      </div>
                      <div className="mt-1 flex flex-wrap items-center gap-x-2 text-sm">
                        <span className="text-xs text-muted-foreground">신고자</span>
                        <Person id={row.reporter_id} name={row.reporter_name} />
                      </div>
                      <div className="flex flex-wrap items-center gap-x-2 text-sm">
                        <span className="text-xs text-muted-foreground">피신고자</span>
                        <Person id={row.accused_id} name={row.accused_name} />
                        {row.accused_state === "banned" && <Tag tone="alert">정지됨</Tag>}
                      </div>
                    </div>
                    <div className="min-w-0 text-sm">
                      {"detail" in row ? (
                        <>
                          <p className="text-xs text-muted-foreground">
                            {row.kind === "message" ? "메시지 신고" : "프로필 신고"}
                          </p>
                          <p className="mt-1 line-clamp-2 break-words leading-relaxed">
                            {row.detail}
                          </p>
                        </>
                      ) : (
                        <>
                          <p className="break-words">
                            약속 {when(row.scheduled_at)}
                            {row.place_name ? ` · ${row.place_name}` : ""}
                          </p>
                          <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
                            {row.state === "pending" &&
                            row.confirm_by &&
                            new Date(row.confirm_by).getTime() < Date.now() ? (
                              <Tag tone="alert">기한 지남 · 우선 검토</Tag>
                            ) : (
                              `확인 기한 ${when(row.confirm_by)}`
                            )}{" "}
                            ·{" "}
                            {row.responded_at
                              ? row.accused_admitted
                                ? "피신고자 인정"
                                : "피신고자 부인"
                              : "피신고자 미응답"}
                          </p>
                        </>
                      )}
                    </div>
                    <Button
                      size="sm"
                      variant="outline"
                      className="w-full lg:w-auto"
                      aria-expanded={openId === row.id}
                      aria-controls={`report-${row.id}`}
                      disabled={editing.busy}
                      onClick={(event) =>
                        ask(() => {
                          setOpenId((id) => (id === row.id ? null : row.id));
                          setEditing({ dirty: false, busy: false });
                        }, event.currentTarget)
                      }
                    >
                      {openId === row.id
                        ? "닫기"
                        : row.state === "pending"
                          ? "검토하기"
                          : "처리 내역"}
                      <ChevronDown
                        aria-hidden="true"
                        className={`ml-2 size-4 ${openId === row.id ? "rotate-180" : ""}`}
                      />
                    </Button>
                  </div>
                  {openId === row.id && (
                    <div
                      id={`report-${row.id}`}
                      className="border-t border-border px-4 pb-5 pt-4 sm:px-5"
                    >
                      <h2 className="text-base font-semibold">
                        {row.accused_name || "회원"}님에 대한 신고
                      </h2>
                      <p className="mt-1 break-all text-xs text-muted-foreground">
                        신고 번호 {row.id}
                      </p>
                      {row.meeting_id && (
                        <Link
                          to="/admin/meetings"
                          search={{ meeting: row.meeting_id }}
                          className="inline-flex min-h-11 items-center text-sm font-medium underline underline-offset-4"
                        >
                          관련 만남 확인
                        </Link>
                      )}
                      {"detail" in row ? (
                        <ContentDetail
                          key={row.id}
                          row={row}
                          disabled={error || loading}
                          onDone={resolved}
                          onEditingChange={setEditing}
                        />
                      ) : (
                        <NoShowDetail
                          key={row.id}
                          row={row}
                          disabled={error || loading}
                          onDone={resolved}
                          onEditingChange={setEditing}
                        />
                      )}
                    </div>
                  )}
                </li>
              ))}
            </ul>
          </>
        )
      )}
    </section>
  );
}

type DetailProps<T> = {
  row: T;
  disabled: boolean;
  onDone: () => Promise<void>;
  onEditingChange: (state: { dirty: boolean; busy: boolean }) => void;
};
function ContentDetail({ row, disabled, onDone, onEditingChange }: DetailProps<AdminReport>) {
  return (
    <>
      <h3 className="mt-3 text-sm font-medium">신고 내용</h3>
      <p className="mt-2 whitespace-pre-wrap break-words text-sm leading-relaxed">{row.detail}</p>
      {row.message_body && (
        <div className="mt-4 rounded-control bg-muted/50 p-4">
          <p className="text-xs font-medium text-muted-foreground">신고된 메시지</p>
          <blockquote className="mt-2 whitespace-pre-wrap break-words text-sm leading-relaxed">
            {row.message_body}
          </blockquote>
        </div>
      )}
      {row.state === "pending" ? (
        <fieldset disabled={disabled} className="mt-4 border-t border-border pt-1">
          <legend className="sr-only">신고 판정</legend>
          <NoteAction
            onEditingChange={onEditingChange}
            toggle={{ label: "인정과 함께 피신고자 계정 정지" }}
            onDone={onDone}
            actions={[
              {
                label: row.refundable ? "인정 · 티켓 환불" : "인정",
                done: "인정 처리했습니다.",
                confirmation: (ban) =>
                  `${row.accused_name}님에 대한 신고를 인정합니다.${row.refundable ? " 신고자의 관련 티켓이 환불됩니다." : ""}${ban ? " 피신고자 계정도 정지됩니다." : " 계정은 정지하지 않습니다."}`,
                run: (note, ban) => resolveReport(row.id, true, note, ban),
              },
              {
                label: "기각",
                done: "기각했습니다.",
                variant: "outline",
                confirmation: () =>
                  `${row.accused_name}님에 대한 신고를 기각합니다. 계정 정지나 티켓 환불은 실행하지 않습니다.`,
                run: (note) => resolveReport(row.id, false, note, false),
              },
            ]}
          />
        </fieldset>
      ) : (
        <Resolution date={row.resolved_at} note={row.resolve_note} />
      )}
    </>
  );
}
function NoShowDetail({ row, disabled, onDone, onEditingChange }: DetailProps<NoShowReport>) {
  return (
    <>
      <div className="mt-3 grid gap-4 sm:grid-cols-2">
        <Statement label="신고자 후기" name={row.reporter_name} body={row.reporter_note} />
        <Statement label="피신고자 후기" name={row.accused_name} body={row.accused_note} />
      </div>
      {row.compensated && (
        <p className="mt-4 text-sm leading-relaxed text-muted-foreground">
          신고자에게 보상 티켓이 발급됐습니다. 기각으로 번복해도 회수하지 않습니다.
        </p>
      )}
      {row.state !== "pending" && <Resolution date={row.resolved_at} note={row.resolution_note} />}
      {row.state === "pending" || row.state === "confirmed" ? (
        <fieldset disabled={disabled} className="mt-4 border-t border-border pt-1">
          <legend className="sr-only">노쇼 판정</legend>
          <NoteAction
            onEditingChange={onEditingChange}
            placeholder={
              row.state === "confirmed"
                ? "번복 사유 (필수 — 기록에 남습니다)"
                : "판정 사유 (필수 — 기록에 남습니다)"
            }
            onDone={onDone}
            actions={
              row.state === "pending"
                ? [
                    {
                      label: "인정 · 제명 + 보상 티켓",
                      done: "확정했습니다.",
                      variant: "destructive",
                      confirmation: () =>
                        `${row.accused_name}님의 노쇼를 확정해 계정을 제명하고, 신고자에게 보상 티켓을 발급합니다. 양쪽 기록을 확인했는지 다시 검토해 주세요.`,
                      run: (note) => resolveNoShow(row.id, true, note),
                    },
                    {
                      label: "기각",
                      done: "기각했습니다.",
                      variant: "outline",
                      confirmation: () =>
                        `${row.accused_name}님에 대한 노쇼 신고를 기각합니다. 제명이나 보상 티켓 발급은 실행하지 않습니다.`,
                      run: (note) => resolveNoShow(row.id, false, note),
                    },
                  ]
                : [
                    {
                      label: "기각으로 번복 · 제명 해제",
                      done: "번복했습니다.",
                      variant: "destructive",
                      confirmation: () =>
                        `${row.accused_name}님의 제명을 해제합니다. 이미 지급한 보상 티켓은 회수하지 않습니다.`,
                      run: (note) => resolveNoShow(row.id, false, note),
                    },
                  ]
            }
          />
        </fieldset>
      ) : (
        <p className="mt-3 text-xs text-muted-foreground">기각된 신고는 다시 확정할 수 없습니다.</p>
      )}
    </>
  );
}
function Person({ id, name }: { id: string; name: string | null }) {
  return (
    <Link
      to="/admin/members/$id"
      params={{ id }}
      className="inline-flex min-h-11 items-center break-all font-medium underline-offset-4 hover:underline"
    >
      {name || "이름 없음"}
    </Link>
  );
}
function ReportStatus({ state }: { state: ReportState }) {
  return (
    <Tag tone={state === "pending" ? "alert" : "muted"}>
      {state === "pending" ? "미처리" : state === "confirmed" ? "인정" : "기각"}
    </Tag>
  );
}
function Statement({ label, name, body }: { label: string; name: string; body: string | null }) {
  return (
    <div className="min-w-0 rounded-control bg-muted/50 p-4">
      <h3 className="text-sm font-medium">
        {label} · {name || "회원"}
      </h3>
      <p className="mt-2 whitespace-pre-wrap break-words text-sm leading-relaxed">
        {body || "남긴 후기가 없습니다."}
      </p>
    </div>
  );
}
function Resolution({ date, note }: { date: string | null; note: string | null }) {
  return (
    <div className="mt-4 border-t border-border pt-4">
      <h3 className="text-xs font-medium text-muted-foreground">처리 기록 · {when(date)}</h3>
      <p className="mt-2 whitespace-pre-wrap break-words text-sm leading-relaxed">
        {note || "사유 기록 없음"}
      </p>
    </div>
  );
}
