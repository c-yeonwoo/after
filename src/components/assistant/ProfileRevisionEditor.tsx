import { Link } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Check, RefreshCw, Send } from "lucide-react";
import { AssistantMark } from "@/components/assistant/AssistantMark";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { useMe } from "@/lib/me";
import { takeAssistantDraft } from "@/lib/assistantDraft";
import { useMemberLiveQuery } from "@/lib/useMemberLiveQuery";
import { profileRevisionSummary } from "@/lib/profileRevisionCopy";
import {
  approveProfileRevision,
  generateProfileRevision,
  getProfileRevision,
  getProfileRevisionById,
  profileRevisionChanges,
  type ProfileRevisionDraft,
} from "@/lib/profileRevision";

function revisionError(code: string): string {
  switch (code) {
    case "context_changed":
      return "프로필이 달라졌어요. 최신 내용을 확인하고 새로 다듬어 주세요.";
    case "daily_limit":
      return "오늘은 다섯 번까지 다듬을 수 있어요. 내일 다시 이어가요.";
    case "quality_failed":
      return "요청의 뜻을 정확히 살리지 못했어요. 바꾸고 싶은 부분을 조금 더 알려주세요.";
    case "needs_material":
      return "현재 소개글이 짧아 먼저 내용을 보태야 해요. 직접 수정에서도 이어갈 수 있어요.";
    case "contact_not_allowed":
      return "연락처나 링크를 빼고 알려주세요. 공개 프로필에는 담을 수 없어요.";
    case "generation_failed":
      return "초안을 완성하지 못했어요. 현재 프로필은 그대로예요. 잠시 뒤 다시 시도해 주세요.";
    case "not_configured":
      return "지금은 비서가 글을 다듬을 수 없어요. 직접 수정은 계속 사용할 수 있어요.";
    case "disabled_or_no_consent":
      return "지금은 비서의 프로필 수정을 사용할 수 없어요. 직접 수정에서 이어가 주세요.";
    default:
      return "처리 결과를 확인하지 못했어요. ‘상태 확인’으로 먼저 확인해 주세요.";
  }
}

export function ProfileRevisionEditor({ owner }: { owner: string }) {
  const { me, refresh } = useMe();
  const client = useQueryClient();
  const live = useMemberLiveQuery("profile-revision", owner, getProfileRevision);
  const state = live.isError || live.isPaused ? undefined : live.data;
  const [instruction, setInstruction] = useState("");
  const [consent, setConsent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [recovery, setRecovery] = useState(false);
  const [footer, setFooter] = useState<HTMLElement | null>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const sending = useRef(false);
  const alive = useRef(true);
  const request = useRef<{ id: string; text: string } | null>(null);
  useEffect(() => {
    alive.current = true;
    setFooter(document.getElementById("profile-revision-footer"));
    const text = takeAssistantDraft(owner);
    if (text) setInstruction(text);
    return () => {
      alive.current = false;
      client.removeQueries({ queryKey: ["profile-revision", owner], exact: true });
    };
  }, [owner, client]);
  const draft = state?.draft;
  const pending = draft?.state === "pending";
  const review = draft?.state === "ready" && draft.before && draft.after ? draft : null;
  const { beginInteraction } = live;
  useEffect(() => {
    // Keep the exact candidate being read in place. A foreground refresh must
    // never swap another device's newer draft under the approval button.
    if (draft?.state === "ready") return beginInteraction();
  }, [draft?.id, draft?.state, beginInteraction]);
  const run = async (action: () => Promise<void>) => {
    if (sending.current) return;
    sending.current = true;
    setBusy(true);
    setError("");
    const release = live.beginInteraction();
    try {
      await action();
    } catch (cause) {
      if (alive.current) setError(revisionError(cause instanceof Error ? cause.message : ""));
    } finally {
      release();
      sending.current = false;
      if (alive.current) setBusy(false);
    }
  };
  const recover = async () => {
    const result = request.current
      ? await getProfileRevisionById(request.current.id)
      : await getProfileRevision();
    if (!alive.current) return;
    live.update(() => result);
    setRecovery(false);
    if (result.draft && result.draft.state !== "pending") request.current = null;
    if (result.draft?.state === "approved") {
      await refresh();
      await client.invalidateQueries({ queryKey: ["member-home", owner], exact: true });
      await client.invalidateQueries({
        predicate: (query) =>
          query.queryKey.includes(owner) &&
          typeof query.queryKey[0] === "string" &&
          query.queryKey[0].startsWith("member-introduction:"),
      });
    }
    return result;
  };
  const generate = () =>
    run(async () => {
      if (!state?.enabled || !consent || instruction.trim().length < 3 || pending || recovery)
        return;
      if (!request.current || request.current.text !== instruction.trim())
        request.current = { id: crypto.randomUUID(), text: instruction.trim() };
      try {
        await generateProfileRevision(request.current.text, request.current.id);
        await recover();
      } catch (cause) {
        const code = cause instanceof Error ? cause.message : "";
        if (
          [
            "quality_failed",
            "generation_failed",
            "not_configured",
            "needs_material",
            "daily_limit",
            "context_changed",
            "contact_not_allowed",
            "disabled_or_no_consent",
          ].includes(code)
        )
          request.current = null;
        else if (alive.current) setRecovery(true);
        try {
          await recover();
        } catch {
          /* Keep explicit recovery available after a network failure. */
        }
        throw cause;
      }
    });
  const decide = (approved: boolean) =>
    run(async () => {
      if (!review || !state?.enabled) return;
      try {
        await approveProfileRevision(review.id, approved);
        const result = await getProfileRevisionById(review.id);
        if (!alive.current) return;
        live.update(() => result);
        setRecovery(false);
        if (approved) {
          await refresh();
          await client.invalidateQueries({ queryKey: ["member-home", owner], exact: true });
          await client.invalidateQueries({
            predicate: (query) =>
              query.queryKey.includes(owner) &&
              typeof query.queryKey[0] === "string" &&
              query.queryKey[0].startsWith("member-introduction:"),
          });
        }
      } catch (cause) {
        try {
          await recover();
        } catch {
          if (alive.current) setRecovery(true);
        }
        throw cause;
      }
    });

  const submitControls = (
    <div className="profile-revision-footer">
      <Button
        className="w-full"
        type="submit"
        form="profile-revision-form"
        disabled={busy || !consent || instruction.trim().length < 3 || recovery}
      >
        <Send aria-hidden="true" />
        {busy ? "다듬는 중…" : "비서와 다듬기"}
      </Button>
    </div>
  );
  return (
    <div className="space-y-6 pb-6">
      <div className="flex items-start gap-3">
        <AssistantMark className="size-10 shrink-0" />
        <div className="min-w-0">
          <h2 className="text-lg font-semibold leading-snug">내 매력이 더 잘 전해지게.</h2>
          <p className="mt-1 text-sm leading-relaxed text-muted-foreground">
            바꾸고 싶은 점을 알려주세요. 반영 전 함께 확인해요.
          </p>
        </div>
      </div>
      {!state ? (
        <div
          role={live.isError ? "alert" : "status"}
          className="space-y-3 text-sm text-muted-foreground"
        >
          <p>{live.isError ? "프로필을 불러오지 못했어요." : "프로필을 확인하고 있어요."}</p>
          {live.isError && (
            <Button variant="outline" onClick={() => void live.refetch()}>
              다시 불러오기
            </Button>
          )}
        </div>
      ) : !state.enabled ? (
        <div className="space-y-3">
          <p className="text-sm leading-relaxed text-muted-foreground">
            비서와 글 다듬기는 준비 중이에요. 직접 수정은 바로 할 수 있어요.
          </p>
          <ManualEdit />
        </div>
      ) : (
        <>
          {draft?.state === "approved" && (
            <div role="status" className="flex items-center gap-2 text-sm font-medium text-success">
              <Check className="size-4" aria-hidden="true" />
              <span>프로필에 반영했어요.</span>
              <Link
                className="ml-auto inline-flex min-h-11 items-center text-primary-strong"
                to="/profile"
              >
                프로필 보기
              </Link>
            </div>
          )}
          {pending ? (
            <div role="status" className="assistant-reply">
              <p className="font-medium">말씀해주신 뜻을 살리고 있어요.</p>
              <p className="mt-1 text-sm text-muted-foreground">
                완성되면 바뀐 부분을 함께 확인해요.
              </p>
            </div>
          ) : review ? (
            <RevisionReview draft={review} busy={busy} onDecide={decide} />
          ) : (
            <form
              id="profile-revision-form"
              className="space-y-4"
              onSubmit={(event) => {
                event.preventDefault();
                void generate();
              }}
            >
              {me?.headline || me?.intro ? (
                <details className="profile-revision-context">
                  <summary className="min-h-11 cursor-pointer text-sm font-semibold">
                    현재 소개글 확인
                    {me.headline ? (
                      <span className="mt-2 block text-base font-medium leading-relaxed">
                        {me.headline}
                      </span>
                    ) : null}
                  </summary>
                  <p className="mt-3 whitespace-pre-wrap text-sm leading-relaxed text-muted-foreground">
                    {me.intro || "소개글을 아직 작성하지 않았어요."}
                  </p>
                </details>
              ) : null}
              <label className="block text-sm font-semibold" htmlFor="profile-revision-instruction">
                어떻게 바꿔볼까요?
              </label>
              <Textarea
                ref={inputRef}
                id="profile-revision-instruction"
                value={instruction}
                onChange={(event) => setInstruction(event.target.value)}
                maxLength={1000}
                rows={4}
                disabled={busy}
                placeholder="예: 낯을 가린다는 표현을 조금 더 부드럽게 바꿔줘."
                aria-describedby="profile-revision-hint"
              />
              <div className="flex flex-wrap gap-2" role="group" aria-label="다듬기 요청 예시">
                {[
                  ["말투 부드럽게", "내 말투를 유지하면서 문장을 부드럽게 다듬어줘"],
                  ["반복 줄이기", "반복되는 표현을 줄이고 읽기 쉽게 정리해줘"],
                ].map(([label, text]) => (
                  <Button
                    key={label}
                    type="button"
                    variant="outline"
                    size="sm"
                    disabled={busy}
                    onClick={() => {
                      setInstruction(text);
                      inputRef.current?.focus();
                    }}
                  >
                    {label}
                  </Button>
                ))}
              </div>
              <p
                id="profile-revision-hint"
                className="text-xs leading-relaxed text-muted-foreground"
              >
                소개글만 다듬어요. 사진·기본 정보는 직접 수정에서 바꿀 수 있어요.
              </p>
              <label className="flex min-h-11 items-start gap-2 py-2 text-sm leading-relaxed">
                <input
                  type="checkbox"
                  className="mt-1 size-4 shrink-0 accent-primary-strong"
                  checked={consent}
                  onChange={(event) => setConsent(event.target.checked)}
                  disabled={busy}
                />
                <span>현재 공개 글과 이 요청을 AI에 보내 다듬는 데 동의해요.</span>
              </label>
              {footer ? createPortal(submitControls, footer) : submitControls}
              {instruction.trim().length > 0 && instruction.trim().length < 3 && (
                <p className="text-xs text-muted-foreground">
                  바꾸고 싶은 점을 세 글자 이상 알려주세요.
                </p>
              )}
            </form>
          )}
          {(draft?.state === "failed" || draft?.state === "expired") && !error && (
            <p role="status" className="text-sm leading-relaxed text-muted-foreground">
              {draft.state === "expired"
                ? "이전 초안의 확인 시간이 지났어요. 새 요청으로 다시 다듬어 주세요."
                : "이전 초안을 완성하지 못했어요. 현재 프로필은 그대로예요."}
            </p>
          )}
          {error && (
            <p role="alert" className="text-sm leading-relaxed text-destructive">
              {error}
            </p>
          )}
          {(pending || recovery || error) && (
            <Button
              variant="outline"
              className="w-full"
              disabled={busy}
              onClick={() =>
                void run(async () => {
                  await recover();
                })
              }
            >
              <RefreshCw aria-hidden="true" />
              상태 확인
            </Button>
          )}
          <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
            <Link
              className="inline-flex min-h-11 items-center font-medium text-primary-strong"
              to="/profile"
            >
              현재 프로필 보기
            </Link>
            <ManualEdit />
          </div>
        </>
      )}
    </div>
  );
}

function ManualEdit() {
  return (
    <Link
      className="inline-flex min-h-11 items-center text-sm font-medium text-primary-strong"
      to="/signup"
      search={{ edit: true }}
    >
      사진·기본 정보 직접 수정
    </Link>
  );
}

function RevisionReview({
  draft,
  busy,
  onDecide,
}: {
  draft: ProfileRevisionDraft;
  busy: boolean;
  onDecide: (approved: boolean) => Promise<void>;
}) {
  const changes = profileRevisionChanges(draft.before!, draft.after!);
  return (
    <section className="space-y-5" aria-labelledby="revision-review-title">
      <div>
        <h2 id="revision-review-title" className="text-lg font-semibold">
          이렇게 다듬어봤어요.
        </h2>
        <p className="mt-1 text-sm leading-relaxed text-muted-foreground">
          {profileRevisionSummary(draft.before!, draft.after!)}
        </p>
      </div>
      <p className="text-sm leading-relaxed">
        <span className="font-semibold">내 요청</span>
        <br />
        {draft.instruction}
      </p>
      <div className="space-y-5">
        {changes.map((change) => (
          <article key={change.label} className="space-y-2">
            <h3 className="text-sm font-semibold text-primary-strong">{change.label}</h3>
            <div className="space-y-2">
              <div className="text-sm leading-relaxed text-muted-foreground">
                <span className="mb-1 block text-xs font-medium">현재</span>
                <p className="whitespace-pre-wrap">{change.before || "아직 없어요."}</p>
              </div>
              <div className="rounded-surface bg-assistant-surface p-4 text-assistant-ink">
                <span className="mb-1 block text-xs font-medium">수정안</span>
                <p className="whitespace-pre-wrap text-base leading-relaxed">
                  {change.after || "이 내용은 빼요."}
                </p>
              </div>
            </div>
          </article>
        ))}
      </div>
      <div className="space-y-2">
        <p className="text-xs leading-relaxed text-muted-foreground">
          반영하면 소개가 열린 상대에게 수정된 글이 보여요.
        </p>
        <Button className="w-full" disabled={busy} onClick={() => void onDecide(true)}>
          {busy ? "확인하는 중…" : "이대로 프로필에 반영"}
        </Button>
        <Button
          className="w-full"
          variant="ghost"
          disabled={busy}
          onClick={() => void onDecide(false)}
        >
          반영하지 않고 다시 쓰기
        </Button>
      </div>
    </section>
  );
}
