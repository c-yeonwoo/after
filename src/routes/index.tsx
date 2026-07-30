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
    <div className="min-h-screen bg-background">
      <header className="mx-auto flex max-w-5xl items-center justify-between px-5 py-6">
        <span className="font-serif text-lg font-bold tracking-tight">{BRAND.name}</span>
        <Button asChild variant="ghost" size="sm">
          <Link to="/onboarding">시작하기</Link>
        </Button>
      </header>

      <main>
        <section className="mx-auto max-w-5xl px-5 pb-20 pt-10 sm:pt-20">
          <p className="inline-flex items-center gap-2 rounded-full border border-border bg-card px-3 py-1 text-xs text-muted-foreground">
            <span className="size-1.5 rounded-full bg-primary" />
            지금 열려 있는 존 · {hub.label}
          </p>
          <h1 className="mt-6 max-w-2xl text-4xl leading-[1.25] font-bold sm:text-5xl sm:leading-[1.25]">
            같은 퇴근길에서,
            <br />
            호감 있는 한 사람과,
            <br />
            <span className="text-primary">카페 한 잔.</span>
          </h1>
          <p className="mt-6 max-w-xl text-base leading-relaxed text-muted-foreground">
            {BRAND.description}
          </p>
          <div className="mt-9 flex flex-wrap items-center gap-3">
            <Button asChild size="lg">
              <Link to="/onboarding">퇴근존 인증하고 시작하기</Link>
            </Button>
            <span className="text-xs text-muted-foreground">
              회사 이메일 인증 · 1분 소요
            </span>
          </div>
        </section>

        <section className="border-y border-border bg-card/40">
          <div className="mx-auto max-w-5xl px-5 py-16">
            <h2 className="text-2xl font-bold">한 번에 한 사람, 세 단계</h2>
            <div className="mt-10 grid gap-8 sm:grid-cols-3">
              {LOOP.map((step, i) => (
                <div key={step.title}>
                  <div className="flex items-center gap-3">
                    <span className="flex size-9 items-center justify-center rounded-full bg-primary/12 text-primary">
                      <step.icon className="size-4" />
                    </span>
                    <span className="text-xs text-muted-foreground">
                      0{i + 1} · {step.role}
                    </span>
                  </div>
                  <h3 className="mt-4 text-lg font-bold">{step.title}</h3>
                  <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
                    {step.body}
                  </p>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section className="mx-auto max-w-5xl px-5 py-16">
          <h2 className="text-2xl font-bold">1차 만남 규칙은 앱이 지킵니다</h2>
          <p className="mt-3 max-w-xl text-sm leading-relaxed text-muted-foreground">
            첫 만남의 시간과 비용을 예측 가능하게 만드는 것이 이 서비스의 기본값입니다.
          </p>
          <ul className="mt-8 grid gap-4 sm:grid-cols-3">
            {FIRST_MEETING_PROTOCOL.map((rule) => (
              <li key={rule.title} className="rounded-xl border border-border bg-card p-5">
                <p className="font-bold text-primary">{rule.title}</p>
                <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
                  {rule.body}
                </p>
              </li>
            ))}
          </ul>
        </section>

        <section className="border-t border-border bg-card/40">
          <div className="mx-auto max-w-5xl px-5 py-16">
            <h2 className="text-2xl font-bold">신뢰는 존·직장·시간으로</h2>
            <div className="mt-10 grid gap-8 sm:grid-cols-3">
              {TRUST.map((item) => (
                <div key={item.title}>
                  <item.icon className="size-5 text-primary" />
                  <h3 className="mt-4 text-base font-bold">{item.title}</h3>
                  <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
                    {item.body}
                  </p>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section className="mx-auto max-w-5xl px-5 py-20 text-center">
          <h2 className="text-2xl font-bold">{BRAND.tagline}</h2>
          <div className="mt-8">
            <Button asChild size="lg">
              <Link to="/onboarding">시작하기</Link>
            </Button>
          </div>
        </section>
      </main>

      <footer className="border-t border-border">
        <div className="mx-auto max-w-5xl px-5 py-8 text-xs text-muted-foreground">
          {BRAND.name} · {hub.label} 단일 허브 운영 · 그룹 미팅·전국 매칭은 제공하지 않습니다.
        </div>
      </footer>
    </div>
  );
}
