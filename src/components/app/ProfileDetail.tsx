import type { ReactNode } from "react";
import { UserRound } from "lucide-react";

import { usePhotoUrl } from "@/lib/photo";
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

/*
  소개장(D3, 2026-10-10).

  예전 구성은 4:5 사진 히어로(그라데이션 + 이니셜) → "01 소개 PROFILE" 처럼 번호와
  영문 키커가 붙은 섹션이었다. 번호는 순서 정보가 아니었고, 영문 키커는 한국어
  화면에서 정보 0 인 템플릿 문법이었다. 그리고 사진이 맨 위를 차지해 "결" 보다
  얼굴이 먼저 읽혔다.

  사람의 문장이 먼저다. 이름 → 한 줄 소개 → 소개글 → 사진 → 기본 정보 순서.
  명조는 한 줄 인용에만 남기고, 이름과 본문은 화면의 나머지 UI와 같은 서체로 읽힌다.
*/

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="border-t border-border pt-5">
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

function PhotoTile({ path, name, index }: { path: string; name: string; index: number }) {
  // 비공개 버킷이라 표시할 때마다 서명 URL 을 받는다(S11).
  const src = usePhotoUrl(path);
  return (
    <div className="aspect-[3/4] w-[56%] shrink-0 snap-start overflow-hidden rounded-surface bg-muted">
      {src ? (
        <img
          src={src}
          alt={`${name} 프로필 사진 ${index + 1}`}
          loading={index > 1 ? "lazy" : "eager"}
          className="size-full object-cover"
        />
      ) : (
        <div className="grid size-full place-items-center">
          <UserRound className="size-8 text-muted-foreground" aria-hidden="true" />
        </div>
      )}
    </div>
  );
}

/*
  사진은 소개장의 삽화다. 한 장이 화면 폭을 다 쓰면 글보다 사진이 먼저 읽힌다
  (2026-10-10). 3장 이상(s53)을 한 줄에 한 장 반 정도 보이게 가로로 넘긴다 — 다음
  사진이 살짝 보여야 넘길 수 있다는 걸 안다.
*/
function Photos({ paths, name }: { paths: string[]; name: string }) {
  if (paths.length === 0) return null;
  return (
    <div
      className="-mx-5 flex snap-x snap-mandatory gap-3 overflow-x-auto overscroll-x-contain px-5 pb-1 focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring focus-visible:outline-none [scrollbar-width:none]"
      role="region"
      tabIndex={0}
      aria-label={`${name} 사진 ${paths.length}장`}
    >
      {paths.map((path, i) => (
        <PhotoTile key={path} path={path} name={name} index={i} />
      ))}
    </div>
  );
}

export function ProfileDetail({ p }: { p: ProfileView }) {
  const paragraphs = (p.intro || "")
    .split(/\n\s*\n/)
    .map((x) => x.trim())
    .filter(Boolean);
  // 가입 기본값이 "소개글 = 한 줄 소개" 라 둘이 같은 사람이 많다. 같은 문장을 두 번 쓰지 않는다.
  if (paragraphs[0] && paragraphs[0] === p.headline?.trim()) paragraphs.shift();
  const [first, ...rest] = paragraphs;

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
        <h2 className="text-[1.875rem] leading-[1.25] font-semibold tracking-[-0.035em] text-foreground">
          {p.name}
          {p.age ? (
            <span className="ml-2 font-sans text-base font-medium text-muted-foreground">
              {p.age}
            </span>
          ) : null}
        </h2>
        <p className="mt-1 text-sm text-muted-foreground">
          {[p.job, p.area].filter(Boolean).join(" · ")}
        </p>
      </header>

      {p.headline ? (
        <blockquote className="border-l-2 border-brand-blush pl-4">
          <p
            data-selectable
            className="serif break-keep break-words text-pretty text-[1.1875rem] leading-[1.5] text-foreground"
          >
            {p.headline}
          </p>
        </blockquote>
      ) : null}

      {!p.story && first ? (
        <p
          data-selectable
          className="break-keep break-words text-pretty text-base leading-[1.65] whitespace-pre-line text-foreground"
        >
          {first}
        </p>
      ) : null}

      <Photos paths={p.photos} name={p.name} />

      {p.story?.sections.map((section) => (
        <section key={section.id} className="border-t border-border pt-5">
          <h3 className="break-keep text-sm font-semibold leading-relaxed text-muted-foreground">
            {section.question}
          </h3>
          <p
            data-selectable
            className="mt-2 break-keep break-words text-pretty text-base leading-[1.65] whitespace-pre-line text-foreground"
          >
            {section.answer}
          </p>
        </section>
      ))}

      {!p.story &&
        rest.map((para) => (
          <p
            key={para}
            data-selectable
            className="break-keep break-words text-pretty text-base leading-[1.65] whitespace-pre-line text-foreground"
          >
            {para}
          </p>
        ))}

      {hasAnyFact ? (
        <dl className="grid grid-cols-3 gap-x-3 gap-y-4 border-t border-border pt-4">
          {facts.map((f) => (
            <div key={f.k}>
              <dt className="text-xs text-muted-foreground">{f.k}</dt>
              <dd
                className={cn(
                  "mt-1 text-sm leading-snug font-semibold",
                  f.v ? "text-foreground" : "text-muted-foreground",
                )}
              >
                {f.v ?? "—"}
              </dd>
            </div>
          ))}
        </dl>
      ) : null}

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
