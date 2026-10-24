import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { ArrowRight, RefreshCw } from "lucide-react";
import { AppScreen } from "@/components/app/AppScreen";
import { AssistantMark } from "@/components/assistant/AssistantMark";
import { Button } from "@/components/ui/button";
import { getProfile } from "@/lib/api";
import { useMe } from "@/lib/me";
import { supabase } from "@/lib/supabase";
import { useMemberLiveQuery } from "@/lib/useMemberLiveQuery";
import type { ConversationPreparation } from "../../supabase/functions/_shared/conversation-prep";

export const Route = createFileRoute("/conversation-prep")({
  validateSearch: (search: Record<string, unknown>) => ({
    target:
      typeof search.target === "string" && /^[0-9a-f-]{36}$/i.test(search.target)
        ? search.target
        : "",
  }),
  head: () => ({
    meta: [{ title: "만남 전 준비 — 애프터" }, { name: "robots", content: "noindex" }],
  }),
  component: ConversationPrep,
});

const errors: Record<string, string> = {
  unavailable: "이 프로필을 더 이상 확인할 수 없어요. 소개 화면에서 현재 상태를 확인해 주세요.",
  unauthorized: "로그인을 다시 확인해 주세요.",
  needs_material:
    "아직 공개된 이야기가 충분하지 않아요. 프로필을 읽고 궁금한 점부터 가볍게 물어보세요.",
  daily_limit: "오늘 준비 횟수를 모두 사용했어요. 이미 준비한 상대의 내용은 다시 볼 수 있어요.",
  in_progress: "이미 준비 중이에요. 잠시 뒤 다시 확인해 주세요.",
  quality_failed: "프로필과 맞지 않는 표현이 있어 보여드리지 않았어요. 잠시 뒤 다시 준비해 주세요.",
  not_configured: "대화 준비 기능을 점검하고 있어요. 잠시 뒤 다시 이용해 주세요.",
};

function ConversationPrep() {
  const { target } = Route.useSearch();
  const { me, ready } = useMe();
  const navigate = useNavigate();
  const live = useMemberLiveQuery(
    `conversation-prep-access:${target}`,
    me?.id,
    async () => ({ target, profile: target ? await getProfile(target) : null }),
    Boolean(ready && me && me.onboarding_step >= 7 && target),
  );
  const profile =
    live.data?.target === target && !live.isError && !live.isPaused ? live.data.profile : null;
  const fingerprint = profile ? JSON.stringify(profile) : "";
  const [consent, setConsent] = useState(false);
  const [busy, setBusy] = useState(false);
  const busyRef = useRef(false);
  const generation = useRef(0);
  const [error, setError] = useState("");
  const [result, setResult] = useState<{
    owner: string;
    target: string;
    fingerprint: string;
    data: ConversationPreparation;
  } | null>(null);
  useEffect(() => {
    if (ready && !me) void navigate({ to: "/login" });
  }, [ready, me, navigate]);
  useEffect(() => {
    setResult(null);
    setConsent(false);
    setError("");
    setBusy(false);
    busyRef.current = false;
    generation.current++;
    return () => {
      // Request epoch, not a DOM ref: invalidate every pending response on unmount.
      // eslint-disable-next-line react-hooks/exhaustive-deps
      generation.current++;
    };
  }, [me?.id, target]);
  const visibleResult =
    result?.owner === me?.id && result?.target === target && result.fingerprint === fingerprint
      ? result.data
      : null;

  async function prepare() {
    if (!me || !profile || !consent || busyRef.current) return;
    busyRef.current = true;
    setBusy(true);
    setError("");
    const epoch = ++generation.current;
    try {
      const { data, error: invokeError } = await supabase.functions.invoke<
        ConversationPreparation & { code?: string }
      >("prepare-conversation", {
        body: { target, requestId: crypto.randomUUID(), consent: true },
      });
      if (invokeError || !data?.topics?.length) {
        let code = data?.code;
        if (invokeError && "context" in invokeError && invokeError.context instanceof Response) {
          try {
            code = (await invokeError.context.json()).code;
          } catch {
            /* Generic recovery below. */
          }
        }
        throw new Error(
          errors[code ?? ""] ?? "준비를 마치지 못했어요. 연결을 확인하고 다시 시도해 주세요.",
        );
      }
      const latest = await getProfile(target);
      if (!latest || JSON.stringify(latest) !== fingerprint) throw new Error(errors.unavailable);
      if (generation.current === epoch) setResult({ owner: me.id, target, fingerprint, data });
    } catch (cause) {
      if (generation.current === epoch)
        setError(cause instanceof Error ? cause.message : "다시 시도해 주세요.");
    } finally {
      if (generation.current === epoch) {
        setBusy(false);
        busyRef.current = false;
      }
    }
  }

  return (
    <AppScreen title="만남 전 준비" back="/intro" hideTabs>
      {!ready || (live.isPending && !live.isPaused && target && me?.onboarding_step === 7) ? (
        <p className="py-12 text-center text-sm text-muted-foreground" role="status">
          공개 프로필을 확인하고 있어요…
        </p>
      ) : !profile ? (
        <div className="py-8">
          <h2 className="text-2xl font-bold">지금은 준비할 수 없어요</h2>
          <p className="mt-3 text-sm text-muted-foreground">
            소개가 열려 있는 상대인지, 연결 상태가 괜찮은지 확인해 주세요.
          </p>
          <Button className="mt-5" variant="outline" onClick={() => void live.refetch()}>
            다시 확인하기
          </Button>
          <Link className="mt-4 flex min-h-11 items-center text-sm font-semibold" to="/intro">
            소개로 돌아가기
          </Link>
        </div>
      ) : (
        <>
          <div className="assistant-status">
            <AssistantMark />
            <h2 className="mt-4 text-[1.75rem] leading-[1.3] font-bold tracking-tight break-keep">
              {profile.name ?? "상대"}님과,
              <br />
              첫마디가 편해지도록.
            </h2>
            <p className="mt-3 text-sm leading-relaxed break-keep text-pretty">
              프로필 속 이야기에서 대화의 실마리를 찾아요. 외울 필요 없이, 마음에 드는 질문 하나만
              골라보세요.
            </p>
          </div>
          {!visibleResult ? (
            <div className="mt-7">
              <label className="flex min-h-11 cursor-pointer items-start gap-3 text-sm leading-relaxed">
                <input
                  type="checkbox"
                  checked={consent}
                  onChange={(event) => setConsent(event.target.checked)}
                  className="mt-1 size-5 shrink-0 accent-primary"
                  disabled={busy}
                />
                <span>
                  상대의 공개 프로필 문장을 AI에 보내 대화 주제를 준비할게요. 연락처와 비공개 답변은
                  보내지 않아요.
                </span>
              </label>
              <Button
                size="lg"
                className="mt-5 w-full"
                disabled={!consent || busy}
                onClick={() => void prepare()}
              >
                {busy ? (
                  <>
                    <RefreshCw className="mr-2 size-4 animate-spin motion-reduce:animate-none" />
                    대화를 준비하고 있어요…
                  </>
                ) : (
                  <>
                    공개 프로필로 준비하기
                    <ArrowRight className="ml-2 size-4" />
                  </>
                )}
              </Button>
              <p className="mt-3 text-xs leading-relaxed text-muted-foreground">
                나만 보는 준비 메모예요. 상대에게 전송되지 않으며 약속을 변경하지 않아요.
              </p>
            </div>
          ) : (
            <div className="mt-6 space-y-5" aria-live="polite">
              {visibleResult.topics.map((topic) => (
                <section key={topic.question} className="prep-topic">
                  <h2>{topic.question}</h2>
                  <div className="prep-evidence">
                    <p className="text-xs font-semibold text-muted-foreground">
                      프로필에서 찾은 실마리
                    </p>
                    <blockquote className="mt-1.5">“{topic.quote}”</blockquote>
                  </div>
                  <p className="mt-4 text-xs font-semibold text-muted-foreground">
                    답을 듣고 이어가요
                  </p>
                  <p className="mt-1.5 text-sm leading-relaxed">{topic.followup}</p>
                </section>
              ))}
              {visibleResult.advice?.length ? (
                <section className="assistant-reply" aria-label="만남 직전 짧은 팁">
                  <div className="flex items-center gap-2">
                    <AssistantMark />
                    <h2 className="text-lg font-bold">만남 직전, 이것만.</h2>
                  </div>
                  <div className="mt-5 space-y-5">
                    {visibleResult.advice.map((tip) => (
                      <div key={tip.kind}>
                        <h3 className="text-xs font-semibold text-primary-strong">
                          {
                            {
                              start: "이 이야기부터",
                              respect: "부담을 줄이는 표현",
                              pace: "편안하게 이어가기",
                            }[tip.kind]
                          }
                        </h3>
                        <p className="mt-1.5 text-sm leading-relaxed break-keep">{tip.text}</p>
                        <p className="mt-2 text-xs leading-relaxed text-muted-foreground">
                          프로필의 “{tip.quote}”에서 생각한 팁이에요.
                        </p>
                      </div>
                    ))}
                  </div>
                </section>
              ) : null}
              <p className="text-xs leading-relaxed text-muted-foreground break-keep text-pretty">
                AI가 제안한 질문과 조언이에요. MBTI보다 직접 나누는 이야기를 믿고, 상대의 반응에
                맞춰 편하게 이어가세요.
              </p>
            </div>
          )}
          {error ? (
            <p role="alert" className="mt-4 text-sm leading-relaxed text-destructive">
              {error}
            </p>
          ) : null}
        </>
      )}
    </AppScreen>
  );
}
