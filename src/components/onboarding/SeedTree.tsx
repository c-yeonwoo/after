import { cn } from "@/lib/utils";

export type SeedNode = {
  /** 씨앗 — 직접 적은 키워드 */
  label: string;
  /** 잎 — 후속 질문에 대한 답 (없으면 아직 가지만) */
  leaf?: string;
};

/**
 * 씨앗 → 가지 → 잎.
 * 직접 적은 키워드가 줄기에서 가지로 뻗고, 후속 답변이 잎으로 맺힙니다.
 */
export function SeedTree({
  nodes,
  activeIndex,
  onSelect,
  className,
}: {
  nodes: SeedNode[];
  activeIndex?: number;
  onSelect?: (index: number) => void;
  className?: string;
}) {
  if (!nodes.length) return null;

  return (
    <div className={cn("relative pl-5", className)}>
      {/* 줄기 */}
      <span
        aria-hidden="true"
        className="bg-border absolute top-2 bottom-2 left-[3px] w-px"
      />
      <ul className="space-y-2.5">
        {nodes.map((node, i) => {
          const active = activeIndex === i;
          const grown = Boolean(node.leaf?.trim());
          const Wrapper = onSelect ? "button" : "div";
          return (
            <li key={`${node.label}-${i}`} className="relative">
              {/* 가지 */}
              <span
                aria-hidden="true"
                className={cn(
                  "absolute top-4 -left-[17px] h-px w-[14px]",
                  grown ? "bg-primary/60" : "bg-border",
                )}
              />
              <span
                aria-hidden="true"
                className={cn(
                  "absolute top-[13px] -left-[6px] size-[7px] rounded-full border",
                  grown
                    ? "border-primary bg-primary"
                    : active
                      ? "border-primary bg-background"
                      : "border-border bg-background",
                )}
              />
              <Wrapper
                {...(onSelect
                  ? {
                      type: "button" as const,
                      onClick: () => onSelect(i),
                      "aria-current": active,
                    }
                  : {})}
                className={cn(
                  "block w-full rounded-field border px-3.5 py-2.5 text-left transition-colors",
                  active
                    ? "border-primary bg-primary/[0.06]"
                    : grown
                      ? "border-border bg-card"
                      : "border-border/70 bg-card/60",
                )}
              >
                <span className="block text-[0.9rem] leading-none font-semibold text-foreground">
                  {node.label}
                </span>
                {grown ? (
                  <span className="mt-1.5 block text-xs leading-relaxed text-muted-foreground">
                    {node.leaf}
                  </span>
                ) : (
                  <span className="mt-1.5 block text-xs leading-none text-muted-foreground">
                    한 마디 덧붙이면 잎이 맺힙니다
                  </span>
                )}
              </Wrapper>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
