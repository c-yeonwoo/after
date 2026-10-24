import { cn } from "@/lib/utils";
import { Check } from "lucide-react";

export function Chip({
  selected,
  disabled,
  onClick,
  children,
  className,
}: {
  selected: boolean;
  disabled?: boolean;
  onClick: () => void;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      aria-pressed={selected}
      onClick={onClick}
      className={cn(
        "inline-flex min-h-11 items-center justify-center rounded-control border px-4 py-2.5 text-center",
        "pressable break-keep font-sans text-sm leading-snug font-medium tracking-[-0.01em]",
        "focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background focus-visible:outline-none",
        selected
          ? "border-selection bg-selection text-selection-foreground font-semibold"
          : "border-border bg-card text-foreground",
        disabled && !selected ? "cursor-not-allowed opacity-45" : "",
        className,
      )}
    >
      {children}
      {selected ? <Check aria-hidden="true" className="ml-1.5 size-3.5 shrink-0" /> : null}
    </button>
  );
}
