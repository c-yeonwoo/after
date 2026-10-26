import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import { RefreshCw } from "lucide-react";
import { Link } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";
import { useMe } from "@/lib/me";
import { useAssistantFlags } from "@/lib/useAssistantFlags";
import { setAssistantDraft } from "@/lib/assistantDraft";
import { getAssistantFlags } from "@/lib/privateAssistant";
import { useMemberLiveQuery } from "@/lib/useMemberLiveQuery";
import {
  introduceMember,
  introductionProfileFingerprint,
  memberIntroductionError,
  readIntroductionProfiles,
  type MemberIntroductionBrief,
  type PublicEvidence,
} from "@/lib/memberIntroduction";
import {
  comparePublicProfiles,
  profileReading,
  profileWritingCoaching,
  type ConciergeProfile,
  type ProfileConnection,
} from "@/lib/profileConcierge";

export function ProfileConcierge({
  profile,
  viewer,
  own = false,
  signature,
  targetId,
}: {
  profile: ConciergeProfile;
  viewer?: ConciergeProfile;
  own?: boolean;
  signature?: ReactNode;
  targetId?: string;
}) {
  if (own) return <OwnProfileCoaching profile={profile} signature={signature} />;
  const fallback = (
    <RuleProfileConcierge profile={profile} viewer={viewer} own={own} signature={signature} />
  );
  return !own && targetId ? (
    <MemberManagerIntroduction targetId={targetId} signature={signature} fallback={fallback} />
  ) : (
    fallback
  );
}

function OwnProfileCoaching({
  profile,
  signature,
}: {
  profile: ConciergeProfile;
  signature?: ReactNode;
}) {
  const { me } = useMe();
  const flags = useAssistantFlags(me?.id);
  const coaching = profileWritingCoaching(profile);
  const canAsk = Boolean(flags.data?.chat && !flags.isError && !flags.isPaused);
  const ask =
    "내 프로필의 장점과 아쉬운 표현을 코칭해줘. 상대가 읽기 편하도록 원문에 근거한 수정 예시도 알려줘.";
  return (
    <aside className="profile-coaching space-y-5" aria-label="내 프로필 표현 점검">
      <div className="flex items-center gap-3">
        {signature}
        <div>
          <h3 className="text-lg font-semibold">첫인상을 더 선명하게</h3>
          <p className="mt-1 text-xs text-muted-foreground">
            내 문장을 바탕으로 한 표현 점검 · 나만 보기
          </p>
        </div>
      </div>
      {[coaching.strength, coaching.improvement]
        .filter((item) => item !== null)
        .map((item) => (
          <section key={item.title}>
            <h4 className="text-base font-semibold">{item.title}</h4>
            {item.quote ? (
              <blockquote className="profile-coaching-quote">“{item.quote}”</blockquote>
            ) : null}
            <p className="mt-2 break-keep text-sm leading-relaxed">{item.advice}</p>
          </section>
        ))}
      {canAsk && me ? (
        <Link
          to="/assistant"
          search={{ panel: "chat" }}
          className="assistant-suggestion inline-flex items-center"
          onClick={() => setAssistantDraft(me.id, ask)}
        >
          비서에게 코칭받기
        </Link>
      ) : (
        <Link
          to="/signup"
          search={{ edit: true }}
          className="assistant-suggestion inline-flex items-center"
        >
          프로필 직접 다듬기
        </Link>
      )}
      {canAsk ? (
        <p className="text-xs leading-relaxed text-muted-foreground">
          현재 공개 글로 AI 조언을 받아요. 대화에서 직접 보내면 시작해요.
        </p>
      ) : null}
    </aside>
  );
}

function RuleProfileConcierge({
  profile,
  viewer,
  own,
  signature,
}: {
  profile: ConciergeProfile;
  viewer?: ConciergeProfile;
  own: boolean;
  signature?: ReactNode;
}) {
  const id = useId();
  const reading = profileReading(profile);
  const comparison = viewer && !own ? comparePublicProfiles(viewer, profile) : null;
  if (!own && !comparison && !reading.summary && !reading.hooks.length) return null;

  return (
    <aside aria-labelledby={id} className="space-y-5 rounded-surface bg-muted p-5">
      <div className="flex items-center gap-3">
        {signature}
        <div>
          <h3 id={id} className="text-lg font-semibold leading-snug text-foreground">
            {own ? "나만 보는 프로필 코칭" : "이분을 소개할게요"}
          </h3>
          {own ? (
            <p className="mt-1 text-sm leading-relaxed text-muted-foreground">
              이 코칭은 상대에게 보이는 소개글에 포함되지 않아요.
            </p>
          ) : null}
        </div>
      </div>

      {reading.summary ? (
        <blockquote>
          <p className="break-keep break-words text-base leading-relaxed text-foreground">
            {reading.summary}
          </p>
          <footer className="mt-2 text-xs text-muted-foreground">프로필에 담긴 요약</footer>
        </blockquote>
      ) : null}

      {comparison ? (
        <>
          <section aria-label="말문을 열어 줄 접점">
            <h4 className="text-base font-semibold text-foreground">말문을 열어 줄 접점</h4>
            {comparison.connections.length ? (
              <div className="mt-4 space-y-5">
                {comparison.connections.map((connection) => (
                  <Connection key={connection.id} value={connection} />
                ))}
              </div>
            ) : (
              <p className="mt-3 text-sm leading-relaxed text-foreground">
                아직 두 소개글에서 겹치는 소재를 찾지 못했어요. 눈길이 간 이야기 하나부터
                물어보세요.
              </p>
            )}
          </section>
          {comparison.considerations.length ? (
            <section aria-label="함께 확인할 점">
              <h4 className="text-base font-semibold text-foreground">함께 확인할 점</h4>
              <div className="mt-4 space-y-5">
                {comparison.considerations.map((connection) => (
                  <Connection key={connection.id} value={connection} />
                ))}
              </div>
            </section>
          ) : null}
        </>
      ) : null}

      {reading.hooks.length ? (
        <section aria-label="대화의 실마리">
          <h4 className="text-base font-semibold text-foreground">프로필에 담긴 대화의 실마리</h4>
          <ul className="mt-3 space-y-2">
            {reading.hooks.map((hook) => (
              <li
                key={hook}
                className="break-keep break-words text-sm leading-relaxed text-foreground"
              >
                {hook}
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {own ? (
        <section aria-label="다음에 더할 이야기" className="space-y-3">
          <p className="text-sm leading-relaxed text-foreground">{reading.strength}</p>
          <div>
            <h4 className="text-base font-semibold text-foreground">다음에 한 장면만 더</h4>
            <p className="mt-2 break-keep text-base leading-relaxed text-foreground">
              {reading.nextPrompt}
            </p>
          </div>
        </section>
      ) : null}
    </aside>
  );
}

function MemberManagerIntroduction({
  targetId,
  signature,
  fallback,
}: {
  targetId: string;
  signature?: ReactNode;
  fallback: ReactNode;
}) {
  const id = useId();
  const { me } = useMe();
  const live = useMemberLiveQuery(
    `member-introduction:${targetId}`,
    me?.id,
    async () => {
      const flags = await getAssistantFlags();
      const profiles =
        flags.introduction && me ? await readIntroductionProfiles(me.id, targetId) : null;
      return { owner: me?.id, target: targetId, enabled: flags.introduction, profiles };
    },
    Boolean(me?.id && me.id !== targetId),
  );
  const context =
    !live.isError &&
    !live.isPaused &&
    live.data &&
    live.data.owner === me?.id &&
    live.data.target === targetId
      ? live.data
      : null;
  const fingerprint = context?.profiles ? introductionProfileFingerprint(context.profiles) : "";
  const [consent, setConsent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState<{
    fingerprint: string;
    brief: MemberIntroductionBrief;
  } | null>(null);
  const generation = useRef(0);
  const busyRef = useRef(false);
  useEffect(() => {
    setConsent(false);
    setError("");
    setResult(null);
    setBusy(false);
    busyRef.current = false;
    generation.current++;
    return () => {
      // Ignore a completed request after unmount or account/target switch.
      // eslint-disable-next-line react-hooks/exhaustive-deps
      generation.current++;
    };
  }, [me?.id, targetId]);
  const visible =
    context?.enabled &&
    fingerprint &&
    result?.fingerprint === fingerprint &&
    result.brief.viewerId === me?.id &&
    result.brief.targetId === targetId &&
    Date.parse(result.brief.expiresAt) > Date.now()
      ? result.brief
      : null;

  async function prepare() {
    if (!me || !context?.enabled || !context.profiles || !consent || busyRef.current) return;
    busyRef.current = true;
    setBusy(true);
    setError("");
    const epoch = ++generation.current;
    const ownerId = me.id;
    try {
      const brief = await introduceMember(targetId, crypto.randomUUID());
      const latest = await readIntroductionProfiles(ownerId, targetId);
      if (
        !latest ||
        introductionProfileFingerprint(latest) !== fingerprint ||
        brief.viewerId !== ownerId ||
        brief.targetId !== targetId
      )
        throw new Error("changed");
      if (generation.current === epoch) setResult({ fingerprint, brief });
    } catch (cause) {
      if (generation.current === epoch)
        setError(memberIntroductionError(cause instanceof Error ? cause.message : ""));
    } finally {
      if (generation.current === epoch) {
        setBusy(false);
        busyRef.current = false;
      }
      void live.refetch();
    }
  }

  if (!context) return null;
  if (!context.enabled) return fallback;
  if (!context.profiles) return null;
  return (
    <aside aria-labelledby={id} className="space-y-5 rounded-surface bg-muted p-5">
      <div className="flex items-center gap-3">
        {signature}
        <h3 id={id} className="text-lg font-semibold leading-snug text-foreground">
          이분을 소개할게요
        </h3>
      </div>
      {visible ? (
        <div className="space-y-6" aria-live="polite">
          <section aria-label="비서가 읽어드리는 프로필" className="space-y-4">
            {visible.portrait.map((item) => (
              <ManagerObservation key={item.text} text={item.text} sources={item.sources} />
            ))}
          </section>
          {visible.connections.length ? (
            <section>
              <h4 className="text-base font-semibold text-foreground">두 분의 접점</h4>
              <div className="mt-3 space-y-4">
                {visible.connections.map((item) => (
                  <ManagerObservation
                    key={item.text}
                    text={item.text}
                    sources={[...item.selfSources, ...item.otherSources]}
                  />
                ))}
              </div>
            </section>
          ) : null}
          {visible.questions.length ? (
            <section>
              <h4 className="text-base font-semibold text-foreground">함께 알아볼 점</h4>
              <div className="mt-3 space-y-4">
                {visible.questions.map((item) => (
                  <ManagerObservation key={item.text} text={item.text} sources={item.sources} />
                ))}
              </div>
            </section>
          ) : null}
          <p className="text-xs leading-relaxed text-muted-foreground">
            두 사람의 공개 답변에서 AI가 정리한 설명이에요.
          </p>
        </div>
      ) : (
        <div>
          <p className="text-base leading-relaxed text-foreground">
            어떤 일상을 보내는지, 두 분은 어디서 이야기가 통할지 살펴볼게요.
          </p>
          <label className="mt-3 flex min-h-11 cursor-pointer items-start gap-3 py-2 text-sm leading-relaxed text-foreground">
            <input
              type="checkbox"
              checked={consent}
              disabled={busy}
              onChange={(event) => setConsent(event.target.checked)}
              className="mt-0.5 size-5 shrink-0 accent-primary-strong"
            />
            <span>두 사람의 공개 답변을 AI에 보내 소개 설명을 준비하는 데 동의해요.</span>
          </label>
          <Button
            className="mt-3 w-full"
            disabled={!consent || busy}
            onClick={() => void prepare()}
          >
            {busy ? (
              <>
                <RefreshCw className="animate-spin motion-reduce:animate-none" />두 분의 이야기를
                읽고 있어요…
              </>
            ) : (
              "비서 설명 듣기"
            )}
          </Button>
        </div>
      )}
      {error ? (
        <p role="alert" className="text-sm leading-relaxed text-destructive">
          {error}
        </p>
      ) : null}
    </aside>
  );
}

function ManagerObservation({ text, sources }: { text: string; sources: PublicEvidence[] }) {
  return (
    <div>
      <p className="break-keep break-words text-base leading-relaxed text-foreground">{text}</p>
      <details className="mt-1 text-sm">
        <summary className="min-h-11 cursor-pointer py-3 font-medium text-primary-strong underline-offset-4 hover:underline focus-visible:rounded-control focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
          공개 답변 보기
        </summary>
        <dl className="space-y-3 pb-2">
          {sources.map((source) => (
            <div key={`${source.person}:${source.field}:${source.quote}`}>
              <dt className="text-xs font-medium text-muted-foreground">
                {source.person === "self" ? "나" : "상대"}의 이야기
              </dt>
              <dd className="mt-1 break-keep break-words text-sm leading-relaxed text-foreground">
                “{source.quote}”
              </dd>
            </div>
          ))}
        </dl>
      </details>
    </div>
  );
}

function Connection({ value }: { value: ProfileConnection }) {
  return (
    <div>
      <p className="break-keep text-sm leading-relaxed text-foreground">{value.reading}</p>
      <p className="mt-2 break-keep text-sm leading-relaxed text-foreground">{value.invitation}</p>
      <details className="mt-2 text-sm">
        <summary className="min-h-11 cursor-pointer py-3 font-medium text-primary-strong underline-offset-4 hover:underline focus-visible:rounded-control focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
          두 사람의 공개 답변 보기
        </summary>
        <dl className="space-y-3 pb-2">
          {value.evidence.map((source) => (
            <div key={`${source.person}:${source.field}`}>
              <dt className="text-xs font-medium text-muted-foreground">
                {source.person === "self" ? "나" : "상대"} · {source.label}
              </dt>
              <dd className="mt-1 break-keep break-words text-sm leading-relaxed text-foreground">
                “{source.quote}”
              </dd>
            </div>
          ))}
        </dl>
      </details>
    </div>
  );
}
