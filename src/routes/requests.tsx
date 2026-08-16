import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { ArrowRight, Clock } from "lucide-react";

import { AppScreen } from "@/components/app/AppScreen";
import { GuideNote } from "@/components/app/GuideNote";
import { BRAND } from "@/lib/brand";
import { listMeetingsAwaitingMyPrefs, type MeetingRequest } from "@/lib/api";

export const Route = createFileRoute("/requests")({
  head: () => ({
    meta: [
      { title: `만남 요청 — ${BRAND.name}` },
      { name: "description", content: "만남 티켓을 사용한 분들의 요청을 확인하고 답합니다." },
    ],
  }),
  component: RequestsPage,
});

/** 티켓 사용 시점 + 24시간 = 자동 환불 기한(P3). */
function deadlineOf(createdAt: string) {
  return new Date(new Date(createdAt).getTime() + 24 * 3_600_000).getTime();
}

function remainingLabel(deadline: number, now: number) {
  const left = deadline - now;
  if (left <= 0) return null;
  const h = Math.floor(left / 3_600_000);
  const m = Math.floor((left % 3_600_000) / 60_000);
  return h > 0 ? `${h}시간 ${m}분` : `${m}분`;
}

/**
 * 만남 요청 목록 (여성 전용).
 *
 * 여러 남성이 동시에 티켓을 쓸 수 있으므로 N건이 될 수 있다.
 * 각 요청은 **독립적으로** 답한다 — 하나를 답한다고 나머지가 사라지지 않는다.
 */
function RequestsPage() {
  const [loading, setLoading] = useState(true);
  const [requests, setRequests] = useState<MeetingRequest[]>([]);
  const [now, setNow] = useState<number | null>(null);

  useEffect(() => {
    setNow(Date.now());
    const t = window.setInterval(() => setNow(Date.now()), 60_000);
    return () => window.clearInterval(t);
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const list = await listMeetingsAwaitingMyPrefs();
      if (!cancelled) {
        setRequests(list);
        setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  if (loading) {
    return (
      <AppScreen title="만남 요청" back="/home">
        <p className="mt-16 text-center text-sm text-muted-foreground">불러오는 중입니다…</p>
      </AppScreen>
    );
  }

  if (requests.length === 0) {
    return (
      <AppScreen title="만남 요청" back="/home">
        <div className="mt-16 rounded-surface border-2 border-dashed border-foreground/20 px-6 py-12 text-center">
          <p className="headline text-base">아직 받은 요청이 없습니다</p>
          <p className="mt-2 text-xs leading-relaxed text-muted-foreground">
            좋아요를 보낸 분이 만남 티켓을 사용하면 여기에 도착합니다.
          </p>
        </div>
      </AppScreen>
    );
  }

  return (
    <AppScreen title="만남 요청" back="/home">
      <div className="mt-3">
        <GuideNote>
          {`만나고 싶다는 요청이 ${requests.length}건 도착했어요. 각각 따로 답하실 수 있습니다.`}
        </GuideNote>
      </div>

      <ul className="mt-6 space-y-3">
        {requests.map(({ meeting, candidate }) => {
          const left = now === null ? null : remainingLabel(deadlineOf(meeting.created_at), now);
          return (
            <li key={meeting.id}>
              <div className="overflow-hidden rounded-surface border border-border bg-card shadow-card">
                <div className="px-5 pt-5 pb-4">
                  <p className="headline text-xl">
                    {candidate.name}
                    {candidate.age !== null ? (
                      <span className="ml-1.5 text-base text-muted-foreground">
                        {candidate.age}
                      </span>
                    ) : null}
                  </p>
                  <p className="mt-1 text-xs text-muted-foreground">{candidate.job}</p>
                  {candidate.headline ? (
                    <p className="mt-3 line-clamp-2 text-sm leading-snug text-foreground/90">
                      “{candidate.headline}”
                    </p>
                  ) : null}
                  <p className="mt-3 flex items-center gap-1.5 text-xs text-muted-foreground">
                    <Clock className="size-3.5" aria-hidden="true" />
                    {left ? (
                      <>
                        <span className="font-semibold text-foreground">{left}</span> 안에 답해
                        주세요
                      </>
                    ) : (
                      "곧 만료됩니다"
                    )}
                  </p>
                </div>
                <Link
                  to="/prefs"
                  search={{ meetingId: meeting.id }}
                  className="flex min-h-14 items-center justify-center gap-2 bg-primary text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary/90 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
                >
                  가능한 날짜 보내기
                  <ArrowRight className="size-4" aria-hidden="true" />
                </Link>
              </div>
            </li>
          );
        })}
      </ul>
    </AppScreen>
  );
}
