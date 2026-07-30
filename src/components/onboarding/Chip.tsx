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
        "min-h-11 rounded-full border px-4 py-2 text-sm transition-colors",
        "focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background focus-visible:outline-none",
        selected
          ? "border-primary-strong bg-primary/10 font-semibold text-primary-strong"
          : "border-border bg-card text-foreground",
        disabled && !selected ? "cursor-not-allowed opacity-45" : "",
      )}
    >
      {children}
    </button>
  );
}
