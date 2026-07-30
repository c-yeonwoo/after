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
    <Reveal className="mt-9 first:mt-0">
      <section>
        <div className="flex items-center gap-2.5">
          <span className="font-serif text-base leading-none text-primary">
            {String(index).padStart(2, "0")}
          </span>
          <h2 className="text-[0.7rem] font-semibold tracking-[0.2em] text-ink-muted uppercase">
            {title}
          </h2>
          <span className="h-px w-6 bg-primary/40" aria-hidden="true" />
        </div>
        <div className="mt-3.5">{children}</div>
      </section>
    </Reveal>
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
  const meta = [p.mbti, p.smoking, p.drinking, p.religion].filter(Boolean) as string[];
  let n = 0;
  const next = () => ++n;

  return (
    // 화면 좌우 여백을 넘어 꽉 차게: AppScreen의 px-6 을 상쇄
    <div className="-mx-6">
      <div className="relative">
        {/* 히어로 — 사진 + 하단 딤 */}
        <div className="sticky top-0 h-[68vh] max-h-[560px] min-h-[380px] overflow-hidden">
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

          <div className="absolute inset-x-0 bottom-0 px-6 pb-14">
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
          </div>
        </div>

        {/* 시트 — 스크롤하면 히어로 위로 자연스럽게 덮인다 */}
        <div className="relative z-10 -mt-10 rounded-t-[1.75rem] bg-background pb-2 shadow-[0_-24px_60px_-28px_oklch(0.203_0_0/0.55)]">
          <div
            className="pointer-events-none absolute inset-x-0 top-0 h-40 rounded-t-[1.75rem] bg-gradient-to-b from-coral-100/70 to-transparent"
            aria-hidden="true"
          />

          <div className="relative px-6 pt-5">
            <div
              className="mx-auto h-1 w-9 rounded-full bg-foreground/12"
              aria-hidden="true"
            />

            {/* 기본 정보 — 원장(ledger) 스트립 */}
            <dl className="mt-6 grid grid-cols-2 gap-x-4 gap-y-3 border-y border-foreground/10 py-4">
              {[
                { k: "직업", v: p.job },
                ...(p.mbti ? [{ k: "MBTI", v: p.mbti }] : []),
                ...(p.smoking ? [{ k: "흡연", v: p.smoking }] : []),
                ...(p.drinking ? [{ k: "음주", v: p.drinking }] : []),
                ...(p.religion ? [{ k: "종교", v: p.religion }] : []),
              ]
                .filter((r) => Boolean(r.v))
                .map((r) => (
                  <div key={r.k}>
                    <dt className="text-[0.65rem] tracking-[0.16em] text-ink-muted uppercase">
                      {r.k}
                    </dt>
                    <dd className="mt-1 text-[0.9rem] font-medium text-foreground">{r.v}</dd>
                  </div>
                ))}
              {meta.length === 0 && !p.job ? null : null}
            </dl>

            <div className="mt-9">
              {p.intro ? (
                <Section title="소개" index={next()}>
                  <p className="font-serif text-[1.35rem] leading-[1.45] whitespace-pre-line text-foreground">
                    {p.intro}
                  </p>
                </Section>
              ) : null}

              {p.interests.length ? (
                <Section title="요즘 시간을 쓰는 것" index={next()}>
                  <div className="flex flex-wrap gap-2">
                    {p.interests.map((i) => (
                      <Tag key={i}>{i}</Tag>
                    ))}
                  </div>
                </Section>
              ) : null}

              {p.answers.length ? (
                <Section title="이런 사람입니다" index={next()}>
                  <div className="overflow-hidden rounded-surface bg-card shadow-card">
                    {p.answers.map((a, i) => (
                      <Reveal key={a.q} delay={i * 70}>
                        <div
                          className={cn(
                            "px-4 py-4",
                            i > 0 && "border-t border-foreground/8",
                          )}
                        >
                          <p className="font-serif text-[0.95rem] leading-snug text-primary-strong">
                            {a.q}
                          </p>
                          <p className="mt-2 border-l-2 border-accent pl-3 text-[0.9rem] leading-relaxed text-foreground/90">
                            {a.a}
                          </p>
                        </div>
                      </Reveal>
                    ))}
                  </div>
                </Section>
              ) : null}

              {p.matchTags.length ? (
                <Section title="잘 맞는 사람" index={next()}>
                  <div className="flex flex-wrap gap-2">
                    {p.matchTags.map((t) => (
                      <Tag key={t}>{t}</Tag>
                    ))}
                  </div>
                </Section>
              ) : null}

              {p.topics.length ? (
                <Section title="나누고 싶은 이야기" index={next()}>
                  <div className="flex flex-wrap gap-2">
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
      </div>
    </div>
  );
}

