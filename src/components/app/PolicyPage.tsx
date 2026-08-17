import { Link } from "@tanstack/react-router";
import { ArrowLeft } from "lucide-react";

import { BUSINESS_LINES, LEGAL_TODO, POLICY_VERSION, type PolicySection } from "@/lib/policy";

/** 약관·처리방침 공용 레이아웃. 두 문서의 구조가 같아 하나로 둔다. */
export function PolicyPage({ title, sections }: { title: string; sections: PolicySection[] }) {
  return (
    <div className="flex h-full flex-col overflow-hidden bg-background">
      <header
        className="z-20 shrink-0 border-b border-border/70 bg-background px-6 pb-3"
        style={{ paddingTop: "var(--safe-top)" }}
      >
        <div className="flex min-w-0 items-center gap-2">
          {/* 앱 안에서는 "나" 탭에서만 열린다. 가입 화면에서는 새 탭으로 뜬다. */}
          <Link
            to="/me"
            aria-label="뒤로"
            className="-ml-2 inline-flex size-11 shrink-0 items-center justify-center rounded-full text-foreground transition-colors hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
          >
            <ArrowLeft className="size-5" aria-hidden="true" />
          </Link>
          <h1 className="headline min-w-0 truncate text-xl">{title}</h1>
        </div>
      </header>

      <main
        className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-6 pt-6"
        style={{ paddingBottom: "calc(var(--safe-bottom) + 1.5rem)" }}
      >
        <p className="text-2xs font-semibold tracking-[0.14em] text-muted-foreground uppercase">
          버전 {POLICY_VERSION}
        </p>

        {/*
          미확정 항목이 남아 있을 때만 띄운다. LEGAL_TODO 는 BUSINESS 에서
          파생되므로, 값을 채우면 이 상자가 저절로 사라진다 — 다 채웠는데
          "초안입니다" 가 남아 있는 상태가 생기지 않는다.
        */}
        {LEGAL_TODO.length > 0 ? (
          <div
            role="note"
            className="mt-4 rounded-surface border border-warning/40 bg-warning/10 px-4 py-3.5"
          >
            <p className="text-sm font-semibold">법률 검토 전 초안입니다</p>
            <p className="mt-1.5 text-xs leading-relaxed text-foreground/80">
              베타 오픈 전에 아래 항목을 확정하고 법률 검토를 받아야 합니다. 확정되지 않은 정보를
              임의로 적지 않았습니다.
            </p>
            <ul className="mt-2.5 space-y-1">
              {LEGAL_TODO.map((item) => (
                <li key={item} className="text-xs text-muted-foreground">
                  · {item}
                </li>
              ))}
            </ul>
          </div>
        ) : null}

        {sections.map((s) => (
          <section key={s.heading} className="mt-8">
            <h2 className="text-base font-semibold">{s.heading}</h2>
            <div className="mt-2.5 space-y-2">
              {s.body.map((p) => (
                <p key={p} className="text-sm leading-relaxed text-muted-foreground">
                  {p}
                </p>
              ))}
            </div>
          </section>
        ))}

        {/* 사업자 정보 — 전자상거래법이 공개를 요구한다. 확정된 항목만 나온다. */}
        <section className="mt-10 border-t border-border pt-5">
          <h2 className="text-2xs font-semibold tracking-[0.14em] text-muted-foreground uppercase">
            사업자 정보
          </h2>
          <ul className="mt-2.5 space-y-1">
            {BUSINESS_LINES.map((line) => (
              <li key={line} className="text-xs leading-relaxed text-muted-foreground">
                {line}
              </li>
            ))}
          </ul>
        </section>
      </main>
    </div>
  );
}
