import { useEffect, useMemo, useState } from "react";
import { MapPin, X } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { meetPlacesForMe, requestMeeting, type Meeting, type MeetPlace } from "@/lib/api";
import {
  calendarDays,
  formatDayKey,
  formatMeetTime,
  isWeekendKey,
  meetingIso,
  WEEKDAY_TIMES,
} from "@/lib/meet";
import { cn } from "@/lib/utils";

const MAX_SLOTS = 3;

/** 서버가 거절한 이유를 사용자 문장으로. PostgREST 에러는 Error 가 아니라 객체다. */
function requestError(err: unknown) {
  const raw =
    typeof err === "object" &&
    err !== null &&
    typeof (err as { message?: unknown }).message === "string"
      ? (err as { message: string }).message
      : "";
  if (raw.includes("between 3 hours and 21 days"))
    return "후보는 3시간 뒤부터 3주 안의 시간으로 골라 주세요.";
  if (raw.includes("place not available"))
    return "그 장소는 지금 고를 수 없어요. 다른 곳을 골라 주세요.";
  if (raw.includes("place required")) return "만날 곳을 적어 주세요.";
  if (raw.includes("no unused ticket")) return "쓸 수 있는 만남 티켓이 없어요.";
  if (raw.includes("intro not open")) return "이 소개는 이미 닫혔어요.";
  return "요청을 보내지 못했습니다. 잠시 후 다시 시도해 주세요.";
}

const KIND_LABEL: Record<string, string> = {
  cafe: "카페",
  restaurant: "식당",
  bar: "바",
  etc: "기타",
};

/**
 * 만남 요청 — 평일 저녁 후보 최대 3개 + 장소 하나 (D1-B, s51).
 *
 * 예전에는 티켓을 쓰면 여성이 가능한 날짜를 보내고, 남성이 그중 하나를 고른 뒤 장소를
 * 빈칸에 적었다. 왕복 두 번이었고 장소는 늘 남성의 숙제였다. 이제 요청 한 번에 후보와
 * 장소가 같이 가고, 여성은 하나를 누르면 끝난다.
 *
 * 후보는 **평일 저녁**만 고를 수 있다 — "퇴근 후, 회사 근처" 가 이 서비스의 약속이다.
 * 장소는 운영팀이 권역마다 골라 둔 목록에서 고른다. 목록이 아직 비어 있으면 직접 적는다.
 */
export function MeetRequestForm({
  introId,
  counterpartName,
  onRequested,
}: {
  introId: string;
  counterpartName: string | null;
  onRequested: (m: Meeting) => void;
}) {
  // 달력은 클라이언트에서만 만든다(하이드레이션 — meet.ts 주석).
  const [days, setDays] = useState<string[]>([]);
  const [day, setDay] = useState<string | null>(null);
  const [slots, setSlots] = useState<string[]>([]);
  const [places, setPlaces] = useState<MeetPlace[] | null>(null);
  const [placeId, setPlaceId] = useState<string | null>(null);
  const [placeName, setPlaceName] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    setDays(
      calendarDays(3)
        .filter((d) => d.selectable && !isWeekendKey(d.key))
        .slice(0, 10)
        .map((d) => d.key),
    );
    meetPlacesForMe()
      .then(setPlaces)
      .catch(() => setPlaces([]));
  }, []);

  const sortedSlots = useMemo(() => [...slots].sort(), [slots]);
  const placeReady = placeId !== null || placeName.trim().length > 0;
  const ready = slots.length > 0 && placeReady && !busy;

  function toggleSlot(iso: string) {
    setSlots((list) =>
      list.includes(iso)
        ? list.filter((s) => s !== iso)
        : list.length >= MAX_SLOTS
          ? list
          : [...list, iso],
    );
  }

  return (
    <div className="space-y-7">
      <section>
        <h3 className="text-base font-semibold text-foreground">언제 만날까요?</h3>
        <p className="mt-1 text-sm text-muted-foreground">
          평일 저녁 후보를 {MAX_SLOTS}개까지 고르세요.
          {counterpartName ? ` ${counterpartName}님이` : " 상대가"} 하나를 고르면 바로 약속이
          정해져요.
        </p>

        <div className="mt-4 flex gap-2 overflow-x-auto pb-1" role="group" aria-label="날짜">
          {days.map((k) => (
            <button
              key={k}
              type="button"
              aria-pressed={day === k}
              onClick={() => setDay(k)}
              className={cn(
                "min-h-11 shrink-0 rounded-control border px-3.5 text-sm transition-colors focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none",
                day === k
                  ? "border-primary bg-primary font-semibold text-primary-foreground"
                  : "border-border bg-card text-foreground",
              )}
            >
              {formatDayKey(k)}
            </button>
          ))}
        </div>

        {day ? (
          <div className="mt-3 grid grid-cols-4 gap-2" role="group" aria-label="시간">
            {WEEKDAY_TIMES.map((t) => {
              const iso = meetingIso(day, t.value);
              const on = slots.includes(iso);
              const full = !on && slots.length >= MAX_SLOTS;
              return (
                <button
                  key={t.value}
                  type="button"
                  aria-pressed={on}
                  disabled={full}
                  onClick={() => toggleSlot(iso)}
                  className={cn(
                    "min-h-11 rounded-control border text-sm transition-colors focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none disabled:opacity-40",
                    on
                      ? "border-primary bg-primary font-semibold text-primary-foreground"
                      : "border-border bg-card text-foreground",
                  )}
                >
                  {t.label}
                </button>
              );
            })}
          </div>
        ) : null}

        {sortedSlots.length > 0 ? (
          <ul className="mt-4 space-y-2" aria-label="고른 후보">
            {sortedSlots.map((iso) => (
              <li
                key={iso}
                className="flex min-h-11 items-center justify-between gap-3 rounded-field border border-border bg-card px-4 text-sm"
              >
                <span className="font-medium text-foreground">{formatMeetTime(iso)}</span>
                <button
                  type="button"
                  aria-label={`${formatMeetTime(iso)} 빼기`}
                  onClick={() => toggleSlot(iso)}
                  className="grid size-9 place-items-center rounded-control text-muted-foreground hover:bg-muted"
                >
                  <X className="size-4" aria-hidden="true" />
                </button>
              </li>
            ))}
          </ul>
        ) : null}
      </section>

      <section>
        <h3 className="text-base font-semibold text-foreground">어디서 만날까요?</h3>
        {places === null ? (
          <p className="mt-2 text-sm text-muted-foreground">장소를 불러오는 중입니다…</p>
        ) : places.length > 0 ? (
          <>
            <p className="mt-1 text-sm text-muted-foreground">
              운영팀이 퇴근길에 들르기 좋은 곳을 골라 두었어요. 예약은 하지 않아요.
            </p>
            <ul className="mt-3 space-y-2" role="radiogroup" aria-label="장소">
              {places.map((p) => (
                <li key={p.id}>
                  <button
                    type="button"
                    role="radio"
                    aria-checked={placeId === p.id}
                    onClick={() => setPlaceId(p.id)}
                    className={cn(
                      "flex w-full items-start gap-3 rounded-surface border px-4 py-3 text-left transition-colors focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none",
                      placeId === p.id ? "border-primary bg-brand-tint" : "border-border bg-card",
                    )}
                  >
                    <MapPin
                      className="mt-0.5 size-4 shrink-0 text-primary-strong"
                      aria-hidden="true"
                    />
                    <span className="min-w-0">
                      <span className="block text-sm font-semibold text-foreground">{p.name}</span>
                      <span className="mt-0.5 block text-xs text-muted-foreground">
                        {p.station}역 · {KIND_LABEL[p.kind] ?? p.kind}
                        {p.note ? ` · ${p.note}` : ""}
                      </span>
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          </>
        ) : (
          <>
            <p className="mt-1 text-sm text-muted-foreground">
              만날 곳을 적어 주세요. 회사 근처, 사람이 많은 곳이면 좋아요.
            </p>
            <Input
              className="mt-3"
              aria-label="만날 곳"
              placeholder="예: 역삼역 3번 출구 근처 카페"
              maxLength={60}
              value={placeName}
              onChange={(e) => setPlaceName(e.target.value)}
            />
          </>
        )}
      </section>

      <div>
        <Button
          className="w-full"
          size="lg"
          disabled={!ready}
          onClick={async () => {
            setBusy(true);
            try {
              const m = await requestMeeting(
                introId,
                sortedSlots,
                placeId ? { placeId } : { placeName: placeName.trim() },
              );
              toast.success("요청을 보냈어요. 상대가 고르면 바로 약속이 정해져요.");
              onRequested(m);
            } catch (err) {
              toast.error(requestError(err));
            } finally {
              setBusy(false);
            }
          }}
        >
          {busy
            ? "보내는 중…"
            : slots.length > 0
              ? `후보 ${slots.length}개로 요청하기 · 만남 티켓 1장`
              : "후보를 골라 주세요"}
        </Button>
        <p className="mt-3 text-center text-xs leading-relaxed text-muted-foreground">
          상대가 거절하거나 24시간 안에 답하지 않으면 티켓을 돌려드려요.
        </p>
      </div>
    </div>
  );
}
