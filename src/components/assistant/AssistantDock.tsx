import { useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { ArrowUp } from "lucide-react";
import { AssistantMark } from "./AssistantMark";
import { AssistantActions } from "./AssistantActions";
import { assistantIntent, type AssistantIntent } from "@/lib/assistant";
import { assistantReply } from "@/lib/assistantExperience";
import { privateAssistantSafety } from "../../../supabase/functions/_shared/assistant-private";
import { getAssistantFlags } from "@/lib/privateAssistant";
import { useMemberLiveQuery } from "@/lib/useMemberLiveQuery";
import { useMe } from "@/lib/me";
import { setAssistantDraft } from "@/lib/assistantDraft";

export function AssistantDock({
  status,
  counterpartId,
  state,
}: {
  status: string;
  counterpartId?: string | null;
  state?: string;
}) {
  const { me } = useMe();
  const navigate = useNavigate();
  const flags = useMemberLiveQuery("assistant-capabilities", me?.id, getAssistantFlags);
  const [input, setInput] = useState("");
  const [intent, setIntent] = useState<AssistantIntent | null>(null);
  const [safety, setSafety] = useState<string | null>(null);
  const awaitingCapabilities = flags.isPending && assistantIntent(input.trim()) === "unknown";
  const reply = intent
    ? assistantReply(intent, {
        gender: me?.gender ?? null,
        complete: Boolean(me && me.onboarding_step >= 7),
        status,
        state,
        counterpartId,
        schedule: Boolean(flags.data?.schedule && !flags.isError && !flags.isPaused),
        memory: Boolean(flags.data?.memory && !flags.isError && !flags.isPaused),
      })
    : null;
  return (
    <section className="assistant-dock" aria-label="비서에게 물어보기">
      <div className="flex items-center gap-2.5">
        <AssistantMark />
        <div>
          <h2 className="text-sm font-semibold">애프터 AI</h2>
          <p className="mt-0.5 text-xs text-muted-foreground">무엇을 도와드릴까요?</p>
        </div>
      </div>
      <div className="mt-4 flex flex-wrap gap-2" aria-label="빠른 도움">
        {(
          [
            ["status", "지금 내 상태"],
            ["intro", "소개 확인"],
            ["profile", "내 프로필"],
            ["prepare", "대화 팁"],
            ["schedule", "일정 정리"],
          ] as const
        ).map(([key, label]) => (
          <button
            key={key}
            className="assistant-suggestion pressable"
            aria-pressed={intent === key}
            onClick={() => {
              setSafety(null);
              setIntent(key);
            }}
          >
            {label}
          </button>
        ))}
      </div>
      {safety || reply ? (
        <div className="assistant-reply mt-4" role="status">
          <p className="text-sm leading-relaxed">{safety ?? reply?.text}</p>
          {!safety && reply ? (
            <AssistantActions actions={reply.actions} counterpartId={counterpartId} />
          ) : null}
        </div>
      ) : null}
      <form
        className="assistant-composer mt-4 flex items-center gap-2"
        aria-busy={awaitingCapabilities}
        onSubmit={(event) => {
          event.preventDefault();
          const text = input.trim();
          if (text) {
            // Harm/privacy checks precede navigation. Transaction requests still
            // lead to explicit structured confirmation, never an automatic write.
            const refusal = privateAssistantSafety(text, { execution: false });
            if (refusal) {
              setSafety(refusal);
              setIntent(null);
              setInput("");
              return;
            }
            const next = assistantIntent(text);
            if (next === "unknown" && flags.isPending) return;
            if (next === "unknown" && me && flags.data?.chat && !flags.isError && !flags.isPaused) {
              setAssistantDraft(me.id, text);
              void navigate({ to: "/assistant", search: { panel: "chat" } });
            } else {
              setSafety(null);
              setIntent(next);
            }
            setInput("");
          }
        }}
      >
        <input
          aria-label="비서에게 물어볼 내용"
          placeholder="비서에게 말해보세요"
          value={input}
          maxLength={300}
          enterKeyHint="send"
          onChange={(event) => setInput(event.target.value)}
          className="min-w-0 flex-1 rounded-control bg-transparent px-3 py-2 text-base outline-none focus-visible:ring-2 focus-visible:ring-ring"
        />
        <button
          type="submit"
          disabled={!input.trim() || awaitingCapabilities}
          aria-label="비서에게 질문하기"
          className="pressable flex size-11 shrink-0 items-center justify-center rounded-control bg-selection text-selection-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none disabled:bg-muted disabled:text-muted-foreground"
        >
          <ArrowUp className="size-5" />
        </button>
      </form>
      <p className="mt-2 text-center text-xs text-muted-foreground">비서에게만 보여요</p>
    </section>
  );
}
