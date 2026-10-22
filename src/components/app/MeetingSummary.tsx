import type { ReactNode } from "react";
import { formatMeetTime } from "@/lib/meet";

/** The same time/place vocabulary in planning, home and conversation. */
export function MeetingSummary({
  scheduledAt,
  placeName,
  counterpartName,
  children,
}: {
  scheduledAt?: string | null;
  placeName?: string | null;
  counterpartName?: string | null;
  children?: ReactNode;
}) {
  return (
    <section aria-label="약속 요약" className="min-w-0">
      {counterpartName ? (
        <h2 className="mb-3 break-keep break-words text-lg font-semibold">
          {counterpartName}님과의 약속
        </h2>
      ) : null}
      <dl className="space-y-2 text-sm">
        <div className="flex items-baseline gap-3">
          <dt className="w-7 shrink-0 opacity-80">일시</dt>
          <dd className="min-w-0 break-keep break-words font-medium">
            {scheduledAt ? formatMeetTime(scheduledAt) : "날짜 선택 중"}
          </dd>
        </div>
        <div className="flex items-baseline gap-3">
          <dt className="w-7 shrink-0 opacity-80">장소</dt>
          <dd data-selectable className="min-w-0 break-keep break-words">
            {placeName || "장소 선택 중"}
          </dd>
        </div>
      </dl>
      {children}
    </section>
  );
}
