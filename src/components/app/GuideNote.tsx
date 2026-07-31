import type { ReactNode } from "react";

/** 안내자 「세라」 — 전환 지점에서만 등장하는 목소리 (혼합형 컨셉) */
export const GUIDE_NAME = "세라";

export function GuideNote({ children }: { children: ReactNode }) {
  return (
    <div className="relative flex gap-3 overflow-hidden rounded-surface border border-primary/25 bg-primary/8 px-4 py-3.5 shadow-sm">
      <span
        className="absolute inset-y-0 left-0 w-1 bg-primary"
        aria-hidden="true"
      />
      <span
        aria-hidden="true"
        className="ml-1 flex size-8 shrink-0 items-center justify-center rounded-full bg-primary text-[0.8rem] leading-none font-bold text-primary-foreground shadow-sm"
      >
        S
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-[0.68rem] font-semibold tracking-[0.14em] text-primary-strong uppercase">
          {GUIDE_NAME}
        </p>
        <p className="mt-1 text-[0.82rem] leading-relaxed text-foreground/85">{children}</p>
      </div>
    </div>
  );
}

