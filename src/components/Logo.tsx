import { BRAND } from "@/lib/brand";
import { BRAND_LOGO } from "@/lib/brandLogo";
import { cn } from "@/lib/utils";

/**
 * Approved connected f/t mark. Geometry is generated from brand/after-logo.json
 * and shared by app icons, favicons and social exports.
 */
export function LogoMark({ className }: { className?: string }) {
  return (
    <svg
      viewBox={BRAND_LOGO.symbol.viewBox.join(" ")}
      fill="none"
      stroke="currentColor"
      strokeWidth={BRAND_LOGO.strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      className={cn("size-6 text-foreground", className)}
    >
      {BRAND_LOGO.symbol.paths.map((path) => (
        <path key={path} d={path} />
      ))}
    </svg>
  );
}

export function Logo({ className, size = "md" }: { className?: string; size?: "sm" | "md" }) {
  return (
    <span
      className={cn(
        "inline-flex min-w-0 items-center text-foreground",
        size === "sm" ? "h-7" : "h-8",
        className,
      )}
      aria-label={BRAND.name}
      role="img"
    >
      <svg
        aria-hidden="true"
        viewBox={BRAND_LOGO.wordmark.viewBox.join(" ")}
        className="block h-full w-auto max-w-full"
        fill="none"
        stroke="currentColor"
        strokeWidth={BRAND_LOGO.strokeWidth}
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        {BRAND_LOGO.wordmark.paths.map((path) => (
          <path key={path} d={path} />
        ))}
      </svg>
    </span>
  );
}
