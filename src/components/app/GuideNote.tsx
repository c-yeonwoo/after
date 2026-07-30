import type { ReactNode } from "react";

/** 안내자 「세라」 — 전환 지점에서만 등장하는 목소리 (혼합형 컨셉) */
export const GUIDE_NAME = "세라";

export function GuideNote({ children }: { children: ReactNode }) {
  return (
    <div className="flex items-center gap-2.5 rounded-xl border border-border/70 bg-muted/50 px-4 py-3">
      <span
        aria-hidden="true"
        className="flex size-6 shrink-0 items-center justify-center self-start rounded-full bg-primary text-[0.65rem] leading-none font-semibold text-primary-foreground"
      >
        S
      </span>
      <p className="min-w-0 flex-1 self-center text-xs leading-relaxed text-muted-foreground">
        <span className="font-medium text-primary-strong">{GUIDE_NAME}</span>
        <span className="mx-1.5 text-border">·</span>
        {children}
      </p>
    </div>
  );
}
