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
    <div className="flex min-h-screen flex-col bg-background">
      <header
        className="sticky top-0 z-20 bg-background/80 pb-2 backdrop-blur-xl"
        style={{
          paddingTop: "calc(env(safe-area-inset-top, 0px) + 0.75rem)",
          paddingLeft: "max(env(safe-area-inset-left, 0px), 1rem)",
          paddingRight: "max(env(safe-area-inset-right, 0px), 1rem)",
        }}
      >
        <div className="flex min-w-0 items-center justify-between gap-2">
          <Logo size="sm" className="min-w-0 shrink" />
          <span className="rounded-full bg-muted px-2.5 py-1 text-[0.7rem] font-medium text-muted-foreground tabular-nums">
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


      <main className="mx-auto w-full flex-1 px-5 py-10">
        <p className="text-sm font-semibold tracking-wide text-primary-strong">{eyebrow}</p>
        <h1 className="mt-3 text-2xl leading-snug font-semibold">{title}</h1>
        {description ? (
          <p className="mt-3 text-sm leading-relaxed text-muted-foreground">{description}</p>
        ) : null}
        <div className="mt-8">{children}</div>
      </main>

      {footer ? (
        <footer className="sticky bottom-0 border-t border-border bg-background/95 backdrop-blur">
          <div className="mx-auto px-5 py-4">{footer}</div>
        </footer>
      ) : null}
    </div>
  );
}
