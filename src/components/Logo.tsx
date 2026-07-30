import { cn } from "@/lib/utils";

/**
 * 세렌디피티 로고.
 * mark: 두 개의 궤도가 한 점에서 우연히 겹치는 형태 (우연한 만남).
 */
export function LogoMark({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 32 32"
      fill="none"
      aria-hidden="true"
      className={cn("size-7", className)}
    >
      <path
        d="M6 21.5c4.6 0 8-3.6 8-8s3.4-8 8-8"
        stroke="currentColor"
        strokeWidth="2.6"
        strokeLinecap="round"
        className="text-primary"
      />
      <path
        d="M6 10.5c4.6 0 8 3.6 8 8s3.4 8 8 8"
        stroke="currentColor"
        strokeWidth="2.6"
        strokeLinecap="round"
        className="text-coral-500"
      />
      <circle cx="14" cy="16" r="2.9" fill="currentColor" className="text-primary" />
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
          "truncate font-display leading-none",
          size === "sm"
            ? "text-[0.98rem] tracking-[0.01em]"
            : "text-[1.12rem] tracking-[0.012em]",
        )}
        style={{ fontStretch: "122%", fontWeight: 620 }}
      >
        Serendipity
      </span>
    </span>
  );
}
