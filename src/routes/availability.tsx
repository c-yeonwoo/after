import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
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
import { BRAND } from "@/lib/brand";

export const Route = createFileRoute("/availability")({
  validateSearch: (search: Record<string, unknown>): { from?: "me" } => ({
    from: search.from === "me" ? "me" : undefined,
  }),
  head: () => ({ meta: [{ title: `만남 가능 시간 — ${BRAND.name}` }] }),
  component: AvailabilityPage,
});

function AvailabilityPage() {
  const navigate = useNavigate();
  const { me, ready } = useMe();
  const { from } = Route.useSearch();
  const back = from === "me" ? "/me" : "/home";
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [saved, setSaved] = useState<MeetWindow | null>(null);
  const [weekdays, setWeekdays] = useState<number[]>([]);
  const [earliest, setEarliest] = useState("19:00");
  const [busy, setBusy] = useState(false);
  const [retry, setRetry] = useState(0);
  const mutationLock = useRef(false);
  const activeUser = useRef<string | null>(null);
  const userId = me?.id;
  const completed = Boolean(me && me.onboarding_step >= 7);

  useEffect(() => {
    if (ready && !me) void navigate({ to: "/" });
    if (ready && me && me.onboarding_step < 7) void navigate({ to: "/signup" });
  }, [ready, me, navigate]);

  useEffect(() => {
    if (!ready || !userId || !completed) return;
    let cancelled = false;
    activeUser.current = userId;
    setLoading(true);
    setLoadError(false);
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
      activeUser.current = null;
    };
  }, [ready, userId, completed, retry]);

  function toggleDay(value: number) {
    setWeekdays((current) =>
      current.includes(value) ? current.filter((day) => day !== value) : [...current, value].sort(),
    );
  }

  async function save() {
    if (mutationLock.current || !me || weekdays.length === 0) return;
    mutationLock.current = true;
    setBusy(true);
    const owner = me.id;
    try {
      const next = await saveMyMeetWindow(weekdays, earliest);
      if (activeUser.current !== owner) return;
      setSaved(next);
      toast.success("가능한 시간을 저장했어요.");
      void navigate({ to: back });
    } catch {
      if (activeUser.current === owner) toast.error("저장하지 못했어요. 다시 시도해 주세요.");
    } finally {
      mutationLock.current = false;
      if (activeUser.current === owner) setBusy(false);
    }
  }

  if (!ready || !me || me.onboarding_step < 7 || loading) {
    return (
      <AppScreen title="만남 가능 시간" hideTabs back={back}>
        <p role="status" className="mt-16 text-center text-sm text-muted-foreground">
          불러오는 중입니다…
        </p>
      </AppScreen>
    );
  }

  return (
    <AppScreen
      title="만남 가능 시간"
      hideTabs
      back={back}
      footer={
        !loadError ? (
          <div>
            {weekdays.length === 0 ? (
              <p id="weekday-required" className="mb-3 text-center text-xs text-muted-foreground">
                편한 요일을 하나 이상 골라 주세요.
              </p>
            ) : null}
            <Button
              className="w-full"
              size="lg"
              disabled={busy || weekdays.length === 0}
              aria-describedby={weekdays.length === 0 ? "weekday-required" : undefined}
              onClick={() => void save()}
            >
              {busy ? "저장 중…" : "저장하기"}
            </Button>
          </div>
        ) : undefined
      }
    >
      <div className="mt-4">
        <h2 className="text-xl font-semibold tracking-tight">퇴근 후, 언제 편하세요?</h2>
        <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
          평소 가능한 요일을 알려주시면 약속 후보를 고를 때 참고할게요. 실제 날짜는 요청이 오면 다시
          고를 수 있습니다.
        </p>
      </div>

      {loadError ? (
        <div role="alert" className="app-elevated mt-6 rounded-surface bg-card p-5 text-sm">
          <p className="text-muted-foreground">저장된 시간을 확인하지 못했습니다.</p>
          <Button variant="outline" className="mt-4" onClick={() => setRetry((v) => v + 1)}>
            다시 불러오기
          </Button>
        </div>
      ) : (
        <>
          {saved && !saved.fresh ? (
            <p role="status" className="mt-5 text-sm text-muted-foreground">
              설정한 지 14일이 지났어요. 요일과 시간을 다시 확인하고 저장해 주세요.
            </p>
          ) : null}
          <fieldset disabled={busy} className="min-w-0">
            <section
              className="app-elevated mt-6 rounded-surface bg-card p-5"
              aria-labelledby="weekday-title"
            >
              <h3 id="weekday-title" className="text-sm font-semibold">
                편한 요일
              </h3>
              <div className="mt-3 grid grid-cols-5 gap-1" role="group" aria-label="편한 요일">
                {[1, 2, 3, 4, 5].map((day) => (
                  <button
                    key={day}
                    type="button"
                    aria-pressed={weekdays.includes(day)}
                    onClick={() => toggleDay(day)}
                    className={cn(
                      "pressable min-h-12 rounded-control text-sm font-semibold focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none disabled:opacity-60",
                      weekdays.includes(day)
                        ? "bg-primary text-primary-foreground"
                        : "bg-surface-subtle text-foreground",
                    )}
                  >
                    {WEEKDAY_LABELS[day]}
                  </button>
                ))}
              </div>
            </section>

            <section
              className="app-elevated mt-6 rounded-surface bg-card p-5"
              aria-labelledby="time-title"
            >
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
                      "pressable min-h-12 rounded-control text-sm focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none disabled:opacity-60",
                      earliest === time.value
                        ? "bg-primary font-semibold text-primary-foreground"
                        : "bg-surface-subtle text-foreground",
                    )}
                  >
                    {time.label}부터
                  </button>
                ))}
              </div>
            </section>
          </fieldset>

          <p className="mt-7 text-xs leading-relaxed text-muted-foreground">
            설정은 14일 동안 약속 제안에만 사용합니다. 상대에게 입력한 요일을 그대로 보여주지
            않으며, 언제든 바꾸거나 지울 수 있습니다.
          </p>

          {saved ? (
            <button
              type="button"
              disabled={busy}
              className="pressable mt-3 min-h-12 w-full rounded-control text-sm text-muted-foreground hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none disabled:opacity-50"
              onClick={async () => {
                if (mutationLock.current) return;
                mutationLock.current = true;
                setBusy(true);
                const owner = me.id;
                try {
                  await clearMyMeetWindow();
                  if (activeUser.current !== owner) return;
                  setSaved(null);
                  setWeekdays([]);
                  toast.success("가능한 시간 설정을 지웠어요.");
                } catch {
                  if (activeUser.current === owner) toast.error("설정을 지우지 못했어요.");
                } finally {
                  mutationLock.current = false;
                  if (activeUser.current === owner) setBusy(false);
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
