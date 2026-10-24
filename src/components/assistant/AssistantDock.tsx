import { useState } from "react";
import { Link } from "@tanstack/react-router";
import { ArrowUpRight, Send } from "lucide-react";
import { AssistantMark } from "./AssistantMark";
import { assistantIntent, type AssistantIntent } from "@/lib/assistant";
import { getAssistantFlags } from "@/lib/privateAssistant";
import { useMemberLiveQuery } from "@/lib/useMemberLiveQuery";
import { useMe } from "@/lib/me";

export function AssistantDock({
  status,
  counterpartId,
}: {
  status: string;
  counterpartId?: string | null;
}) {
  const { me } = useMe();
  const flags = useMemberLiveQuery("assistant-capabilities", me?.id, getAssistantFlags);
  const [input, setInput] = useState("");
  const [intent, setIntent] = useState<AssistantIntent | null>(null);
  const replies = {
    status: { text: status, to: null, label: "" },
    profile: {
      text: "프로필은 직접 확인하고 바꿀 수 있어요. 저장한 내용만 상대에게 보여요.",
      to: "/profile",
      label: "내 프로필 보기",
    },
    schedule: {
      text:
        flags.data?.schedule && !flags.isError && !flags.isPaused
          ? "진행 중인 약속의 시간을 함께 정리해요. 초안을 보고 승인하기 전에는 상대에게 전달하지 않아요."
          : "가능한 시간을 정해두세요. 약속의 변경·확정은 해당 화면에서 직접 확인해요. 아직 변경한 내용은 없어요.",
      to:
        flags.data?.schedule && !flags.isError && !flags.isPaused
          ? "/assistant-schedule"
          : "/availability",
      label:
        flags.data?.schedule && !flags.isError && !flags.isPaused
          ? "비서와 약속 준비"
          : "가능한 시간 보기",
    },
    prepare: {
      text: counterpartId
        ? "상대가 공개한 이야기에서 첫 대화의 실마리를 찾아볼게요."
        : "열람할 수 있는 상대가 생기면 그분의 프로필로 대화를 준비할 수 있어요.",
      to: null,
      label: "",
    },
    support: {
      text: "결제·취소·신고는 제가 자동 처리하지 않아요. 필요한 도움을 고객센터에서 요청할 수 있어요.",
      to: "/support",
      label: "고객센터",
    },
    unknown: {
      text: "지금은 진행 상태, 프로필, 가능한 시간, 상대와의 대화 준비를 안내할 수 있어요. 입력한 말은 상대에게 보내지 않아요.",
      to: null,
      label: "",
    },
  };
  const reply = intent ? replies[intent] : null;
  return (
    <section className="assistant-dock" aria-label="내 비서에게 물어보기">
      <div className="flex items-center gap-2.5">
        <AssistantMark />
        <h2 className="font-semibold">내 비서에게 물어보기</h2>
      </div>
      <p className="mt-2 text-xs leading-relaxed text-muted-foreground">
        진행 안내와 대화 준비를 도와요. 상대에게 전송되지 않아요.
      </p>
      {flags.data?.chat && !flags.isError && !flags.isPaused ? (
        <Link
          to="/assistant"
          search={{ panel: "chat" }}
          className="mt-3 flex min-h-11 items-center gap-2 text-sm font-semibold text-primary-strong"
        >
          나만의 상담 시작하기
          <ArrowUpRight className="size-4" />
        </Link>
      ) : null}
      <div className="mt-4 flex flex-wrap gap-2">
        {(
          [
            ["status", "지금 내 상태"],
            ["prepare", "대화 준비"],
            ["schedule", "가능한 시간"],
          ] as const
        ).map(([key, label]) => (
          <button key={key} className="assistant-suggestion" onClick={() => setIntent(key)}>
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
        className="mt-4 flex items-center gap-2 rounded-surface bg-background p-2"
        onSubmit={(event) => {
          event.preventDefault();
          if (input.trim()) {
            setIntent(assistantIntent(input));
            setInput("");
          }
        }}
      >
        <input
          aria-label="비서에게 물어볼 내용"
          placeholder="어떤 도움이 필요하세요?"
          value={input}
          maxLength={300}
          onChange={(event) => setInput(event.target.value)}
          className="min-w-0 flex-1 bg-transparent px-2 py-2 text-base outline-none focus-visible:ring-2 focus-visible:ring-ring rounded-control"
        />
        <button
          type="submit"
          disabled={!input.trim()}
          aria-label="비서에게 질문하기"
          className="pressable flex size-11 shrink-0 items-center justify-center rounded-control bg-selection text-selection-foreground disabled:opacity-50"
        >
          <Send className="size-4" />
        </button>
      </form>
    </section>
  );
}
