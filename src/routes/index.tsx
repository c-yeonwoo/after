import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";

import { BRAND, COVERAGE_LABEL } from "@/lib/brand";
import { Logo } from "@/components/Logo";
import { useMe } from "@/lib/me";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: `${BRAND.name} — 직장인 1:1 소개 서비스` },
      { name: "description", content: BRAND.description },
      { property: "og:title", content: `${BRAND.name} — 직장인 1:1 소개 서비스` },
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

      <main className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-6">
        <section className="pt-8 pb-10">
          {/*
            크기를 vw 로 잡는다. Archivo Black 은 폭이 넓어서 48px 로 두면
            "AFTER WORK" 가 356px 이 되고 375px 화면(SE·mini)의 본문 폭
            327px 을 넘겨 세 줄로 쪼개진다 — "AFTER / WORK / MATCHING" 은
            읽는 리듬이 깨진다.

            아래·위 한계가 둘 다 필요하다. 최소값은 좁은 화면에서 한 줄을
            지키고, 최대값은 데스크톱에서 프레임(430px)을 넘지 않게 한다 —
            vw 는 프레임이 아니라 뷰포트를 보기 때문이다.
          */}
          <h1 className="display-wordmark text-[clamp(2.45rem,11.4vw,2.9rem)] uppercase">
            After Work
            <br />
            <span className="text-primary">Matching</span>
          </h1>
          <p className="mt-6 text-lg leading-snug font-medium">
            퇴근하고 만나기 좋은 거리에,
            <br />
            좋은 사람 한 명.
          </p>
          <p className="mt-3 text-xs text-muted-foreground">
            현재 {COVERAGE_LABEL}에서 운영합니다.
          </p>
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
          {BRAND.name} · 현재 {COVERAGE_LABEL} 운영 · 그룹 미팅·권역을 넘는 매칭은 제공하지
          않습니다.
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
