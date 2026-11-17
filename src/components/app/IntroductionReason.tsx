import { NotebookPen } from "lucide-react";

/** The same byline follows the manager's words from the home preview to the open profile. */
export function IntroductionReason({
  reason,
  embedded = false,
  preview = false,
  portrait = false,
}: {
  reason: string;
  embedded?: boolean;
  preview?: boolean;
  portrait?: boolean;
}) {
  return (
    <aside
      className={embedded ? "border-t border-border pt-4" : "intro-manager-note"}
      aria-label={portrait ? "매니저가 본 이분" : "소개 이유"}
    >
      <h2 className="flex items-center gap-2 text-sm font-semibold text-foreground">
        <NotebookPen className="size-4 shrink-0" aria-hidden="true" />
        {portrait ? "매니저가 본 이분" : "매니저의 소개 이유"}
      </h2>
      <p
        data-selectable
        className={
          preview
            ? "mt-1.5 line-clamp-3 break-keep break-words text-sm leading-relaxed"
            : "mt-2 break-keep break-words text-base leading-relaxed"
        }
      >
        {reason}
      </p>
    </aside>
  );
}
