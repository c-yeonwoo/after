import { cn } from "@/lib/utils";

export function Chip({
  selected,
  disabled,
  onClick,
  children,
}: {
  selected: boolean;
  disabled?: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      aria-pressed={selected}
      onClick={onClick}
      className={cn(
        "inline-flex min-h-11 items-center justify-center rounded-full border px-4 text-center",
        "font-sans text-[0.9rem] leading-none font-medium tracking-[-0.01em] transition-colors",
        "focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background focus-visible:outline-none",
        selected
          ? "border-primary bg-primary text-primary-foreground font-semibold"
          : "border-border bg-card text-foreground",
        disabled && !selected ? "cursor-not-allowed opacity-45" : "",
      )}

    >
      {children}
    </button>
  );
}
