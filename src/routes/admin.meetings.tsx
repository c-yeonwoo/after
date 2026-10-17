import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useCallback, useEffect, useRef, useState } from "react";

import { NoteAction } from "@/components/admin/NoteAction";
import { MeetingLifecyclePanel } from "@/components/admin/MeetingLifecyclePanel";
import { Button } from "@/components/ui/button";
import { Tag } from "@/components/admin/ui";
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

  return (
    <>
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
                ? "bg-primary text-primary-foreground"
                : "bg-muted text-muted-foreground hover:text-foreground"
            }`}
          >
            {f.label}
          </button>
        ))}
      </div>

      {state === "active" && rows ? (
        <div className="mt-5 grid gap-2 sm:grid-cols-2">
          <div className="rounded-surface border border-border bg-card px-4 py-3 text-sm">
            <span className="font-semibold tabular-nums">{urgentCount}건</span>
            <span className="ml-2 text-muted-foreground">응답 기한 임박·경과</span>
          </div>
          <div className="rounded-surface border border-border bg-card px-4 py-3 text-sm">
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
          <div className="mt-2 overflow-x-auto">
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
                    open={openId === m.id}
                    onToggle={() => setOpenId(openId === m.id ? null : m.id)}
                    onDone={load}
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
  open,
  onToggle,
  onDone,
  now,
}: {
  m: AdminMeeting;
  open: boolean;
  onToggle: () => void;
  onDone: () => void;
  now: number;
}) {
  const live = !m.cancelled_at && !m.completed_at;

  return (
    <>
      <tr className="group">
        <Td>
          <Person id={m.male_id} name={m.male_name} />
        </Td>
        <Td>
          <Person id={m.female_id} name={m.female_name} />
        </Td>
        <Td>
          {m.cancelled_at ? (
            <Tag tone="alert">취소</Tag>
          ) : m.completed_at ? (
            <Tag tone="muted">완료</Tag>
          ) : m.confirmed_at ? (
            <Tag tone="muted">확정</Tag>
          ) : m.prefs_submitted_at ? (
            <Tag tone="muted">조율 중</Tag>
          ) : (
            // 티켓을 쓴 뒤 상대 응답이 없는 상태. 24시간 지나면 크론이 자동 환불한다.
            <Tag tone="alert">응답 대기</Tag>
          )}
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
            <button
              onClick={onToggle}
              className="text-xs text-muted-foreground underline-offset-2 hover:text-foreground hover:underline"
            >
              {open ? "닫기" : "취소하기"}
            </button>
          ) : m.cancel_reason ? (
            <span className="text-2xs text-muted-foreground">{m.cancel_reason}</span>
          ) : null}
        </Td>
      </tr>
      {open ? (
        <tr>
          <td colSpan={8} className="border-b border-border bg-muted/30 px-3 py-3">
            {/*
              환불 여부를 운영자가 고른다. 취소 사유가 "장소 착오" 인지 "한쪽
              잘못" 인지는 사람만 아는 정보라 서버가 정할 수 없다. 기본은 환불 —
              운영자가 끼어들어 끊는 상황에서 돈을 쥐고 있는 편이 기본값이면 안 된다.

              이미 환불된 티켓이면 서버가 환불 단계를 건너뛴다(중복 환불 없음).
            */}
            <NoteAction
              placeholder="취소 사유 (필수 — 기록에 남습니다)"
              toggle={{ label: "티켓 반환", defaultOn: true }}
              onDone={onDone}
              actions={[
                {
                  label: "만남 강제 취소",
                  done: "취소했습니다.",
                  variant: "destructive",
                  run: (note, refund) => cancelMeeting(m.id, note, refund),
                },
              ]}
            />
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

function Td({ children, className = "" }: { children?: React.ReactNode; className?: string }) {
  return (
    <td className={`border-b border-border px-3 py-2 group-hover:bg-muted/40 ${className}`}>
      {children}
    </td>
  );
}
