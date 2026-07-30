import type { ReactNode } from "react";

import { BRAND } from "@/lib/brand";

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
      <header className="border-b border-border">
        <div className="mx-auto flex max-w-lg items-center justify-between px-5 py-4">
          <span className="font-serif text-base font-bold">{BRAND.name}</span>
          <span className="text-xs text-muted-foreground">
            {step} / {total}
          </span>
        </div>
        <div className="h-0.5 w-full bg-muted">
          <div
            className="h-full bg-primary transition-all duration-500"
            style={{ width: `${(step / total) * 100}%` }}
          />
        </div>
      </header>

      <main className="mx-auto w-full max-w-lg flex-1 px-5 py-10">
        <p className="text-xs tracking-wide text-primary">{eyebrow}</p>
        <h1 className="mt-3 text-2xl leading-snug font-bold">{title}</h1>
        {description ? (
          <p className="mt-3 text-sm leading-relaxed text-muted-foreground">{description}</p>
        ) : null}
        <div className="mt-8">{children}</div>
      </main>

      {footer ? (
        <footer className="sticky bottom-0 border-t border-border bg-background/95 backdrop-blur">
          <div className="mx-auto max-w-lg px-5 py-4">{footer}</div>
        </footer>
      ) : null}
    </div>
  );
}
