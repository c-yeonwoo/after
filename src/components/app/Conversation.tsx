import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { Lock, Send } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { MeetingCheckin } from "@/components/app/MeetingCheckin";
import { MeetingChange } from "@/components/app/MeetingChange";
import { MeetingSummary } from "@/components/app/MeetingSummary";
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
  onMeetingChange,
}: {
  meeting: Meeting;
  onMeetingChange?: (m: Meeting) => void;
}) {
  const { me } = useMe();
  const navigate = useNavigate();

  const [channel, setChannel] = useState<MsgChannel>("coord");
  const [messages, setMessages] = useState<Message[]>([]);
  const [text, setText] = useState("");
  const [now, setNow] = useState<number | null>(null);
  const logRef = useRef<HTMLDivElement>(null);
  const bottom = useRef(true);
  const mutation = useRef(0);
  const sendingRef = useRef(false);
  const sentMessageId = useRef<string | null>(null);
  const context = useRef("");
  const [sending, setSending] = useState(false);
  const [chatError, setChatError] = useState(false);
  const [chatLoading, setChatLoading] = useState(true);
  const [chatRetry, setChatRetry] = useState(0);
  const [newBelow, setNewBelow] = useState(false);

  const channelOpen = isChannelOpenNow(meeting, channel);
  const privateOpen = isChannelOpenNow(meeting, "private");
  const rows = useMemo(() => buildRows(messages, me?.id), [messages, me?.id]);
  const lastMessageId = messages.at(-1)?.id;
  useEffect(() => {
    setNow(Date.now());
    const timer = setInterval(() => setNow(Date.now()), 60_000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    let cancelled = false;
    let loading = false;
    const key = `${meeting.id}:${channel}`;
    if (context.current !== key) {
      context.current = key;
      sentMessageId.current = null;
      setMessages([]);
      setChatLoading(true);
      setNewBelow(false);
      bottom.current = true;
    }
    async function load() {
      if (loading) return;
      loading = true;
      const started = mutation.current;
      try {
        const list = await listMessages(meeting.id, channel);
        if (!cancelled && started === mutation.current) {
          setMessages(list);
          setChatError(false);
        }
      } catch {
        if (!cancelled) setChatError(true);
      } finally {
        loading = false;
        if (!cancelled) setChatLoading(false);
      }
    }
    void load();
    const visible = () => {
      if (document.visibilityState === "visible") void load();
    };
    const timer = setInterval(visible, 3000);
    document.addEventListener("visibilitychange", visible);
    return () => {
      cancelled = true;
      clearInterval(timer);
      document.removeEventListener("visibilitychange", visible);
    };
  }, [meeting.id, channel, chatRetry]);

  // 새 메시지가 오면 로그 맨 아래로. 페이지가 아니라 로그만 움직인다.
  useEffect(() => {
    const el = logRef.current;
    if (el && bottom.current) {
      el.scrollTop = el.scrollHeight;
      setNewBelow(false);
    } else if (el) setNewBelow(true);
  }, [rows.length, lastMessageId, channel]);

  async function send(value: string) {
    const t = value.trim();
    if (!t || !channelOpen || sendingRef.current) return;
    sendingRef.current = true;
    setSending(true);
    mutation.current++;
    const target = context.current;
    try {
      const created = await sendMessage(meeting.id, channel, t);
      mutation.current++;
      if (target === context.current) {
        bottom.current = true;
        sentMessageId.current = created.id;
        setMessages((prev) => (prev.some((m) => m.id === created.id) ? prev : [...prev, created]));
        setText((current) => (current.trim() === t ? "" : current));
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "전송에 실패했습니다.");
    } finally {
      sendingRef.current = false;
      setSending(false);
    }
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      {/* 약속 요약 — 대화 중 계속 보여야 하는 맥락이라 위에 고정한다 */}
      {meeting.confirmed_at ? (
        <section
          aria-label="약속 정보와 참석 확인"
          tabIndex={0}
          className="app-elevated max-h-[50%] min-h-0 overflow-y-auto overscroll-contain rounded-surface bg-card focus-visible:outline-2 focus-visible:outline-ring"
        >
          {meeting.scheduled_at ? (
            <div className="bg-selection px-4 py-4 text-selection-foreground">
              <MeetingSummary scheduledAt={meeting.scheduled_at} placeName={meeting.place_name} />
            </div>
          ) : null}
          <div className="px-4 py-3">
            <MeetingCheckin key={meeting.scheduled_at} meetingId={meeting.id} embedded />
            <MeetingChange meeting={meeting} onChange={onMeetingChange} />
          </div>
        </section>
      ) : null}
      {privateOpen ? (
        <div
          className="mt-3 flex shrink-0 gap-1 rounded-control bg-muted p-1"
          role="tablist"
          aria-label="대화 채널"
        >
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
                "pressable min-h-11 flex-1 rounded-control px-3.5 text-sm font-medium",
                "focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none",
                channel === c.id
                  ? "bg-selection text-selection-foreground"
                  : "text-muted-foreground",
              )}
            >
              {c.label}
            </button>
          ))}
        </div>
      ) : null}

      {/* 로그 — 아래에 붙어 있고 여기만 스크롤된다 */}
      {chatError ? (
        <p role="alert" className="mt-2 shrink-0 text-xs text-destructive">
          대화를 새로 불러오지 못했어요.{" "}
          <Button variant="ghost" size="sm" onClick={() => setChatRetry((v) => v + 1)}>
            대화 다시 불러오기
          </Button>
        </p>
      ) : null}
      {messages.length === 1000 ? (
        <p className="mt-1 shrink-0 text-xs text-muted-foreground">
          최근 메시지 1,000개를 표시하고 있어요.
        </p>
      ) : null}
      <div
        ref={logRef}
        role="log"
        aria-label="대화 내용"
        aria-live="off"
        tabIndex={0}
        onScroll={() => {
          const el = logRef.current;
          if (el) {
            bottom.current = el.scrollHeight - el.clientHeight - el.scrollTop < 64;
            if (bottom.current) setNewBelow(false);
          }
        }}
        className="-mx-1 min-h-20 flex-1 overflow-y-auto overscroll-contain px-1 pt-4 focus-visible:outline-2 focus-visible:outline-ring"
      >
        <div className="flex min-h-full flex-col justify-end gap-1">
          {rows.length === 0 ? (
            <p className="mb-2 text-center text-xs leading-relaxed text-muted-foreground">
              {chatLoading
                ? "대화를 불러오고 있어요…"
                : chatError
                  ? "연결을 다시 확인해 주세요."
                  : channelOpen
                    ? "먼저 인사를 건네 보세요."
                    : "아직 열리지 않은 대화입니다."}
            </p>
          ) : null}

          {rows.map((row) =>
            row.kind === "day" ? (
              <p
                key={row.key}
                className="my-3 self-center rounded-control bg-muted px-3 py-1 text-2xs font-medium text-muted-foreground"
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
                  // 대화 내용은 베껴 쓸 수 있어야 한다 — 장소·시간이 여기서 오간다.
                  data-selectable
                  data-sent={row.msg.id === sentMessageId.current ? "true" : undefined}
                  className={cn(
                    "chat-message min-w-0 max-w-[76%] px-4 py-3 text-base leading-relaxed whitespace-pre-wrap [overflow-wrap:anywhere]",
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

          {meeting.confirmed_at &&
          meeting.scheduled_at &&
          !meeting.cancelled_at &&
          now !== null &&
          Date.parse(meeting.scheduled_at) <= now ? (
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

      {newBelow ? (
        <Button
          className="mt-1 shrink-0"
          size="sm"
          variant="outline"
          onClick={() => {
            bottom.current = true;
            if (logRef.current) logRef.current.scrollTop = logRef.current.scrollHeight;
            setNewBelow(false);
          }}
        >
          최근 메시지 보기
        </Button>
      ) : null}
      {/* 입력 — fixed 가 아니라 플렉스 흐름의 마지막. 탭바 계산이 필요 없다. */}
      <form
        className="chat-composer mt-3 mb-2 flex shrink-0 items-center gap-2 rounded-surface bg-card p-2"
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
          maxLength={2000}
          enterKeyHint="send"
          className="min-w-0 rounded-control border-0 bg-transparent shadow-none focus-visible:ring-inset"
        />
        <Button
          type="submit"
          size="icon"
          className="size-11 shrink-0"
          disabled={!text.trim() || !channelOpen || sending}
          aria-label="보내기"
        >
          <Send className="size-4" aria-hidden="true" />
        </Button>
      </form>
    </div>
  );
}
