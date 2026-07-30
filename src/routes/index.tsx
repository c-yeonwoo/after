import { createFileRoute, Link } from "@tanstack/react-router";
import { Coffee, Heart, Lock, ShieldCheck, Ticket, MessagesSquare } from "lucide-react";

import { BRAND, FIRST_MEETING_PROTOCOL, HUBS } from "@/lib/brand";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: `${BRAND.name} — 테헤란로 직장인 1:1 프라이빗 매칭` },
      { name: "description", content: BRAND.description },
      { property: "og:title", content: `${BRAND.name} — 테헤란로 직장인 1:1 프라이빗 매칭` },
      { property: "og:description", content: BRAND.tagline },
    ],
  }),
  component: Landing,
});

const LOOP = [
  {
    icon: Heart,
    role: "여성",
    title: "무료로 호·불만 남깁니다",
    body: "같은 퇴근존 남성 프로필을 한 장씩 확인하고 호감 여부만 표시합니다. 스와이프 피드도, 과금도 없습니다.",
  },
  {
    icon: Ticket,
    role: "남성",
    title: "소개 티켓으로 한 명씩",
    body: "이미 나에게 호감을 준 분들 중에서만, 한 번에 한 명의 프로필이 열립니다. 동시에 여러 명은 열리지 않습니다.",
  },
  {
    icon: Coffee,
    role: "두 사람",
    title: "카페 한 잔으로 확인",
    body: "만남 티켓을 쓰면 일정·장소 조율 채팅이 열리고, 퇴근길 카페에서 45~60분 1차를 갖습니다.",
  },
];

const TRUST = [
  {
    icon: ShieldCheck,
    title: "회사 이메일 직장 인증",
    body: "테헤란로·역삼권 재직 확인을 마친 분들만 매칭 풀에 들어옵니다.",
  },
  {
    icon: Lock,
    title: "프라이빗 노출",
    body: "불특정 다수에게 프로필이 나열되지 않습니다. 호감·소개 맥락에서만 상대에게 보입니다.",
  },
  {
    icon: MessagesSquare,
    title: "사적 채팅 시간 게이트",
    body: "만남 전날 00:00에 사적 채팅이 열립니다. 그 전까지는 일정 조율만 — 톡방 데이팅이 되지 않도록.",
  },
];

function Landing() {
  const hub = HUBS[0];

  return (
    <div className="min-h-screen bg-background pb-24">
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
            지금 열려 있는 존 · {hub.label}
          </p>
          <h1 className="mt-6 text-[2rem] leading-[1.3] font-bold">
            같은 퇴근길에서,
            <br />
            호감 있는 한 사람과,
            <br />
            <span className="text-primary">카페 한 잔.</span>
          </h1>
          <p className="mt-5 text-sm leading-relaxed text-muted-foreground">
            {BRAND.description}
          </p>
        </section>

        <section className="border-y border-border bg-card/40 px-5 py-12">
          <h2 className="text-xl font-bold">한 번에 한 사람, 세 단계</h2>
          <div className="mt-8 flex flex-col gap-7">
            {LOOP.map((step, i) => (
              <div key={step.title}>
                <div className="flex items-center gap-3">
                  <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-primary/12 text-primary">
                    <step.icon className="size-4" />
                  </span>
                  <span className="text-xs text-muted-foreground">
                    0{i + 1} · {step.role}
                  </span>
                </div>
                <h3 className="mt-3 text-base font-bold">{step.title}</h3>
                <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
                  {step.body}
                </p>
              </div>
            ))}
          </div>
        </section>

        <section className="px-5 py-12">
          <h2 className="text-xl font-bold">1차 만남 규칙은 앱이 지킵니다</h2>
          <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
            첫 만남의 시간과 비용을 예측 가능하게 만드는 것이 이 서비스의 기본값입니다.
          </p>
          <ul className="mt-6 flex flex-col gap-3">
            {FIRST_MEETING_PROTOCOL.map((rule) => (
              <li key={rule.title} className="rounded-xl border border-border bg-card p-4">
                <p className="font-bold text-primary">{rule.title}</p>
                <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
                  {rule.body}
                </p>
              </li>
            ))}
          </ul>
        </section>

        <section className="border-t border-border bg-card/40 px-5 py-12">
          <h2 className="text-xl font-bold">신뢰는 존·직장·시간으로</h2>
          <div className="mt-8 flex flex-col gap-7">
            {TRUST.map((item) => (
              <div key={item.title}>
                <item.icon className="size-5 text-primary" />
                <h3 className="mt-3 text-base font-bold">{item.title}</h3>
                <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
                  {item.body}
                </p>
              </div>
            ))}
          </div>
        </section>

        <section className="px-5 py-12 text-center">
          <h2 className="text-lg leading-relaxed font-bold">{BRAND.tagline}</h2>
        </section>
      </main>

      <footer className="border-t border-border px-5 py-8 text-xs leading-relaxed text-muted-foreground">
        {BRAND.name} · {hub.label} 단일 허브 운영 · 그룹 미팅·전국 매칭은 제공하지 않습니다.
      </footer>

      {/* 모바일 고정 CTA */}
      <div className="sticky bottom-0 z-10 border-t border-border bg-background/95 px-5 py-3 backdrop-blur">
        <Button asChild size="lg" className="w-full">
          <Link to="/onboarding">퇴근존 인증하고 시작하기</Link>
        </Button>
        <p className="mt-2 text-center text-xs text-muted-foreground">
          회사 이메일 인증 · 1분 소요
        </p>
      </div>
    </div>
  );
}

