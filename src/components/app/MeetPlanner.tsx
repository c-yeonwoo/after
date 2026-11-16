import { useState } from "react";
import { CalendarDays, Check } from "lucide-react";
import { toast } from "sonner";

import { AppScreen } from "@/components/app/AppScreen";
import { Button } from "@/components/ui/button";
import { MeetingPolicyNote } from "@/components/app/MeetingPolicyNote";
import { MeetingSummary } from "@/components/app/MeetingSummary";
import { Input } from "@/components/ui/input";
import { describePrefs, formatMeetTime } from "@/lib/meet";
import { confirmMeeting, type Meeting } from "@/lib/api";
import { cn } from "@/lib/utils";

const PLACE_HINTS = ["카페", "저녁", "가벼운 술", "기타"];

/** 상대가 보낸 날짜와 장소를 확정하는 화면 — 장소·음식은 제한하지 않는다(D5 폐기). */
export function MeetPlanner({
  meeting,
  counterpartName,
  onConfirmed,
}: {
  meeting: Meeting;
  counterpartName?: string | null;
  onConfirmed: (m: Meeting) => void;
}) {
  const [date, setDate] = useState<string | null>(null);
  const [placeName, setPlaceName] = useState("");
  const [placeKind, setPlaceKind] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const prefs = meeting.prefs as {
    dates?: string[];
    stations?: string[];
    anywhere?: boolean;
    note?: string;
  } | null;
  const confirmed = meeting.confirmed_at
    ? new Date(meeting.scheduled_at ?? meeting.confirmed_at)
    : null;

  if (confirmed) {
    return (
      <AppScreen title="날짜 정하기" back="/home" hideTabs>
        <div className="app-elevated rounded-surface bg-card p-5">
          <p className="mb-3 text-sm font-semibold">만남 확정</p>
          <MeetingSummary
            scheduledAt={meeting.scheduled_at}
            placeName={meeting.place_name}
            counterpartName={counterpartName}
          />
          <p className="mt-2.5 text-xs leading-relaxed text-muted-foreground">
            만나기 전날 저녁 6시에 사적인 이야기까지 나눌 수 있는 대화가 열립니다.
          </p>
        </div>
      </AppScreen>
    );
  }

  return (
    <AppScreen
      title="날짜 정하기"
      hideTabs
      back="/home"
      keyboardAware
      footer={
        <div className="meeting-response-actions">
          {date && placeName.trim() ? <MeetingPolicyNote /> : null}
          {!date || !placeName.trim() ? (
            <p id="meeting-required" className="mb-2 text-xs text-muted-foreground">
              {!date && !placeName.trim()
                ? "날짜와 장소를 정하면 확정할 수 있어요."
                : !date
                  ? "만날 날짜를 선택해 주세요."
                  : "만날 장소를 입력해 주세요."}
            </p>
          ) : null}
          <Button
            aria-describedby={!date || !placeName.trim() ? "meeting-required" : undefined}
            className="w-full"
            disabled={!date || !placeName.trim() || busy}
            onClick={async () => {
              if (!date || !placeName.trim()) return;
              setBusy(true);
              try {
                const updated = await confirmMeeting(
                  meeting.id,
                  date,
                  placeName.trim(),
                  placeKind ?? undefined,
                );
                onConfirmed(updated);
              } catch (err) {
                toast.error(err instanceof Error ? err.message : "확정에 실패했습니다.");
              } finally {
                setBusy(false);
              }
            }}
          >
            {busy ? "확정하는 중…" : "이 날짜와 장소로 확정하기"}
          </Button>
        </div>
      }
    >
      <section
        className="meeting-date-surface mt-2 rounded-surface p-4"
        aria-labelledby="schedule-date-title"
      >
        <h2 id="schedule-date-title" className="headline text-xl">
          {counterpartName ? `${counterpartName}님이 보낸 날짜` : "상대가 보낸 날짜"}
        </h2>
        <p className="mt-1 text-sm text-muted-foreground">만날 시간 하나를 골라 주세요.</p>
        <div className="mt-2 space-y-2">
          {(prefs?.dates ?? []).map((iso) => (
            <button
              key={iso}
              type="button"
              aria-pressed={date === iso}
              onClick={() => setDate(iso)}
              className={cn(
                "pressable flex min-h-12 w-full items-center gap-3 rounded-control border px-3 py-3 text-left text-sm",
                "focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none",
                date === iso
                  ? "border-selection bg-selection font-semibold text-selection-foreground"
                  : "border-transparent bg-card font-medium",
              )}
            >
              <CalendarDays className="size-4 shrink-0 text-primary-strong" aria-hidden="true" />
              {formatMeetTime(iso)}
              {date === iso ? (
                <Check className="ml-auto size-4 shrink-0" aria-hidden="true" />
              ) : null}
            </button>
          ))}
        </div>
      </section>
      <section className="mt-6" aria-labelledby="schedule-place-title">
        <h2 id="schedule-place-title" className="text-base font-semibold">
          장소 정하기
        </h2>
        {prefs && (describePrefs(prefs) || prefs.note) ? (
          <div className="mt-3 rounded-xl bg-muted/60 px-4 py-3 text-xs leading-relaxed text-muted-foreground">
            {describePrefs(prefs)}
            {prefs.note ? <span className="mt-1 block text-foreground">“{prefs.note}”</span> : null}
          </div>
        ) : null}

        <Input
          aria-label="만날 장소"
          className="mt-2"
          value={placeName}
          onChange={(e) => setPlaceName(e.target.value)}
          placeholder="예) 역삼역 근처 카페"
        />
        <div className="mt-2 flex flex-wrap gap-1.5">
          {PLACE_HINTS.map((h) => (
            <button
              key={h}
              type="button"
              aria-pressed={placeKind === h}
              onClick={() => setPlaceKind((prev) => (prev === h ? null : h))}
              className={cn(
                "pressable min-h-11 rounded-control border px-3 text-sm",
                placeKind === h
                  ? "border-selection bg-selection text-selection-foreground"
                  : "border-border bg-background",
              )}
            >
              {h}
            </button>
          ))}
        </div>
      </section>
    </AppScreen>
  );
}
