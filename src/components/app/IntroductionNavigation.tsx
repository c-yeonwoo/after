import { Link } from "@tanstack/react-router";

export function IntroductionNavigation({ meetings }: { meetings: boolean }) {
  return (
    <nav
      aria-label="소개 메뉴"
      className="mb-5 flex shrink-0 gap-1 rounded-control bg-muted/60 p-1"
    >
      {(
        [
          { to: "/intro", label: "새 소개", active: !meetings },
          { to: "/chats", label: "만남", active: meetings },
        ] as const
      ).map((tab) => (
        <Link
          key={tab.to}
          to={tab.to}
          aria-current={tab.active ? "page" : undefined}
          className={`pressable flex min-h-11 flex-1 items-center justify-center rounded-control text-sm font-semibold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${tab.active ? "bg-card text-primary-strong shadow-sm" : "text-muted-foreground"}`}
        >
          {tab.label}
        </Link>
      ))}
    </nav>
  );
}
