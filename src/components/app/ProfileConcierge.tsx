import { useId, type ReactNode } from "react";
import { Link } from "@tanstack/react-router";
import { useMe } from "@/lib/me";
import { useAssistantFlags } from "@/lib/useAssistantFlags";
import { setAssistantDraft } from "@/lib/assistantDraft";
import { useMemberIntroduction } from "@/lib/useMemberIntroduction";
import type { PublicEvidence } from "@/lib/memberIntroduction";
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
    <aside aria-labelledby={id} className="manager-reading space-y-5">
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
  const { context, brief, visible } = useMemberIntroduction(targetId);
  if (!context) return null;
  if (!context.enabled || !context.profiles || (!visible && !brief.isPending)) return fallback;
  if (!visible) return <div aria-busy="true">{fallback}</div>;
  return (
    <aside aria-labelledby={id} className="manager-reading space-y-5">
      <div className="flex items-center gap-3">
        {signature}
        <h3 id={id} className="text-lg font-semibold leading-snug text-foreground">
          이분을 소개할게요
        </h3>
      </div>
      {visible ? (
        <div className="space-y-6" aria-live="polite">
          <section aria-label="매니저가 읽어드리는 프로필" className="space-y-4">
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
      ) : null}
    </aside>
  );
}

function ManagerObservation({ text, sources }: { text: string; sources: PublicEvidence[] }) {
  return (
    <div>
      <p className="break-keep break-words text-base leading-relaxed text-foreground">{text}</p>
      <dl className="mt-3 space-y-2">
        {sources.map((source) => (
          <div key={`${source.person}:${source.field}:${source.quote}`}>
            <dt className="text-xs font-medium text-muted-foreground">
              {source.person === "self" ? "나" : "상대"}의 이야기
            </dt>
            <dd className="mt-1 break-keep break-words text-sm leading-relaxed text-foreground">
              <mark className="profile-highlight">{source.quote}</mark>
            </dd>
          </div>
        ))}
      </dl>
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
