import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { ArrowLeft, CalendarCheck, Send } from "lucide-react";
import { toast } from "sonner";

import { AppScreen } from "@/components/app/AppScreen";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { BRAND } from "@/lib/brand";
import { getCandidate } from "@/lib/candidates";
import { saveFlow, useFlow } from "@/lib/store";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/chat/$id")({
  head: () => ({
    meta: [
      { title: `대화방 — ${BRAND.name}` },
      { name: "description", content: "약속을 잡기 위한 1:1 대화와 만남 확정." },
      { property: "og:title", content: `대화방 — ${BRAND.name}` },
      { property: "og:description", content: "날짜를 정하면 만남이 확정됩니다." },
    ],
  }),
  component: ChatRoom,
});

const SUGGESTIONS = ["이번 주 목요일 저녁 어때요?", "역삼역 근처면 편해요", "저녁 7시 반이면 괜찮아요"];

function ChatRoom() {
  const { id } = Route.useParams();
  const { flow } = useFlow();
  const navigate = useNavigate();
  const candidate = getCandidate(id);
  const [text, setText] = useState("");
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ block: "end" });
  }, [flow.messages.length]);

  if (!candidate) {
    return (
      <AppScreen title="대화" hideTabs>
        <p className="mt-16 text-center text-sm text-muted-foreground">대화를 찾을 수 없습니다.</p>
      </AppScreen>
    );
  }

  function send(value: string) {
    const t = value.trim();
    if (!t) return;
    const mine = { id: crypto.randomUUID(), from: "me" as const, text: t, at: new Date().toISOString() };
    saveFlow({ messages: [...flow.messages, mine] });
    setText("");
  }

  const meetupDate = flow.meetupAt ? new Date(flow.meetupAt) : null;

  return (
    <AppScreen
      title={`${candidate.name} · ${candidate.job}`}
      hideTabs
      action={
        <Link
          to="/chats"
          aria-label="대화 목록으로"
          className="inline-flex size-9 items-center justify-center rounded-full border border-border focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
        >
          <ArrowLeft className="size-4" aria-hidden="true" />
        </Link>
      }
    >
      <div className="pb-32">
        {/* 만남 카드 */}
        <MeetPlanner area={candidate.area} />

        <p className="mt-6 text-center text-xs text-muted-foreground">
          이번 만남에서 나누고 싶은 이야기: {candidate.topics.join(" · ")}
        </p>

        {/* 메시지 */}
        <ul className="mt-5 space-y-2.5">
          {flow.messages.length === 0 ? (
            <li className="rounded-xl bg-muted/60 px-4 py-3 text-center text-xs leading-relaxed text-muted-foreground">
              대화가 열렸습니다. 약속을 잡는 데 필요한 만큼만 편하게 이야기해 보세요.
            </li>
          ) : null}
          {flow.messages.map((m) => (
            <li key={m.id} className={cn("flex", m.from === "me" ? "justify-end" : "justify-start")}>
              <span
                className={cn(
                  "max-w-[78%] rounded-2xl px-4 py-2.5 text-sm leading-relaxed",
                  m.from === "me"
                    ? "rounded-br-md bg-primary text-primary-foreground"
                    : "rounded-bl-md bg-muted text-foreground",
                )}
              >
                {m.text}
              </span>
            </li>
          ))}
        </ul>
        <div ref={endRef} />

        {flow.meetupAt ? (
          <button
            type="button"
            onClick={() => navigate({ to: "/feedback" })}
            className="mt-8 w-full py-2 text-xs text-muted-foreground underline underline-offset-4"
          >
            만남 후 피드백 남기기
          </button>
        ) : null}
      </div>

      {/* 입력 */}
      <div
        className="fixed inset-x-0 bottom-0 z-30 mx-auto w-full max-w-[430px] border-t border-border/70 bg-background/95 px-4 pt-3 backdrop-blur-xl"
        style={{ paddingBottom: "calc(env(safe-area-inset-bottom, 0px) + 0.75rem)" }}
      >
        {flow.messages.length === 0 ? (
          <div className="mb-2 flex gap-1.5 overflow-x-auto pb-1">
            {SUGGESTIONS.map((s) => (
              <button
                key={s}
                type="button"
                onClick={() => send(s)}
                className="shrink-0 rounded-full border border-border bg-card px-3 py-1.5 text-xs text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
              >
                {s}
              </button>
            ))}
          </div>
        ) : null}
        <form
          className="flex items-center gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            send(text);
          }}
        >
          <label className="sr-only" htmlFor="msg">
            메시지
          </label>
          <Input
            id="msg"
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="메시지 입력"
            autoComplete="off"
          />
          <Button type="submit" size="icon" className="size-11 shrink-0" disabled={!text.trim()} aria-label="보내기">
            <Send className="size-4" aria-hidden="true" />
          </Button>
        </form>
      </div>
    </AppScreen>
  );
}
