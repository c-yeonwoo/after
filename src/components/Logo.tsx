import { BRAND } from "@/lib/brand";
import { cn } from "@/lib/utils";

/**
 * Compact after monogram: a single-storey a with a blush dot (2026-10-11).
 * 앱 아이콘(brand/app-icon-ios.svg)·파비콘과 같은 형태다. 점이 예전보다 크고
 * 블러시라 작게 그려도 "설레는" 인상이 남는다.
 */
export function LogoMark({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 32 32"
      fill="none"
      aria-hidden="true"
      className={cn("size-6 text-foreground", className)}
    >
      <circle cx="13" cy="17" r="7.1" stroke="currentColor" strokeWidth="4.4" />
      <path d="M20.1 17v7" stroke="currentColor" strokeWidth="4.4" strokeLinecap="round" />
      <circle cx="26.5" cy="6.5" r="3.4" fill="var(--color-brand-blush)" />
    </svg>
  );
}

export function Logo({ className, size = "md" }: { className?: string; size?: "sm" | "md" }) {
  return (
    <span
      className={cn(
        "inline-flex min-w-0 items-center whitespace-nowrap text-foreground",
        size === "sm" ? "text-[1.625rem]" : "text-[2rem]",
        className,
      )}
      aria-label={BRAND.name}
      role="img"
    >
      <span
        aria-hidden="true"
        className="font-sans text-[1em] leading-none font-bold tracking-[-0.065em]"
      >
        {BRAND.nameEn}
      </span>
      <span
        aria-hidden="true"
        className="mb-[0.06em] ml-[0.09em] size-[0.18em] self-end rounded-full bg-brand-blush"
      />
    </span>
  );
}
