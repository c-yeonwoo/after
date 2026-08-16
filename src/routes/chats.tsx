import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { ArrowRight, CalendarCheck } from "lucide-react";

import { AppScreen } from "@/components/app/AppScreen";
import { Conversation } from "@/components/app/Conversation";
import { SafetyMenu } from "@/components/app/SafetyMenu";
import { BRAND } from "@/lib/brand";
import { listMyActiveMeetings, type ActiveMeeting } from "@/lib/api";

export const Route = createFileRoute("/chats")({
  head: () => ({
    meta: [
      { title: `대화 — ${BRAND.name}` },
      {
        name: "description",
        content: "약속을 잡는 데 필요한 만큼의 대화. 양쪽이 좋다고 했을 때만 열립니다.",
      },
      { property: "og:title", content: `대화 — ${BRAND.name}` },
      { property: "og:description", content: "양쪽이 좋다고 했을 때만 열리는 1:1 대화." },
    ],
  }),
  component: ChatsPage,
});

/**
 * 대화 탭.
 *
 * 남성은 불변식 2 때문에 항상 0~1건이라 탭이 곧 대화다.
 * 여성은 여러 남성에게 동시에 요청을 받을 수 있어 N건이 될 수 있으므로,
 * 2건 이상일 때만 목록을 보여준다 — 1건인데 목록을 거치게 하면
 * 의미 없는 탭이 한 번 더 생긴다.
 */
function ChatsPage() {
  const [loading, setLoading] = useState(true);
  const [items, setItems] = useState<ActiveMeeting[]>([]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const list = await listMyActiveMeetings();
      if (!cancelled) {
        setItems(list);
        setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  if (loading) {
    return (
      <AppScreen title="대화">
        <p className="mt-16 text-center text-sm text-muted-foreground">불러오는 중입니다…</p>
      </AppScreen>
    );
  }

  if (items.length === 0) {
    return (
      <AppScreen title="대화">
        <div className="mt-16 rounded-surface border-2 border-dashed border-foreground/20 px-6 py-12 text-center">
          <p className="headline text-base">아직 열린 대화가 없습니다</p>
          <p className="mt-2 text-xs leading-relaxed text-muted-foreground">
            가능한 날짜를 주고받으면 이곳에서 대화가 열립니다.
          </p>
        </div>
      </AppScreen>
    );
  }

  if (items.length === 1) {
    const { meeting, counterpart } = items[0];
    const title = `${counterpart.name ?? "대화"}${
      counterpart.age !== null ? ` ${counterpart.age}` : ""
    }`;
    return (
      <AppScreen
        title={title}
        fill
        action={
          <SafetyMenu
            targetId={counterpart.id!}
            targetName={counterpart.name ?? "상대"}
            kind="profile"
            onDone={() => setItems([])}
          />
        }
      >
        <Conversation
          meeting={meeting}
          onMeetingChange={(m) => setItems([{ meeting: m, counterpart }])}
        />
      </AppScreen>
    );
  }

  return (
    <AppScreen title="대화">
      <p className="mt-2 text-sm text-muted-foreground">진행 중인 대화 {items.length}개</p>
      <ul className="mt-4 space-y-3">
        {items.map(({ meeting, counterpart }) => (
          <li key={meeting.id}>
            <Link
              to="/chat/$id"
              params={{ id: meeting.id }}
              className="block rounded-surface border border-border bg-card px-5 py-4 transition-colors hover:bg-muted/40 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
            >
              <div className="flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <p className="headline truncate text-lg">
                    {counterpart.name}
                    {counterpart.age !== null ? (
                      <span className="ml-1.5 text-sm text-muted-foreground">
                        {counterpart.age}
                      </span>
                    ) : null}
                  </p>
                  <p className="mt-0.5 truncate text-xs text-muted-foreground">{counterpart.job}</p>
                  {meeting.confirmed_at ? (
                    <p className="mt-2 flex items-center gap-1.5 text-xs font-medium text-primary-strong">
                      <CalendarCheck className="size-3.5" aria-hidden="true" />
                      만남 확정
                    </p>
                  ) : (
                    <p className="mt-2 text-xs text-muted-foreground">날짜·장소 정하는 중</p>
                  )}
                </div>
                <ArrowRight className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
              </div>
            </Link>
          </li>
        ))}
      </ul>
    </AppScreen>
  );
}
