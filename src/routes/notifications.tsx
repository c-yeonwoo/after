import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Bell, ChevronRight, Settings } from "lucide-react";

import { AppScreen } from "@/components/app/AppScreen";
import { Button } from "@/components/ui/button";
import { markNotificationsRead, myNotifications, type MyNotification } from "@/lib/api";
import { splitAppPath } from "@/lib/appPath";
import { BRAND } from "@/lib/brand";
import { cn } from "@/lib/utils";
import {
  notificationCopy,
  type NotificationKind,
} from "../../supabase/functions/_shared/notification-copy";

export const Route = createFileRoute("/notifications")({
  validateSearch: (search: Record<string, unknown>): { from?: "home" | "me" } => ({
    from: search.from === "me" ? "me" : undefined,
  }),
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
  const { from } = Route.useSearch();
  const [items, setItems] = useState<MyNotification[] | null>(null);
  const [error, setError] = useState(false);
  const [retry, setRetry] = useState(0);

  useEffect(() => {
    let alive = true;
    let sequence = 0;
    const load = () => {
      const request = ++sequence;
      setError(false);
      void myNotifications()
        .then((list) => {
          if (!alive || request !== sequence) return;
          setItems(list);
          if (list.some((n) => !n.read_at))
            void markNotificationsRead(list.filter((n) => !n.read_at).map((n) => n.id)).catch(
              () => {
                // Keep the server's unread state if acknowledgement fails.
              },
            );
        })
        .catch(() => {
          if (alive && request === sequence) setError(true);
        });
    };
    const onVisible = () => {
      if (document.visibilityState === "visible") load();
    };
    load();
    window.addEventListener("focus", onVisible);
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      alive = false;
      window.removeEventListener("focus", onVisible);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [retry]);

  return (
    <AppScreen
      title="알림"
      back={from === "me" ? "/me" : "/home"}
      action={
        <Link
          to="/settings"
          aria-label="알림 설정"
          className="pressable -mr-2 flex size-11 items-center justify-center rounded-full text-foreground hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
        >
          <Settings className="size-5" aria-hidden="true" />
        </Link>
      }
    >
      {error ? (
        <div
          role="alert"
          className="app-elevated mt-3 rounded-surface bg-card px-5 py-8 text-center"
        >
          <p className="text-sm text-muted-foreground">알림을 불러오지 못했어요.</p>
          <Button variant="outline" className="mt-3" onClick={() => setRetry((v) => v + 1)}>
            다시 불러오기
          </Button>
        </div>
      ) : items === null ? (
        <p role="status" className="mt-10 text-center text-sm text-muted-foreground">
          불러오는 중…
        </p>
      ) : items.length === 0 ? (
        <div className="app-elevated mt-3 rounded-surface bg-card px-6 py-10 text-center">
          <Bell
            className="mx-auto size-7 text-primary-strong"
            strokeWidth={1.5}
            aria-hidden="true"
          />
          <h2 className="mt-4 text-base font-semibold">아직 알림이 없어요</h2>
          <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
            소개가 도착하거나 약속이 움직이면
            <br />
            여기에서 알려드릴게요.
          </p>
        </div>
      ) : (
        <ul className="app-elevated mt-3 divide-y divide-border/60 overflow-hidden rounded-surface bg-card">
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
                  className="pressable flex items-start gap-3 px-4 py-5 hover:bg-muted/40 focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring focus-visible:outline-none"
                >
                  <span
                    aria-hidden="true"
                    className={cn(
                      "mt-2 size-1.5 shrink-0 rounded-full",
                      n.read_at ? "bg-transparent" : "bg-primary-strong",
                    )}
                  />
                  <span className="min-w-0 flex-1">
                    {!n.read_at ? <span className="sr-only">읽기 전 알림. </span> : null}
                    <span className="block text-sm font-semibold text-foreground">
                      {copy.title}
                    </span>
                    <span className="mt-1 block text-sm leading-relaxed text-muted-foreground">
                      {copy.body}
                    </span>
                    <time
                      dateTime={n.created_at}
                      className="mt-2 block text-xs text-muted-foreground"
                    >
                      {relative(n.created_at)}
                    </time>
                  </span>
                  <ChevronRight
                    className="mt-0.5 size-4 shrink-0 text-muted-foreground"
                    aria-hidden="true"
                  />
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </AppScreen>
  );
}
