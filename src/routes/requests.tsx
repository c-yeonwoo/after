import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { ArrowRight, Clock, MapPin } from "lucide-react";
import { toast } from "sonner";

import { AppScreen } from "@/components/app/AppScreen";
import { DeclineRequest } from "@/components/app/DeclineRequest";
import { GuideNote } from "@/components/app/GuideNote";
import { BRAND } from "@/lib/brand";
import {
  acceptMeetingSlot,
  listMeetingsAwaitingMyPrefs,
  type Meeting,
  type MeetingRequest,
} from "@/lib/api";
import { formatMeetTime } from "@/lib/meet";

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
                {/*
                  거절을 카드 안에 둔다. 예전에는 답하는 길만 있고 거절하는
                  길이 없어서, 거절하려면 24시간 방치하는 수밖에 없었다.
                  그동안 상대의 티켓도 함께 묶인다.
                */}
                <div className="border-t border-border px-5 pb-1">
                  <DeclineRequest
                    meetingId={meeting.id}
                    candidateName={candidate.name}
                    onDone={() =>
                      setRequests((list) => list.filter((r) => r.meeting.id !== meeting.id))
                    }
                  />
                </div>
                {meeting.proposed_slots?.length ? (
                  <SlotChoices meeting={meeting} />
                ) : (
                  <Link
                    to="/prefs"
                    search={{ meetingId: meeting.id }}
                    className="flex min-h-14 items-center justify-center gap-2 bg-primary text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary/90 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
                  >
                    가능한 날짜 보내기
                    <ArrowRight className="size-4" aria-hidden="true" />
                  </Link>
                )}
              </div>
            </li>
          );
        })}
      </ul>
    </AppScreen>
  );
}

/**
 * 남성이 보낸 평일 저녁 후보(s51). 하나를 누르면 그 자리에서 약속이 확정된다 — 날짜를
 * 다시 보내고 상대가 고르기를 기다리던 왕복이 없다. 결정은 마지막까지 그녀의 몫이다:
 * 맞는 날이 없으면 다른 날을 제안하고, 원치 않으면 위에서 거절한다.
 */
function SlotChoices({ meeting }: { meeting: Meeting }) {
  const navigate = useNavigate();
  const [busy, setBusy] = useState<number | null>(null);
  const slots = meeting.proposed_slots ?? [];

  return (
    <div className="border-t border-border px-5 pt-4 pb-5">
      {meeting.proposed_place_name ? (
        <p className="flex items-start gap-1.5 text-sm text-foreground">
          <MapPin className="mt-0.5 size-4 shrink-0 text-primary-strong" aria-hidden="true" />
          <span>{meeting.proposed_place_name}</span>
        </p>
      ) : null}
      <p className="mt-3 text-xs font-medium text-muted-foreground">
        편한 시간을 하나 고르시면 바로 약속이 정해져요
      </p>
      <div className="mt-2 grid gap-2">
        {slots.map((iso, i) => (
          <button
            key={iso}
            type="button"
            disabled={busy !== null}
            onClick={async () => {
              setBusy(i);
              try {
                await acceptMeetingSlot(meeting.id, i);
                toast.success("약속이 정해졌어요. 대화가 열렸습니다.");
                navigate({ to: "/home" });
              } catch {
                toast.error("이 시간으로 정하지 못했습니다. 다시 시도해 주세요.");
                setBusy(null);
              }
            }}
            className="flex min-h-12 items-center justify-between gap-3 rounded-control border border-border bg-card px-4 text-sm font-semibold text-foreground transition-colors hover:border-primary focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none disabled:opacity-60"
          >
            <span>{formatMeetTime(iso)}</span>
            <span className="text-xs font-medium text-primary-strong">
              {busy === i ? "정하는 중…" : "이 날로 정하기"}
            </span>
          </button>
        ))}
      </div>
      <Link
        to="/prefs"
        search={{ meetingId: meeting.id }}
        className="mt-3 inline-flex min-h-11 items-center text-sm text-muted-foreground underline underline-offset-4"
      >
        다른 날이 좋아요
      </Link>
    </div>
  );
}
