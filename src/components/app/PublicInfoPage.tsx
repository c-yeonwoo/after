import { Link } from "@tanstack/react-router";
import { ArrowLeft } from "lucide-react";
import type { ReactNode } from "react";

import { Logo } from "@/components/Logo";

/** 로그인하지 않은 심사자도 읽을 수 있는 지원·계정 삭제 안내 공용 틀. */
export function PublicInfoPage({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="flex h-full flex-col overflow-hidden bg-background">
      <header
        className="z-20 shrink-0 border-b border-border/70 bg-background px-5 pb-3"
        style={{ paddingTop: "var(--safe-top)" }}
      >
        <div className="flex min-w-0 items-center gap-2">
          <Link
            to="/"
            aria-label="처음으로"
            className="-ml-2 inline-flex size-11 shrink-0 items-center justify-center rounded-full text-foreground transition-colors hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
          >
            <ArrowLeft className="size-5" aria-hidden="true" />
          </Link>
          <Logo size="sm" />
        </div>
      </header>
      <main
        className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-5 pt-7"
        style={{ paddingBottom: "calc(var(--safe-bottom) + 2rem)" }}
      >
        <h1 className="headline text-2xl">{title}</h1>
        <div className="mt-7 space-y-8">{children}</div>
      </main>
    </div>
  );
}

export function InfoSection({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section>
      <h2 className="text-base font-semibold">{title}</h2>
      <div className="mt-2.5 space-y-2 text-sm leading-relaxed text-muted-foreground">
        {children}
      </div>
    </section>
  );
}
