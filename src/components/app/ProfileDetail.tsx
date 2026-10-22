import type { ReactNode } from "react";
import { ProfilePhotos } from "@/components/app/ProfilePhotos";
import { cn } from "@/lib/utils";
import type { ProfileStoryV3 } from "@/lib/profileStory";

export type ProfileView = {
  name: string;
  age: number | null;
  job: string;
  mbti?: string;
  smoking?: string;
  drinking?: string;
  religion?: string;
  area?: string;
  /** Storage 경로들. 첫 장이 대표. */
  photos: string[];
  headline: string;
  intro: string;
  story?: ProfileStoryV3 | null;
  interests: string[];
  matchTags: string[];
  topics: string[];
  answers: { q: string; a: string }[];
};

// 한 줄 소개 → 사진 → 기본 정보 → 인터뷰. 동일한 읽기 순서를 모든 프로필에 쓴다.

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="border-t border-border pt-4">
      <h3 className="text-base leading-snug font-semibold text-foreground">{title}</h3>
      <div className="mt-3">{children}</div>
    </section>
  );
}

/** 칩 대신 문장형 목록 — 봉랍색 가운뎃점 하나만 장식이다. */
function Lines({ items }: { items: string[] }) {
  return (
    <ul className="space-y-1.5">
      {items.map((t) => (
        <li key={t} className="flex gap-2.5 text-base leading-relaxed text-foreground">
          <span aria-hidden="true" className="text-primary-strong">
            ·
          </span>
          <span>{t}</span>
        </li>
      ))}
    </ul>
  );
}

function InterviewAnswer({
  section,
}: {
  section: NonNullable<ProfileView["story"]>["sections"][number];
}) {
  return (
    <section className="border-t border-border pt-5">
      <h3 className="break-keep break-words text-pretty text-sm leading-[1.5] font-medium text-muted-foreground">
        {section.question}
      </h3>
      <p
        data-selectable
        className="mt-2.5 break-keep break-words text-pretty text-base leading-[1.65] whitespace-pre-line text-foreground"
      >
        {section.answer}
      </p>
    </section>
  );
}

export function ProfileDetail({ p }: { p: ProfileView }) {
  const paragraphs = (p.intro || "")
    .split(/\n\s*\n/)
    .map((x) => x.trim())
    .filter(Boolean);
  // 가입 기본값이 "소개글 = 한 줄 소개" 라 둘이 같은 사람이 많다. 같은 문장을 두 번 쓰지 않는다.
  if (paragraphs[0] && paragraphs[0] === p.headline?.trim()) paragraphs.shift();

  /*
    기본 정보 3×2. MBTI·종교는 선택 항목이라 비어 있을 수 있는데, 비었다고 칸을
    빼면 사람마다 그리드가 달라진다. 항상 6칸을 두고 값이 없으면 "—" 로 쓴다.
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
    <article className="space-y-6 pb-4">
      <header>
        <h2 className="text-[1.875rem] leading-[1.25] font-semibold tracking-[-0.03em] text-foreground">
          {p.name}
          {p.age ? (
            <span className="ml-2 font-sans text-base font-medium text-muted-foreground">
              {p.age}
            </span>
          ) : null}
        </h2>
      </header>

      {p.headline ? (
        <blockquote className="border-l border-brand-blush pl-3.5">
          <p
            data-selectable
            className="serif break-keep break-words text-pretty text-[1.1875rem] leading-[1.5] text-foreground"
          >
            {p.headline}
          </p>
        </blockquote>
      ) : null}

      <ProfilePhotos key={p.photos.join("|")} paths={p.photos} name={p.name} />

      {hasAnyFact ? (
        <dl className="grid grid-cols-3 gap-x-3 gap-y-4 border-t border-border pt-4">
          {facts.map((f) => (
            <div key={f.k}>
              <dt className="text-xs text-muted-foreground">{f.k}</dt>
              <dd
                className={cn(
                  "mt-1 break-keep break-words text-sm leading-snug font-medium",
                  f.v ? "text-foreground" : "text-muted-foreground",
                )}
              >
                {f.v ?? "—"}
              </dd>
            </div>
          ))}
        </dl>
      ) : null}

      {p.story?.sections.map((section) => (
        <InterviewAnswer key={section.id} section={section} />
      ))}

      {!p.story &&
        paragraphs.map((para) => (
          <p
            key={para}
            data-selectable
            className="break-keep break-words text-pretty text-base leading-[1.65] whitespace-pre-line text-foreground"
          >
            {para}
          </p>
        ))}

      {!p.story && p.interests.length ? (
        <Section title="요즘 시간 쓰는 것">
          <Lines items={p.interests} />
        </Section>
      ) : null}

      {!p.story && p.answers.length ? (
        <Section title="조금 더">
          <div className="space-y-5">
            {p.answers.map((a) => (
              <div key={a.q}>
                <p className="text-sm font-semibold text-foreground">{a.q}</p>
                <p
                  data-selectable
                  className="mt-1.5 break-keep break-words text-pretty text-base leading-[1.65] whitespace-pre-line text-foreground"
                >
                  {a.a}
                </p>
              </div>
            ))}
          </div>
        </Section>
      ) : null}

      {!p.story && p.matchTags.length ? (
        <Section title="잘 맞았던 사람">
          <Lines items={p.matchTags} />
        </Section>
      ) : null}

      {!p.story && p.topics.length ? (
        <Section title="나누고 싶은 이야기">
          <Lines items={p.topics} />
        </Section>
      ) : null}
    </article>
  );
}
