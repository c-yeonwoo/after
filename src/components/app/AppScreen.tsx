import type { ReactNode } from "react";
import { Link, useRouterState } from "@tanstack/react-router";
import { Home, MessageCircle, Sparkles, User } from "lucide-react";

import { Logo } from "@/components/Logo";
import { cn } from "@/lib/utils";

const TABS = [
  { to: "/home", label: "홈", icon: Home },
  { to: "/intro", label: "소개", icon: Sparkles },
  { to: "/chats", label: "대화", icon: MessageCircle },
  { to: "/me", label: "나", icon: User },
] as const;

export function AppScreen({
  title,
  action,
  children,
  hideTabs,
}: {
  title?: string;
  action?: ReactNode;
  children: ReactNode;
  hideTabs?: boolean;
}) {
  const pathname = useRouterState({ select: (s) => s.location.pathname });

  return (
    <div className="flex min-h-screen flex-col bg-background">
      <header
        className="sticky top-0 z-20 bg-background/80 pb-3 backdrop-blur-xl"
        style={{
          paddingTop: "calc(env(safe-area-inset-top, 0px) + 0.75rem)",
          paddingLeft: "max(env(safe-area-inset-left, 0px), 1.5rem)",
          paddingRight: "max(env(safe-area-inset-right, 0px), 1.5rem)",
        }}
      >
        <div className="flex min-w-0 items-center justify-between gap-2">
          {title ? (
            <h1 className="min-w-0 truncate text-lg font-semibold tracking-tight">{title}</h1>
          ) : (
            <Logo size="sm" className="min-w-0 shrink" />
          )}
          {action}
        </div>
      </header>

      <main
        className="mx-auto w-full flex-1 px-6 pt-1"
        style={{ paddingBottom: hideTabs ? "1.5rem" : "6.5rem" }}
      >
        {children}
      </main>

      {hideTabs ? null : (
        <nav
          className="fixed inset-x-0 bottom-0 z-30 mx-auto w-full max-w-[430px] border-t border-border/70 bg-background/90 backdrop-blur-xl"
          style={{ paddingBottom: "calc(env(safe-area-inset-bottom, 0px) + 0.4rem)" }}
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
                      "flex min-h-14 flex-col items-center justify-center gap-1 pt-2 text-[0.7rem] font-medium transition-colors",
                      "focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none",
                      active ? "text-primary-strong" : "text-muted-foreground",
                    )}
                  >
                    <Icon className="size-5" aria-hidden="true" strokeWidth={active ? 2.4 : 1.8} />
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
