import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { toast } from "sonner";

import { AppScreen } from "@/components/app/AppScreen";
import { Button } from "@/components/ui/button";
import { WEEKDAY_TIMES } from "@/lib/meet";
import {
  WEEKDAY_LABELS,
  clearMyMeetWindow,
  myMeetWindow,
  saveMyMeetWindow,
  type MeetWindow,
} from "@/lib/meetWindow";
import { useMe } from "@/lib/me";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/availability")({
  component: AvailabilityPage,
});

function AvailabilityPage() {
  const navigate = useNavigate();
  const { me, ready } = useMe();
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [saved, setSaved] = useState<MeetWindow | null>(null);
  const [weekdays, setWeekdays] = useState<number[]>([]);
  const [earliest, setEarliest] = useState("19:00");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (ready && !me) void navigate({ to: "/" });
    if (ready && me && me.onboarding_step < 7) void navigate({ to: "/signup" });
  }, [ready, me, navigate]);

  useEffect(() => {
    if (!ready || !me || me.onboarding_step < 7) return;
    let cancelled = false;
    myMeetWindow()
      .then((value) => {
        if (cancelled) return;
        setSaved(value);
        setWeekdays(value?.weekdays ?? []);
        setEarliest(value?.earliest_local ?? "19:00");
        setLoadError(false);
      })
      .catch(() => {
        if (!cancelled) setLoadError(true);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [ready, me]);

  function toggleDay(value: number) {
    setWeekdays((current) =>
      current.includes(value) ? current.filter((day) => day !== value) : [...current, value].sort(),
    );
  }

  if (!ready || !me || loading) {
    return (
      <AppScreen title="만남 가능 시간" hideTabs back="/home">
        <p className="mt-16 text-center text-sm text-muted-foreground">불러오는 중입니다…</p>
      </AppScreen>
    );
  }

  return (
    <AppScreen title="만남 가능 시간" hideTabs back="/home">
      <div className="mt-4">
        <h2 className="text-xl font-semibold tracking-tight">퇴근 후, 언제 편하세요?</h2>
        <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
          평소 가능한 요일을 알려주시면 약속 후보를 고를 때 참고할게요. 실제 날짜는 요청이 오면 다시
          고를 수 있습니다.
        </p>
      </div>

      {loadError ? (
        <p role="alert" className="mt-6 text-sm text-destructive">
          저장된 시간을 확인하지 못했습니다. 잠시 후 다시 열어 주세요.
        </p>
      ) : (
        <>
          <section className="mt-8" aria-labelledby="weekday-title">
            <h3 id="weekday-title" className="text-sm font-semibold">
              편한 요일
            </h3>
            <div className="mt-3 grid grid-cols-5 gap-2" role="group" aria-label="편한 요일">
              {[1, 2, 3, 4, 5].map((day) => (
                <button
                  key={day}
                  type="button"
                  aria-pressed={weekdays.includes(day)}
                  onClick={() => toggleDay(day)}
                  className={cn(
                    "min-h-12 rounded-control border text-sm font-semibold transition-colors active:scale-[0.97] focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none",
                    weekdays.includes(day)
                      ? "border-primary bg-primary text-primary-foreground"
                      : "border-border bg-card text-foreground",
                  )}
                >
                  {WEEKDAY_LABELS[day]}
                </button>
              ))}
            </div>
          </section>

          <section className="mt-8" aria-labelledby="time-title">
            <h3 id="time-title" className="text-sm font-semibold">
              가장 이른 시간
            </h3>
            <div className="mt-3 grid grid-cols-2 gap-2" role="group" aria-label="가장 이른 시간">
              {WEEKDAY_TIMES.map((time) => (
                <button
                  key={time.value}
                  type="button"
                  aria-pressed={earliest === time.value}
                  onClick={() => setEarliest(time.value)}
                  className={cn(
                    "min-h-12 rounded-control border text-sm transition-colors active:scale-[0.97] focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none",
                    earliest === time.value
                      ? "border-primary bg-primary font-semibold text-primary-foreground"
                      : "border-border bg-card text-foreground",
                  )}
                >
                  {time.label}부터
                </button>
              ))}
            </div>
          </section>

          <p className="mt-7 text-xs leading-relaxed text-muted-foreground">
            설정은 14일 동안 약속 제안에만 사용합니다. 상대에게 입력한 요일을 그대로 보여주지
            않으며, 언제든 바꾸거나 지울 수 있습니다.
          </p>

          <Button
            className="mt-5 w-full"
            size="lg"
            disabled={busy || weekdays.length === 0}
            onClick={async () => {
              setBusy(true);
              try {
                const next = await saveMyMeetWindow(weekdays, earliest);
                setSaved(next);
                toast.success("가능한 시간을 저장했어요.");
                void navigate({ to: "/home" });
              } catch {
                toast.error("저장하지 못했어요. 다시 시도해 주세요.");
              } finally {
                setBusy(false);
              }
            }}
          >
            {busy ? "저장 중…" : "저장하기"}
          </Button>

          {saved ? (
            <button
              type="button"
              disabled={busy}
              className="mt-3 min-h-11 w-full text-sm text-muted-foreground underline underline-offset-4 disabled:opacity-50"
              onClick={async () => {
                setBusy(true);
                try {
                  await clearMyMeetWindow();
                  setSaved(null);
                  setWeekdays([]);
                  toast.success("가능한 시간 설정을 지웠어요.");
                } catch {
                  toast.error("설정을 지우지 못했어요.");
                } finally {
                  setBusy(false);
                }
              }}
            >
              설정 지우기
            </button>
          ) : null}
        </>
      )}
    </AppScreen>
  );
}
