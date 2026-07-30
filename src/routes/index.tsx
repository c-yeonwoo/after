import { createFileRoute, Link } from "@tanstack/react-router";
import {
  BadgeCheck,
  CalendarCheck,
  MessagesSquare,
  Sparkles,
  ThumbsUp,
  UserRoundSearch,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";

import { BRAND, FEATURES, HUBS } from "@/lib/brand";
import { Logo } from "@/components/Logo";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: `${BRAND.name} — 강남·역삼 직장인 1:1 소개 서비스` },
      { name: "description", content: BRAND.description },
      { property: "og:title", content: `${BRAND.name} — 강남·역삼 직장인 1:1 소개 서비스` },
      { property: "og:description", content: BRAND.tagline },
    ],
  }),
  component: Landing,
});

const FEATURE_ICONS: Record<string, LucideIcon> = {
  verify: BadgeCheck,
  profile: Sparkles,
  match: UserRoundSearch,
  chat: MessagesSquare,
  meet: CalendarCheck,
  feedback: ThumbsUp,
};

type Tone = "ink" | "coral" | "apricot" | "outline";

const TONE_CLASS: Record<Tone, string> = {
  ink: "bg-foreground text-background",
  coral: "bg-primary text-primary-foreground",
  apricot: "bg-accent text-accent-foreground",
  outline: "border-2 border-foreground bg-background text-foreground",
};

const RING_CLASS: Record<Tone, string> = {
  ink: "border border-background/60",
  coral: "border border-primary-foreground/60",
  apricot: "border border-foreground/40",
  outline: "bg-foreground text-background",
};

function feature(id: string) {
  return FEATURES.find((f) => f.id === id)!;
}

function BentoCard({
  id,
  tone,
  className,
  title,
  body,
  eyebrow,
}: {
  id: string;
  tone: Tone;
  className?: string;
  title: ReactNode;
  body?: string;
  eyebrow?: string;
}) {
  const Icon = FEATURE_ICONS[id] ?? Sparkles;
  return (
    <div
      className={cn(
        "bento animate-fade-in transition-transform duration-200 active:scale-[0.98]",
        TONE_CLASS[tone],
        className,
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <span
          className={cn(
            "flex size-9 shrink-0 items-center justify-center rounded-full",
            RING_CLASS[tone],
          )}
        >
          <Icon className="size-4" aria-hidden="true" strokeWidth={2.4} />
        </span>
        {eyebrow ? (
          <span className="text-[0.6rem] font-semibold tracking-[0.16em] uppercase opacity-80">
            {eyebrow}
          </span>
        ) : null}
      </div>
      <div className="mt-8">
        <h3 className="headline text-lg">{title}</h3>
        {body ? <p className="mt-1.5 text-[0.78rem] leading-snug opacity-80">{body}</p> : null}
      </div>
    </div>
  );
}

function Landing() {
  const hub = HUBS[0];

  return (
    <div className="flex min-h-dvh flex-col bg-background pb-4">
      <header
        className="sticky top-0 z-20 bg-background/85 px-6 pb-3 backdrop-blur-xl"
        style={{ paddingTop: "calc(env(safe-area-inset-top, 0px) + 0.9rem)" }}
      >
        <div className="flex min-w-0 items-center justify-between gap-2">
          <Logo size="sm" className="min-w-0 shrink" />
          <Link
            to="/onboarding"
            className="shrink-0 rounded-full bg-foreground px-4 py-1.5 text-xs font-semibold text-background"
          >
            시작
          </Link>
        </div>
      </header>

      <main className="flex-1 px-6">
        {/* Hero */}
        <section className="pt-6 pb-7">
          <p className="inline-flex items-center gap-2 rounded-full border border-foreground px-3 py-1 text-[0.68rem] font-semibold">
            <span className="size-1.5 rounded-full bg-primary" />
            지금 열려 있는 지역 · {hub.label}
          </p>
          <h1 className="headline mt-6 text-[2.6rem] uppercase">
            After Work
            <br />
            <span className="text-primary">Matching</span>
          </h1>
          <p className="mt-5 text-[1.05rem] leading-tight font-medium">
            퇴근하고 만나기 좋은 거리에,
            <br />
            좋은 사람 한 명.
          </p>
          <p className="mt-4 max-w-[19rem] text-[0.82rem] leading-relaxed text-muted-foreground">
            {BRAND.description}
          </p>
        </section>

        {/* Bento */}
        <section className="grid grid-cols-2 gap-3" aria-label="서비스가 하는 일">
          <BentoCard
            id="verify"
            tone="coral"
            eyebrow="Verified only"
            className="col-span-2 min-h-[11rem]"
            title="직장 인증"
            body={feature("verify").body}
          />
          <BentoCard
            id="profile"
            tone="apricot"
            className="aspect-square"
            title={
              <>
                AI 인터뷰
                <br />
                프로필
              </>
            }
          />
          <BentoCard
            id="match"
            tone="ink"
            className="aspect-square"
            title={
              <>
                1:1
                <br />
                매칭 주선
              </>
            }
          />
          <BentoCard
            id="chat"
            tone="outline"
            className="aspect-square"
            title={
              <>
                채팅
                <br />
                자동 오픈
              </>
            }
          />
          <BentoCard
            id="meet"
            tone="coral"
            className="aspect-square"
            title={
              <>
                만남
                <br />
                확실 보장
              </>
            }
          />
          <BentoCard
            id="feedback"
            tone="apricot"
            className="col-span-2 min-h-[8.5rem]"
            eyebrow="Optional"
            title="만남 후 피드백"
            body={feature("feedback").body}
          />
        </section>

        <p className="mt-8 text-[0.7rem] leading-relaxed text-muted-foreground">
          {BRAND.name} · {hub.label} 단일 지역 운영 · 그룹 미팅·전국 매칭은 제공하지 않습니다.
        </p>
      </main>

      {/* 고정 CTA */}
      <div
        className="sticky bottom-0 z-10 mt-8 bg-background/95 px-6 pt-4 backdrop-blur"
        style={{ paddingBottom: "calc(env(safe-area-inset-bottom, 0px) + 1rem)" }}
      >
        <Link
          to="/onboarding"
          className="headline flex w-full items-center justify-center rounded-full bg-foreground py-5 text-base text-background transition-colors duration-300 hover:bg-primary focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
        >
          직장 인증하고 시작하기
        </Link>
        <p className="mt-3 text-center text-[0.62rem] font-semibold tracking-[0.16em] uppercase text-muted-foreground">
          Verification takes 1 minute
        </p>
      </div>
    </div>
  );
}
