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
      { rootMargin: "0px 0px -12% 0px", threshold: 0.05 },
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
        shown ? "translate-y-0 opacity-100 blur-0" : "translate-y-6 opacity-0 blur-[2px]",
        className,
      )}
    >
      {children}
    </div>
  );
}

function Section({
  title,
  index,
  children,
}: {
  title: string;
  index: number;
  children: ReactNode;
}) {
  return (
    <Reveal className="mt-8 first:mt-0">
      <section>
        <div className="flex items-baseline gap-2">
          <span className="font-mono text-[0.65rem] text-muted-foreground/70">
            {String(index).padStart(2, "0")}
          </span>
          <h2 className="text-xs font-bold tracking-[0.14em] text-primary-strong uppercase">
            {title}
          </h2>
          <span className="h-px flex-1 bg-border" aria-hidden="true" />
        </div>
        <div className="mt-3">{children}</div>
      </section>
    </Reveal>
  );
}

function Tag({ children, tone = "muted" }: { children: ReactNode; tone?: "muted" | "accent" }) {
  return (
    <span
      className={cn(
        "rounded-control px-3 py-1.5 text-xs font-medium",
        tone === "accent"
          ? "bg-accent/50 text-accent-foreground"
          : "border border-border bg-card text-foreground",
      )}
    >
      {children}
    </span>
  );
}

export function ProfileDetail({ p }: { p: ProfileView }) {
  const meta = [p.mbti, p.smoking, p.drinking, p.religion].filter(Boolean);
  let n = 0;
  const next = () => ++n;

  return (
    // 화면 좌우 여백을 넘어 꽉 차게: AppScreen의 px-6 을 상쇄
    <div className="-mx-6">
      <div className="relative">
        {/* 히어로 — 사진 + 하단 딤 */}
        <div className="sticky top-0 -z-0 h-[68vh] max-h-[560px] min-h-[380px] overflow-hidden">
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
            className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/85 via-black/25 to-black/10"
            aria-hidden="true"
          />

          <div className="absolute inset-x-0 bottom-0 px-6 pb-12">
            {p.area ? (
              <span className="inline-flex rounded-control bg-white/15 px-3 py-1 text-[0.68rem] font-semibold tracking-wide text-white backdrop-blur-md">
                {p.area}
              </span>
            ) : null}
            <h2 className="headline mt-3 text-[2.6rem] leading-[0.95] text-white">
              {p.name}
              {p.age ? <span className="text-white/60"> {p.age}</span> : null}
            </h2>
            {p.headline ? (
              <p className="mt-3 max-w-[22rem] font-serif text-lg leading-snug text-white/95">
                “{p.headline}”
              </p>
            ) : null}
            <p className="mt-3 text-xs font-medium text-white/70">
              {[p.job, ...meta].filter(Boolean).join(" · ")}
            </p>
          </div>
        </div>

        {/* 시트 — 스크롤하면 히어로 위로 자연스럽게 덮인다 */}
        <div className="relative z-10 -mt-8 rounded-t-[2rem] bg-background px-6 pt-6 pb-2 shadow-[0_-18px_40px_-24px_rgba(0,0,0,0.45)]">
          <div
            className="mx-auto mb-6 h-1 w-10 rounded-full bg-foreground/15"
            aria-hidden="true"
          />

          {p.intro ? (
            <Section title="소개" index={next()}>
              <p className="text-[0.95rem] leading-relaxed whitespace-pre-line text-foreground">
                {p.intro}
              </p>
            </Section>
          ) : null}

          {p.interests.length ? (
            <Section title="요즘 시간을 쓰는 것" index={next()}>
              <div className="flex flex-wrap gap-1.5">
                {p.interests.map((i) => (
                  <Tag key={i}>{i}</Tag>
                ))}
              </div>
            </Section>
          ) : null}

          {p.answers.length ? (
            <Section title="이런 사람입니다" index={next()}>
              <ul className="space-y-2.5">
                {p.answers.map((a, i) => (
                  <Reveal key={a.q} delay={i * 70}>
                    <li className="rounded-surface border border-border bg-card p-4 shadow-card">
                      <p className="text-xs font-semibold text-muted-foreground">{a.q}</p>
                      <p className="mt-1.5 text-sm leading-relaxed text-foreground">{a.a}</p>
                    </li>
                  </Reveal>
                ))}
              </ul>
            </Section>
          ) : null}

          {p.matchTags.length ? (
            <Section title="잘 맞는 사람" index={next()}>
              <div className="flex flex-wrap gap-1.5">
                {p.matchTags.map((t) => (
                  <Tag key={t}>{t}</Tag>
                ))}
              </div>
            </Section>
          ) : null}

          {p.topics.length ? (
            <Section title="나누고 싶은 이야기" index={next()}>
              <div className="flex flex-wrap gap-1.5">
                {p.topics.map((t) => (
                  <Tag key={t} tone="accent">
                    {t}
                  </Tag>
                ))}
              </div>
            </Section>
          ) : null}
        </div>
      </div>
    </div>
  );
}
