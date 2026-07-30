import { createFileRoute, Link } from "@tanstack/react-router";
import {
  BadgeCheck,
  CalendarCheck,
  MessagesSquare,
  Sparkles,
  UserRoundSearch,
  ThumbsUp,
} from "lucide-react";

import { BRAND, FEATURES, HUBS } from "@/lib/brand";
import { Logo } from "@/components/Logo";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: `${BRAND.name} — 테헤란로 직장인 1:1 소개 서비스` },
      { name: "description", content: BRAND.description },
      { property: "og:title", content: `${BRAND.name} — 테헤란로 직장인 1:1 소개 서비스` },
      { property: "og:description", content: BRAND.tagline },
    ],
  }),
  component: Landing,
});

const FEATURE_ICONS: Record<string, typeof BadgeCheck> = {
  verify: BadgeCheck,
  profile: Sparkles,
  match: UserRoundSearch,
  chat: MessagesSquare,
  meet: CalendarCheck,
  feedback: ThumbsUp,
};

function Landing() {
  const hub = HUBS[0];

  return (
    <div className="min-h-dvh bg-background pb-24">
      <header className="sticky top-0 z-20 px-4 pt-3 pb-2">
        <div className="flex items-center justify-between rounded-full border border-border/60 bg-background/70 py-2 pr-2 pl-4 shadow-[0_6px_24px_-16px_oklch(0_0_0/0.5)] backdrop-blur-xl">
          <Logo size="sm" />
          <Button
            asChild
            size="sm"
            variant="ghost"
            className="h-8 rounded-full px-3 text-xs text-primary-strong hover:bg-primary/10"
          >
            <Link to="/onboarding">시작</Link>
          </Button>
        </div>
      </header>


      <main>
        <section className="relative overflow-hidden px-5 pt-10 pb-14">
          <div
            aria-hidden="true"
            className="pointer-events-none absolute -top-24 -right-16 size-64 rounded-full bg-coral-300/45 blur-3xl"
          />
          <div
            aria-hidden="true"
            className="pointer-events-none absolute -bottom-28 -left-20 size-64 rounded-full bg-brand-200/50 blur-3xl"
          />
          <div className="relative">
            <p className="inline-flex items-center gap-2 rounded-full border border-border bg-card/80 px-3 py-1 text-xs text-muted-foreground backdrop-blur">
              <span className="size-1.5 rounded-full bg-primary" />
              지금 열려 있는 지역 · {hub.label}
            </p>
            <h1 className="mt-6 text-[2.05rem] leading-[1.38] font-semibold">
              퇴근하고 만나기 좋은 거리에,
              <br />
              <span className="text-primary">좋은 사람 한 명.</span>
            </h1>
            <p className="mt-5 text-[0.9rem] leading-[1.75] text-muted-foreground">
              {BRAND.description}
            </p>
          </div>
        </section>

        <section className="border-y border-border bg-card/50 px-5 py-14">
          <h2 className="text-xl font-semibold">바쁜 직장인에게 필요한 만큼만</h2>
          <p className="mt-3 text-[0.9rem] leading-[1.75] text-muted-foreground">
            시간을 많이 쓰지 않아도 되도록, 소개부터 실제 만남까지를 서비스가 대신 챙깁니다.
          </p>
          <div className="mt-9 flex flex-col gap-8">
            {FEATURES.map((feature, i) => {
              const Icon = FEATURE_ICONS[feature.id] ?? Sparkles;
              const tint = [
                "bg-brand-100 text-primary-strong",
                "bg-coral-100 text-coral-600",
                "bg-apricot-300/45 text-accent-foreground",
              ][i % 3];
              return (
                <div key={feature.id}>
                  <span
                    className={`flex size-10 items-center justify-center rounded-2xl ${tint}`}
                  >
                    <Icon className="size-[18px]" aria-hidden="true" />
                  </span>
                  <h3 className="mt-3.5 text-base font-semibold">{feature.title}</h3>
                  <p className="mt-2 text-[0.9rem] leading-[1.75] text-muted-foreground">
                    {feature.body}
                  </p>
                </div>
              );
            })}
          </div>
        </section>


        <section className="px-5 py-12 text-center">
          <h2 className="font-serif text-[1.45rem] leading-relaxed font-normal">{BRAND.tagline}</h2>
        </section>
      </main>

      <footer className="border-t border-border px-5 py-8 text-xs leading-relaxed text-muted-foreground">
        {BRAND.name} · {hub.label} 단일 지역 운영 · 그룹 미팅·전국 매칭은 제공하지 않습니다.
      </footer>

      {/* 모바일 고정 CTA */}
      <div className="sticky bottom-0 z-10 border-t border-border bg-background/95 px-5 py-3 backdrop-blur">
        <Button asChild size="lg" className="w-full">
          <Link to="/onboarding">직장 인증하고 시작하기</Link>
        </Button>
        <p className="mt-2 text-center text-xs text-muted-foreground">
          회사 이메일 인증 · 1분 소요
        </p>
      </div>
    </div>
  );
}
