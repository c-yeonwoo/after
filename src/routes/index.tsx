import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";

import { BRAND, COVERAGE_LABEL } from "@/lib/brand";
import { Logo } from "@/components/Logo";
import { useMe } from "@/lib/me";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: `${BRAND.name} — 한 사람을 제대로 만나는 소개` },
      { name: "description", content: BRAND.description },
      { property: "og:title", content: `${BRAND.name} — 직장인 1:1 소개 서비스` },
      { property: "og:description", content: BRAND.tagline },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Landing,
});

function Landing() {
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
    <div className="flex h-full flex-col overflow-hidden bg-background">
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
              className="inline-flex min-h-11 items-center rounded-full bg-primary px-4 text-xs font-semibold text-primary-foreground"
            >
              시작
            </Link>
          </div>
        </div>
      </header>

      <main className="min-h-0 flex flex-1 items-center px-6">
        <section className="w-full pb-8">
          <p className="text-2xs font-semibold tracking-[0.16em] text-primary-strong uppercase">
            One introduction at a time
          </p>
          <h1 className="mt-4 text-[clamp(2.25rem,10.5vw,2.75rem)] leading-[1.08] font-bold tracking-[-0.055em]">
            한 사람을
            <br />
            <span className="text-primary-strong">제대로 만나세요.</span>
          </h1>
          <p className="mt-5 text-base leading-relaxed font-medium text-foreground/85">
            피드를 넘기지 않고, 한 사람과의 소개를 시작합니다.
          </p>
          <p className="mt-3 text-xs text-muted-foreground">
            현재 {COVERAGE_LABEL}에서 운영합니다.
          </p>
        </section>
      </main>

      <div
        className="z-10 shrink-0 bg-background px-6 pt-4"
        style={{ paddingBottom: "calc(var(--safe-bottom) + 1rem)" }}
      >
        <button
          ref={btnRef}
          type="button"
          onClick={start}
          /*
            브랜드 색으로 채운다. 예전에는 흰 필(bg-foreground)에 hover 로만
            브랜드가 나왔는데, 네이비+금 시절의 잔재다 — 금색은 큰 면적으로
            깔면 저렴해져서 피했었다. 로즈는 그 제약이 없고, 랜딩에서 가장 큰
            면적이 브랜드 색이어야 색이 기억된다.

            hover 는 primary-strong 이 아니라 primary/90 이다 — primary-strong 은
            **글자 전용** 토큰이라 밝은 테마에서는 채움으로 쓸 수 없다(그 위에
            얹히는 잉크 글자와 2.15 밖에 안 난다). 다른 버튼도 같은 규칙을 쓴다.
          */
          className="headline flex w-full items-center justify-center rounded-control bg-primary py-5 text-base text-primary-foreground transition-colors duration-300 hover:bg-primary/90 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
        >
          소개 만들기
        </button>
        <p className="mt-3 text-center text-3xs font-semibold tracking-[0.16em] uppercase text-muted-foreground">
          회사 이메일은 재직 확인에만 사용합니다.
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
