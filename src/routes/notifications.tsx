import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";

import { AppScreen } from "@/components/app/AppScreen";
import { markNotificationsRead, myNotifications, type MyNotification } from "@/lib/api";
import { splitAppPath } from "@/lib/appPath";
import { BRAND } from "@/lib/brand";
import { cn } from "@/lib/utils";
import {
  notificationCopy,
  type NotificationKind,
} from "../../supabase/functions/_shared/notification-copy";

export const Route = createFileRoute("/notifications")({
  head: () => ({ meta: [{ title: `알림 — ${BRAND.name}` }] }),
  component: NotificationsPage,
});

function relative(iso: string) {
  const diff = (Date.now() - new Date(iso).getTime()) / 1000;
  if (diff < 60) return "방금";
  if (diff < 3600) return `${Math.floor(diff / 60)}분 전`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}시간 전`;
  if (diff < 86400 * 7) return `${Math.floor(diff / 86400)}일 전`;
  return new Date(iso).toLocaleDateString("ko-KR", { month: "long", day: "numeric" });
}

/**
 * 알림 목록(s55). 앱 푸시와 **같은 문구**를 쓴다(notification-copy.ts).
 * 화면을 열면 모두 읽음으로 바꾼다. 읽지 않은 줄은 열기 전 상태로 한 번 더 보여 준다.
 */
function NotificationsPage() {
  const [items, setItems] = useState<MyNotification[] | null>(null);

  useEffect(() => {
    myNotifications()
      .then((list) => {
        setItems(list);
        if (list.some((n) => !n.read_at)) void markNotificationsRead();
      })
      .catch(() => setItems([]));
  }, []);

  return (
    <AppScreen title="알림" back="/home">
      {items === null ? (
        <p className="mt-10 text-center text-sm text-muted-foreground">불러오는 중…</p>
      ) : items.length === 0 ? (
        <p className="mt-16 text-center text-sm leading-relaxed text-muted-foreground">
          아직 알림이 없어요.
          <br />
          소개가 도착하거나 약속이 움직이면 여기에 쌓여요.
        </p>
      ) : (
        <ul className="mt-2 divide-y divide-border">
          {items.map((n) => {
            const copy = notificationCopy(n.kind as NotificationKind, {
              counterpart: n.counterpart_name,
              meetingId: n.meeting_id,
            });
            const target = splitAppPath(copy.path);
            return (
              <li key={n.id}>
                <Link
                  to={target.to}
                  search={target.search}
                  className="flex gap-3 py-4 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
                >
                  <span
                    aria-hidden="true"
                    className={cn(
                      "mt-1.5 size-2 shrink-0 rounded-full",
                      n.read_at ? "bg-transparent" : "bg-primary-strong",
                    )}
                  />
                  <span className="min-w-0 flex-1">
                    <span className="flex items-baseline justify-between gap-3">
                      <span className="text-sm font-semibold text-foreground">{copy.title}</span>
                      <span className="shrink-0 text-xs text-muted-foreground">
                        {relative(n.created_at)}
                      </span>
                    </span>
                    <span className="mt-1 block text-sm leading-relaxed text-muted-foreground">
                      {copy.body}
                    </span>
                  </span>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </AppScreen>
  );
}
