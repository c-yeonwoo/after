import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { ArrowRight, Clock, MapPin } from "lucide-react";
import { toast } from "sonner";

import { AppScreen } from "@/components/app/AppScreen";
import { MeetingPolicyNote } from "@/components/app/MeetingPolicyNote";
import { DeclineRequest } from "@/components/app/DeclineRequest";
import { GuideNote } from "@/components/app/GuideNote";
import { LiveRefreshNotice } from "@/components/app/LiveRefreshNotice";
import { IntroductionReason } from "@/components/app/IntroductionReason";
import { Button } from "@/components/ui/button";
import { BRAND } from "@/lib/brand";
import { acceptMeetingSlot, listMeetingsAwaitingMyPrefs, type Meeting } from "@/lib/api";
import { formatMeetTime } from "@/lib/meet";
import { useMe } from "@/lib/me";
import { useMemberLiveQuery } from "@/lib/useMemberLiveQuery";

export const Route = createFileRoute("/requests")({
  head: () => ({
    meta: [
      { title: `만남 요청 — ${BRAND.name}` },
      { name: "description", content: "만남 티켓을 사용한 분들의 요청을 확인하고 답합니다." },
    ],
  }),
  component: RequestsPage,
});

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
  const { me, ready } = useMe();
  const live = useMemberLiveQuery(
    "member-requests",
    me?.id,
    () => listMeetingsAwaitingMyPrefs(me?.id),
    ready,
  );
  const requests = live.data ?? [];
  const loading = live.isPending && !live.isPaused;
  const loadError = (live.isError || live.isPaused) && !live.data;
  const [now, setNow] = useState<number | null>(null);
  const serverClockOffset = useRef(0);

  useEffect(() => {
    setNow(Date.now() + serverClockOffset.current);
    const t = window.setInterval(() => setNow(Date.now() + serverClockOffset.current), 60_000);
    return () => window.clearInterval(t);
  }, []);

  const asOf = live.data?.[0]?.server_as_of;
  useEffect(() => {
    const serverTime = asOf ? Date.parse(asOf) : NaN;
    if (Number.isFinite(serverTime)) {
      serverClockOffset.current = serverTime - Date.now();
      setNow(Date.now() + serverClockOffset.current);
    }
  }, [asOf]);
  const refreshNotice =
    (live.isError || live.isPaused) && live.data ? (
      <LiveRefreshNotice retry={() => void live.refetch()} />
    ) : null;

  if (loading) {
    return (
      <AppScreen title="만남 요청" back="/home">
        <p className="mt-16 text-center text-sm text-muted-foreground">불러오는 중입니다…</p>
      </AppScreen>
    );
  }

  if (loadError) {
    return (
      <AppScreen title="만남 요청" back="/home">
        <div role="alert" className="app-elevated mt-10 rounded-surface bg-card p-6">
          <p className="text-sm">요청 목록을 확인할 수 없습니다.</p>
          <Button className="mt-4" variant="outline" onClick={() => void live.refetch()}>
            다시 확인
          </Button>
        </div>
      </AppScreen>
    );
  }

  if (requests.length === 0) {
    return (
      <AppScreen title="만남 요청" back="/home">
        {refreshNotice}
        <div className="mt-16 px-6 py-12 text-center">
          <p className="headline text-base">아직 받은 요청이 없습니다</p>
          <p className="mt-2 text-xs leading-relaxed text-muted-foreground">
            만남 요청이 오면 여기에서 확인할 수 있어요.
          </p>
        </div>
      </AppScreen>
    );
  }

  return (
    <AppScreen title="만남 요청" back="/home">
      {refreshNotice}
      <div className="mt-3">
        <GuideNote>
          {requests.length > 1
            ? `만남 요청이 ${requests.length}건 도착했어요. 각각 답하실 수 있습니다.`
            : "만남 요청이 도착했어요. 가능한 날짜를 알려주세요."}
        </GuideNote>
      </div>

      <ul className="mt-6 space-y-3">
        {requests.map(({ meeting, candidate, deadline_at, reason }) => {
          const left =
            now === null || !deadline_at ? null : remainingLabel(Date.parse(deadline_at), now);
          return (
            <li key={meeting.id}>
              <div className="app-elevated overflow-hidden rounded-surface bg-card">
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
                  {reason ? (
                    <div className="mt-4">
                      <IntroductionReason reason={reason} embedded />
                    </div>
                  ) : null}
                  <p className="mt-3 flex items-center gap-1.5 text-xs text-muted-foreground">
                    <Clock className="size-3.5" aria-hidden="true" />
                    {!deadline_at ? (
                      "답변 기한을 확인할 수 없습니다"
                    ) : left ? (
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
                    onInteractionStart={live.beginInteraction}
                    onDone={() =>
                      live.update((list) => list.filter((r) => r.meeting.id !== meeting.id))
                    }
                  />
                </div>
                {meeting.proposed_slots?.length ? (
                  <SlotChoices meeting={meeting} onInteractionStart={live.beginInteraction} />
                ) : (
                  <Link
                    to="/prefs"
                    search={{ meetingId: meeting.id }}
                    className="pressable flex min-h-14 items-center justify-center gap-2 bg-primary text-sm font-semibold text-primary-foreground hover:bg-primary-hover focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
                  >
                    가능한 날짜 보내기
                    <ArrowRight className="size-4" aria-hidden="true" />
                  </Link>
                )}
                <Link
                  to="/support"
                  search={{ meetingId: meeting.id }}
                  className="flex min-h-11 items-center justify-center border-t border-border text-xs text-muted-foreground underline underline-offset-4"
                >
                  일정 조율 도움받기
                </Link>
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
function SlotChoices({
  meeting,
  onInteractionStart,
}: {
  meeting: Meeting;
  onInteractionStart: () => () => void;
}) {
  const navigate = useNavigate();
  const [busy, setBusy] = useState<number | null>(null);
  const busyRef = useRef(false);
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
        <MeetingPolicyNote />
        {slots.map((iso, i) => (
          <button
            key={iso}
            type="button"
            disabled={busy !== null}
            onClick={async () => {
              if (busyRef.current) return;
              busyRef.current = true;
              const release = onInteractionStart();
              setBusy(i);
              try {
                await acceptMeetingSlot(meeting.id, i);
                toast.success("약속이 정해졌어요. 대화가 열렸습니다.");
                navigate({ to: "/home" });
              } catch {
                toast.error("이 시간으로 정하지 못했습니다. 다시 시도해 주세요.");
                setBusy(null);
                busyRef.current = false;
              } finally {
                release();
              }
            }}
            className="pressable flex min-h-12 items-center justify-between gap-3 rounded-control border border-border bg-card px-4 py-3 text-left text-sm font-semibold text-foreground hover:border-primary focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none disabled:opacity-60"
          >
            <span>{formatMeetTime(iso)}</span>
            <span className="shrink-0 text-xs font-medium text-primary-strong">
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
