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
        d="M6.5 21.5c4.5 0 8-3.5 8-8s3.5-8 8-8"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
        className="text-primary"
      />
      <path
        d="M6.5 10.5c4.5 0 8 3.5 8 8s3.5 8 8 8"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
        className="text-coral-500"
      />
      <circle cx="14.5" cy="16" r="2.4" fill="currentColor" className="text-primary" />
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
          "truncate font-serif leading-none tracking-[-0.01em]",
          size === "sm" ? "text-[1.05rem]" : "text-[1.2rem]",
        )}
      >
        Serendipity
      </span>
    </span>
  );
}
