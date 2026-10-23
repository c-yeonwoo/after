import { useEffect, useRef, type ReactNode } from "react";

import { Logo } from "@/components/Logo";
import { useKeepFieldVisible, useKeyboardOpen } from "@/lib/keyboard";
import { useContentArrival } from "@/lib/contentMotion";

export function StepShell({
  step,
  total,
  eyebrow,
  eyebrowAction,
  title,
  description,
  children,
  footer,
  progressLabel,
  transitionKey,
  progress,
}: {
  step: number;
  total: number;
  eyebrow: string;
  eyebrowAction?: ReactNode;
  title: string;
  description?: string;
  children: ReactNode;
  footer?: ReactNode;
  progressLabel?: string;
  transitionKey?: string;
  progress?: number;
}) {
  // 키보드가 떠 있으면 하단 고정 영역을 접는다 — 그만큼 본문이 넓어진다.
  const keyboardOpen = useKeyboardOpen();
  const mainRef = useRef<HTMLElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const headingRef = useRef<HTMLHeadingElement>(null);
  const contentKey = transitionKey ?? `${step}:${eyebrow}:${title}`;
  const fraction = Math.max(0, Math.min(1, progress ?? step / total));
  useKeepFieldVisible(mainRef, contentKey);
  useContentArrival(contentRef, contentKey);
  useEffect(() => {
    const active = document.activeElement;
    if (
      active instanceof HTMLElement &&
      mainRef.current?.contains(active) &&
      active.matches("input, textarea, select")
    )
      return;
    mainRef.current?.scrollTo({ top: 0 });
    headingRef.current?.focus({ preventScroll: true });
  }, [contentKey]);

  return (
    <div className="onboarding-screen flex h-full flex-col overflow-hidden bg-background">
      <header
        className="z-20 shrink-0 bg-background pb-2"
        style={{
          paddingTop: "var(--safe-top)",
          paddingLeft: "max(env(safe-area-inset-left, 0px), 1.25rem)",
          paddingRight: "max(env(safe-area-inset-right, 0px), 1.25rem)",
        }}
      >
        <div className="flex min-w-0 items-center justify-between gap-2">
          <Logo size="sm" className="min-w-0 shrink" />
          <div className="min-w-0 text-right">
            <p className="text-xs font-medium text-foreground">{eyebrow}</p>
            <div className="mt-1 flex flex-wrap items-center justify-end gap-x-3 gap-y-1 text-2xs text-muted-foreground tabular-nums">
              <span>{progressLabel ?? `${step} / ${total}`}</span>
              {eyebrowAction}
            </div>
          </div>
        </div>
        <div
          className="mt-3 h-1 w-full overflow-hidden rounded-full bg-muted"
          role="progressbar"
          aria-valuenow={Math.round(fraction * 100)}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuetext={`${eyebrow} · ${progressLabel ?? `${step} / ${total}`}`}
          aria-label={progressLabel ? "프로필 작성 진행률" : "가입 진행률"}
        >
          <div
            className="h-full origin-left rounded-full bg-foreground transition-transform duration-200 ease-out motion-reduce:transition-none"
            style={{ transform: `scaleX(${fraction})` }}
          />
        </div>
      </header>

      <main
        ref={mainRef}
        className="mx-auto w-full min-h-0 flex-1 overflow-y-auto overscroll-contain px-5 pt-6 pb-8"
      >
        <div ref={contentRef}>
          <h1
            ref={headingRef}
            tabIndex={-1}
            className="break-keep text-balance text-[clamp(1.5rem,7vw,1.75rem)] leading-[1.35] font-semibold tracking-[-0.03em] outline-none"
          >
            {title}
          </h1>
          {description ? (
            <p className="mt-2.5 break-keep text-sm leading-relaxed text-muted-foreground">
              {description}
            </p>
          ) : null}
          <div className="mt-6">{children}</div>
        </div>
      </main>

      {footer && !keyboardOpen ? (
        <footer className="shrink-0 bg-background">
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
