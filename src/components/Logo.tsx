import { cn } from "@/lib/utils";

/**
 * 애프터 로고.
 * mark: 두 개의 부드러운 원이 겹쳐 하나의 따뜻한 렌즈 형태를 만드는 모양 (우연히 겹친 두 사람).
 */
export function LogoMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" fill="none" aria-hidden="true" className={cn("size-7", className)}>
      <circle cx="12.4" cy="16" r="8.4" fill="currentColor" className="text-accent" />
      <circle cx="19.6" cy="16" r="8.4" fill="currentColor" className="text-primary/85" />
      <path
        d="M16 8.6a8.4 8.4 0 0 0 0 14.8 8.4 8.4 0 0 0 0-14.8Z"
        fill="currentColor"
        className="text-background"
        opacity="0.55"
      />
    </svg>
  );
}

export function Logo({
  className,
  size = "md",
}: {
  className?: string;
  size?: "sm" | "md";
}) {
  return (
    <span className={cn("flex min-w-0 items-center gap-2", className)}>
      <LogoMark className={cn("shrink-0", size === "sm" ? "size-6" : "size-7")} />
      <span
        className={cn(
          "headline truncate tracking-[-0.02em] lowercase",
          size === "sm" ? "text-[1.1rem]" : "text-[1.3rem]",
        )}
      >
        serendipity
      </span>

    </span>
  );
}
