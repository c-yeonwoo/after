import { useState } from "react";
import { CalendarCheck } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { VENUES, formatEvening } from "@/lib/meet";
import { saveFlow, useFlow, useMe } from "@/lib/store";
import { cn } from "@/lib/utils";

/** 대화방 상단의 약속 조율 카드 — 남성이 날짜·장소를 고르고 확정합니다. */
export function MeetPlanner({ area }: { area: string }) {
  const { flow } = useFlow();
  const { me } = useMe();
  const isMale = me?.gender === "male";
  const prefs = flow.prefs;

  const [date, setDate] = useState<string | null>(null);
  const [venueId, setVenueId] = useState<string | null>(null);

  const venue = VENUES.find((v) => v.id === flow.venueId);
  const confirmed = flow.meetupAt ? new Date(flow.meetupAt) : null;

  const candidates = prefs
    ? VENUES.filter((v) => v.kind === prefs.food || v.area === prefs.area)
    : VENUES;
  const venueList = candidates.length ? candidates : VENUES;

  if (confirmed) {
    return (
      <div className="rounded-2xl border border-border bg-card p-5 shadow-card">
        <div className="flex items-center gap-2">
          <CalendarCheck className="size-4 text-primary-strong" aria-hidden="true" />
          <p className="text-sm font-semibold">만남 확정</p>
        </div>
        <p className="mt-2 text-sm text-foreground">{formatEvening(flow.meetupAt!)}</p>
        <p className="mt-0.5 text-sm text-muted-foreground">
          {venue ? `${venue.name} · ${venue.area}` : `${area} 일대`}
        </p>
        <p className="mt-2.5 text-xs leading-relaxed text-muted-foreground">
          예약은 컨시어지가 잡아둡니다. 전날 자정에 사적인 이야기까지 나눌 수 있는 대화가 열립니다.
        </p>
      </div>
    );
  }

  return (
    <div className="rounded-2xl border border-border bg-card p-5 shadow-card">
      <div className="flex items-center gap-2">
        <CalendarCheck className="size-4 text-primary-strong" aria-hidden="true" />
        <p className="text-sm font-semibold">약속 정하기</p>
      </div>

      {prefs ? (
        <div className="mt-3 rounded-xl bg-muted/60 px-4 py-3 text-xs leading-relaxed text-muted-foreground">
          상대가 보내온 선호 · {prefs.area} · {prefs.food}
          {prefs.note ? <span className="mt-1 block text-foreground">“{prefs.note}”</span> : null}
        </div>
      ) : null}

      {!isMale ? (
        <p className="mt-3 text-xs leading-relaxed text-muted-foreground">
          보내주신 선호를 전달했습니다. 상대가 날짜와 장소를 제안하면 알려드릴게요.
        </p>
      ) : (
        <>
          <p className="mt-4 text-xs font-medium text-primary-strong">날짜 고르기</p>
          <div className="mt-2 space-y-2">
            {(prefs?.dates ?? []).map((iso) => (
              <button
                key={iso}
                type="button"
                aria-pressed={date === iso}
                onClick={() => setDate(iso)}
                className={cn(
                  "min-h-12 w-full rounded-xl border px-4 text-left text-sm transition-colors",
                  "focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none",
                  date === iso
                    ? "border-primary bg-primary/10 font-medium text-primary-strong"
                    : "border-border",
                )}
              >
                {formatEvening(iso)}
              </button>
            ))}
          </div>

          <p className="mt-5 text-xs font-medium text-primary-strong">장소 고르기</p>
          <div className="mt-2 space-y-2">
            {venueList.map((v) => (
              <button
                key={v.id}
                type="button"
                aria-pressed={venueId === v.id}
                onClick={() => setVenueId(v.id)}
                className={cn(
                  "w-full rounded-xl border px-4 py-3 text-left transition-colors",
                  "focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none",
                  venueId === v.id ? "border-primary bg-primary/10" : "border-border",
                )}
              >
                <span className="block text-sm font-medium">
                  {v.name} · {v.kind}
                </span>
                <span className="mt-0.5 block text-xs text-muted-foreground">
                  {v.area} · {v.note}
                </span>
              </button>
            ))}
          </div>

          <Button
            className="mt-5 w-full"
            disabled={!date || !venueId}
            onClick={() => {
              saveFlow({ meetupAt: date, venueId });
              toast.success("만남이 확정되었습니다. 예약은 컨시어지가 잡아둘게요.");
            }}
          >
            이 날짜와 장소로 확정하기
          </Button>
        </>
      )}
    </div>
  );
}
