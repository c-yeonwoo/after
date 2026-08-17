import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { toast } from "sonner";

import { AppScreen } from "@/components/app/AppScreen";
import { GuideNote } from "@/components/app/GuideNote";
import { MeetPlanner } from "@/components/app/MeetPlanner";
import { BRAND } from "@/lib/brand";
import { getMeeting, getMeetingCounterpart, type Meeting, type PublicProfile } from "@/lib/api";
import { haptics } from "@/lib/native";

export const Route = createFileRoute("/schedule")({
  validateSearch: (search: Record<string, unknown>): { meetingId?: string } => ({
    meetingId: typeof search.meetingId === "string" ? search.meetingId : undefined,
  }),
  head: () => ({
    meta: [
      { title: `날짜 정하기 — ${BRAND.name}` },
      { name: "description", content: "상대가 보내온 가능한 날짜 중에서 하나를 고릅니다." },
    ],
  }),
  component: SchedulePage,
});

/**
 * 남성이 상대가 보낸 날짜·지역을 보고 **확정**하는 화면.
 *
 * 예전에는 이 단계를 대화방 안에서 했다. 그런데 S7 이후 대화는 확정된 뒤에야
 * 열리므로(세라가 그 전까지 중개한다) 확정 화면이 대화 바깥에 있어야 한다.
 */
function SchedulePage() {
  const navigate = useNavigate();
  const { meetingId } = Route.useSearch();
  const [loading, setLoading] = useState(true);
  const [meeting, setMeeting] = useState<Meeting | null>(null);
  const [counterpart, setCounterpart] = useState<PublicProfile | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!meetingId) {
        setLoading(false);
        return;
      }
      const m = await getMeeting(meetingId);
      if (cancelled) return;
      setMeeting(m);
      if (m) {
        const c = await getMeetingCounterpart(m);
        if (!cancelled) setCounterpart(c);
      }
      if (!cancelled) setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [meetingId]);

  if (loading) {
    return (
      <AppScreen title="날짜 정하기" hideTabs back="/home">
        <p className="mt-16 text-center text-sm text-muted-foreground">불러오는 중입니다…</p>
      </AppScreen>
    );
  }

  if (!meeting || !meeting.prefs_submitted_at) {
    return (
      <AppScreen title="날짜 정하기" hideTabs back="/home">
        <div className="mt-16 rounded-surface border-2 border-dashed border-foreground/20 px-6 py-12 text-center">
          <p className="headline text-base">아직 정할 날짜가 없습니다</p>
          <p className="mt-2 text-xs leading-relaxed text-muted-foreground">
            상대가 가능한 날짜를 보내오면 여기서 고르실 수 있습니다.
          </p>
        </div>
      </AppScreen>
    );
  }

  return (
    <AppScreen title="날짜 정하기" hideTabs back="/home">
      <div className="mt-3">
        <GuideNote>
          {counterpart?.name
            ? `${counterpart.name}님이 가능한 날짜를 보내주셨어요. 하나를 고르시면 대화가 열립니다.`
            : "가능한 날짜가 도착했어요. 하나를 고르시면 대화가 열립니다."}
        </GuideNote>
      </div>

      {counterpart ? (
        <div className="mt-5 rounded-surface border border-border bg-card px-5 py-4">
          <p className="headline text-xl">
            {counterpart.name}
            {counterpart.age !== null ? (
              <span className="ml-1.5 text-base text-muted-foreground">{counterpart.age}</span>
            ) : null}
          </p>
          <p className="mt-1 text-xs text-muted-foreground">{counterpart.job}</p>
        </div>
      ) : null}

      <div className="mt-5">
        <MeetPlanner
          meeting={meeting}
          onConfirmed={(m) => {
            setMeeting(m);
            haptics.success();
            toast.success("만남이 확정되었습니다. 대화가 열렸어요.");
            navigate({ to: "/chats" });
          }}
        />
      </div>
    </AppScreen>
  );
}
