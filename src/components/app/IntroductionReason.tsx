/** A separately authored manager's note, never part of the member's own words. */
export function IntroductionReason({ reason }: { reason: string }) {
  return (
    <aside className="rounded-surface bg-surface-subtle px-5 py-4" aria-label="소개 이유">
      <h2 className="text-sm font-semibold text-foreground">애프터가 두 분을 소개하는 이유</h2>
      <p
        data-selectable
        className="mt-2 break-keep break-words text-pretty text-base leading-[1.65] text-foreground"
      >
        {reason}
      </p>
    </aside>
  );
}
