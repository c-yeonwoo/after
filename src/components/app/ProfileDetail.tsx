import { useEffect, useRef, useState, type ReactNode } from "react";

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
      <h2 className="headline text-[1.05rem] leading-none tracking-tight text-foreground">
        {title}
      </h2>
      {kicker ? (
        <span className="ml-auto text-[0.62rem] tracking-[0.18em] text-ink-muted uppercase">
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
        "rounded-control px-3.5 py-2 text-[0.8rem] leading-none font-medium",
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
  let n = 0;
  const next = () => ++n;

  const facts = [
    { k: "직업", v: p.job },
    { k: "지역", v: p.area },
    { k: "MBTI", v: p.mbti },
    { k: "흡연", v: p.smoking },
    { k: "음주", v: p.drinking },
    { k: "종교", v: p.religion },
  ].filter((f) => Boolean(f.v));

  return (
    <div className="pb-4">
      {/* 히어로 카드 — 사진 전면 + 하단 딤 오버레이 */}
      <div className="overflow-hidden rounded-surface bg-card shadow-card">
        <div className="relative aspect-[4/5] w-full">
          {p.photo ? (
            <img
              src={p.photo}
              alt={`${p.name} 프로필 사진`}
              className="size-full object-cover"
            />
          ) : (
            <div className="grid size-full place-items-center bg-gradient-to-br from-primary/80 via-primary to-accent">
              <span className="headline text-[5rem] leading-none text-background/90">
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
              <span className="inline-flex rounded-control bg-white/18 px-3 py-1 text-[0.66rem] font-semibold tracking-wide text-white backdrop-blur-md">
                {p.area}
              </span>
            ) : null}
            <h2 className="headline mt-2.5 text-[2.1rem] leading-[1] text-white">
              {p.name}
              {p.age ? <span className="text-white/55"> {p.age}</span> : null}
            </h2>
            {p.headline ? (
              <p className="mt-2 max-w-[20rem] text-[0.92rem] leading-snug text-white/85">
                {p.headline}
              </p>
            ) : null}
          </div>
        </div>
      </div>

      {/* 팩트 스트립 */}
      {facts.length ? (
        <Reveal>
          <dl className="mt-5 grid grid-cols-3 gap-x-3 gap-y-4 border-y border-foreground/12 py-4">
            {facts.map((f) => (
              <div key={f.k}>
                <dt className="text-[0.6rem] tracking-[0.16em] text-ink-muted uppercase">{f.k}</dt>
                <dd className="mt-1 text-[0.85rem] leading-snug font-semibold text-foreground">
                  {f.v}
                </dd>
              </div>
            ))}
          </dl>
        </Reveal>
      ) : null}

      {/* 매거진 본문 */}
      <div className="mt-8 space-y-10">
        {p.intro ? (
          <Reveal>
            <section>
              <SectionHead index={next()} title="소개" kicker="Profile" />
              <p className="text-[1.02rem] leading-[1.75] whitespace-pre-line text-foreground/90">
                {p.intro}
              </p>
            </section>
          </Reveal>
        ) : null}

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
                    <span className="headline pt-0.5 text-[0.95rem] text-foreground/25">
                      Q{i + 1}
                    </span>
                    <div>
                      <h3 className="text-[1rem] leading-snug font-bold text-foreground">{a.q}</h3>
                      <p className="mt-2 text-[0.93rem] leading-[1.7] whitespace-pre-line text-foreground/80">
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
