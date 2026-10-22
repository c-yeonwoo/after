import type { ReactNode } from "react";
import { CalendarDays, MapPin } from "lucide-react";
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
      <dl className="space-y-2.5 text-sm">
        <div className="flex items-start gap-3">
          <dt className="flex w-12 shrink-0 items-center gap-1.5">
            <CalendarDays className="size-3.5" aria-hidden="true" />
            일시
          </dt>
          <dd className="min-w-0 break-keep break-words font-semibold">
            {scheduledAt ? formatMeetTime(scheduledAt) : "날짜 선택 중"}
          </dd>
        </div>
        <div className="flex items-start gap-3">
          <dt className="flex w-12 shrink-0 items-center gap-1.5">
            <MapPin className="size-3.5" aria-hidden="true" />
            장소
          </dt>
          <dd data-selectable className="min-w-0 break-keep break-words">
            {placeName || "장소 선택 중"}
          </dd>
        </div>
      </dl>
      {children}
    </section>
  );
}
