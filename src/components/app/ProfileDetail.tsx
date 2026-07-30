import type { ReactNode } from "react";

export type ProfileView = {
  name: string;
  age: number | null;
  job: string;
  mbti?: string;
  smoking?: string;
  drinking?: string;
  area?: string;
  distance?: string;
  headline: string;
  intro: string;
  interests: string[];
  matchTags: string[];
  topics: string[];
  answers: { q: string; a: string }[];
};

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="mt-7">
      <h2 className="text-xs font-semibold tracking-wide text-primary-strong">{title}</h2>
      <div className="mt-2.5">{children}</div>
    </section>
  );
}

function Tag({ children, tone = "muted" }: { children: ReactNode; tone?: "muted" | "accent" }) {
  return (
    <span
      className={
        tone === "accent"
          ? "rounded-full bg-accent/40 px-3 py-1 text-xs text-foreground"
          : "rounded-full bg-muted px-3 py-1 text-xs text-foreground"
      }
    >
      {children}
    </span>
  );
}

export function ProfileDetail({ p }: { p: ProfileView }) {
  const meta = [p.mbti, p.smoking, p.drinking].filter(Boolean).join(" · ");

  return (
    <div>
      <div className="rounded-2xl border border-border bg-card p-6 shadow-card">
        <p className="text-xl font-semibold tracking-tight">
          {p.name}
          {p.age ? <span className="text-muted-foreground"> · 만 {p.age}</span> : null}
        </p>
        <p className="mt-1 text-sm text-muted-foreground">
          {[p.job, meta].filter(Boolean).join(" · ")}
        </p>
        {p.distance || p.area ? (
          <p className="mt-3 inline-flex rounded-full bg-primary/10 px-3 py-1 text-xs font-medium text-primary-strong">
            {[p.area, p.distance].filter(Boolean).join(" · ")}
          </p>
        ) : null}
        {p.headline ? (
          <p className="mt-4 font-serif text-lg leading-snug text-foreground">“{p.headline}”</p>
        ) : null}
      </div>

      {p.intro ? (
        <Section title="소개">
          <p className="text-[0.95rem] leading-relaxed whitespace-pre-line text-foreground">{p.intro}</p>
        </Section>
      ) : null}

      {p.interests.length ? (
        <Section title="관심사">
          <div className="flex flex-wrap gap-1.5">
            {p.interests.map((i) => (
              <Tag key={i}>{i}</Tag>
            ))}
          </div>
        </Section>
      ) : null}

      {p.answers.length ? (
        <Section title="이런 사람입니다">
          <ul className="space-y-4">
            {p.answers.map((a) => (
              <li key={a.q} className="rounded-xl border border-border/70 bg-card/60 p-4">
                <p className="text-xs font-medium text-muted-foreground">{a.q}</p>
                <p className="mt-1.5 text-sm leading-relaxed text-foreground">{a.a}</p>
              </li>
            ))}
          </ul>
        </Section>
      ) : null}

      {p.matchTags.length ? (
        <Section title="잘 맞는 사람">
          <div className="flex flex-wrap gap-1.5">
            {p.matchTags.map((t) => (
              <Tag key={t}>{t}</Tag>
            ))}
          </div>
        </Section>
      ) : null}

      {p.topics.length ? (
        <Section title="이번 만남에서 나누고 싶은 이야기">
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
  );
}
