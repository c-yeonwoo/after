import { BRAND } from "@/lib/brand";
import { cn } from "@/lib/utils";

/**
 * Compact after monogram: a single-storey a with a small signature dot.
 */
export function LogoMark({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 32 32"
      fill="none"
      aria-hidden="true"
      className={cn("size-6 text-primary-strong", className)}
    >
      <circle cx="13" cy="17" r="7.1" stroke="currentColor" strokeWidth="4.1" />
      <path d="M20.1 17v7" stroke="currentColor" strokeWidth="4.1" strokeLinecap="round" />
      <circle cx="25" cy="8" r="2.1" fill="var(--color-brand-signature)" />
    </svg>
  );
}

export function Logo({ className, size = "md" }: { className?: string; size?: "sm" | "md" }) {
  return (
    <span
      className={cn(
        "inline-flex min-w-0 items-center whitespace-nowrap text-foreground",
        size === "sm" ? "gap-1.5 text-lg" : "gap-2 text-xl",
        className,
      )}
      aria-label={BRAND.name}
      role="img"
    >
      <LogoMark className="size-5" />
      <span aria-hidden="true" className="font-sans text-[1em] font-semibold tracking-[-0.05em]">
        {BRAND.nameEn}
      </span>
    </span>
  );
}
