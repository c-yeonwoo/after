import { useRef, useState, type ComponentProps } from "react";
import { AssistantConversation } from "./AssistantConversation";
import { useNavigate } from "@tanstack/react-router";
import { ArrowUp } from "lucide-react";
import { AssistantMark } from "./AssistantMark";
import { AssistantActions } from "./AssistantActions";
import { assistantIntent, type AssistantIntent } from "@/lib/assistant";
import { assistantReply } from "@/lib/assistantExperience";
import { privateAssistantSafety } from "../../../supabase/functions/_shared/assistant-private";
import { useAssistantFlags } from "@/lib/useAssistantFlags";
import { useMe } from "@/lib/me";
import { setAssistantDraft } from "@/lib/assistantDraft";
import { AssistantPrompts } from "./AssistantPrompts";

export function AssistantDock(props: Omit<ComponentProps<typeof LegacyAssistantDock>, "flags">) {
  const { me } = useMe();
  const flags = useAssistantFlags(me?.id);
  if (!flags.data && me && me.onboarding_step >= 7) {
    return (
      <div className="py-4 text-sm text-muted-foreground" role="status">
        {flags.isError || flags.isPaused ? "대화를 불러오지 못했어요." : "대화를 불러오고 있어요…"}
        {flags.isError || flags.isPaused ? (
          <button
            type="button"
            className="ml-2 min-h-11 font-semibold text-primary-strong"
            onClick={() => void flags.refetch()}
          >
            다시 확인
          </button>
        ) : null}
      </div>
    );
  }
  // Keep the conversation mounted through a transient capability read failure.
  // Its own RPC enforces live consent/flags before any send.
  if (me && me.onboarding_step >= 7 && flags.data?.chat) {
    return <AssistantConversation key={me.id} owner={me.id} compact context={props} />;
  }
  return <LegacyAssistantDock {...props} flags={flags} />;
}

function LegacyAssistantDock({
  status,
  counterpartId,
  state,
  hasMeeting,
  hasOpenIntro,
  showIdentity = true,
  flags,
}: {
  status: string;
  counterpartId?: string | null;
  state?: string;
  hasMeeting?: boolean;
  hasOpenIntro?: boolean;
  showIdentity?: boolean;
  flags: ReturnType<typeof useAssistantFlags>;
}) {
  const { me } = useMe();
  const navigate = useNavigate();
  const [input, setInput] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);
  const [intent, setIntent] = useState<AssistantIntent | null>(null);
  const [lastQuestion, setLastQuestion] = useState<string | null>(null);
  const [safety, setSafety] = useState<string | null>(null);
  const inputIntent = assistantIntent(input.trim());
  const awaitingCapabilities =
    flags.isPending && ["unknown", "edit", "edit_story", "coach_profile"].includes(inputIntent);
  const reply = intent
    ? assistantReply(intent, {
        gender: me?.gender ?? null,
        complete: Boolean(me && me.onboarding_step >= 7),
        status,
        state,
        counterpartId,
        hasMeeting,
        hasOpenIntro,
        schedule: Boolean(flags.data?.schedule && !flags.isError && !flags.isPaused),
        memory: Boolean(flags.data?.memory && !flags.isError && !flags.isPaused),
        profileEdit: Boolean(flags.data?.profileEdit && !flags.isError && !flags.isPaused),
      })
    : null;
  return (
    <section className="assistant-dock" aria-label="매니저에게 물어보기">
      {showIdentity ? (
        <div className="flex items-center gap-2.5">
          <AssistantMark />
          <div>
            <h2 className="text-base font-semibold">같이 이야기해요</h2>
            <p className="mt-1 text-xs text-muted-foreground">애프터 매니저 · 나를 알아가는 AI</p>
          </div>
        </div>
      ) : null}
      <div className="assistant-quick-actions" role="group" aria-label="빠른 도움">
        {(
          [
            ["status", "내 상태"],
            ["intro", "소개 확인"],
            ["profile", "내 프로필"],
            ["prepare", "대화 팁"],
            ["schedule", "일정 정리"],
          ] as const
        ).map(([key, label]) => (
          <button
            key={key}
            type="button"
            className="assistant-quick-chip pressable"
            aria-pressed={intent === key}
            onFocus={(event) =>
              event.currentTarget.scrollIntoView({ block: "nearest", inline: "nearest" })
            }
            onClick={() => {
              setSafety(null);
              setLastQuestion(null);
              setIntent(key);
            }}
          >
            <span className="assistant-quick-chip-label">{label}</span>
          </button>
        ))}
      </div>
      {safety || reply ? (
        <div className="assistant-reply mt-4" role="status">
          <p className="text-sm leading-relaxed">{safety ?? reply?.text}</p>
          {!safety && reply ? (
            <AssistantActions
              actions={reply.actions}
              counterpartId={counterpartId}
              draft={me && lastQuestion ? { owner: me.id, text: lastQuestion } : undefined}
            />
          ) : null}
        </div>
      ) : null}
      {!reply && !safety ? (
        <AssistantPrompts
          input={input}
          canCoach={false}
          onChoose={(text) => {
            setInput(text);
            inputRef.current?.focus();
          }}
        />
      ) : input ? (
        <AssistantPrompts
          input={input}
          canCoach={false}
          onChoose={(text) => {
            setInput(text);
            inputRef.current?.focus();
          }}
        />
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
            if (
              ["unknown", "coach_profile", "edit", "edit_story"].includes(next) &&
              flags.isPending
            )
              return;
            if (
              next === "edit_story" &&
              me?.onboarding_step &&
              me.onboarding_step >= 7 &&
              flags.data?.profileEdit &&
              !flags.isError &&
              !flags.isPaused
            ) {
              setAssistantDraft(me.id, text);
              void navigate({ to: "/assistant-profile" });
            } else if (
              (next === "unknown" || next === "coach_profile") &&
              me &&
              flags.data?.chat &&
              !flags.isError &&
              !flags.isPaused
            ) {
              setAssistantDraft(me.id, text);
              void navigate({ to: "/assistant", search: { panel: "chat" } });
            } else {
              setSafety(null);
              setLastQuestion(text);
              setIntent(next);
            }
            setInput("");
          }
        }}
      >
        <input
          ref={inputRef}
          aria-label="매니저에게 물어볼 내용"
          placeholder="궁금한 점을 편하게 물어보세요"
          value={input}
          maxLength={300}
          enterKeyHint="send"
          onChange={(event) => setInput(event.target.value)}
          className="min-w-0 flex-1 rounded-control bg-transparent px-3 py-2 text-base outline-none focus-visible:ring-2 focus-visible:ring-ring"
        />
        <button
          type="submit"
          disabled={!input.trim() || awaitingCapabilities}
          aria-label="매니저에게 질문하기"
          className="app-primary-button pressable flex size-11 shrink-0 items-center justify-center rounded-control bg-primary text-primary-foreground hover:bg-primary-hover focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none disabled:bg-muted disabled:text-muted-foreground"
        >
          <ArrowUp className="size-5" />
        </button>
      </form>
    </section>
  );
}
