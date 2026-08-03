import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";

import { AppScreen } from "@/components/app/AppScreen";
import { Conversation } from "@/components/app/Conversation";
import { BRAND } from "@/lib/brand";
import { getMeeting, getMeetingCounterpart, type Meeting, type PublicProfile } from "@/lib/api";

export const Route = createFileRoute("/chat/$id")({
  head: () => ({
    meta: [
      { title: `대화 — ${BRAND.name}` },
      { name: "description", content: "약속을 잡는 데 필요한 만큼의 대화." },
    ],
  }),
  component: ChatRoom,
});

/**
 * 특정 만남의 대화로 직접 들어오는 경로(딥링크·알림용).
 * 평소 진입은 `/chats` 탭이며, 본문은 같은 <Conversation> 을 공유한다.
 */
function ChatRoom() {
  // 라우트 파라미터는 상대 프로필 id 가 아니라 meeting id 다.
  const { id: meetingId } = Route.useParams();

  const [loading, setLoading] = useState(true);
  const [meeting, setMeeting] = useState<Meeting | null>(null);
  const [counterpart, setCounterpart] = useState<PublicProfile | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
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
      <AppScreen title="대화" hideTabs back="/chats">
        <p className="mt-16 text-center text-sm text-muted-foreground">불러오는 중입니다…</p>
      </AppScreen>
    );
  }

  if (!meeting) {
    return (
      <AppScreen title="대화" hideTabs back="/chats">
        <p className="mt-16 text-center text-sm text-muted-foreground">대화를 찾을 수 없습니다.</p>
      </AppScreen>
    );
  }

  return (
    <AppScreen title={counterpart?.name ?? "대화"} hideTabs back="/chats" fill>
      <Conversation meeting={meeting} onMeetingChange={setMeeting} />
    </AppScreen>
  );
}
