import { useEffect, useRef, useState, type ReactNode } from "react";

import { usePhotoUrl } from "@/lib/photo";
import { cn } from "@/lib/utils";

export type ProfileView = {
  name: string;
  age: number | null;
  job: string;
  mbti?: string;
  smoking?: string;
  drinking?: string;
  religion?: string;
  area?: string;
  photo?: string;
  headline: string;
  intro: string;
  interests: string[];
  matchTags: string[];
  topics: string[];
  answers: { q: string; a: string }[];
};

/** 스크롤하면 아래에서 떠오르듯 나타나는 래퍼 */
function Reveal({
  children,
  delay = 0,
  className,
}: {
  children: ReactNode;
  delay?: number;
  className?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [shown, setShown] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (typeof IntersectionObserver === "undefined") {
      setShown(true);
      return;
    }
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) if (e.isIntersecting) setShown(true);
      },
      { rootMargin: "0px 0px -10% 0px", threshold: 0.05 },
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);

  return (
    <div
      ref={ref}
      style={{ transitionDelay: `${delay}ms` }}
      className={cn(
        "transition-all duration-700 ease-out motion-reduce:transition-none",
        shown ? "translate-y-0 opacity-100" : "translate-y-5 opacity-0",
        className,
      )}
    >
      {children}
    </div>
  );
}

function SectionHead({ index, title, kicker }: { index: number; title: string; kicker?: string }) {
  return (
    <div className="mb-4 flex items-baseline gap-3 border-b-2 border-foreground/85 pb-2">
      <span className="headline text-sm leading-none text-primary">
        {String(index).padStart(2, "0")}
      </span>
      <h2 className="headline text-lg leading-none tracking-tight text-foreground">{title}</h2>
      {kicker ? (
        <span className="ml-auto text-3xs tracking-[0.18em] text-ink-muted uppercase">
          {kicker}
        </span>
      ) : null}
    </div>
  );
}

function Tag({ children, tone = "muted" }: { children: ReactNode; tone?: "muted" | "accent" }) {
  return (
    <span
      className={cn(
        "rounded-control px-3.5 py-2 text-sm leading-none font-medium",
        tone === "accent"
          ? "bg-accent/45 text-accent-foreground"
          : "border border-foreground/12 bg-card text-foreground/85",
      )}
    >
      {children}
    </span>
  );
}

export function ProfileDetail({ p }: { p: ProfileView }) {
  // 비공개 버킷이라 표시할 때마다 서명 URL 을 받는다(S11).
  const photo = usePhotoUrl(p.photo);
  let n = 0;
  const next = () => ++n;

  /*
    기본 정보 3×2. MBTI·종교는 온보딩에서 선택 항목이라 비어 있을 수 있는데,
    비었다고 칸을 빼면 5칸·4칸이 되어 그리드가 사람마다 달라진다.
    항상 6칸을 유지하고 값이 없으면 "—" 로 표시한다.
  */
  const facts = [
    { k: "직업", v: p.job },
    { k: "지역", v: p.area },
    { k: "MBTI", v: p.mbti },
    { k: "흡연", v: p.smoking },
    { k: "음주", v: p.drinking },
    { k: "종교", v: p.religion },
  ].map((f) => ({ ...f, v: f.v?.trim() || null }));

  const hasAnyFact = facts.some((f) => f.v);

  return (
    <div className="pb-4">
      {/* 히어로 카드 — 사진 전면 + 하단 딤 오버레이 */}
      <div className="overflow-hidden rounded-surface bg-card shadow-card">
        <div className="relative aspect-[4/5] w-full">
          {photo ? (
            <img src={photo} alt={`${p.name} 프로필 사진`} className="size-full object-cover" />
          ) : (
            <div className="grid size-full place-items-center bg-gradient-to-br from-primary/80 via-primary to-accent">
              <span className="headline text-7xl leading-none text-background/90">
                {p.name.slice(0, 1)}
              </span>
            </div>
          )}

          <div
            className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/90 via-black/35 to-transparent"
            aria-hidden="true"
          />

          <div className="absolute inset-x-0 bottom-0 px-5 pb-5">
            {p.area ? (
              <span className="inline-flex rounded-control bg-white/18 px-3 py-1 text-2xs font-semibold tracking-wide text-white backdrop-blur-md">
                {p.area}
              </span>
            ) : null}
            {/* 나이는 이름보다 한 단계 작게 — 이름이 정체, 나이는 부가 정보다.
                홈 카드(text-2xl 이름 + text-base 나이)와 같은 위계를 쓴다. */}
            <h2 className="headline mt-2.5 text-3xl leading-[1] text-white">
              {p.name}
              {p.age ? <span className="ml-1.5 text-lg text-white/60">{p.age}</span> : null}
            </h2>
            {p.headline ? (
              <p className="mt-2 max-w-[20rem] text-sm leading-snug text-white/85">{p.headline}</p>
            ) : null}
          </div>
        </div>
      </div>

      {/*
        기본 정보 — 사진 바로 아래. 접지 않는다.
        PRD F4 는 원래 "스펙은 접어서 아래에" 였지만, 실제 화면에서 보니 직업·지역은
        "만날 수 있는 사람인가"를 판단하는 실용 정보라 한 번의 탭을 요구할 이유가 없었다.
        한 줄 소개는 이미 히어로에 얹혀 있어서 "결"이 먼저 오는 순서는 유지된다.
      */}
      {/*
        소개글을 스펙 그리드 **위로** 올렸다.
        3만원을 정당화할 내용(소개·요즘 시간 쓰는 것)이 전부 아래에 있는데
        결정 버튼은 fixed 로 처음부터 떠 있어서, 구조가 빠른 거절에 최적화돼
        있었다(진단 UX-5). 첫 화면에서 "어떤 사람인가"를 먼저 읽게 한다.
      */}
      {p.intro ? (
        <section className="mt-6">
          <SectionHead index={next()} title="소개" kicker="Profile" />
          <p className="text-base leading-[1.75] whitespace-pre-line text-foreground/90">
            {p.intro}
          </p>
        </section>
      ) : null}

      {hasAnyFact ? (
        <dl className="mt-8 grid grid-cols-3 gap-x-3 gap-y-4 border-y border-foreground/12 py-4">
          {facts.map((f) => (
            <div key={f.k}>
              <dt className="text-3xs tracking-[0.16em] text-ink-muted uppercase">{f.k}</dt>
              <dd
                className={cn(
                  "mt-1 text-sm leading-snug font-semibold",
                  f.v ? "text-foreground" : "text-ink-muted",
                )}
              >
                {f.v ?? "—"}
              </dd>
            </div>
          ))}
        </dl>
      ) : null}

      <div className="mt-8 space-y-10">
        {p.interests.length ? (
          <Reveal>
            <section>
              <SectionHead index={next()} title="요즘 시간 쓰는 것" kicker="Now" />
              <div className="flex flex-wrap gap-2">
                {p.interests.map((i) => (
                  <Tag key={i}>{i}</Tag>
                ))}
              </div>
            </section>
          </Reveal>
        ) : null}

        {p.answers.length ? (
          <section>
            <Reveal>
              <SectionHead index={next()} title="인터뷰" kicker="Interview" />
            </Reveal>
            <div className="space-y-7">
              {p.answers.map((a, i) => (
                <Reveal key={a.q} delay={i * 60}>
                  <article className="grid grid-cols-[2.1rem_1fr] gap-x-3">
                    <span className="headline pt-0.5 text-base text-foreground/25">Q{i + 1}</span>
                    <div>
                      <h3 className="text-base leading-snug font-bold text-foreground">{a.q}</h3>
                      <p className="mt-2 text-sm leading-[1.7] whitespace-pre-line text-foreground/80">
                        {a.a}
                      </p>
                    </div>
                  </article>
                </Reveal>
              ))}
            </div>
          </section>
        ) : null}

        {p.matchTags.length ? (
          <Reveal>
            <section>
              <SectionHead index={next()} title="잘 맞는 사람" kicker="Match" />
              <div className="flex flex-wrap gap-2">
                {p.matchTags.map((t) => (
                  <Tag key={t}>{t}</Tag>
                ))}
              </div>
            </section>
          </Reveal>
        ) : null}

        {p.topics.length ? (
          <Reveal>
            <section>
              <SectionHead index={next()} title="나누고 싶은 이야기" kicker="Talk" />
              <div className="flex flex-wrap gap-2">
                {p.topics.map((t) => (
                  <Tag key={t} tone="accent">
                    {t}
                  </Tag>
                ))}
              </div>
            </section>
          </Reveal>
        ) : null}
      </div>
    </div>
  );
}
