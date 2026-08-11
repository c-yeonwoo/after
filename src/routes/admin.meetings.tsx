import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useCallback, useEffect, useState } from "react";

import { NoteAction } from "@/components/admin/NoteAction";
import { Tag } from "@/components/admin/ui";
import { cancelMeeting, fetchMeetings, type AdminMeeting, type MeetingFilter } from "@/lib/admin";

const STATES: MeetingFilter[] = ["active", "confirmed", "completed", "cancelled"];

export const Route = createFileRoute("/admin/meetings")({
  validateSearch: (s: Record<string, unknown>): { state?: MeetingFilter } => ({
    state: STATES.includes(s.state as MeetingFilter) ? (s.state as MeetingFilter) : undefined,
  }),
  component: MeetingsTab,
});

const DATE = new Intl.DateTimeFormat("ko-KR", { dateStyle: "short", timeStyle: "short" });
const when = (s: string | null) => (s ? DATE.format(new Date(s)) : "—");

const FILTERS: { v: MeetingFilter | ""; label: string }[] = [
  { v: "active", label: "진행 중" },
  { v: "confirmed", label: "확정" },
  { v: "completed", label: "완료" },
  { v: "cancelled", label: "취소" },
  { v: "", label: "전체" },
];

function MeetingsTab() {
  const { state } = Route.useSearch();
  const navigate = useNavigate({ from: Route.fullPath });
  const [rows, setRows] = useState<AdminMeeting[] | null>(null);
  /*
    한 번에 한 건만 펼친다. 목록에 취소 폼을 전부 펼쳐 두면 화면이 폼으로 덮여
    "지금 몇 건이 돌고 있나" 를 볼 수 없고, 실수로 옆 건을 취소할 여지도 커진다.
  */
  const [openId, setOpenId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setRows(await fetchMeetings(state));
    setOpenId(null);
  }, [state]);

  useEffect(() => {
    void load();
  }, [load]);

  // 기본은 진행 중이다 — 운영자가 손댈 수 있는 건 그것뿐이다.
  useEffect(() => {
    if (state === undefined) {
      void navigate({ search: { state: "active" }, replace: true });
    }
  }, [state, navigate]);

  return (
    <>
      <div className="flex flex-wrap gap-1">
        {FILTERS.map((f) => (
          <button
            key={f.v}
            onClick={() => void navigate({ search: { state: f.v || undefined }, replace: true })}
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
        <p className="mt-6 text-sm text-muted-foreground">해당하는 만남이 없습니다.</p>
      ) : (
        <>
          <p className="mt-5 text-sm text-muted-foreground tabular-nums">{rows.length}건</p>
          <div className="mt-2 overflow-x-auto">
            <table className="w-full min-w-[56rem] border-separate border-spacing-0 text-sm">
              <thead>
                <tr className="text-left text-xs text-muted-foreground">
                  <Th>남성</Th>
                  <Th>여성</Th>
                  <Th>상태</Th>
                  <Th>티켓</Th>
                  <Th>일정 · 장소</Th>
                  <Th>시작</Th>
                  <Th />
                </tr>
              </thead>
              <tbody>
                {rows.map((m) => (
                  <MeetingRow
                    key={m.id}
                    m={m}
                    open={openId === m.id}
                    onToggle={() => setOpenId(openId === m.id ? null : m.id)}
                    onDone={load}
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
}: {
  m: AdminMeeting;
  open: boolean;
  onToggle: () => void;
  onDone: () => void;
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
        <Td className="text-muted-foreground">
          {m.ticket_state === "used" ? "사용" : m.ticket_state === "refunded" ? "환불" : "미사용"}
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
          <td colSpan={7} className="border-b border-border bg-muted/30 px-3 py-3">
            {/*
              환불 여부를 운영자가 고른다. 취소 사유가 "장소 착오" 인지 "한쪽
              잘못" 인지는 사람만 아는 정보라 서버가 정할 수 없다. 기본은 환불 —
              운영자가 끼어들어 끊는 상황에서 돈을 쥐고 있는 편이 기본값이면 안 된다.

              이미 환불된 티켓이면 서버가 환불 단계를 건너뛴다(중복 환불 없음).
            */}
            <NoteAction
              placeholder="취소 사유 (필수 — 기록에 남습니다)"
              toggle={{ label: "티켓 환불", defaultOn: true }}
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
