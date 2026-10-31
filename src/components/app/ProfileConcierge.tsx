import { useId, type ReactNode } from "react";
import { Link } from "@tanstack/react-router";
import { useMe } from "@/lib/me";
import { useAssistantFlags } from "@/lib/useAssistantFlags";
import { setAssistantDraft } from "@/lib/assistantDraft";
import { useMemberIntroduction } from "@/lib/useMemberIntroduction";
import { memberIntroductionError } from "@/lib/memberIntroduction";
import { profileWritingCoaching, type ConciergeProfile } from "@/lib/profileConcierge";

export function ProfileConcierge({
  profile,
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
  return targetId ? <MemberManagerIntroduction targetId={targetId} signature={signature} /> : null;
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
          매니저에게 코칭받기
        </Link>
      ) : (
        <Link
          to="/signup"
          search={{ edit: true }}
          className="assistant-suggestion inline-flex items-center"
        >
          직접 수정하기
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

/** Source quotations stay in the verified result; the original interview is rendered once below. */
function MemberManagerIntroduction({
  targetId,
  signature,
}: {
  targetId: string;
  signature?: ReactNode;
}) {
  const id = useId();
  const { context, brief, visible } = useMemberIntroduction(targetId);
  const failure = brief.error instanceof Error ? brief.error.message : "";
  const canRetry = ![
    "daily_limit",
    "needs_material",
    "disabled",
    "consent_required",
    "unavailable",
    "unauthorized",
  ].includes(failure);
  if (!context?.enabled || !context.profiles) return null;
  return (
    <aside aria-labelledby={id} className="manager-reading" aria-busy={brief.isFetching}>
      <div className="flex items-center gap-2.5">
        {signature}
        <h3 id={id} className="text-base font-semibold">
          매니저가 본 이분
        </h3>
      </div>
      {visible ? (
        <div className="mt-3 space-y-4" aria-live="polite">
          <div className="space-y-2.5">
            {visible.portrait.map((item) => (
              <p key={item.text} className="manager-reading-text">
                {item.text}
              </p>
            ))}
          </div>
          {visible.connections.length ? (
            <section>
              <h4 className="manager-reading-label">함께하면 좋을 점</h4>
              <div className="mt-1.5 space-y-2.5">
                {visible.connections.map((item) => (
                  <p key={item.text} className="manager-reading-text">
                    {item.text}
                  </p>
                ))}
              </div>
            </section>
          ) : null}
          {visible.questions.length ? (
            <section>
              <h4 className="manager-reading-label">천천히 알아볼 점</h4>
              <div className="mt-1.5 space-y-2.5">
                {visible.questions.map((item) => (
                  <p key={item.text} className="manager-reading-text">
                    {item.text}
                  </p>
                ))}
              </div>
            </section>
          ) : null}
        </div>
      ) : brief.isError ? (
        <div className="mt-3">
          <p role="status" className="text-sm leading-relaxed text-muted-foreground">
            {memberIntroductionError(failure)}
          </p>
          {canRetry ? (
            <button
              type="button"
              className="mt-1 inline-flex min-h-11 items-center text-sm font-semibold text-foreground focus-visible:rounded-control focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              onClick={() => void brief.refetch()}
              disabled={brief.isFetching}
            >
              설명 다시 준비하기
            </button>
          ) : null}
        </div>
      ) : (
        <p role="status" className="mt-3 text-sm leading-relaxed text-muted-foreground">
          두 분의 이야기를 읽고 있어요…
        </p>
      )}
    </aside>
  );
}
