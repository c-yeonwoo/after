import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { toast } from "sonner";

import { AppScreen } from "@/components/app/AppScreen";
import { MeetPlanner } from "@/components/app/MeetPlanner";
import { GuideNote } from "@/components/app/GuideNote";
import { Button } from "@/components/ui/button";
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
 * 열리므로(자동 안내가 그 전까지 중개한다) 확정 화면이 대화 바깥에 있어야 한다.
 */
function SchedulePage() {
  const navigate = useNavigate();
  const { meetingId } = Route.useSearch();
  const [loading, setLoading] = useState(true);
  const [meeting, setMeeting] = useState<Meeting | null>(null);
  const [counterpart, setCounterpart] = useState<PublicProfile | null>(null);
  const [error, setError] = useState(false);
  const [retry, setRetry] = useState(0);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(false);
    setMeeting(null);
    setCounterpart(null);
    (async () => {
      try {
        if (!meetingId) return;
        const m = await getMeeting(meetingId);
        if (cancelled) return;
        if (m) {
          const c = await getMeetingCounterpart(m);
          if (!cancelled) setCounterpart(c);
        }
        if (!cancelled) setMeeting(m);
      } catch {
        if (!cancelled) setError(true);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [meetingId, retry]);

  if (loading) {
    return (
      <AppScreen title="날짜 정하기" hideTabs back="/home">
        <p className="mt-16 text-center text-sm text-muted-foreground">불러오는 중입니다…</p>
      </AppScreen>
    );
  }

  if (error) {
    return (
      <AppScreen title="날짜 정하기" hideTabs back="/home">
        <div role="alert" className="mt-8 space-y-4">
          <p className="text-sm">약속 정보를 불러오지 못했어요. 다시 확인해 주세요.</p>
          <Button variant="outline" onClick={() => setRetry((v) => v + 1)}>
            다시 확인
          </Button>
        </div>
      </AppScreen>
    );
  }

  if (!meeting || !meeting.prefs_submitted_at || meeting.cancelled_at || meeting.completed_at) {
    return (
      <AppScreen title="날짜 정하기" hideTabs back="/home">
        <div className="mt-16 px-6 py-12 text-center">
          <p className="headline text-base">
            {meeting?.cancelled_at || meeting?.completed_at
              ? "종료된 약속이에요"
              : "아직 정할 날짜가 없습니다"}
          </p>
          <p className="mt-2 text-xs leading-relaxed text-muted-foreground">
            {meeting?.cancelled_at || meeting?.completed_at
              ? "홈에서 현재 진행 상황을 확인해 주세요."
              : "상대가 가능한 날짜를 보내오면 여기서 고르실 수 있습니다."}
          </p>
        </div>
      </AppScreen>
    );
  }

  return (
    <AppScreen title="날짜 정하기" hideTabs back="/home">
      <div className="mt-3">
        <GuideNote assistant>
          서로 가능한 날짜를 받았어요. 시간과 장소를 확인하고 약속을 정해 주세요.
        </GuideNote>
      </div>
      <div className="mt-5">
        <MeetPlanner
          key={meeting.id}
          meeting={meeting}
          counterpartName={counterpart?.name}
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
