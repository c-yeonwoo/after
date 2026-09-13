import { useId } from "react";

import { BRAND } from "@/lib/brand";
import { cn } from "@/lib/utils";

/**
 * 로고 마크 — 완전히 가려지기 직전의 원.
 *
 * 작은 i 점에 마크를 끼워 넣은 이전 워드마크는 정교하지만 너무 작아, 로고라기보다
 * 오타처럼 읽혔다. 아이콘을 이름 바깥으로 꺼내고, 16px에서도 남는 큰 초승 형태와
 * 얇은 궤도로 이클립스의 순간만 남긴다. 연애 앱의 하트·커플 아이콘은 쓰지 않는다.
 */
export function LogoMark({ className }: { className?: string }) {
  const maskId = `eclipse-crescent-${useId()}`;

  return (
    <svg
      viewBox="0 0 32 32"
      fill="none"
      aria-hidden="true"
      className={cn("size-6 text-primary-strong", className)}
    >
      <mask id={maskId}>
        <rect width="32" height="32" fill="#000" />
        <circle cx="15" cy="17" r="9.5" fill="#fff" />
        <circle cx="21.5" cy="11.5" r="9.5" fill="#000" />
      </mask>
      <circle cx="16" cy="16" r="11.5" stroke="currentColor" strokeWidth="1.25" opacity="0.35" />
      <circle cx="16" cy="16" r="11" fill="currentColor" mask={`url(#${maskId})`} />
    </svg>
  );
}

export function Logo({ className, size = "md" }: { className?: string; size?: "sm" | "md" }) {
  return (
    <span
      className={cn(
        "inline-flex min-w-0 items-center whitespace-nowrap text-foreground",
        size === "sm" ? "gap-2 text-lg" : "gap-2 text-xl",
        className,
      )}
      aria-label={BRAND.name}
      role="img"
    >
      <LogoMark className="size-5" />
      <span aria-hidden="true" className="font-sans text-[0.72em] font-bold tracking-[0.16em]">
        ECLIPSE
      </span>
    </span>
  );
}
