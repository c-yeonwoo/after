import { useState } from "react";
import { Link, useNavigate } from "@tanstack/react-router";
import { ArrowUp, ArrowUpRight } from "lucide-react";
import { AssistantMark } from "./AssistantMark";
import { assistantIntent, type AssistantIntent } from "@/lib/assistant";
import { getAssistantFlags } from "@/lib/privateAssistant";
import { useMemberLiveQuery } from "@/lib/useMemberLiveQuery";
import { useMe } from "@/lib/me";
import { setAssistantDraft } from "@/lib/assistantDraft";

export function AssistantDock({
  status,
  counterpartId,
}: {
  status: string;
  counterpartId?: string | null;
}) {
  const { me } = useMe();
  const navigate = useNavigate();
  const flags = useMemberLiveQuery("assistant-capabilities", me?.id, getAssistantFlags);
  const [input, setInput] = useState("");
  const [intent, setIntent] = useState<AssistantIntent | null>(null);
  const awaitingCapabilities = flags.isPending && assistantIntent(input.trim()) === "unknown";
  const replies = {
    status: { text: status, to: null, label: "" },
    profile: {
      text: "나답게 고쳐볼까요? 저장한 프로필만 상대에게 보여요.",
      to: "/profile",
      label: "내 프로필 보기",
    },
    schedule: {
      text:
        flags.data?.schedule && !flags.isError && !flags.isPaused
          ? "시간을 함께 정리해요. 승인한 초안만 전달해요."
          : "편한 시간을 알려주세요. 약속 변경은 상세에서 확인해요.",
      to:
        flags.data?.schedule && !flags.isError && !flags.isPaused
          ? "/assistant-schedule"
          : "/availability",
      label:
        flags.data?.schedule && !flags.isError && !flags.isPaused
          ? "일정 정리하기"
          : "가능한 시간 보기",
    },
    prepare: {
      text: counterpartId
        ? "상대의 이야기에서 대화의 실마리를 찾아봐요."
        : "소개가 열리면 그분에게 맞는 대화 팁을 준비해요.",
      to: null,
      label: "",
    },
    support: {
      text: "결제·취소·신고는 제가 자동 처리하지 않아요. 고객센터에서 도와드릴게요.",
      to: "/support",
      label: "고객센터",
    },
    unknown: {
      text: "진행 상황, 프로필, 일정, 대화 팁을 도와드릴게요. 어떤 게 궁금하세요?",
      to: null,
      label: "",
    },
  };
  const reply = intent ? replies[intent] : null;
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
            ["prepare", "대화 팁"],
            ["schedule", "일정 정리"],
          ] as const
        ).map(([key, label]) => (
          <button
            key={key}
            className="assistant-suggestion pressable"
            aria-pressed={intent === key}
            onClick={() => setIntent(key)}
          >
            {label}
          </button>
        ))}
      </div>
      {reply ? (
        <div className="assistant-reply mt-4" role="status">
          <p className="text-sm leading-relaxed">{reply.text}</p>
          {reply.to ? (
            <Link
              to={reply.to}
              className="mt-3 inline-flex min-h-11 items-center gap-1 text-sm font-semibold"
            >
              {reply.label}
              <ArrowUpRight className="size-4" />
            </Link>
          ) : null}
          {intent === "prepare" && counterpartId ? (
            <Link
              to="/conversation-prep"
              search={{ target: counterpartId }}
              className="mt-3 inline-flex min-h-11 items-center gap-1 text-sm font-semibold"
            >
              대화 준비하기
              <ArrowUpRight className="size-4" />
            </Link>
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
            const next = assistantIntent(text);
            if (next === "unknown" && flags.isPending) return;
            if (next === "unknown" && me && flags.data?.chat && !flags.isError && !flags.isPaused) {
              setAssistantDraft(me.id, text);
              void navigate({ to: "/assistant", search: { panel: "chat" } });
            } else {
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
