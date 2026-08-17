import { useRef, type ReactNode } from "react";

import { Logo } from "@/components/Logo";
import { useKeepActionsVisible, useKeyboardOpen } from "@/lib/keyboard";

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
  /*
    가입은 모든 단계가 "입력하고 → 아래 버튼을 누른다" 구조다. 키보드가 뜨면
    본문 스크롤러가 그만큼 짧아져 그 버튼이 접힌 자리 밖으로 밀린다. 단계마다
    따로 처리하지 않고 껍데기에서 한 번에 맞춘다 — 새 단계가 생겨도 따라온다.
  */
  const endRef = useRef<HTMLDivElement>(null);
  useKeepActionsVisible(endRef, [step]);
  // 키보드가 떠 있으면 하단 고정 영역을 접는다 — 그만큼 본문이 넓어진다.
  const keyboardOpen = useKeyboardOpen();

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
        <div ref={endRef} aria-hidden="true" />
      </main>

      {footer && !keyboardOpen ? (
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
