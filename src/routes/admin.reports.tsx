import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useCallback, useEffect, useState } from "react";

import { NoteAction } from "@/components/admin/NoteAction";
import { Tag } from "@/components/admin/ui";
import {
  fetchNoShowReports,
  fetchReports,
  resolveNoShow,
  resolveReport,
  type AdminReport,
  type NoShowReport,
  type ReportState,
} from "@/lib/admin";

const STATES: ReportState[] = ["pending", "confirmed", "dismissed"];
const KINDS = ["content", "no_show"] as const;
type ReportTab = (typeof KINDS)[number];

export const Route = createFileRoute("/admin/reports")({
  /*
    노쇼 신고를 별도 탭으로 빼지 않고 여기 둔다. 성격이 같은 판정 업무이고
    (사유를 읽고 인정/기각), 운영자가 "지금 판정할 게 몇 건인가" 를 한 자리에서
    보는 편이 낫다 — 탭이 늘수록 어디를 봐야 하는지가 흐려진다.
  */
  validateSearch: (s: Record<string, unknown>): { state?: ReportState; kind?: ReportTab } => ({
    state: STATES.includes(s.state as ReportState) ? (s.state as ReportState) : undefined,
    kind: KINDS.includes(s.kind as ReportTab) ? (s.kind as ReportTab) : undefined,
  }),
  component: ReportsTab,
});

const DATE = new Intl.DateTimeFormat("ko-KR", { dateStyle: "short", timeStyle: "short" });
const when = (s: string | null) => (s ? DATE.format(new Date(s)) : "—");

const FILTERS: { v: ReportState | ""; label: string }[] = [
  { v: "pending", label: "미처리" },
  { v: "confirmed", label: "인정" },
  { v: "dismissed", label: "기각" },
  { v: "", label: "전체" },
];

/**
 * 카드로 쌓지 않는다.
 *
 * 처음에는 신고 하나가 카드 하나였고 카드마다 사유 입력·체크박스·버튼 두 개가
 * 늘 펼쳐져 있었다. 한 화면에 두세 건밖에 안 들어와서 "지금 뭐가 밀려 있나" 를
 * 훑을 수 없고, 정작 판단에 필요한 정보(누가 누구를, 언제, 무슨 내용)는 폼에
 * 밀려 아래로 내려갔다.
 *
 * 훑기와 처리를 나눈다 — 목록은 표로 눕혀 한눈에 보고, 처리할 한 건만 펼친다.
 */
function ReportsTab() {
  const { state, kind } = Route.useSearch();
  const tab: ReportTab = kind ?? "content";
  const navigate = useNavigate({ from: Route.fullPath });

  // 기본은 미처리다 — 운영자가 손댈 수 있는 건 그것뿐이다.
  useEffect(() => {
    if (state === undefined) {
      void navigate({ search: { kind: tab, state: "pending" }, replace: true });
    }
  }, [state, tab, navigate]);

  return (
    <>
      <div className="flex gap-2">
        {(
          [
            { v: "content" as const, label: "콘텐츠 신고" },
            { v: "no_show" as const, label: "노쇼 신고" },
          ] satisfies { v: ReportTab; label: string }[]
        ).map((k) => (
          <button
            key={k.v}
            onClick={() =>
              void navigate({ search: { kind: k.v, state: "pending" }, replace: true })
            }
            className={`rounded-control border-2 px-3 py-1.5 text-sm font-medium transition-colors ${
              tab === k.v ? "border-primary bg-primary/8" : "border-border bg-card"
            }`}
          >
            {k.label}
          </button>
        ))}
      </div>

      {tab === "no_show" ? <NoShowList state={state} /> : <ContentList state={state} />}
    </>
  );
}

/** 콘텐츠 신고 — 기존 목록. */
function ContentList({ state }: { state?: ReportState }) {
  const navigate = useNavigate({ from: Route.fullPath });
  const [rows, setRows] = useState<AdminReport[] | null>(null);
  const [openId, setOpenId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setRows(await fetchReports(state));
    setOpenId(null);
  }, [state]);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <>
      <div className="mt-4 flex flex-wrap gap-1">
        {FILTERS.map((f) => (
          <button
            key={f.v}
            onClick={() =>
              void navigate({
                search: { kind: "content", state: f.v || undefined },
                replace: true,
              })
            }
            className={`rounded-full px-3 py-1 text-sm transition-colors ${
              (state ?? "") === f.v
                ? "bg-primary text-primary-foreground"
                : "bg-muted text-muted-foreground hover:text-foreground"
            }`}
          >
            {f.label}
          </button>
        ))}
      </div>

      {rows === null ? (
        <p className="mt-6 text-sm text-muted-foreground">불러오는 중…</p>
      ) : rows.length === 0 ? (
        <p className="mt-6 text-sm text-muted-foreground">해당하는 신고가 없습니다.</p>
      ) : (
        <>
          <p className="mt-5 text-sm text-muted-foreground tabular-nums">{rows.length}건</p>
          <div className="mt-2 overflow-x-auto">
            <table className="w-full min-w-[56rem] border-separate border-spacing-0 text-sm">
              <thead>
                <tr className="text-left text-xs text-muted-foreground">
                  <Th>접수</Th>
                  <Th>신고자</Th>
                  <Th>피신고자</Th>
                  <Th>종류</Th>
                  <Th>내용</Th>
                  <Th>상태</Th>
                  <Th />
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <ReportRow
                    key={r.id}
                    r={r}
                    open={openId === r.id}
                    onToggle={() => setOpenId(openId === r.id ? null : r.id)}
                    onResolved={load}
                  />
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </>
  );
}

function ReportRow({
  r,
  open,
  onToggle,
  onResolved,
}: {
  r: AdminReport;
  open: boolean;
  onToggle: () => void;
  onResolved: () => void;
}) {
  const pending = r.state === "pending";

  return (
    <>
      <tr className="group">
        <Td className="text-muted-foreground tabular-nums whitespace-nowrap">
          {when(r.created_at)}
        </Td>
        <Td>
          <Person id={r.reporter_id} name={r.reporter_name} />
        </Td>
        <Td>
          <span className="flex items-center gap-1.5">
            <Person id={r.accused_id} name={r.accused_name} />
            {r.accused_state === "banned" ? <Tag tone="alert">정지됨</Tag> : null}
          </span>
        </Td>
        <Td className="text-muted-foreground whitespace-nowrap">
          {r.kind === "message" ? "메시지" : "프로필"}
        </Td>
        {/* 내용은 한 줄로 자른다 — 훑을 때 필요한 건 길이가 아니라 성격이다. */}
        <Td className="max-w-[22rem] truncate text-muted-foreground" title={r.detail}>
          {r.detail}
        </Td>
        <Td>
          {pending ? (
            <Tag tone="alert">미처리</Tag>
          ) : r.state === "confirmed" ? (
            <Tag tone="muted">인정</Tag>
          ) : (
            <Tag tone="muted">기각</Tag>
          )}
        </Td>
        <Td className="text-right whitespace-nowrap">
          <button
            onClick={onToggle}
            className="text-xs text-muted-foreground underline-offset-2 hover:text-foreground hover:underline"
          >
            {open ? "닫기" : pending ? "처리하기" : "보기"}
          </button>
        </Td>
      </tr>

      {open ? (
        <tr>
          <td colSpan={7} className="border-b border-border bg-muted/30 px-3 py-3">
            <p className="text-sm leading-relaxed whitespace-pre-line">{r.detail}</p>

            {r.message_body ? (
              <blockquote className="mt-2 border-l-2 border-border pl-3 text-sm text-muted-foreground">
                {r.message_body}
              </blockquote>
            ) : null}

            {pending ? (
              /*
                인정하면 신고자 티켓이 환불된다(서버에서) — 단 **만남이 딸린
                신고만** 이다. resolve_content_report 는 meeting_id 가 없으면
                돌려줄 티켓을 찾지 않는다. 실제로 일어나는 일만 문구에 적는다.
              */
              <NoteAction
                placeholder="처리 사유 (필수 — 기록에 남습니다)"
                toggle={{ label: "인정과 함께 계정 정지" }}
                onDone={onResolved}
                actions={[
                  {
                    label: r.refundable ? "인정 · 티켓 환불" : "인정",
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
            ) : (
              /*
                처리 사유를 반드시 보여준다. 서버가 note 를 not null 로 강제하는
                이유가 "왜 그렇게 처리했는지" 를 남기는 것인데, 화면에 돌려주지
                않으면 DB 를 열어야만 알 수 있다(s16c).
              */
              <p className="mt-3 text-sm text-muted-foreground">
                {when(r.resolved_at)} 처리 · {r.resolve_note || "사유 기록 없음"}
              </p>
            )}
          </td>
        </tr>
      ) : null}
    </>
  );
}

function Person({ id, name }: { id: string; name: string | null }) {
  return (
    <Link
      to="/admin/members/$id"
      params={{ id }}
      className="font-semibold underline-offset-2 hover:underline"
    >
      {name ?? "(이름 없음)"}
    </Link>
  );
}

function Th({ children }: { children?: React.ReactNode }) {
  return <th className="border-b border-border px-3 py-2 font-medium">{children}</th>;
}

function Td({
  children,
  className = "",
  title,
}: {
  children?: React.ReactNode;
  className?: string;
  title?: string;
}) {
  return (
    <td
      title={title}
      className={`border-b border-border px-3 py-2 group-hover:bg-muted/40 ${className}`}
    >
      {children}
    </td>
  );
}

/**
 * 노쇼 신고 — 콘텐츠 신고와 판정 방식이 다르다.
 *
 * s4 의 원칙: **단일 미검증 신고로 즉시 제명하지 않는다.** 확정은 상대의 인정
 * 또는 24시간 무응답으로만 일어난다. 운영자는 자동 판정을 앞지르는 사람이
 * 아니라 그 뒤에 오는 다툼을 판정하는 사람이다.
 *
 * 그래서 화면이 반드시 보여줘야 하는 것이 둘 있다.
 *   · **양쪽 후기** — 신고 사유는 feedbacks.body 에만 있고, 한쪽 말만 보이면
 *     운영자가 한쪽 말로 판정한다.
 *   · **확인 기한** — 지나면 무응답으로 자동 확정된다. 그 전에 볼 기회를 준다.
 */
function NoShowList({ state }: { state?: ReportState }) {
  const navigate = useNavigate({ from: Route.fullPath });
  const [rows, setRows] = useState<NoShowReport[] | null>(null);
  const [openId, setOpenId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setRows(await fetchNoShowReports(state));
    setOpenId(null);
  }, [state]);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <>
      <div className="mt-4 flex flex-wrap gap-1">
        {FILTERS.map((f) => (
          <button
            key={f.v}
            onClick={() =>
              void navigate({
                search: { kind: "no_show", state: f.v || undefined },
                replace: true,
              })
            }
            className={`rounded-full px-3 py-1 text-sm transition-colors ${
              (state ?? "") === f.v
                ? "bg-primary text-primary-foreground"
                : "bg-muted text-muted-foreground hover:text-foreground"
            }`}
          >
            {f.label}
          </button>
        ))}
      </div>

      {rows === null ? (
        <p className="mt-6 text-sm text-muted-foreground">불러오는 중…</p>
      ) : rows.length === 0 ? (
        <p className="mt-6 text-sm text-muted-foreground">해당하는 노쇼 신고가 없습니다.</p>
      ) : (
        <>
          <p className="mt-5 text-sm text-muted-foreground tabular-nums">{rows.length}건</p>
          <div className="mt-2 overflow-x-auto">
            <table className="w-full min-w-[56rem] border-separate border-spacing-0 text-sm">
              <thead>
                <tr className="text-left text-xs text-muted-foreground">
                  <Th>약속</Th>
                  <Th>신고자</Th>
                  <Th>피신고자</Th>
                  <Th>확인 기한</Th>
                  <Th>상태</Th>
                  <Th />
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <NoShowRow
                    key={r.id}
                    r={r}
                    open={openId === r.id}
                    onToggle={() => setOpenId(openId === r.id ? null : r.id)}
                    onResolved={load}
                  />
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </>
  );
}

function NoShowRow({
  r,
  open,
  onToggle,
  onResolved,
}: {
  r: NoShowReport;
  open: boolean;
  onToggle: () => void;
  onResolved: () => void;
}) {
  const pending = r.state === "pending";
  const overdue = pending && r.confirm_by !== null && new Date(r.confirm_by) < new Date();

  return (
    <>
      <tr className="group">
        <Td className="text-muted-foreground tabular-nums whitespace-nowrap">
          {when(r.scheduled_at)}
          {r.place_name ? ` · ${r.place_name}` : ""}
        </Td>
        <Td>
          <Person id={r.reporter_id} name={r.reporter_name} />
        </Td>
        <Td>
          <span className="flex items-center gap-1.5">
            <Person id={r.accused_id} name={r.accused_name} />
            {r.accused_state === "banned" ? <Tag tone="alert">제명됨</Tag> : null}
          </span>
        </Td>
        <Td className="text-muted-foreground tabular-nums whitespace-nowrap">
          {/* 기한이 지나면 크론이 무응답으로 자동 확정한다 — 그 사실을 표시한다. */}
          {overdue ? (
            <span className="text-primary-strong">기한 지남 · 자동 확정 대기</span>
          ) : (
            when(r.confirm_by)
          )}
        </Td>
        <Td>
          {pending ? (
            <Tag tone="alert">미처리</Tag>
          ) : r.state === "confirmed" ? (
            <Tag tone="alert">확정</Tag>
          ) : (
            <Tag tone="muted">기각</Tag>
          )}
        </Td>
        <Td className="text-right whitespace-nowrap">
          <button
            onClick={onToggle}
            className="text-xs text-muted-foreground underline-offset-2 hover:text-foreground hover:underline"
          >
            {open ? "닫기" : pending || r.state === "confirmed" ? "판정하기" : "보기"}
          </button>
        </Td>
      </tr>

      {open ? (
        <tr>
          <td colSpan={6} className="border-b border-border bg-muted/30 px-3 py-3">
            {/* 양쪽 후기를 나란히. 한쪽만 보이면 한쪽 말로 판정하게 된다. */}
            <div className="grid gap-3 sm:grid-cols-2">
              <Note who={r.reporter_name} label="신고자" body={r.reporter_note} />
              <Note who={r.accused_name} label="피신고자" body={r.accused_note} />
            </div>

            {r.compensated ? (
              <p className="mt-3 text-xs text-muted-foreground">
                확정으로 신고자에게 보상 티켓이 이미 발급됐습니다.{" "}
                <strong>기각으로 되돌려도 회수하지 않습니다.</strong>
              </p>
            ) : null}

            {pending ? (
              <NoteAction
                placeholder="판정 사유 (필수 — 기록에 남습니다)"
                onDone={onResolved}
                actions={[
                  {
                    label: "인정 · 제명 + 보상 티켓",
                    done: "확정했습니다.",
                    run: (note) => resolveNoShow(r.id, true, note),
                  },
                  {
                    label: "기각",
                    done: "기각했습니다.",
                    variant: "outline",
                    run: (note) => resolveNoShow(r.id, false, note),
                  },
                ]}
              />
            ) : r.state === "confirmed" ? (
              <>
                <p className="mt-3 text-xs text-muted-foreground">
                  확정된 건입니다. 기각으로 되돌리면 제명이 풀립니다.
                </p>
                <NoteAction
                  placeholder="번복 사유 (필수 — 기록에 남습니다)"
                  onDone={onResolved}
                  actions={[
                    {
                      label: "기각으로 번복 · 제명 해제",
                      done: "번복했습니다.",
                      variant: "destructive",
                      run: (note) => resolveNoShow(r.id, false, note),
                    },
                  ]}
                />
              </>
            ) : (
              /* 기각된 건은 다시 확정할 수 없다 — 새 신고가 접수되는 편이 옳다. */
              <p className="mt-3 text-sm text-muted-foreground">
                {when(r.resolved_at)} 기각 처리됨. 다시 확정할 수는 없습니다.
              </p>
            )}
          </td>
        </tr>
      ) : null}
    </>
  );
}

function Note({ who, label, body }: { who: string | null; label: string; body: string | null }) {
  return (
    <div className="rounded-surface border border-border bg-card p-3">
      <p className="text-xs text-muted-foreground">
        {label} · {who ?? "(이름 없음)"}
      </p>
      <p className="mt-1 text-sm leading-relaxed whitespace-pre-line">
        {body || <span className="text-muted-foreground">후기를 남기지 않았습니다.</span>}
      </p>
    </div>
  );
}
