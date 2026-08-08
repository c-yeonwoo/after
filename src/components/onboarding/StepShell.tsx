import type { ReactNode } from "react";

import { Logo } from "@/components/Logo";

export function StepShell({
  step,
  total,
  eyebrow,
  title,
  description,
  children,
  footer,
}: {
  step: number;
  total: number;
  eyebrow: string;
  title: string;
  description?: string;
  children: ReactNode;
  footer?: ReactNode;
}) {
  return (
    <div className="flex h-full flex-col overflow-hidden bg-background">
      <header
        className="z-20 shrink-0 bg-background pb-2"
        style={{
          paddingTop: "var(--safe-top)",
          paddingLeft: "max(env(safe-area-inset-left, 0px), 1rem)",
          paddingRight: "max(env(safe-area-inset-right, 0px), 1rem)",
        }}
      >
        <div className="flex min-w-0 items-center justify-between gap-2">
          <Logo size="sm" className="min-w-0 shrink" />
          <span className="shrink-0 rounded-full bg-muted px-2.5 py-1 text-2xs font-medium text-muted-foreground tabular-nums">
            {step} / {total}
          </span>
        </div>
        <div
          className="mt-3 h-1 w-full overflow-hidden rounded-full bg-muted"
          role="progressbar"
          aria-valuenow={step}
          aria-valuemin={1}
          aria-valuemax={total}
          aria-label="가입 진행률"
        >
          <div
            className="h-full rounded-full bg-primary transition-all duration-500"
            style={{ width: `${(step / total) * 100}%` }}
          />
        </div>
      </header>

      <main className="mx-auto w-full min-h-0 flex-1 overflow-y-auto overscroll-contain px-5 py-10">
        <p className="text-sm font-semibold tracking-wide text-primary-strong">{eyebrow}</p>
        <h1 className="mt-3 text-2xl leading-snug font-semibold">{title}</h1>
        {description ? (
          <p className="mt-3 text-sm leading-relaxed text-muted-foreground">{description}</p>
        ) : null}
        <div className="mt-8">{children}</div>
      </main>

      {footer ? (
        <footer className="shrink-0 border-t border-border bg-background">
          <div
            className="mx-auto px-5 pt-4"
            style={{ paddingBottom: "calc(var(--safe-bottom) + 0.5rem)" }}
          >
            {footer}
          </div>
        </footer>
      ) : null}
    </div>
  );
}
