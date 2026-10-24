import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { BookmarkPlus, Send, Trash2 } from "lucide-react";
import { AppScreen } from "@/components/app/AppScreen";
import { AssistantMark } from "@/components/assistant/AssistantMark";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useMe } from "@/lib/me";
import { takeAssistantDraft } from "@/lib/assistantDraft";
import { useMemberLiveQuery } from "@/lib/useMemberLiveQuery";
import {
  assistantRpc,
  askPrivateAssistant,
  getPrivateAssistant,
  type AssistantPrivateState,
  type AssistantMemory,
} from "@/lib/privateAssistant";

export const Route = createFileRoute("/assistant")({
  validateSearch: (s: Record<string, unknown>) => ({
    panel: s.panel === "memory" ? ("memory" as const) : ("chat" as const),
  }),
  head: () => ({ meta: [{ title: "나와 비서 — 애프터" }, { name: "robots", content: "noindex" }] }),
  component: AssistantPage,
});

function AssistantPage() {
  const { me, ready } = useMe();
  const navigate = useNavigate();
  useEffect(() => {
    if (ready && !me) void navigate({ to: "/login" });
  }, [me, ready, navigate]);
  return me && me.onboarding_step >= 7 ? (
    <PrivateAssistant key={me.id} owner={me.id} />
  ) : (
    <AppScreen title="나와 비서" back="/home" hideTabs>
      <p className="py-8">프로필을 준비하면 비서와 이야기를 나눌 수 있어요.</p>
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

function PrivateAssistant({ owner }: { owner: string }) {
  const { panel } = Route.useSearch();
  const client = useQueryClient();
  const live = useMemberLiveQuery("assistant-private", owner, getPrivateAssistant);
  const data = !live.isError && !live.isPaused ? live.data : undefined;
  const [input, setInput] = useState("");
  useEffect(() => {
    const draft = takeAssistantDraft(owner);
    if (draft) setInput(draft);
  }, [owner]);
  const [agree, setAgree] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
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
  const pendingRequest = useRef<{ id: string; text: string; revision: number } | null>(null);
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
  }, [panel, data]);
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
  const run = async (action: () => Promise<AssistantPrivateState | void>) => {
    if (sending.current) return;
    sending.current = true;
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
              : "처리 결과를 확인하지 못했어요. 아래 ‘상태 다시 확인’으로 먼저 확인해 주세요. 같은 요청을 중복 실행하지 않아요.",
        );
        await live.refetch();
      }
    } finally {
      release();
      sending.current = false;
      if (alive.current) setBusy(false);
    }
  };
  const send = () =>
    run(async () => {
      if (!input.trim() || !data) return;
      if (
        !pendingRequest.current ||
        pendingRequest.current.text !== input.trim() ||
        pendingRequest.current.revision !== data.revision
      )
        pendingRequest.current = {
          id: crypto.randomUUID(),
          text: input.trim(),
          revision: data.revision,
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
  return (
    <AppScreen
      title="나와 비서"
      back="/home"
      hideTabs
      keyboardAware
      footer={
        panel === "chat" && data?.consented && data.flags.chat && !memory && !erase ? (
          <form
            className="flex items-end gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              void send();
            }}
          >
            <label className="min-w-0 flex-1">
              <span className="sr-only">비서에게 상담할 내용</span>
              <textarea
                className="w-full resize-none rounded-control bg-card p-3 text-base outline-none focus-visible:ring-2 focus-visible:ring-ring"
                rows={2}
                maxLength={1000}
                value={input}
                onChange={(e) => setInput(e.target.value)}
                placeholder="만남 앞에서 궁금한 게 있나요?"
                disabled={busy}
              />
            </label>
            <Button
              size="icon"
              type="submit"
              aria-label="상담 보내기"
              disabled={!input.trim() || busy || data.turns.some((t) => t.state === "pending")}
              className="mb-1 size-11"
            >
              <Send className="size-4" />
            </Button>
          </form>
        ) : undefined
      }
    >
      <nav className="mb-5 flex gap-2" aria-label="비서 메뉴">
        <Link
          to="/assistant"
          search={{ panel: "chat" }}
          aria-current={panel === "chat" ? "page" : undefined}
          className={`assistant-suggestion ${panel === "chat" ? "!bg-selection !text-selection-foreground" : ""}`}
        >
          나만의 상담
        </Link>
        <Link
          to="/assistant"
          search={{ panel: "memory" }}
          aria-current={panel === "memory" ? "page" : undefined}
          className={`assistant-suggestion ${panel === "memory" ? "!bg-selection !text-selection-foreground" : ""}`}
        >
          기억 관리
        </Link>
      </nav>
      {!data ? (
        <div className="py-6">
          <p role="status">
            {live.isError || live.isPaused
              ? "연결을 확인하고 다시 불러와 주세요."
              : "내 비서를 불러오고 있어요…"}
          </p>
          <Button variant="outline" className="mt-4" onClick={() => void live.refetch()}>
            상태 다시 확인
          </Button>
        </div>
      ) : (
        <>
          {!data.consented ? (
            <section className="assistant-status">
              <AssistantMark />
              <h2 className="mt-4 text-2xl font-bold break-keep">
                나에게 맞는 만남을,
                <br />
                같이 준비해요.
              </h2>
              <p className="mt-3 text-sm leading-relaxed">
                상담은 상대에게 전송되지 않아요. 공개 프로필과도 분리해서 다뤄요.
              </p>
              {data.flags.chat ? (
                <>
                  <label className="mt-5 flex gap-3 text-sm leading-relaxed">
                    <input
                      className="mt-1 size-5 shrink-0 accent-primary"
                      type="checkbox"
                      checked={agree}
                      onChange={(e) => setAgree(e.target.checked)}
                    />
                    <span>
                      상담 내용과 승인한 기억을 AI에 보내 조언을 받고, 상담 기록을 30일 보관하는 데
                      동의해요. 연락처·건강 등 민감한 내용은 입력하지 마세요. 언제든 기록을 지우고
                      동의를 철회할 수 있어요.
                    </span>
                  </label>
                  <Link
                    to="/privacy"
                    className="mt-3 flex min-h-11 items-center text-sm font-semibold"
                  >
                    개인정보 처리 안내
                  </Link>
                  <Button
                    className="mt-3 w-full"
                    disabled={!agree || busy}
                    onClick={() =>
                      void run(() => assistantRpc("assistant_consent", { p_agree: true }))
                    }
                  >
                    동의하고 시작하기
                  </Button>
                </>
              ) : (
                <p className="mt-5 text-sm font-semibold">
                  비공개 상담은 아직 준비 중이에요. 기존 대화 준비와 소개 기능은 계속 이용할 수
                  있어요.
                </p>
              )}
            </section>
          ) : panel === "chat" ? (
            <>
              <p className="mb-5 text-xs text-muted-foreground leading-relaxed">
                AI 조언은 참고용이에요. 기억은 따로 승인해야 저장돼요. 상담 원문은 최대 30일
                보관해요.
              </p>
              {!data.flags.chat ? (
                <p role="status" className="assistant-reply mb-5">
                  새 상담은 잠시 쉬고 있어요. 기록 확인과 삭제는 계속 할 수 있어요.
                </p>
              ) : null}
              {data.turns.length === 0 ? (
                <div className="assistant-reply">
                  <p className="text-lg font-semibold">첫 만남, 어떤 점이 신경 쓰이나요?</p>
                  <p className="mt-2 text-sm leading-relaxed">
                    말문을 여는 방법부터 편안한 만남 방식까지, 하나씩 이야기해요.
                  </p>
                </div>
              ) : (
                <ol className="space-y-6" aria-label="나만의 상담 기록">
                  {data.turns.map((turn) => (
                    <li key={turn.id}>
                      <div className="ml-6 rounded-[16px_4px_16px_16px] bg-card p-4">
                        <p className="whitespace-pre-wrap break-words text-base leading-relaxed">
                          {turn.question}
                        </p>
                        {data.flags.memory && turn.question.length <= 240 ? (
                          <button
                            className="mt-2 inline-flex min-h-11 items-center gap-1.5 text-xs font-semibold text-primary-strong"
                            onClick={() => {
                              setMemory({
                                text: turn.question,
                                source: turn.id,
                                revision: data.revision,
                              });
                              setApproved(false);
                            }}
                            disabled={busy}
                          >
                            <BookmarkPlus className="size-4" />이 내용 기억하기
                          </button>
                        ) : null}
                      </div>
                      <div className="assistant-reply mt-3 mr-4">
                        <p className="whitespace-pre-wrap break-words text-sm leading-relaxed">
                          {turn.answer ??
                            (turn.state === "pending"
                              ? "답변을 준비하고 있어요…"
                              : "답변을 마치지 못했어요. 질문을 다시 보내주세요.")}
                        </p>
                      </div>
                    </li>
                  ))}
                </ol>
              )}
              <div ref={conversationEnd} aria-hidden="true" />
              <Button
                variant="ghost"
                className="mt-5"
                disabled={busy || !data.turns.length}
                onClick={() => setErase("history")}
              >
                <Trash2 className="mr-2 size-4" />
                상담 기록 지우기
              </Button>
            </>
          ) : (
            <>
              <h2 className="text-2xl font-bold">비서가 기억하는 나</h2>
              <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
                내가 승인한 만남 선호만 상담에 활용해요. 상대에게 공개하지 않으며, 90일 뒤에는
                자동으로 지워요.
              </p>
              {!data.memories.length ? (
                <p className="mt-6 text-sm">아직 승인한 기억이 없어요.</p>
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
              {data.flags.memory ? (
                <Button
                  variant="outline"
                  className="mt-5 w-full"
                  disabled={busy}
                  onClick={() => {
                    setMemory({ text: "", revision: data.revision });
                    setApproved(false);
                  }}
                >
                  기억할 선호 추가
                </Button>
              ) : (
                <p className="mt-4 text-sm text-muted-foreground">
                  새 기억 저장은 아직 켜져 있지 않아요.
                </p>
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
              <h2 className="text-lg font-bold">이대로 기억할까요?</h2>
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
                  className="mt-1 size-5 shrink-0 accent-primary"
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
                    void run(() =>
                      assistantRpc("assistant_save_memory", {
                        p_id: memory.existing?.id ?? null,
                        p_content: memory.text.trim(),
                        p_version: memory.existing?.version ?? null,
                        p_source_id: memory.source ?? null,
                        p_expected_revision: memory.revision,
                      }),
                    )
                  }
                >
                  승인하고 기억하기
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
                  variant="destructive"
                  disabled={busy}
                  onClick={() =>
                    void run(() =>
                      erase === "consent"
                        ? assistantRpc("assistant_consent", { p_agree: false })
                        : assistantRpc("assistant_forget", {
                            p_scope: erase === "history" ? "history" : "memory",
                            p_memory_id: erase === "history" ? null : erase,
                          }),
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
          처리 결과를 확인하고 있어요…
        </p>
      ) : null}
    </AppScreen>
  );
}
