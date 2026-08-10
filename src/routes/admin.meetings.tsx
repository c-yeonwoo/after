import { createFileRoute, Link } from "@tanstack/react-router";
import { useCallback, useEffect, useState } from "react";

import { NoteAction } from "@/components/admin/NoteAction";
import { Tag } from "@/components/admin/ui";
import { cancelMeeting, fetchMeetings, type AdminMeeting, type MeetingFilter } from "@/lib/admin";

export const Route = createFileRoute("/admin/meetings")({ component: MeetingsTab });

const DATE = new Intl.DateTimeFormat("ko-KR", { dateStyle: "medium", timeStyle: "short" });
const when = (s: string | null) => (s ? DATE.format(new Date(s)) : "—");

const FILTERS: { v: MeetingFilter | ""; label: string }[] = [
  { v: "active", label: "진행 중" },
  { v: "confirmed", label: "확정" },
  { v: "completed", label: "완료" },
  { v: "cancelled", label: "취소" },
  { v: "", label: "전체" },
];

function MeetingsTab() {
  // 기본은 진행 중이다 — 운영자가 손댈 수 있는 건 그것뿐이다.
  const [filter, setFilter] = useState<MeetingFilter | "">("active");
  const [rows, setRows] = useState<AdminMeeting[] | null>(null);

  const load = useCallback(async () => {
    setRows(await fetchMeetings(filter || undefined));
  }, [filter]);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <>
      <div className="flex flex-wrap gap-1">
        {FILTERS.map((f) => (
          <button
            key={f.v}
            onClick={() => setFilter(f.v)}
            className={`rounded-full px-3 py-1 text-sm transition-colors ${
              filter === f.v
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
        <ul className="mt-6 space-y-3">
          {rows.map((m) => (
            <MeetingCard key={m.id} m={m} onDone={load} />
          ))}
        </ul>
      )}
    </>
  );
}

function MeetingCard({ m, onDone }: { m: AdminMeeting; onDone: () => void }) {
  const live = !m.cancelled_at && !m.completed_at;

  return (
    <li className="rounded-surface border border-border p-4">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm">
        <Link
          to="/admin/members/$id"
          params={{ id: m.male_id }}
          className="font-semibold underline-offset-2 hover:underline"
        >
          {m.male_name}
        </Link>
        <span className="text-muted-foreground">↔</span>
        <Link
          to="/admin/members/$id"
          params={{ id: m.female_id }}
          className="font-semibold underline-offset-2 hover:underline"
        >
          {m.female_name}
        </Link>
        {m.cancelled_at ? (
          <Tag tone="alert">취소 · {m.cancel_reason ?? "사유 없음"}</Tag>
        ) : m.completed_at ? (
          <Tag tone="muted">완료</Tag>
        ) : m.confirmed_at ? (
          <Tag tone="muted">확정</Tag>
        ) : m.prefs_submitted_at ? (
          <Tag tone="muted">조율 중</Tag>
        ) : (
          <Tag tone="alert">상대 응답 대기</Tag>
        )}
        <Tag tone={m.ticket_state === "refunded" ? "alert" : "muted"}>
          티켓{" "}
          {m.ticket_state === "used" ? "사용" : m.ticket_state === "refunded" ? "환불" : "미사용"}
        </Tag>
      </div>

      <p className="mt-2 text-sm text-muted-foreground">
        {m.scheduled_at
          ? `${when(m.scheduled_at)} · ${m.place_name ?? "장소 미정"}`
          : "일정 미확정"}
        {" · "}시작 {when(m.created_at)}
      </p>

      {/*
        환불 여부를 운영자가 고른다. 취소 사유가 "장소 착오" 인지 "한쪽 잘못"
        인지는 사람만 아는 정보라 서버가 정할 수 없다. 기본은 환불 — 운영자가
        끼어들어 끊는 상황에서 돈을 쥐고 있는 편이 기본값이면 안 된다.

        이미 환불된 티켓이면 서버가 환불 단계를 건너뛴다(중복 환불 없음).
      */}
      {live ? (
        <NoteAction
          placeholder="취소 사유 (필수 — 양쪽에 남습니다)"
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
      ) : null}
    </li>
  );
}
