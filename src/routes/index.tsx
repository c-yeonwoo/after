import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";

import { BRAND, HUBS } from "@/lib/brand";
import { Logo } from "@/components/Logo";
import { useMe } from "@/lib/me";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: `${BRAND.name} — 강남·역삼 직장인 1:1 소개 서비스` },
      { name: "description", content: BRAND.description },
      { property: "og:title", content: `${BRAND.name} — 강남·역삼 직장인 1:1 소개 서비스` },
      { property: "og:description", content: BRAND.tagline },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Landing,
});

const POINTS = [
  { n: "01", title: "회사 이메일로 인증된 사람만", body: "퇴근 후 만나기 좋은 거리 안에서." },
  { n: "02", title: "한 번에 한 명만 소개", body: "고르는 피로 없이, 한 사람에 집중." },
  { n: "03", title: "약속까지 대신 조율", body: "채팅이 열리고 날짜와 장소를 정리해 드려요." },
];

function Landing() {
  const hub = HUBS[0];
  const navigate = useNavigate();
  const { me, ready } = useMe();

  // 이미 로그인한 사용자를 가입 유도 랜딩에 세워두지 않는다.
  useEffect(() => {
    if (ready && me) navigate({ to: "/home" });
  }, [ready, me, navigate]);
  const btnRef = useRef<HTMLButtonElement>(null);
  const [origin, setOrigin] = useState<{ x: number; y: number } | null>(null);
  const [revealed, setRevealed] = useState(false);

  function start() {
    if (origin) return;
    const r = btnRef.current?.getBoundingClientRect();
    setOrigin(
      r
        ? { x: r.left + r.width / 2, y: r.top + r.height / 2 }
        : { x: window.innerWidth / 2, y: window.innerHeight - 80 },
    );
    requestAnimationFrame(() => setRevealed(true));
    window.setTimeout(() => navigate({ to: me ? "/home" : "/signup" }), 560);
  }

  return (
    <div className="brand-surface flex h-full flex-col overflow-hidden bg-background">
      <header
        className="z-20 shrink-0 bg-background px-6 pb-3"
        style={{ paddingTop: "var(--safe-top)" }}
      >
        <div className="flex min-w-0 items-center justify-between gap-2">
          <Logo size="sm" className="min-w-0 shrink" />
          <div className="flex shrink-0 items-center gap-1">
            <Link
              to="/login"
              className="inline-flex min-h-11 items-center rounded-full px-3 text-xs font-semibold text-foreground underline underline-offset-4"
            >
              로그인
            </Link>
            <Link
              to="/signup"
              className="inline-flex min-h-11 items-center rounded-full bg-foreground px-4 text-xs font-semibold text-background"
            >
              시작
            </Link>
          </div>
        </div>
      </header>

      <main className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-6">
        <section className="pt-8 pb-10">
          <h1 className="wordmark text-5xl leading-[0.95] uppercase">
            After Work
            <br />
            <span className="text-primary">Matching</span>
          </h1>
          <p className="mt-6 text-lg leading-snug font-medium">
            퇴근하고 만나기 좋은 거리에,
            <br />
            좋은 사람 한 명.
          </p>
          <p className="mt-3 text-xs text-muted-foreground">현재 {hub.label}에서 운영합니다.</p>
        </section>

        <section className="border-t border-border/70" aria-label="서비스 소개">
          {POINTS.map((p) => (
            <div key={p.n} className="flex gap-4 border-b border-border/70 py-5">
              <span className="mt-0.5 text-2xs font-semibold tracking-[0.14em] text-primary">
                {p.n}
              </span>
              <div className="min-w-0">
                <h2 className="text-base font-semibold">{p.title}</h2>
                <p className="mt-1 text-sm leading-relaxed text-muted-foreground">{p.body}</p>
              </div>
            </div>
          ))}
        </section>

        <p className="mt-7 text-2xs leading-relaxed text-muted-foreground">
          {BRAND.name} · {hub.label} 단일 지역 운영 · 그룹 미팅·전국 매칭은 제공하지 않습니다.
        </p>
      </main>

      <div
        className="z-10 shrink-0 bg-background px-6 pt-4"
        style={{ paddingBottom: "calc(var(--safe-bottom) + 1rem)" }}
      >
        <button
          ref={btnRef}
          type="button"
          onClick={start}
          className="headline flex w-full items-center justify-center rounded-control bg-foreground py-5 text-base text-background transition-colors duration-300 hover:bg-primary focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
        >
          직장 인증하고 시작하기
        </button>
        <p className="mt-3 text-center text-3xs font-semibold tracking-[0.16em] uppercase text-muted-foreground">
          인증은 1분이면 끝나요.
        </p>
        <p className="mt-2 text-center text-xs text-muted-foreground">
          이미 가입하셨나요?{" "}
          <Link to="/login" className="font-semibold text-primary-strong underline">
            로그인
          </Link>
        </p>
      </div>

      {origin ? (
        <div
          aria-hidden="true"
          className="pointer-events-none fixed inset-0 z-50 bg-primary"
          style={{
            clipPath: `circle(${revealed ? "150%" : "0%"} at ${origin.x}px ${origin.y}px)`,
            transition: "clip-path 620ms cubic-bezier(0.65, 0, 0.35, 1)",
          }}
        />
      ) : null}
    </div>
  );
}
