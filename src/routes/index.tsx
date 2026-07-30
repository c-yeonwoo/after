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
      <header className="sticky top-0 z-10 flex items-center justify-between border-b border-border bg-background/95 px-5 py-4 backdrop-blur">
        <span className="font-serif text-lg font-bold tracking-tight">{BRAND.name}</span>
        <Button asChild variant="ghost" size="sm">
          <Link to="/onboarding">시작하기</Link>
        </Button>
      </header>

      <main>
        <section className="px-5 pt-10 pb-12">
          <p className="inline-flex items-center gap-2 rounded-full border border-border bg-card px-3 py-1 text-xs text-muted-foreground">
            <span className="size-1.5 rounded-full bg-primary" />
            지금 열려 있는 지역 · {hub.label}
          </p>
          <h1 className="mt-6 text-[2rem] leading-[1.3] font-bold">
            퇴근하고 만나기 좋은 거리에,
            <br />
            <span className="text-primary">좋은 사람 한 명.</span>
          </h1>
          <p className="mt-5 text-sm leading-relaxed text-muted-foreground">
            {BRAND.description}
          </p>
        </section>

        <section className="border-y border-border bg-card/40 px-5 py-12">
          <h2 className="text-xl font-bold">바쁜 직장인에게 필요한 만큼만</h2>
          <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
            시간을 많이 쓰지 않아도 되도록, 소개부터 실제 만남까지를 서비스가 대신 챙깁니다.
          </p>
          <div className="mt-8 flex flex-col gap-7">
            {FEATURES.map((feature) => {
              const Icon = FEATURE_ICONS[feature.id] ?? Sparkles;
              return (
                <div key={feature.id}>
                  <span className="flex size-9 items-center justify-center rounded-full bg-primary/12 text-primary-strong">
                    <Icon className="size-4" aria-hidden="true" />
                  </span>
                  <h3 className="mt-3 text-base font-bold">{feature.title}</h3>
                  <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
                    {feature.body}
                  </p>
                </div>
              );
            })}
          </div>
        </section>

        <section className="px-5 py-12 text-center">
          <h2 className="text-lg leading-relaxed font-bold">{BRAND.tagline}</h2>
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
