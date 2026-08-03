import { useState } from "react";
import { CalendarCheck } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { describePrefs, formatMeetTime } from "@/lib/meet";
import { confirmMeeting, type Meeting } from "@/lib/api";
import { cn } from "@/lib/utils";

const PLACE_HINTS = ["카페", "저녁", "가벼운 술", "기타"];

/** 대화방 상단의 약속 조율 카드 — 장소·음식은 제한하지 않는다(D5 폐기). */
export function MeetPlanner({
  meeting,
  onConfirmed,
}: {
  meeting: Meeting;
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
      <div className="rounded-2xl border border-border bg-card p-5 shadow-card">
        <div className="flex items-center gap-2">
          <CalendarCheck className="size-4 text-primary-strong" aria-hidden="true" />
          <p className="text-sm font-semibold">만남 확정</p>
        </div>
        <p className="mt-2 text-sm text-foreground">{formatMeetTime(confirmed.toISOString())}</p>
        <p className="mt-0.5 text-sm text-muted-foreground">{meeting.place_name}</p>
        <p className="mt-2.5 text-xs leading-relaxed text-muted-foreground">
          만나기 전날 저녁 6시에 사적인 이야기까지 나눌 수 있는 대화가 열립니다.
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
          상대가 보내온 선호 · {describePrefs(prefs) || "지역은 상관없다고 하셨어요"}
          {prefs.note ? <span className="mt-1 block text-foreground">“{prefs.note}”</span> : null}
        </div>
      ) : null}

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
            {formatMeetTime(iso)}
          </button>
        ))}
      </div>

      <p className="mt-5 text-xs font-medium text-primary-strong">장소 정하기</p>
      <p className="mt-1 text-xs text-muted-foreground">
        카페든 저녁이든 무엇이든 괜찮습니다. 장소를 직접 적어 주세요.
      </p>
      <Input
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
              "min-h-11 rounded-full border px-3 text-xs transition-colors",
              placeKind === h
                ? "border-primary bg-primary/10 text-primary-strong"
                : "border-border bg-background",
            )}
          >
            {h}
          </button>
        ))}
      </div>

      <Button
        className="mt-5 w-full"
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
            toast.success("만남이 확정되었습니다.");
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
  );
}
