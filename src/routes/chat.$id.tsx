import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";

import { AppScreen } from "@/components/app/AppScreen";
import { Conversation } from "@/components/app/Conversation";
import { SafetyMenu } from "@/components/app/SafetyMenu";
import { Button } from "@/components/ui/button";
import { useMe } from "@/lib/me";
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

function ChatRoom() {
  const { id } = Route.useParams();
  const { me } = useMe();
  return <MeetingRoom key={`${me?.id ?? ""}:${id}`} meetingId={id} />;
}

function MeetingRoom({ meetingId }: { meetingId: string }) {
  const navigate = useNavigate();

  const [failed, setFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const [loading, setLoading] = useState(true);
  const [meeting, setMeeting] = useState<Meeting | null>(null);
  const [counterpart, setCounterpart] = useState<PublicProfile | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setFailed(false);
    void (async () => {
      const m = await getMeeting(meetingId);
      if (cancelled) return;
      setMeeting(m);
      if (m) {
        const c = await getMeetingCounterpart(m);
        if (!cancelled) setCounterpart(c);
      }
    })()
      .catch(() => {
        if (!cancelled) setFailed(true);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [meetingId, attempt]);

  if (loading) {
    return (
      <AppScreen title="대화" hideTabs back="/chats">
        <p className="mt-16 text-center text-sm text-muted-foreground">불러오는 중입니다…</p>
      </AppScreen>
    );
  }

  if (failed) {
    return (
      <AppScreen title="대화" hideTabs back="/chats">
        <p role="alert" className="mt-12 text-center text-sm">
          대화를 불러오지 못했어요.
        </p>
        <Button
          variant="outline"
          className="mx-auto mt-3 flex"
          onClick={() => setAttempt((v) => v + 1)}
        >
          다시 확인하기
        </Button>
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
    <AppScreen
      title={counterpart?.name ?? "대화"}
      hideTabs
      back="/chats"
      fill
      /*
        신고·차단은 대화 안에 있어야 한다 — 불쾌한 일이 벌어지는 자리가 여기이고,
        설정 화면까지 찾아 들어가게 하면 그 순간에 쓸 수 없다.
      */
      action={
        counterpart?.id ? (
          <SafetyMenu
            targetId={counterpart.id}
            targetName={counterpart.name ?? "상대"}
            kind="profile"
            onDone={() => navigate({ to: "/chats" })}
          />
        ) : null
      }
    >
      <Conversation
        counterpartName={counterpart?.name || "상대"}
        meeting={meeting}
        onMeetingChange={setMeeting}
      />
    </AppScreen>
  );
}
