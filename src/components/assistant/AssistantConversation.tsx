import { Link, useRouterState } from "@tanstack/react-router";
import { createPortal } from "react-dom";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { ChevronRight, Send, Trash2 } from "lucide-react";
import { AppScreen } from "@/components/app/AppScreen";
import { AssistantMark } from "@/components/assistant/AssistantMark";
import { AssistantActions } from "@/components/assistant/AssistantActions";
import { AssistantPrompts } from "@/components/assistant/AssistantPrompts";
import { AssistantTextarea } from "@/components/assistant/AssistantTextarea";
import { privateAssistantSafety } from "../../../supabase/functions/_shared/assistant-private";
import { assistantIntent } from "@/lib/assistant";
import {
  assistantReply,
  historicalAssistantActions,
  type AssistantContext,
} from "@/lib/assistantExperience";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useMe } from "@/lib/me";
import { setAssistantDraft, takeAssistantDraft } from "@/lib/assistantDraft";
import { useMemberLiveQuery } from "@/lib/useMemberLiveQuery";
import {
  assistantRpc,
  askPrivateAssistant,
  getPrivateAssistant,
  type AssistantPrivateState,
  type AssistantMemory,
} from "@/lib/privateAssistant";

function ConversationFrame({
  compact,
  footer,
  children,
}: {
  compact: boolean;
  footer?: ReactNode;
  children: ReactNode;
}) {
  const [homeFooter, setHomeFooter] = useState<HTMLElement | null>(null);
  useEffect(() => {
    setHomeFooter(compact ? document.getElementById("assistant-home-composer") : null);
  }, [compact]);
  return compact ? (
    <section aria-label="나와 매니저의 대화" className="assistant-dock">
      {children}
      {footer ? (
        homeFooter ? (
          createPortal(footer, homeFooter)
        ) : (
          <div className="mt-4">{footer}</div>
        )
      ) : null}
    </section>
  ) : (
    <AppScreen title="나와 매니저" back="/home" hideTabs keyboardAware footer={footer}>
      {children}
    </AppScreen>
  );
}

function revealInConversation(
  element: HTMLElement | null,
  alignment: "end" | "center" | "nearest",
) {
  const main = element?.closest("main");
  if (!element || !main) return;
  const box = element.getBoundingClientRect();
  const viewport = main.getBoundingClientRect();
  if (alignment === "nearest" && box.top >= viewport.top && box.bottom <= viewport.bottom) return;
  const offset =
    alignment === "center"
      ? (main.clientHeight - box.height) / 2
      : alignment === "end" || box.bottom > viewport.bottom
        ? main.clientHeight - box.height
        : 0;
  // Scroll only the app body; scrollIntoView also moves outer frames and can
  // push the persistent header offscreen on a phone.
  main.scrollTo({ top: main.scrollTop + box.top - viewport.top - offset, behavior: "instant" });
}

export function AssistantConversation({
  owner,
  compact = false,
  panel = "chat",
  context,
}: {
  owner: string;
  compact?: boolean;
  panel?: "chat" | "memory";
  context?: Partial<AssistantContext>;
}) {
  const { me } = useMe();
  const navigating = useRouterState({ select: (state) => state.isLoading });
  const client = useQueryClient();
  const live = useMemberLiveQuery("assistant-private", owner, getPrivateAssistant);
  const data = !live.isError && !live.isPaused ? live.data : undefined;
  const [earlier, setEarlier] = useState<{
    revision: number;
    sessionId: string | null;
    turns: AssistantPrivateState["turns"];
    exhausted: boolean;
  } | null>(null);
  const [loadingEarlier, setLoadingEarlier] = useState(false);
  useEffect(() => {
    if (!data) return;
    setEarlier((previous) => {
      if (
        !previous ||
        previous.revision !== data.revision ||
        previous.sessionId !== (data.session_id ?? null)
      )
        return null;
      const turns = [
        ...new Map(
          [...previous.turns, ...data.turns].map((turn) => [turn.id, turn] as const),
        ).values(),
      ].sort((a, b) => a.created_at.localeCompare(b.created_at) || a.id.localeCompare(b.id));
      if (
        turns.length === previous.turns.length &&
        turns.every((turn, index) => turn === previous.turns[index])
      )
        return previous;
      return { ...previous, turns };
    });
  }, [data, earlier]);
  const latestRevision = useRef<number | undefined>(undefined);
  latestRevision.current = data?.revision;
  const latestSession = useRef<string | null>(null);
  latestSession.current = data?.session_id ?? null;
  const visibleTurns = data
    ? [
        ...new Map(
          [
            ...(earlier?.revision === data.revision &&
            earlier.sessionId === (data.session_id ?? null)
              ? earlier.turns
              : []),
            ...data.turns,
          ].map((turn) => [turn.id, turn] as const),
        ).values(),
      ].sort((a, b) => a.created_at.localeCompare(b.created_at) || a.id.localeCompare(b.id))
    : [];
  const shownTurns = compact
    ? visibleTurns.filter((turn) => !turn.kind || turn.kind === "conversation").slice(-1)
    : visibleTurns;
  const [input, setInput] = useState("");
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const [suggestionsHidden, setSuggestionsHidden] = useState(false);
  const inputEdited = useRef(false);
  useEffect(() => {
    const draft = takeAssistantDraft(owner);
    if (draft && !inputEdited.current) setInput(draft);
  }, [owner]);
  const [busy, setBusy] = useState(false);
  const [busyLabel, setBusyLabel] = useState("");
  const [error, setError] = useState("");
  const [guide, setGuide] = useState<string | null>(null);
  const actionContext: AssistantContext = {
    gender: me?.gender ?? null,
    complete: Boolean(me && me.onboarding_step >= 7),
    schedule: Boolean(data?.flags.schedule),
    memory: Boolean(data?.flags.memory),
    profileEdit: Boolean(data?.flags.profileEdit),
    ...context,
  };
  const guideReply = guide ? assistantReply(assistantIntent(guide), actionContext) : null;
  const [memory, setMemory] = useState<{
    text: string;
    existing?: AssistantMemory;
    source?: string;
    revision: number;
  } | null>(null);
  const [approved, setApproved] = useState(false);
  const [erase, setErase] = useState<"history" | "all" | "consent" | string | null>(null);
  const sending = useRef(false);
  const alive = useRef(true);
  const pendingRequest = useRef<{
    id: string;
    text: string;
    revision: number;
    sessionId: string | null;
  } | null>(null);
  const conversationEnd = useRef<HTMLDivElement>(null);
  const memoryInput = useRef<HTMLInputElement>(null);
  const eraseConfirmation = useRef<HTMLElement>(null);
  const historyPositioned = useRef(false);
  const followTurn = useRef<string | null>(null);
  const memoryOpen = memory !== null;
  const hasData = data !== undefined;
  useEffect(() => {
    if (panel !== "chat") {
      historyPositioned.current = false;
      return;
    }
    if (!data) return;
    const ownTurn = data.turns.find((turn) => turn.id === followTurn.current);
    // Home initially shows the greeting; only a turn sent here follows to the reply.
    if (compact && !ownTurn) return;
    if (historyPositioned.current && !ownTurn) return;
    let secondFrame = 0;
    // Run after the app shell's route scroll reset. Background polling must not
    // pull someone away from older messages they are reading.
    const frame = requestAnimationFrame(() => {
      secondFrame = requestAnimationFrame(() => {
        revealInConversation(conversationEnd.current, "end");
        historyPositioned.current = true;
        if (ownTurn && ownTurn.state !== "pending") followTurn.current = null;
      });
    });
    return () => {
      cancelAnimationFrame(frame);
      cancelAnimationFrame(secondFrame);
    };
  }, [panel, data, compact]);
  useEffect(() => {
    if (!memoryOpen || !hasData) return;
    const frame = requestAnimationFrame(() => {
      revealInConversation(memoryInput.current, "center");
      memoryInput.current?.focus({ preventScroll: true });
    });
    return () => cancelAnimationFrame(frame);
  }, [memoryOpen, hasData]);
  useEffect(() => {
    if (!erase || !hasData) return;
    const frame = requestAnimationFrame(() => {
      revealInConversation(eraseConfirmation.current, "nearest");
      eraseConfirmation.current?.focus({ preventScroll: true });
    });
    return () => cancelAnimationFrame(frame);
  }, [erase, hasData]);
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
      client.removeQueries({ queryKey: ["assistant-private", owner], exact: true });
    };
  }, [client, owner]);
  const run = async (
    action: () => Promise<AssistantPrivateState | void>,
    label = "답변을 준비하고 있어요…",
  ) => {
    if (sending.current) return;
    sending.current = true;
    setBusyLabel(label);
    setBusy(true);
    setError("");
    const release = live.beginInteraction();
    try {
      const result = await action();
      if (alive.current) {
        if (result) live.update(() => result);
        setErase(null);
        setMemory(null);
        setApproved(false);
        await live.refetch();
      }
    } catch (cause) {
      if (alive.current) {
        const code = cause instanceof Error ? cause.message : "";
        setError(
          code === "daily_limit" || code === "limit"
            ? "오늘 이용 한도에 도달했어요. 잠시 쉬었다 다시 찾아주세요."
            : code === "quality_failed"
              ? "조언을 점검하는 중 표현이 맞지 않아 보여드리지 않았어요. 질문을 조금 바꿔 다시 물어봐 주세요."
              : "요청이 완료됐는지 확인하지 못했어요. 다시 보내기 전에 ‘상태 다시 확인’을 눌러 주세요.",
        );
        await live.refetch();
      }
    } finally {
      release();
      sending.current = false;
      if (alive.current) setBusy(false);
    }
  };
  const send = (question: string) =>
    run(async () => {
      const text = question.trim();
      if (!text || !data) return;
      if (
        !pendingRequest.current ||
        pendingRequest.current.text !== text ||
        pendingRequest.current.revision !== data.revision ||
        pendingRequest.current.sessionId !== (data.session_id ?? null)
      )
        pendingRequest.current = {
          id: crypto.randomUUID(),
          text,
          revision: data.revision,
          sessionId: data.session_id ?? null,
        };
      try {
        followTurn.current = pendingRequest.current.id;
        await askPrivateAssistant(
          pendingRequest.current.text,
          pendingRequest.current.id,
          pendingRequest.current.revision,
        );
      } catch (cause) {
        if (
          cause instanceof Error &&
          [
            "turn_failed",
            "quality_failed",
            "generation_failed",
            "not_configured",
            "daily_limit",
            "context_changed",
            "disabled_or_no_consent",
          ].includes(cause.message)
        )
          pendingRequest.current = null;
        throw cause;
      }
      if (alive.current) {
        setInput("");
        pendingRequest.current = null;
      }
    });
  const loadEarlier = async () => {
    if (!data || loadingEarlier || !visibleTurns.length) return;
    const revision = data.revision;
    const sessionId = data.session_id ?? null;
    const first = visibleTurns[0];
    setLoadingEarlier(true);
    setError("");
    try {
      const page = await assistantRpc<
        Pick<AssistantPrivateState, "revision" | "turns" | "session_id">
      >("assistant_history", {
        p_before: first.created_at,
        p_before_id: first.id,
      });
      if (
        !alive.current ||
        latestRevision.current !== revision ||
        page.revision !== revision ||
        latestSession.current !== sessionId ||
        (page.session_id ?? null) !== sessionId
      )
        return;
      setEarlier(() => ({
        revision,
        sessionId,
        exhausted: page.turns.length < 20,
        turns: [...page.turns, ...visibleTurns],
      }));
    } catch {
      if (alive.current) setError("이전 대화를 불러오지 못했어요. 다시 시도해 주세요.");
    } finally {
      if (alive.current) setLoadingEarlier(false);
    }
  };
  return (
    <ConversationFrame
      compact={compact}
      footer={
        panel === "chat" && data?.consented && data.flags.chat && !memory && !erase ? (
          <div className="assistant-input-area">
            {assistantIntent(input) === "coach_profile" ? (
              <p className="mb-2 text-xs leading-relaxed text-muted-foreground">
                보내면 현재 공개 프로필을 AI와 함께 읽어요. 수정은 따로 확인해요.
              </p>
            ) : null}
            {!suggestionsHidden && input.trim() ? (
              <AssistantPrompts
                input={input}
                disabled={busy || navigating}
                onChoose={(text) => {
                  inputEdited.current = true;
                  setInput(text);
                  setSuggestionsHidden(true);
                  inputRef.current?.focus();
                }}
              />
            ) : null}
            <form
              className="assistant-composer flex items-end gap-2"
              onSubmit={(e) => {
                e.preventDefault();
                // Submit the visible field, never a pre-handoff render's closure.
                void send(String(new FormData(e.currentTarget).get("question") ?? ""));
              }}
            >
              <label className="min-w-0 flex-1">
                <span className="sr-only">매니저에게 상담할 내용</span>
                <AssistantTextarea
                  inputRef={inputRef}
                  name="question"
                  className="assistant-textarea block w-full resize-none rounded-control bg-transparent px-3 py-2.5 text-base leading-6 placeholder:text-muted-foreground outline-none"
                  maxLength={1000}
                  value={input}
                  onChange={(e) => {
                    inputEdited.current = true;
                    setInput(e.target.value);
                    setSuggestionsHidden(false);
                  }}
                  onKeyDown={(e) => {
                    if (e.key === "Escape") setSuggestionsHidden(true);
                  }}
                  placeholder="이어서 이야기해 주세요"
                  disabled={busy || navigating}
                />
              </label>
              <Button
                size="icon"
                type="submit"
                aria-label="상담 보내기"
                disabled={
                  !input.trim() ||
                  busy ||
                  navigating ||
                  data.turns.some((t) => t.state === "pending")
                }
                className="size-11 shrink-0"
              >
                <Send className="size-4" />
              </Button>
            </form>
          </div>
        ) : undefined
      }
    >
      {compact ? (
        <div className="assistant-conversation-heading">
          <AssistantMark />
          <div className="min-w-0 flex-1">
            <h2 className="text-base font-semibold">애프터 매니저</h2>
            <p className="mt-1 text-xs text-muted-foreground">
              {data?.turns.length ? "최근 대화" : "어떤 이야기를 해볼까요?"}
            </p>
          </div>
          {data?.consented ? (
            <Link
              to="/assistant"
              search={{ panel: "chat" }}
              className="inline-flex min-h-11 items-center gap-1 text-sm font-medium"
              onClick={() => setAssistantDraft(owner, input)}
            >
              전체 대화 <ChevronRight className="size-4" aria-hidden="true" />
            </Link>
          ) : null}
        </div>
      ) : null}
      {!compact ? (
        <nav className="mb-4 flex items-center gap-2" aria-label="매니저 메뉴">
          <Link
            to="/assistant"
            search={{ panel: "chat" }}
            aria-current={panel === "chat" ? "page" : undefined}
            className={`assistant-suggestion ${panel === "chat" ? "!bg-selection !text-selection-foreground" : ""}`}
          >
            대화
          </Link>
          <Link
            to="/assistant"
            search={{ panel: "memory" }}
            aria-current={panel === "memory" ? "page" : undefined}
            className={`assistant-suggestion ${panel === "memory" ? "!bg-selection !text-selection-foreground" : ""}`}
          >
            대화 설정
          </Link>
        </nav>
      ) : null}
      {panel === "chat" && !compact ? (
        <>
          <div className="assistant-quick-actions" role="group" aria-label="빠른 도움">
            {(compact
              ? ["소개 확인", "내 프로필 수정", "일정 정리"]
              : ["내 상태", "소개 확인", "내 프로필 수정", "대화 팁", "일정 정리", "티켓 가격"]
            ).map((text) => (
              <button
                type="button"
                key={text}
                className="assistant-quick-chip pressable"
                aria-pressed={guide === text}
                onClick={() => setGuide(text)}
              >
                <span className="assistant-quick-chip-label">{text}</span>
              </button>
            ))}
          </div>
          {guideReply ? (
            <div className="assistant-reply mb-5" role="status">
              <p className="text-base leading-relaxed">{guideReply.text}</p>
              <AssistantActions
                actions={guideReply.actions}
                counterpartId={actionContext.counterpartId}
              />
            </div>
          ) : null}
        </>
      ) : null}
      {!data ? (
        <div className="py-6">
          <p role="status">
            {live.isError || live.isPaused
              ? "연결을 확인하고 다시 불러와 주세요."
              : "내 매니저를 불러오고 있어요…"}
          </p>
          <Button variant="outline" className="mt-4" onClick={() => void live.refetch()}>
            상태 다시 확인
          </Button>
        </div>
      ) : (
        <>
          {!data.consented ? (
            <section className="assistant-consent">
              {!compact ? <AssistantMark /> : null}
              <h2 className="mt-3 text-lg font-semibold break-keep">편하게 물어보세요.</h2>
              <p className="mt-3 text-sm leading-relaxed">
                상담은 상대에게 전송되지 않아요. 공개 프로필과도 분리해서 다뤄요.
              </p>
              {data.flags.chat ? (
                <Link
                  to="/consent"
                  search={{ manager: true }}
                  className="app-primary-button mt-4 flex min-h-12 items-center justify-center rounded-control bg-primary px-5 text-sm font-semibold text-primary-foreground"
                >
                  맞춤 상담 시작
                </Link>
              ) : (
                <p className="mt-5 text-sm font-semibold">
                  비공개 상담은 아직 준비 중이에요. 기존 대화 준비와 소개 기능은 계속 이용할 수
                  있어요.
                </p>
              )}
              {data.session_id && !compact ? (
                <>
                  <details className="mt-4">
                    <summary className="min-h-11 cursor-pointer py-3 text-sm font-semibold">
                      기존 대화와 선호 보기
                    </summary>
                    <ol className="space-y-4">
                      {visibleTurns.map((turn) => (
                        <li key={turn.id} className="text-sm leading-relaxed whitespace-pre-wrap">
                          <p>{turn.question}</p>
                          <p className="mt-2 text-muted-foreground">
                            {turn.answer ?? "답변을 완료하지 못했어요."}
                          </p>
                        </li>
                      ))}
                    </ol>
                    {visibleTurns.length >= 20 && !earlier?.exhausted ? (
                      <Button
                        variant="ghost"
                        disabled={loadingEarlier}
                        onClick={() => void loadEarlier()}
                      >
                        이전 대화 보기
                      </Button>
                    ) : null}
                    {data.memories.map((item) => (
                      <p key={item.id} className="mt-3 text-sm">
                        저장한 선호: {item.content}
                      </p>
                    ))}
                  </details>
                  <Button
                    variant="ghost"
                    className="mt-3 w-full"
                    disabled={busy}
                    onClick={() => setErase("consent")}
                  >
                    동의하지 않고 기존 기록 삭제
                  </Button>
                </>
              ) : null}
            </section>
          ) : panel === "chat" ? (
            <>
              {!compact ? (
                <p className="mb-5 text-xs text-muted-foreground leading-relaxed">
                  내 프로필과 대화를 바탕으로 이어가요. 중요한 내용은 언제든 바로잡아 주세요.
                </p>
              ) : null}
              {!data.flags.chat ? (
                <p role="status" className="assistant-reply mb-5">
                  새 상담은 잠시 쉬고 있어요. 기록 확인과 삭제는 계속 할 수 있어요.
                </p>
              ) : null}
              {!compact &&
              visibleTurns.length >= 20 &&
              !(earlier?.revision === data.revision && earlier.exhausted) ? (
                <Button
                  variant="ghost"
                  className="mt-3 w-full"
                  disabled={loadingEarlier || busy}
                  onClick={() => void loadEarlier()}
                >
                  {loadingEarlier ? "이전 대화 불러오는 중…" : "이전 대화 보기"}
                </Button>
              ) : null}
              {shownTurns.length === 0 ? (
                <div>
                  {!compact ? (
                    <div className="assistant-reply">
                      <p className="text-lg font-semibold">첫 만남, 어떤 점이 신경 쓰이나요?</p>
                      <p className="mt-2 text-sm leading-relaxed">
                        아래 질문을 골라도, 직접 물어봐도 좋아요.
                      </p>
                    </div>
                  ) : null}
                  <AssistantPrompts
                    input=""
                    disabled={busy || navigating || !data.flags.chat}
                    onChoose={(text) => {
                      inputEdited.current = true;
                      setInput(text);
                      setSuggestionsHidden(true);
                      inputRef.current?.focus();
                    }}
                  />
                </div>
              ) : (
                <ol className="assistant-transcript mt-4 space-y-4" aria-label="나만의 상담 기록">
                  {shownTurns.map((turn) => (
                    <li key={turn.id}>
                      {!turn.kind || turn.kind === "conversation" ? (
                        <div className="ml-8 rounded-[16px_4px_16px_16px] bg-bubble-mine px-4 py-3 text-bubble-mine-foreground">
                          <p className="whitespace-pre-wrap break-words text-base leading-relaxed">
                            {turn.question}
                          </p>
                        </div>
                      ) : null}
                      <div className="assistant-reply mt-2 mr-4">
                        <p className="mb-1 text-xs font-semibold text-muted-foreground">
                          {turn.kind === "profile_applied"
                            ? "프로필 반영 완료"
                            : turn.kind === "schedule_applied"
                              ? "일정 반영 완료"
                              : "내 매니저"}
                        </p>
                        <p className="whitespace-pre-wrap break-words text-base leading-relaxed">
                          {turn.answer ??
                            (turn.state === "pending"
                              ? "답변을 준비하고 있어요…"
                              : "답변을 마치지 못했어요. 질문을 다시 보내주세요.")}
                        </p>
                        {turn.state === "complete" &&
                        !privateAssistantSafety(turn.question, { execution: false }) ? (
                          <AssistantActions
                            draft={{ owner, text: turn.question }}
                            actions={
                              turn.kind === "profile_applied"
                                ? ["profile"]
                                : turn.kind === "schedule_applied"
                                  ? ["appointments"]
                                  : historicalAssistantActions(assistantIntent(turn.question), {
                                      gender: me?.gender ?? null,
                                      complete: true,
                                      memory: data.flags.memory,
                                      profileEdit: data.flags.profileEdit,
                                    })
                            }
                          />
                        ) : null}
                        <time
                          dateTime={turn.created_at}
                          className="mt-2 block text-xs text-muted-foreground"
                        >
                          {new Date(turn.created_at).toLocaleString("ko-KR", {
                            month: "numeric",
                            day: "numeric",
                            hour: "2-digit",
                            minute: "2-digit",
                          })}
                        </time>
                      </div>
                    </li>
                  ))}
                </ol>
              )}
              <div ref={conversationEnd} aria-hidden="true" />
              {!compact ? (
                <Button
                  variant="ghost"
                  className="mt-5"
                  disabled={busy || !data.turns.length}
                  onClick={() => setErase("history")}
                >
                  <Trash2 className="mr-2 size-4" />
                  상담 기록 지우기
                </Button>
              ) : null}
            </>
          ) : (
            <>
              <h2 className="text-2xl font-bold">대화와 내 정보</h2>
              <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
                프로필과 관련 대화를 참고해 답해요. 대화는 초기화 전까지 이어지고 상대에게 공개되지
                않아요. 예전에 따로 저장한 선호는 아래에서 관리할 수 있으며, 저장일부터 90일 뒤
                지워져요.
              </p>
              {!data.memories.length ? (
                <p className="mt-6 text-sm">
                  따로 저장한 선호가 없어요. 대화할 때마다 저장할 필요는 없어요.
                </p>
              ) : (
                <ul className="mt-6 space-y-5">
                  {data.memories.map((item) => (
                    <li key={item.id} className="rounded-surface bg-card p-4">
                      <p className="break-keep break-words text-base leading-relaxed">
                        {item.content}
                      </p>
                      <p className="mt-2 text-xs text-muted-foreground">
                        {new Date(item.expires_at).toLocaleDateString("ko-KR")}까지 사용 · 내가
                        승인함
                      </p>
                      <div className="mt-2 flex gap-3">
                        <Button
                          variant="ghost"
                          disabled={busy || !data.flags.memory}
                          onClick={() => {
                            setMemory({
                              text: item.content,
                              existing: item,
                              revision: data.revision,
                            });
                            setApproved(false);
                          }}
                        >
                          수정
                        </Button>
                        <Button variant="ghost" disabled={busy} onClick={() => setErase(item.id)}>
                          삭제
                        </Button>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
              <Button
                variant="ghost"
                className="mt-5"
                disabled={busy}
                onClick={() => setErase("consent")}
              >
                상담 동의 철회·전체 삭제
              </Button>
            </>
          )}
          {memory ? (
            <section className="mt-6 rounded-surface bg-muted p-4" aria-label="기억 저장 확인">
              <h2 className="text-lg font-bold">저장한 선호 수정</h2>
              <label className="mt-3 block">
                <span className="sr-only">기억할 선호</span>
                <Input
                  ref={memoryInput}
                  maxLength={240}
                  value={memory.text}
                  onChange={(e) => {
                    setMemory({ ...memory, text: e.target.value, source: undefined });
                    setApproved(false);
                  }}
                />
              </label>
              <label className="mt-4 flex gap-3 text-sm leading-relaxed">
                <input
                  className="mt-1 size-5 shrink-0 accent-primary-strong"
                  type="checkbox"
                  checked={approved}
                  onChange={(e) => setApproved(e.target.checked)}
                />
                <span>
                  이 내용을 비공개 상담에 활용하도록 90일간 기억해 주세요.
                  {memory.existing ? " 수정하면 이전 상담 기록도 정리돼요." : ""}
                </span>
              </label>
              <div className="mt-4 flex gap-2">
                <Button
                  disabled={
                    busy ||
                    !approved ||
                    memory.text.trim().length < 2 ||
                    memory.revision !== data.revision
                  }
                  onClick={() =>
                    void run(
                      () =>
                        assistantRpc("assistant_save_memory", {
                          p_id: memory.existing?.id ?? null,
                          p_content: memory.text.trim(),
                          p_version: memory.existing?.version ?? null,
                          p_source_id: memory.source ?? null,
                          p_expected_revision: memory.revision,
                        }),
                      "기억을 저장하고 있어요…",
                    )
                  }
                >
                  수정 저장
                </Button>
                {memory.revision !== data.revision ? (
                  <p role="alert" className="mt-2 text-sm">
                    기억이나 동의 상태가 바뀌었어요. 그만두기를 누르고 최신 내용에서 다시 시작해
                    주세요.
                  </p>
                ) : null}
                <Button variant="ghost" disabled={busy} onClick={() => setMemory(null)}>
                  그만두기
                </Button>
              </div>
            </section>
          ) : null}
          {erase ? (
            <section
              ref={eraseConfirmation}
              tabIndex={-1}
              className="mt-6 rounded-surface bg-muted p-4"
              role="alert"
            >
              <h2 className="text-lg font-bold">기록을 지울까요?</h2>
              <p className="mt-2 text-sm leading-relaxed">
                {erase === "history"
                  ? "상담 기록을 모두 지워요. 따로 승인한 기억은 남아요."
                  : erase === "consent"
                    ? "동의를 철회하고 상담과 기억을 모두 지워요."
                    : "이 기억과 이를 인용했을 수 있는 상담 기록을 모두 지워요. 다른 승인 기억은 남아요."}{" "}
                지운 기록은 되돌릴 수 없어요.
              </p>
              <div className="mt-4 flex gap-2">
                <Button
                  variant="outline"
                  className="border-destructive/40 text-destructive hover:bg-destructive/10 hover:text-destructive"
                  disabled={busy}
                  onClick={() =>
                    void run(
                      () =>
                        erase === "consent"
                          ? assistantRpc("assistant_consent", { p_agree: false })
                          : assistantRpc("assistant_forget", {
                              p_scope: erase === "history" ? "history" : "memory",
                              p_memory_id: erase === "history" ? null : erase,
                            }),
                      "기록을 지우고 있어요…",
                    )
                  }
                >
                  확인하고 삭제
                </Button>
                <Button variant="ghost" disabled={busy} onClick={() => setErase(null)}>
                  유지하기
                </Button>
              </div>
            </section>
          ) : null}
        </>
      )}
      {error ? (
        <div className="mt-4" role="alert">
          <p className="text-sm text-destructive leading-relaxed">{error}</p>
          <Button variant="outline" className="mt-3" onClick={() => void live.refetch()}>
            상태 다시 확인
          </Button>
        </div>
      ) : null}
      {busy ? (
        <p className="mt-4 text-sm text-muted-foreground" role="status">
          {busyLabel}
        </p>
      ) : null}
    </ConversationFrame>
  );
}
