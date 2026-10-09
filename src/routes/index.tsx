import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect } from "react";

import { BRAND, COVERAGE_LABEL } from "@/lib/brand";
import { Logo } from "@/components/Logo";
import { useMe } from "@/lib/me";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: `${BRAND.name} — ${BRAND.tagline}` },
      { name: "description", content: BRAND.description },
      { property: "og:title", content: `${BRAND.name} — ${BRAND.tagline}` },
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

  // 이미 로그인한 사용자는 완료 상태에 맞는 화면으로 보낸다.
  useEffect(() => {
    if (ready && me) navigate({ to: me.onboarding_step < 7 ? "/signup" : "/home" });
  }, [ready, me, navigate]);
  function start() {
    navigate({ to: me && me.onboarding_step >= 7 ? "/home" : "/signup" });
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
          </div>
        </div>
      </header>

      <main className="min-h-0 flex flex-1 items-center px-6">
        <section className="w-full pb-8">
          <h1 className="mt-4 text-[clamp(2.25rem,10.5vw,2.75rem)] leading-[1.08] font-bold tracking-[-0.055em]">
            퇴근 후,
            <br />
            <span className="text-primary-strong">한 사람과의 약속.</span>
          </h1>
          <p className="mt-5 text-base leading-relaxed font-medium text-foreground/85">
            회사 이메일을 인증한 직장인을 한 번에 한 사람씩 소개해요.
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
          type="button"
          onClick={start}
          className="flex min-h-[52px] w-full items-center justify-center rounded-control bg-primary px-4 text-base font-semibold text-primary-foreground transition-colors hover:opacity-90 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
        >
          가입하고 시작하기
        </button>
        <p className="mt-3 text-center text-xs text-muted-foreground">
          회사 이메일 주소는 상대에게 공개되지 않아요.
        </p>
        <nav className="mt-3 flex items-center justify-center gap-3 text-xs text-muted-foreground">
          <Link to="/support" className="underline underline-offset-2">
            고객 지원
          </Link>
          <Link to="/privacy" className="underline underline-offset-2">
            개인정보 처리방침
          </Link>
          <Link to="/delete-account" className="underline underline-offset-2">
            계정 삭제
          </Link>
        </nav>
      </div>
    </div>
  );
}
