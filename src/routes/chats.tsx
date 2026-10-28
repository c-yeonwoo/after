import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect } from "react";
import { ArrowUpRight, CalendarCheck } from "lucide-react";
import { AppScreen } from "@/components/app/AppScreen";
import { LiveRefreshNotice } from "@/components/app/LiveRefreshNotice";
import { Button } from "@/components/ui/button";
import { listMyActiveMeetings } from "@/lib/api";
import { useMe } from "@/lib/me";
import { useMemberLiveQuery } from "@/lib/useMemberLiveQuery";
import { formatMeetTime } from "@/lib/meet";

export const Route = createFileRoute("/chats")({
  head: () => ({ meta: [{ title: "만남 — 애프터" }] }),
  component: MeetingsPage,
});

/** One overview for requests, scheduling and confirmed conversations. */
function MeetingsPage() {
  const { me, ready } = useMe();
  const navigate = useNavigate();
  const live = useMemberLiveQuery(
    "member-meetings",
    me?.id,
    () => listMyActiveMeetings(false, me?.id),
    ready,
  );
  useEffect(() => {
    if (ready && !me) void navigate({ to: "/login" });
  }, [ready, me, navigate]);
  return (
    <AppScreen title="소개">
      <h1 className="text-lg font-semibold">함께할 약속</h1>
      <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
        만남 요청부터 날짜 조율, 확정된 대화까지.
      </p>
      {live.isError || live.isPaused ? (
        <LiveRefreshNotice retry={() => void live.refetch()} />
      ) : null}
      {live.isPending && !live.isPaused ? (
        <p role="status" className="py-8 text-sm text-muted-foreground">
          만남을 불러오는 중…
        </p>
      ) : null}
      {live.data?.length === 0 ? (
        <div className="py-10">
          <p className="font-semibold">아직 진행 중인 만남이 없어요.</p>
          <p className="mt-2 text-sm text-muted-foreground">
            마음이 가는 소개부터 천천히 살펴보세요.
          </p>
          <Button asChild variant="outline" className="mt-5">
            <Link to="/intro">새 소개 보기</Link>
          </Button>
        </div>
      ) : null}
      <ul className="mt-5 space-y-4">
        {live.data?.map(({ meeting, counterpart }) => (
          <li key={meeting.id} className="rounded-surface border border-border bg-card p-4">
            <div className="flex items-center justify-between gap-3">
              <h2 className="text-lg font-semibold">
                {counterpart.name ?? "상대"}
                <span className="ml-2 text-sm font-normal text-muted-foreground">
                  {counterpart.age}
                </span>
              </h2>
              <span className="rounded-full bg-muted px-2.5 py-1 text-xs font-medium">
                {meeting.completed_at
                  ? "지난 만남"
                  : meeting.confirmed_at
                    ? "약속 확정"
                    : meeting.prefs_submitted_at
                      ? "날짜 조율"
                      : "만남 요청"}
              </span>
            </div>
            <p className="mt-1 text-xs text-muted-foreground">{counterpart.job}</p>
            {meeting.confirmed_at ? (
              <>
                {meeting.scheduled_at ? (
                  <p className="mt-4 flex items-center gap-2 text-sm">
                    <CalendarCheck className="size-4 shrink-0" aria-hidden="true" />
                    {formatMeetTime(meeting.scheduled_at)}
                  </p>
                ) : null}
                <Link
                  to="/chat/$id"
                  params={{ id: meeting.id }}
                  className="mt-3 flex min-h-11 items-center justify-between text-sm font-semibold text-primary-strong"
                >
                  약속·상대와 대화
                  <ArrowUpRight className="size-4" aria-hidden="true" />
                </Link>
              </>
            ) : !meeting.prefs_submitted_at && me?.gender === "female" ? (
              <Link
                to="/requests"
                className="mt-3 flex min-h-11 items-center justify-between text-sm font-semibold text-primary-strong"
              >
                요청 확인·답하기
                <ArrowUpRight className="size-4" aria-hidden="true" />
              </Link>
            ) : meeting.prefs_submitted_at && me?.gender === "male" ? (
              <Link
                to="/schedule"
                search={{ meetingId: meeting.id }}
                className="mt-3 flex min-h-11 items-center justify-between text-sm font-semibold text-primary-strong"
              >
                날짜 고르기
                <ArrowUpRight className="size-4" aria-hidden="true" />
              </Link>
            ) : (
              <p className="mt-4 text-sm leading-relaxed text-muted-foreground">
                {meeting.prefs_submitted_at
                  ? "가능한 날짜를 전했어요. 상대의 선택을 기다리고 있어요."
                  : "만남을 요청했어요. 상대의 답변을 기다리고 있어요."}
              </p>
            )}
          </li>
        ))}
      </ul>
    </AppScreen>
  );
}
