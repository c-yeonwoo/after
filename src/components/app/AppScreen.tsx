import type { ReactNode } from "react";
import { Link, useRouterState } from "@tanstack/react-router";
import { ArrowLeft, Heart, Home, MessageCircle, User } from "lucide-react";

import { Logo } from "@/components/Logo";
import { cn } from "@/lib/utils";

/**
 * 탭 라벨은 성별과 무관하게 "소개" 하나로 둔다.
 * 여성은 소개받은 사람을 평가하고 남성은 소개받은 한 사람을 읽는다 — 하는 일은
 * 다르지만 둘 다 "소개"가 대상이라 라벨을 나눌 만큼의 차이는 아니었다.
 */
const TABS = [
  { to: "/home", label: "홈", icon: Home },
  { to: "/intro", label: "소개", icon: Heart },
  { to: "/chats", label: "대화", icon: MessageCircle },
  { to: "/me", label: "나", icon: User },
] as const;

export function AppScreen({
  title,
  action,
  children,
  hideTabs,
  /**
   * 화면 높이를 꽉 채우고 **스크롤을 자식에게 넘긴다.**
   * 대화방처럼 "헤더 고정 + 로그만 스크롤 + 입력창 고정" 프레임이 필요한 화면용.
   * 기본값은 페이지 전체가 스크롤되는 일반 문서형이다.
   */
  fill,
  /**
   * 탭 루트가 아닌 화면에는 항상 돌아갈 길을 준다.
   * 히스토리 대신 **명시적 경로**를 받는다 — 딥링크나 새로고침으로 들어온 경우
   * history.back() 은 앱 밖으로 나가버린다.
   */
  back,
}: {
  title?: string;
  action?: ReactNode;
  children: ReactNode;
  hideTabs?: boolean;
  fill?: boolean;
  back?: string;
}) {
  const pathname = useRouterState({ select: (s) => s.location.pathname });

  return (
    <div
      className={cn("flex flex-col bg-background", fill ? "h-dvh overflow-hidden" : "min-h-screen")}
      style={fill && !hideTabs ? { paddingBottom: "calc(var(--safe-bottom) + 4rem)" } : undefined}
    >
      <header
        className="sticky top-0 z-20 bg-background/80 pb-3 backdrop-blur-xl"
        style={{
          paddingTop: "var(--safe-top)",
          paddingLeft: "max(env(safe-area-inset-left, 0px), 1.5rem)",
          paddingRight: "max(env(safe-area-inset-right, 0px), 1.5rem)",
        }}
      >
        <div className="flex min-w-0 items-center gap-2">
          {back ? (
            <Link
              to={back}
              aria-label="뒤로"
              className="-ml-2 inline-flex size-11 shrink-0 items-center justify-center rounded-full text-foreground transition-colors hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
            >
              <ArrowLeft className="size-5" aria-hidden="true" />
            </Link>
          ) : null}
          {title ? (
            <h1 className="headline min-w-0 flex-1 truncate text-xl">{title}</h1>
          ) : (
            <Logo size="sm" className="min-w-0 flex-1 shrink" />
          )}
          {action}
        </div>
      </header>

      <main
        className={cn("mx-auto w-full px-6 pt-1", fill ? "flex min-h-0 flex-1 flex-col" : "flex-1")}
        style={fill ? undefined : { paddingBottom: hideTabs ? "1.5rem" : "6.5rem" }}
      >
        {children}
      </main>

      {hideTabs ? null : (
        <nav
          className="fixed inset-x-0 bottom-0 z-30 mx-auto w-full max-w-[430px] border-t-2 border-foreground/10 bg-background/95 backdrop-blur-xl"
          style={{ paddingBottom: "var(--safe-bottom)" }}
          aria-label="주요 메뉴"
        >
          <ul className="flex items-stretch">
            {TABS.map((t) => {
              const active = pathname === t.to || pathname.startsWith(`${t.to}/`);
              const Icon = t.icon;
              return (
                <li key={t.to} className="flex-1">
                  <Link
                    to={t.to}
                    aria-current={active ? "page" : undefined}
                    className={cn(
                      "flex min-h-14 flex-col items-center justify-center gap-1 pt-2 text-2xs font-semibold transition-colors",
                      "focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none",
                      active ? "text-primary" : "text-muted-foreground",
                    )}
                  >
                    <Icon className="size-5" aria-hidden="true" strokeWidth={active ? 2.6 : 1.9} />
                    {t.label}
                  </Link>
                </li>
              );
            })}
          </ul>
        </nav>
      )}
    </div>
  );
}
