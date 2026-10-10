import { Link } from "@tanstack/react-router";
import { Bell } from "lucide-react";
import { useEffect, useState } from "react";

import { unreadNotificationCount } from "@/lib/api";

/**
 * 상단 종 아이콘(s55). 웹에는 푸시가 없으므로 알림은 여기로만 보인다.
 *
 * 1분마다, 그리고 탭으로 돌아올 때 센다. 실시간 구독은 두지 않는다 — 소개와 약속은
 * 분 단위로 다투는 일이 아니고, 구독은 화면마다 연결을 하나씩 더 연다.
 */
export function NotificationBell() {
  const [count, setCount] = useState(0);

  useEffect(() => {
    let alive = true;
    const load = () =>
      unreadNotificationCount()
        .then((n) => alive && setCount(n))
        .catch(() => undefined);
    void load();
    const timer = window.setInterval(load, 60_000);
    const onVisible = () => document.visibilityState === "visible" && void load();
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      alive = false;
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, []);

  return (
    <Link
      to="/notifications"
      aria-label={count > 0 ? `알림 ${count}개 안 읽음` : "알림"}
      className="relative -mr-2 inline-flex size-11 shrink-0 items-center justify-center rounded-full text-foreground transition-colors hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
    >
      <Bell className="size-5" aria-hidden="true" />
      {count > 0 ? (
        <span className="absolute top-1.5 right-1.5 grid min-w-4 place-items-center rounded-full bg-primary-strong px-1 text-[0.625rem] leading-4 font-semibold text-background tabular-nums">
          {count > 9 ? "9+" : count}
        </span>
      ) : null}
    </Link>
  );
}
