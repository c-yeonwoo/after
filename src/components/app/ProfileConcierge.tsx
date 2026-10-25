import { useId, type ReactNode } from "react";
import {
  comparePublicProfiles,
  profileReading,
  type ConciergeProfile,
  type ProfileConnection,
} from "@/lib/profileConcierge";

export function ProfileConcierge({
  profile,
  viewer,
  own = false,
  signature,
}: {
  profile: ConciergeProfile;
  viewer?: ConciergeProfile;
  own?: boolean;
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
