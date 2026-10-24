import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useCallback, useEffect, useRef, useState } from "react";

import { NoteAction } from "@/components/admin/NoteAction";
import { MeetingLifecyclePanel } from "@/components/admin/MeetingLifecyclePanel";
import { Button } from "@/components/ui/button";
import { Tag } from "@/components/admin/ui";
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogCancel,
} from "@/components/ui/alert-dialog";
import { cancelMeeting, fetchMeetings, type AdminMeeting, type MeetingFilter } from "@/lib/admin";

const STATES: (MeetingFilter | "all")[] = ["active", "confirmed", "completed", "cancelled", "all"];

export const Route = createFileRoute("/admin/meetings")({
  validateSearch: (
    s: Record<string, unknown>,
  ): { state?: MeetingFilter | "all"; meeting?: string } => ({
    state: STATES.includes(s.state as MeetingFilter | "all")
      ? (s.state as MeetingFilter | "all")
      : undefined,
    meeting: typeof s.meeting === "string" ? s.meeting : undefined,
  }),
  component: MeetingsTab,
});

const DATE = new Intl.DateTimeFormat("ko-KR", { dateStyle: "short", timeStyle: "short" });
const when = (s: string | null) => (s ? DATE.format(new Date(s)) : "—");
const DAY_MS = 24 * 60 * 60 * 1000;

function urgency(m: AdminMeeting, now: number) {
  if (m.cancelled_at || m.completed_at) return 5;
  if (m.confirmed_at) return m.scheduled_at && Date.parse(m.scheduled_at) < now ? 1 : 4;
  if (!m.prefs_submitted_at)
    return m.response_due_at && now >= Date.parse(m.response_due_at) - 6 * 60 * 60 * 1000 ? 0 : 3;
  if (!m.confirmed_at) return 2;
  return 4;
}

function nextStep(m: AdminMeeting, now: number) {
  if (m.cancelled_at || m.completed_at) return "처리 완료";
  if (m.confirmed_at)
    return m.scheduled_at && Date.parse(m.scheduled_at) < now ? "만남 결과 확인" : "약속 예정";
  if (!m.prefs_submitted_at) {
    const left =
      (m.response_due_at ? Date.parse(m.response_due_at) : Date.parse(m.created_at) + DAY_MS) - now;
    return left <= 0
      ? "응답 기한 경과"
      : left <= 6 * 60 * 60 * 1000
        ? "여성 응답 임박"
        : "여성 응답 대기";
  }
  if (!m.confirmed_at)
    return m.proposed_slots?.length ? "여성 날짜 선택 대기" : "남성 날짜 선택 대기";
  if (m.scheduled_at && Date.parse(m.scheduled_at) < now) return "만남 결과 확인";
  return "약속 예정";
}

const FILTERS: { v: MeetingFilter | "all"; label: string }[] = [
  { v: "active", label: "진행 중" },
  { v: "confirmed", label: "확정" },
  { v: "completed", label: "완료" },
  { v: "cancelled", label: "취소" },
  { v: "all", label: "전체" },
];

function MeetingsTab() {
  const { state, meeting } = Route.useSearch();
  const navigate = useNavigate({ from: Route.fullPath });
  const [rows, setRows] = useState<AdminMeeting[] | null>(null);
  /*
    한 번에 한 건만 펼친다. 목록에 취소 폼을 전부 펼쳐 두면 화면이 폼으로 덮여
    "지금 몇 건이 돌고 있나" 를 볼 수 없고, 실수로 옆 건을 취소할 여지도 커진다.
  */
  const [openId, setOpenId] = useState<string | null>(null);
  const [now, setNow] = useState(Date.now());
  const [error, setError] = useState(false);
  const [canceling, setCanceling] = useState(false);
  const cancelLock = useRef(false);
  const cancelTrigger = useRef<HTMLElement | null>(null);
  const heading = useRef<HTMLHeadingElement>(null);
  const [checkedAt, setCheckedAt] = useState<Date | null>(null);
  const epoch = useRef(0);
  const invalidate = useCallback(() => {
    epoch.current++;
  }, []);
  const sortedRows = rows
    ? [...rows].sort(
        (a, b) =>
          urgency(a, now) - urgency(b, now) || Date.parse(a.created_at) - Date.parse(b.created_at),
      )
    : null;
  const urgentCount = rows?.filter((m) => urgency(m, now) === 0).length ?? 0;
  const outcomeCount = rows?.filter((m) => urgency(m, now) === 1).length ?? 0;

  const load = useCallback(async () => {
    const request = ++epoch.current;
    try {
      const fetched = await fetchMeetings(
        meeting || state === "all" ? undefined : (state ?? "active"),
      );
      if (request !== epoch.current) return;
      setRows(meeting ? fetched.filter((row) => row.id === meeting) : fetched);
      setError(false);
      setCheckedAt(new Date());
      setNow(Date.now());
    } catch {
      if (request === epoch.current) setError(true);
    }
  }, [state, meeting]);

  useEffect(() => {
    setRows(null);
    setError(false);
    setCheckedAt(null);
    setOpenId(null);
    void load();
    const tick = () => {
      if (document.visibilityState === "visible") void load();
    };
    const timer = setInterval(tick, 30_000);
    document.addEventListener("visibilitychange", tick);
    return () => {
      invalidate();
      clearInterval(timer);
      document.removeEventListener("visibilitychange", tick);
    };
  }, [load, invalidate]);

  // 기본은 진행 중이다 — 운영자가 손댈 수 있는 건 그것뿐이다.
  useEffect(() => {
    if (state === undefined && !meeting) {
      void navigate({ search: { state: "active" }, replace: true });
    }
  }, [state, meeting, navigate]);

  const selected = rows?.find((item) => item.id === openId);
  return (
    <>
      <header className="mb-5">
        <h1
          ref={heading}
          tabIndex={-1}
          className="text-2xl font-semibold tracking-tight outline-none"
        >
          만남 관리
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">응답 기한과 다음 조치부터 확인하세요.</p>
      </header>
      <AlertDialog
        open={Boolean(selected)}
        onOpenChange={(open) => {
          if (!open && !cancelLock.current) setOpenId(null);
        }}
      >
        <AlertDialogContent
          onCloseAutoFocus={(event) => {
            event.preventDefault();
            if (cancelTrigger.current?.isConnected && cancelTrigger.current.getClientRects().length)
              cancelTrigger.current.focus();
            else heading.current?.focus();
          }}
        >
          <AlertDialogHeader>
            <AlertDialogTitle>만남 취소</AlertDialogTitle>
            <AlertDialogDescription>
              {selected?.male_name ?? "남성 회원"} · {selected?.female_name ?? "여성 회원"}의
              만남입니다. 대상과 티켓 반환 여부를 확인해 주세요.
            </AlertDialogDescription>
          </AlertDialogHeader>
          {selected ? (
            <NoteAction
              key={selected.id}
              placeholder="취소 사유 (필수 — 기록에 남습니다)"
              toggle={{ label: "티켓 반환", defaultOn: true }}
              onDone={() => {
                setOpenId(null);
                void load();
              }}
              actions={[
                {
                  label: "만남 강제 취소",
                  done: "취소했습니다.",
                  variant: "destructive",
                  run: async (note, refund) => {
                    if (cancelLock.current) return;
                    cancelLock.current = true;
                    setCanceling(true);
                    try {
                      await cancelMeeting(selected.id, note, refund);
                    } finally {
                      cancelLock.current = false;
                      setCanceling(false);
                    }
                  },
                },
              ]}
            />
          ) : null}
          <AlertDialogCancel disabled={canceling}>돌아가기</AlertDialogCancel>
        </AlertDialogContent>
      </AlertDialog>
      {!meeting ? <MeetingLifecyclePanel /> : null}
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
        <span>
          {checkedAt
            ? `조회 시각 ${checkedAt.toLocaleTimeString("ko-KR")} · 30초마다 갱신`
            : "만남 목록 확인 중"}
        </span>
        <Button variant="outline" size="sm" onClick={() => void load()}>
          목록 새로고침
        </Button>
      </div>
      {error ? (
        <p role="alert" className="mb-4 text-sm text-destructive">
          만남 목록을 불러오지 못했습니다. 이전 조회 결과일 수 있어요.
        </p>
      ) : null}
      {meeting ? (
        <div className="mb-5 flex items-center justify-between gap-3 rounded-surface border border-border bg-card px-4 py-3 text-sm">
          <span className="font-semibold">문의와 연결된 만남</span>
          <Link
            to="/admin/meetings"
            search={{ state: "active" }}
            className="text-primary-strong underline underline-offset-4"
          >
            전체 보기
          </Link>
        </div>
      ) : null}
      <div className="flex flex-wrap gap-1">
        {FILTERS.map((f) => (
          <button
            key={f.v}
            aria-pressed={(state ?? (meeting ? "all" : "active")) === f.v}
            onClick={() => void navigate({ search: { state: f.v }, replace: true })}
            className={`min-h-11 rounded-full px-3 py-1 text-sm ${
              (state ?? (meeting ? "all" : "active")) === f.v
                ? "bg-selection text-selection-foreground"
                : "bg-muted text-muted-foreground hover:text-foreground"
            }`}
          >
            {f.label}
          </button>
        ))}
      </div>

      {state === "active" && rows ? (
        <div className="mt-5 grid gap-2 sm:grid-cols-2">
          <div className="app-elevated rounded-surface bg-card px-4 py-3 text-sm">
            <span className="font-semibold tabular-nums">{urgentCount}건</span>
            <span className="ml-2 text-muted-foreground">응답 기한 임박·경과</span>
          </div>
          <div className="app-elevated rounded-surface bg-card px-4 py-3 text-sm">
            <span className="font-semibold tabular-nums">{outcomeCount}건</span>
            <span className="ml-2 text-muted-foreground">지난 만남 결과 확인</span>
          </div>
        </div>
      ) : null}

      {rows === null ? (
        error ? null : (
          <p className="mt-6 text-sm text-muted-foreground">불러오는 중…</p>
        )
      ) : rows.length === 0 ? (
        <p className="mt-6 text-sm text-muted-foreground">해당하는 만남이 없습니다.</p>
      ) : (
        <>
          <p className="mt-5 text-sm text-muted-foreground tabular-nums">
            {rows.length}건 · 처리할 일부터
          </p>
          <ul aria-label="만남 목록" className="mt-3 space-y-3 md:hidden">
            {sortedRows?.map((m) => (
              <li key={m.id} className="app-elevated rounded-surface bg-card p-4">
                <div className="flex flex-wrap items-center gap-x-2">
                  <Person id={m.male_id} name={m.male_name} />
                  <span aria-hidden="true" className="text-muted-foreground">
                    ·
                  </span>
                  <Person id={m.female_id} name={m.female_name} />
                </div>
                <div className="mt-1 flex flex-wrap items-center gap-2">
                  <MeetingStatus m={m} />
                  <span
                    className={`text-sm ${urgency(m, now) <= 1 ? "font-semibold text-primary-strong" : "text-muted-foreground"}`}
                  >
                    {nextStep(m, now)}
                  </span>
                </div>
                <dl className="mt-4 space-y-2 text-xs leading-relaxed">
                  <div>
                    <dt className="text-muted-foreground">일정 · 장소</dt>
                    <dd className="mt-1 break-words">
                      {m.scheduled_at
                        ? `${when(m.scheduled_at)} · ${m.place_name ?? "장소 미정"}`
                        : "미확정"}
                    </dd>
                  </div>
                  <div className="flex items-baseline justify-between gap-2">
                    <dt className="text-muted-foreground">티켓</dt>
                    <dd>
                      {m.ticket_state === "used"
                        ? "사용"
                        : m.ticket_state === "refunded"
                          ? "반환"
                          : "미사용"}
                    </dd>
                  </div>
                  <div className="flex items-baseline justify-between gap-2">
                    <dt className="text-muted-foreground">시작</dt>
                    <dd>{when(m.created_at)}</dd>
                  </div>
                </dl>
                {!m.cancelled_at && !m.completed_at ? (
                  <Button
                    variant="outline"
                    size="sm"
                    className="mt-4 w-full"
                    onClick={(event) => {
                      cancelTrigger.current = event.currentTarget;
                      setOpenId(m.id);
                    }}
                  >
                    취소하기
                  </Button>
                ) : m.cancel_reason ? (
                  <p className="mt-3 text-xs text-muted-foreground">{m.cancel_reason}</p>
                ) : null}
              </li>
            ))}
          </ul>
          <div
            role="region"
            aria-label="만남 목록 표"
            tabIndex={0}
            className="app-elevated mt-3 hidden overflow-x-auto rounded-surface bg-card focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none md:block"
          >
            <table className="w-full min-w-[56rem] border-separate border-spacing-0 text-sm">
              <thead>
                <tr className="text-left text-xs text-muted-foreground">
                  <Th>남성</Th>
                  <Th>여성</Th>
                  <Th>상태</Th>
                  <Th>다음 단계</Th>
                  <Th>티켓</Th>
                  <Th>일정 · 장소</Th>
                  <Th>시작</Th>
                  <Th />
                </tr>
              </thead>
              <tbody>
                {sortedRows?.map((m) => (
                  <MeetingRow
                    key={m.id}
                    m={m}
                    onToggle={(trigger) => {
                      cancelTrigger.current = trigger;
                      setOpenId(m.id);
                    }}
                    now={now}
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

function MeetingRow({
  m,
  onToggle,
  now,
}: {
  m: AdminMeeting;
  onToggle: (trigger: HTMLElement) => void;
  now: number;
}) {
  const live = !m.cancelled_at && !m.completed_at;
  return (
    <tr className="group">
      <Td>
        <Person id={m.male_id} name={m.male_name} />
      </Td>
      <Td>
        <Person id={m.female_id} name={m.female_name} />
      </Td>
      <Td>
        <MeetingStatus m={m} />
      </Td>
      <Td
        className={
          urgency(m, now) <= 1 ? "font-semibold text-primary-strong" : "text-muted-foreground"
        }
      >
        {nextStep(m, now)}
      </Td>
      <Td className="text-muted-foreground">
        {m.ticket_state === "used" ? "사용" : m.ticket_state === "refunded" ? "반환" : "미사용"}
      </Td>
      <Td className="text-muted-foreground">
        {m.scheduled_at ? `${when(m.scheduled_at)} · ${m.place_name ?? "장소 미정"}` : "미확정"}
      </Td>
      <Td className="text-muted-foreground tabular-nums">{when(m.created_at)}</Td>
      <Td className="text-right">
        {live ? (
          <Button size="sm" variant="ghost" onClick={(event) => onToggle(event.currentTarget)}>
            취소하기
          </Button>
        ) : m.cancel_reason ? (
          <span className="text-2xs text-muted-foreground">{m.cancel_reason}</span>
        ) : null}
      </Td>
    </tr>
  );
}

function MeetingStatus({ m }: { m: AdminMeeting }) {
  return (
    <Tag
      tone={
        m.cancelled_at || (!m.prefs_submitted_at && !m.confirmed_at && !m.completed_at)
          ? "alert"
          : "muted"
      }
    >
      {m.cancelled_at
        ? "취소"
        : m.completed_at
          ? "완료"
          : m.confirmed_at
            ? "확정"
            : m.prefs_submitted_at
              ? "조율 중"
              : "응답 대기"}
    </Tag>
  );
}

function Person({ id, name }: { id: string; name: string | null }) {
  return (
    <Link
      to="/admin/members/$id"
      params={{ id }}
      className="pressable inline-flex min-h-11 items-center rounded-control font-semibold focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none hover:underline"
    >
      {name ?? "(이름 없음)"}
    </Link>
  );
}

function Th({ children }: { children?: React.ReactNode }) {
  return <th className="border-b border-border px-3 py-2 font-medium">{children}</th>;
}

function Td({ children, className = "" }: { children?: React.ReactNode; className?: string }) {
  return (
    <td className={`border-b border-border px-3 py-2 group-hover:bg-muted/40 ${className}`}>
      {children}
    </td>
  );
}
