import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { Check, MapPin, Search, X } from "lucide-react";
import { toast } from "sonner";

import { AppScreen } from "@/components/app/AppScreen";
import { GuideNote } from "@/components/app/GuideNote";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { BRAND } from "@/lib/brand";
import {
  calendarDays,
  DEFAULT_MEET_TIME,
  formatDayKey,
  isWeekendKey,
  meetingIso,
  searchStations,
  timesFor,
  type MeetPrefs,
} from "@/lib/meet";
import { listMeetingsAwaitingMyPrefs, submitMeetingPrefs } from "@/lib/api";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/prefs")({
  // 요청이 여러 건일 수 있으므로 어느 요청에 답하는지 반드시 지정한다.
  validateSearch: (search: Record<string, unknown>): { meetingId?: string } => ({
    meetingId: typeof search.meetingId === "string" ? search.meetingId : undefined,
  }),
  head: () => ({
    meta: [
      { title: `만남 선호 답하기 — ${BRAND.short}` },
      { name: "description", content: "가능한 날짜와 편한 지역만 고르면 대화가 열립니다." },
      { property: "og:title", content: `만남 선호 답하기 — ${BRAND.short}` },
      { property: "og:description", content: "짧게 몇 가지만 고르면 됩니다." },
    ],
  }),
  component: PrefsPage,
});

const WEEKDAYS = ["일", "월", "화", "수", "목", "금", "토"];

function PrefsPage() {
  const navigate = useNavigate();
  const { meetingId: meetingIdParam } = Route.useSearch();
  const [loading, setLoading] = useState(true);
  const [meetingId, setMeetingId] = useState<string | null>(null);
  const [candidateName, setCandidateName] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // `loading` 이 풀린 뒤에만 렌더되므로 이 시점은 항상 클라이언트다.
  const days = useMemo(() => calendarDays(3), []);
  /** 고른 날짜 → 그 날의 시각. 날짜마다 다르게 정할 수 있다. */
  const [picked, setPicked] = useState<Record<string, string>>({});
  /**
   * 마지막으로 고른 시각. 새로 찍는 날짜가 이 값을 물려받는다.
   * "퇴근하고 늘 7시 반"처럼 시각이 대체로 같은 사람이 날짜 수만큼
   * 시각을 다시 누르지 않아도 되게 하는 장치다.
   *
   * 평일과 주말을 따로 기억한다 — 선택지 목록이 다르므로 하나로 합치면
   * 주말에 고른 "낮 12시"가 평일 날짜로 새어 들어가 어느 칩도 선택되지 않은
   * 상태가 된다(그리고 화요일 정오로 저장된다).
   */
  const [lastTime, setLastTime] = useState({
    weekday: DEFAULT_MEET_TIME,
    weekend: DEFAULT_MEET_TIME,
  });
  const [stations, setStations] = useState<string[]>([]);
  const [anywhere, setAnywhere] = useState(false);
  const [q, setQ] = useState("");
  const [note, setNote] = useState("");

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const pending = await listMeetingsAwaitingMyPrefs();
      if (cancelled) return;
      // 지정된 요청이 있으면 그것, 없으면 가장 오래 기다린 것(환불 기한이 먼저 온다).
      const target = meetingIdParam
        ? pending.find((r) => r.meeting.id === meetingIdParam)
        : pending[0];
      setMeetingId(target?.meeting.id ?? null);
      setCandidateName(target?.candidate.name ?? null);
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [meetingIdParam]);

  // 날짜 키가 YYYY-MM-DD 라 사전순 정렬이 곧 시간순이다.
  const pickedKeys = useMemo(() => Object.keys(picked).sort(), [picked]);

  // 역은 선택 사항이다 — 날짜만 있으면 세라가 전달할 수 있다.
  const canSubmit = pickedKeys.length > 0;

  const monthLabel = useMemo(() => {
    const months = [...new Set(days.map((d) => d.month))];
    return months.map((m) => `${m}월`).join(" – ");
  }, [days]);

  function toggleDay(key: string) {
    setPicked((p) => {
      if (p[key]) {
        const next = { ...p };
        delete next[key];
        return next;
      }
      return { ...p, [key]: isWeekendKey(key) ? lastTime.weekend : lastTime.weekday };
    });
  }

  function setDayTime(key: string, t: string) {
    setPicked((p) => ({ ...p, [key]: t }));
    setLastTime((prev) => ({ ...prev, [isWeekendKey(key) ? "weekend" : "weekday"]: t }));
  }

  if (loading) {
    return (
      <AppScreen title="만남 선호" hideTabs back="/requests">
        <p className="mt-16 text-center text-sm text-muted-foreground">불러오는 중입니다…</p>
      </AppScreen>
    );
  }

  if (!meetingId) {
    return (
      <AppScreen title="만남 선호" hideTabs back="/requests">
        <div className="mt-16 rounded-2xl border border-dashed border-border px-6 py-12 text-center">
          <p className="text-sm font-medium">지금 답할 선호가 없습니다</p>
          <p className="mt-1.5 text-xs leading-relaxed text-muted-foreground">
            상대가 만남 티켓을 사용하면 이곳에서 답할 수 있습니다.
          </p>
        </div>
      </AppScreen>
    );
  }

  return (
    <AppScreen title="만남 선호" hideTabs back="/requests">
      <div className="mt-3">
        <GuideNote>
          {candidateName
            ? `${candidateName}님이 만남 티켓을 사용했어요. 가능한 날과 편한 지역만 알려 주세요.`
            : "만남 요청이 도착했어요. 가능한 날과 편한 지역만 알려 주세요."}
        </GuideNote>
      </div>

      <section className="mt-6">
        <h2 className="text-sm font-semibold">가능한 날</h2>
        <p className="mt-1 text-xs text-muted-foreground">
          편한 날을 직접 골라 주세요. 여러 날을 고르시면 상대가 그중에서 정합니다.
        </p>

        <div className="mt-3 rounded-surface border border-border bg-card px-4 pt-4 pb-3">
          <p className="text-3xs font-semibold tracking-[0.14em] text-muted-foreground uppercase">
            {monthLabel}
          </p>
          <div className="mt-2.5 grid grid-cols-7 gap-1">
            {WEEKDAYS.map((w) => (
              <span
                key={w}
                aria-hidden="true"
                className="pb-1 text-center text-3xs font-semibold text-muted-foreground"
              >
                {w}
              </span>
            ))}
            {days.map((d) => {
              const on = Boolean(picked[d.key]);
              return (
                <button
                  key={d.key}
                  type="button"
                  disabled={!d.selectable}
                  aria-pressed={on}
                  aria-label={`${d.month}월 ${d.day}일`}
                  onClick={() => toggleDay(d.key)}
                  className={cn(
                    "flex aspect-square items-center justify-center rounded-xl text-sm tabular-nums transition-colors",
                    "focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none",
                    !d.selectable && "text-muted-foreground/35",
                    d.selectable && !on && "text-foreground hover:bg-muted",
                    on && "bg-primary font-semibold text-primary-foreground",
                  )}
                >
                  {d.firstOfMonth ? `${d.month}/1` : d.day}
                </button>
              );
            })}
          </div>
        </div>

        <h3 className="mt-5 text-sm font-semibold">
          고른 날{pickedKeys.length ? ` ${pickedKeys.length}일` : ""}
        </h3>
        <p className="mt-1 text-xs text-muted-foreground">
          날짜마다 시각을 다르게 정하실 수 있습니다.
        </p>

        {pickedKeys.length ? (
          <ul className="mt-3 space-y-2">
            {pickedKeys.map((key) => {
              const label = formatDayKey(key);
              return (
                <li key={key} className="rounded-surface border border-border bg-card px-4 py-3">
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-sm font-semibold">{label}</p>
                    <button
                      type="button"
                      onClick={() => toggleDay(key)}
                      aria-label={`${label} 빼기`}
                      className="-mr-1.5 inline-flex size-9 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
                    >
                      <X className="size-4" aria-hidden="true" />
                    </button>
                  </div>
                  <div className="mt-2 grid grid-cols-4 gap-1.5">
                    {timesFor(key).map((t) => {
                      const on = picked[key] === t.value;
                      return (
                        <button
                          key={t.value}
                          type="button"
                          aria-pressed={on}
                          aria-label={`${label} ${t.label}`}
                          onClick={() => setDayTime(key, t.value)}
                          className={cn(
                            "min-h-11 rounded-control border text-sm transition-colors",
                            "focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none",
                            on
                              ? "border-primary bg-primary/12 font-medium text-primary-strong"
                              : "border-border text-foreground",
                          )}
                        >
                          {t.label}
                        </button>
                      );
                    })}
                  </div>
                </li>
              );
            })}
          </ul>
        ) : (
          <p className="mt-3 rounded-surface border border-dashed border-border px-4 py-6 text-center text-xs text-muted-foreground">
            위 달력에서 편한 날을 눌러 주세요.
          </p>
        )}
      </section>

      <section className="mt-7">
        <h2 className="text-sm font-semibold">이동이 편한 역</h2>
        <p className="mt-1 text-xs text-muted-foreground">
          여러 개 골라도 되고, 건너뛰셔도 됩니다.
        </p>

        {stations.length ? (
          <div className="mt-3 flex flex-wrap gap-2">
            {stations.map((st) => (
              <span
                key={st}
                className="inline-flex min-h-11 items-center gap-1.5 rounded-control bg-primary/12 pr-2 pl-3.5 text-sm font-medium text-primary-strong"
              >
                <MapPin className="size-3.5" aria-hidden="true" />
                {st}
                <button
                  type="button"
                  onClick={() => setStations((p) => p.filter((x) => x !== st))}
                  aria-label={`${st}역 빼기`}
                  className="rounded-full p-1.5 hover:bg-primary/15 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
                >
                  <X className="size-3.5" aria-hidden="true" />
                </button>
              </span>
            ))}
          </div>
        ) : null}

        <div className="relative mt-3">
          <Search
            className="pointer-events-none absolute top-1/2 left-3.5 size-4 -translate-y-1/2 text-muted-foreground"
            aria-hidden="true"
          />
          <Input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="역 이름 검색"
            aria-label="역 이름 검색"
            className="pl-10"
          />
        </div>

        {searchStations(q, stations).length ? (
          <ul className="mt-2 overflow-hidden rounded-field border border-border">
            {searchStations(q, stations).map((st) => (
              <li key={st}>
                <button
                  type="button"
                  onClick={() => {
                    setStations((p) => [...p, st]);
                    setQ("");
                  }}
                  className="flex min-h-12 w-full items-center gap-2 border-b border-border/70 px-4 text-left text-sm last:border-0 hover:bg-muted/50 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
                >
                  <MapPin className="size-3.5 text-muted-foreground" aria-hidden="true" />
                  {st}
                </button>
              </li>
            ))}
          </ul>
        ) : null}

        {/*
          "어디든 괜찮아요"는 역 선택과 **배타가 아니다.**
          역을 고르고도 켤 수 있어야 "이 역들이 편하지만 다른 데도 괜찮다"는
          실제 의사를 표현할 수 있다. 예전엔 역 이름들과 같은 칩 세트에 섞여 있어
          하나만 고를 수 있었고, 그래서 세트 전체가 성의 없어 보였다.
        */}
        <button
          type="button"
          aria-pressed={anywhere}
          onClick={() => setAnywhere((v) => !v)}
          className={cn(
            "mt-3 flex min-h-12 w-full items-center justify-center gap-2 rounded-control border text-sm transition-colors",
            "focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none",
            anywhere
              ? "border-primary bg-primary/10 font-medium text-primary-strong"
              : "border-border bg-card text-foreground",
          )}
        >
          {anywhere ? <Check className="size-4" aria-hidden="true" /> : null}
          {stations.length ? "그 외에도 괜찮아요" : "어디든 괜찮아요"}
        </button>
      </section>

      <section className="mt-7">
        <label htmlFor="note" className="text-sm font-semibold">
          덧붙일 말 (선택)
        </label>
        <Input
          id="note"
          className="mt-3"
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder="예) 주말엔 종로 쪽이 편해요"
        />
      </section>

      <Button
        className="mt-8 w-full"
        size="lg"
        disabled={!canSubmit || busy}
        onClick={async () => {
          if (!canSubmit || !meetingId) return;
          setBusy(true);
          try {
            const prefs: MeetPrefs = {
              dates: pickedKeys.map((k) => meetingIso(k, picked[k])),
              stations,
              anywhere,
              note: note.trim() || undefined,
            };
            await submitMeetingPrefs(meetingId, prefs);
            // S7: 여기서 대화가 열리지 않는다 — 세라가 전달하고, 상대가 확정해야 열린다.
            toast.success("전달했습니다. 상대가 날짜를 고르면 대화가 열려요.");
            navigate({ to: "/home" });
          } catch (err) {
            toast.error(err instanceof Error ? err.message : "전달에 실패했습니다.");
          } finally {
            setBusy(false);
          }
        }}
      >
        {busy ? "보내는 중…" : "세라에게 보내기"}
      </Button>
      <p className="mt-3 text-center text-xs text-muted-foreground">
        세라가 상대에게 그대로 전달합니다. 상대가 날짜와 장소를 정하면 대화가 열립니다.
      </p>
    </AppScreen>
  );
}
