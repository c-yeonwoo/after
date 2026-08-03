import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { CalendarCheck, Lock, Send } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  isChannelOpenNow,
  listMessages,
  sendMessage,
  type Meeting,
  type Message,
  type MsgChannel,
} from "@/lib/api";
import { useMe } from "@/lib/me";
import { cn } from "@/lib/utils";

/**
 * 대화 본문 — 탭(`/chats`)과 딥링크(`/chat/$id`) 양쪽이 공유한다.
 *
 * 대화방으로 보이게 만드는 것은 말풍선 모양이 아니라 **프레임과 시간**이다:
 *  - 로그가 아래에 붙어 있고(문서처럼 위에서 시작하지 않는다) 로그만 스크롤된다
 *  - 같은 사람이 이어 보낸 말은 한 덩어리로 묶이고, 덩어리 끝에만 시각이 붙는다
 *  - 날짜가 바뀌면 구분선이 들어간다
 * 이전 구현은 이 셋이 전부 없어서 "문자열 목록"처럼 읽혔다.
 */

const DAY = ["일", "월", "화", "수", "목", "금", "토"];

function dayKey(iso: string) {
  const d = new Date(iso);
  return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
}

function formatDay(iso: string) {
  const d = new Date(iso);
  return `${d.getMonth() + 1}월 ${d.getDate()}일 ${DAY[d.getDay()]}요일`;
}

function formatTime(iso: string) {
  return new Date(iso).toLocaleTimeString("ko-KR", { hour: "numeric", minute: "2-digit" });
}

/** 같은 사람이 5분 안에 이어 보낸 말은 한 덩어리로 본다. */
const GROUP_WINDOW_MS = 5 * 60 * 1000;

type Row =
  | { kind: "day"; key: string; iso: string }
  | { kind: "msg"; key: string; msg: Message; mine: boolean; lastOfGroup: boolean };

function buildRows(messages: Message[], myId: string | undefined): Row[] {
  const rows: Row[] = [];
  messages.forEach((msg, i) => {
    const prev = messages[i - 1];
    const next = messages[i + 1];

    if (!prev || dayKey(prev.created_at) !== dayKey(msg.created_at)) {
      rows.push({ kind: "day", key: `d-${msg.id}`, iso: msg.created_at });
    }

    const sameSenderNext = next && next.sender_id === msg.sender_id;
    const closeNext =
      next &&
      new Date(next.created_at).getTime() - new Date(msg.created_at).getTime() < GROUP_WINDOW_MS;
    const sameDayNext = next && dayKey(next.created_at) === dayKey(msg.created_at);

    rows.push({
      kind: "msg",
      key: msg.id,
      msg,
      mine: msg.sender_id === myId,
      lastOfGroup: !(sameSenderNext && closeNext && sameDayNext),
    });
  });
  return rows;
}

export function Conversation({
  meeting,
  onMeetingChange: _onMeetingChange,
}: {
  meeting: Meeting;
  onMeetingChange?: (m: Meeting) => void;
}) {
  const { me } = useMe();
  const navigate = useNavigate();

  const [channel, setChannel] = useState<MsgChannel>("coord");
  const [messages, setMessages] = useState<Message[]>([]);
  const [text, setText] = useState("");
  const logRef = useRef<HTMLDivElement>(null);

  const channelOpen = isChannelOpenNow(meeting, channel);
  const privateOpen = isChannelOpenNow(meeting, "private");
  const rows = useMemo(() => buildRows(messages, me?.id), [messages, me?.id]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const list = await listMessages(meeting.id, channel);
      if (!cancelled) setMessages(list);
    })();
    return () => {
      cancelled = true;
    };
  }, [meeting.id, channel]);

  // 새 메시지가 오면 로그 맨 아래로. 페이지가 아니라 로그만 움직인다.
  useEffect(() => {
    const el = logRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [rows.length, channel]);

  async function send(value: string) {
    const t = value.trim();
    if (!t || !channelOpen) return;
    try {
      const created = await sendMessage(meeting.id, channel, t);
      setMessages((prev) => [...prev, created]);
      setText("");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "전송에 실패했습니다.");
    }
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      {/* 약속 요약 — 대화 중 계속 보여야 하는 맥락이라 위에 고정한다 */}
      {meeting.confirmed_at && meeting.scheduled_at ? (
        <div className="flex shrink-0 items-center gap-2 rounded-surface bg-primary/10 px-3.5 py-2.5">
          <CalendarCheck className="size-4 shrink-0 text-primary-strong" aria-hidden="true" />
          <p className="min-w-0 truncate text-xs text-foreground">
            <span className="font-semibold">
              {new Date(meeting.scheduled_at).toLocaleDateString("ko-KR", {
                month: "long",
                day: "numeric",
                weekday: "short",
              })}
            </span>
            {meeting.place_name ? ` · ${meeting.place_name}` : ""}
          </p>
        </div>
      ) : null}

      {privateOpen ? (
        <div className="mt-3 flex shrink-0 gap-1.5" role="tablist" aria-label="대화 채널">
          {(
            [
              { id: "coord", label: "약속 이야기" },
              { id: "private", label: "사적인 대화" },
            ] as const
          ).map((c) => (
            <button
              key={c.id}
              type="button"
              role="tab"
              aria-selected={channel === c.id}
              onClick={() => setChannel(c.id)}
              className={cn(
                "min-h-11 rounded-control border px-3.5 text-xs font-medium transition-colors",
                "focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none",
                channel === c.id
                  ? "border-primary bg-primary/10 text-primary-strong"
                  : "border-border",
              )}
            >
              {c.label}
            </button>
          ))}
        </div>
      ) : null}

      {/* 로그 — 아래에 붙어 있고 여기만 스크롤된다 */}
      <div ref={logRef} className="-mx-1 min-h-0 flex-1 overflow-y-auto px-1 pt-4">
        <div className="flex min-h-full flex-col justify-end gap-1">
          {rows.length === 0 ? (
            <p className="mb-2 text-center text-xs leading-relaxed text-muted-foreground">
              {channelOpen ? "먼저 인사를 건네 보세요." : "아직 열리지 않은 대화입니다."}
            </p>
          ) : null}

          {rows.map((row) =>
            row.kind === "day" ? (
              <p
                key={row.key}
                className="my-3 text-center text-3xs font-semibold tracking-[0.1em] text-muted-foreground"
              >
                {formatDay(row.iso)}
              </p>
            ) : (
              <div
                key={row.key}
                className={cn(
                  "flex items-end gap-1.5",
                  row.mine ? "justify-end" : "justify-start",
                  row.lastOfGroup ? "mb-2" : "mb-0.5",
                )}
              >
                {row.mine && row.lastOfGroup ? (
                  <time
                    dateTime={row.msg.created_at}
                    className="mb-0.5 shrink-0 text-3xs text-muted-foreground"
                  >
                    {formatTime(row.msg.created_at)}
                  </time>
                ) : null}
                <span
                  className={cn(
                    "max-w-[76%] px-3.5 py-2.5 text-sm leading-relaxed whitespace-pre-wrap",
                    row.mine
                      ? "rounded-2xl bg-bubble-mine text-bubble-mine-foreground"
                      : "rounded-2xl bg-card text-foreground shadow-sm",
                    // 덩어리의 마지막만 꼬리를 뾰족하게 — 이어진 말은 둥글게 둔다
                    row.lastOfGroup && (row.mine ? "rounded-br-sm" : "rounded-bl-sm"),
                  )}
                >
                  {row.msg.body}
                </span>
                {!row.mine && row.lastOfGroup ? (
                  <time
                    dateTime={row.msg.created_at}
                    className="mb-0.5 shrink-0 text-3xs text-muted-foreground"
                  >
                    {formatTime(row.msg.created_at)}
                  </time>
                ) : null}
              </div>
            ),
          )}

          {meeting.confirmed_at ? (
            <button
              type="button"
              onClick={() => navigate({ to: "/feedback", search: { meetingId: meeting.id } })}
              className="mt-6 mb-1 min-h-11 w-full text-xs text-muted-foreground underline underline-offset-4"
            >
              만남 후 피드백 남기기
            </button>
          ) : null}
        </div>
      </div>

      {/* 입력 — fixed 가 아니라 플렉스 흐름의 마지막. 탭바 계산이 필요 없다. */}
      <form
        className="flex shrink-0 items-center gap-2 pt-3 pb-2"
        onSubmit={(e) => {
          e.preventDefault();
          send(text);
        }}
      >
        <label className="sr-only" htmlFor="msg">
          메시지
        </label>
        {channelOpen ? null : (
          <Lock className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
        )}
        <Input
          id="msg"
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder={channelOpen ? "메시지 입력" : "아직 열리지 않은 대화입니다"}
          disabled={!channelOpen}
          autoComplete="off"
          className="rounded-control"
        />
        <Button
          type="submit"
          size="icon"
          className="size-11 shrink-0"
          disabled={!text.trim() || !channelOpen}
          aria-label="보내기"
        >
          <Send className="size-4" aria-hidden="true" />
        </Button>
      </form>
    </div>
  );
}
