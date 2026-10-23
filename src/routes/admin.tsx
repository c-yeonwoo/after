import { createFileRoute, Link, Outlet, useNavigate, useRouterState } from "@tanstack/react-router";
import {
  CalendarCheck,
  Camera,
  HeartHandshake,
  LayoutDashboard,
  PackageCheck,
  Search,
  Settings2,
  MessageCircleQuestion,
  ShieldCheck,
  Users,
  MapPin,
  ListTodo,
  ChartColumn,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { useEffect, useRef, useState } from "react";

import { Logo } from "@/components/Logo";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useKeepFieldVisible } from "@/lib/keyboard";
import { useMe } from "@/lib/me";
import { amIAdmin } from "@/lib/admin";

export const Route = createFileRoute("/admin")({
  head: () => ({
    meta: [
      { title: "운영" },
      // 운영 화면은 검색에 잡힐 이유가 없다.
      { name: "robots", content: "noindex, nofollow" },
    ],
  }),
  component: AdminLayout,
});

/*
  탭은 라우트로 나눈다.

  처음에는 한 화면에 대시보드와 신고를 위아래로 쌓았는데, 운영자가 할 일이
  늘어나면(회원·만남·큐레이션) 그 방식은 스크롤 하나에 전부 매달린다. 지금 보는
  것이 무엇인지 URL 에 남지 않아 "그 회원 화면 링크 줘" 도 안 된다.

  경로는 전부 `admin.` 으로 시작해야 한다 — vite.config.ts 가 그 접두사로
  앱 빌드에서 제외한다. 파일명을 바꿀 때 이 규칙을 깨면 어드민이 앱 번들에
  섞인다.
*/
type AdminNavItem = { to: string; label: string; exact?: boolean; icon: LucideIcon };

const NAV: { label: string; items: AdminNavItem[] }[] = [
  {
    label: "오늘",
    items: [
      { to: "/admin", label: "운영 홈", exact: true, icon: LayoutDashboard },
      { to: "/admin/tasks", label: "작업함", icon: ListTodo },
    ],
  },
  {
    label: "매칭 운영",
    items: [
      { to: "/admin/curation", label: "큐레이션", icon: HeartHandshake },
      { to: "/admin/meetings", label: "만남", icon: CalendarCheck },
      { to: "/admin/places", label: "약속 장소", icon: MapPin },
    ],
  },
  {
    label: "회원과 안전",
    items: [
      { to: "/admin/members", label: "회원", icon: Users },
      { to: "/admin/photos", label: "사진 검수", icon: Camera },
      { to: "/admin/reports", label: "신고", icon: ShieldCheck },
      { to: "/admin/support", label: "고객 문의", icon: MessageCircleQuestion },
    ],
  },
  {
    label: "거래와 개선",
    items: [
      { to: "/admin/orders", label: "주문·티켓", icon: PackageCheck },
      { to: "/admin/insights", label: "수급·성과", icon: ChartColumn },
    ],
  },
  {
    label: "자동화와 관리",
    items: [
      { to: "/admin/system", label: "자동화·시스템", icon: Settings2 },
      { to: "/admin/settings", label: "운영 설정", icon: Settings2 },
    ],
  },
];

const FLAT_NAV = NAV.flatMap((g) => g.items);
const MOBILE_NAV = FLAT_NAV.filter((item) =>
  ["/admin", "/admin/tasks", "/admin/curation", "/admin/members"].includes(item.to),
);
const MOBILE_MORE = FLAT_NAV.filter((item) => !MOBILE_NAV.includes(item));

function AdminLayout() {
  const { me, ready } = useMe();
  const navigate = useNavigate();
  const [permission, setPermission] = useState<{ actor: string; allowed: boolean } | null>(null);
  const [error, setError] = useState(false);
  const [retry, setRetry] = useState(0);
  const actor = me?.id;

  useEffect(() => {
    if (ready && !me) navigate({ to: "/login" });
  }, [ready, me, navigate]);

  useEffect(() => {
    if (!ready || !actor) return;
    let active = true;
    setError(false);
    void amIAdmin()
      .then((allowed) => {
        if (active) setPermission({ actor, allowed });
      })
      .catch(() => {
        if (active) setError(true);
      });
    return () => {
      active = false;
    };
  }, [ready, actor, retry]);

  /*
    여기서 하는 권한 확인은 화면을 감추는 것이지 보안이 아니다. 실제 방어는
    서버의 is_admin() 이고, 그걸 통과 못 하면 자식 화면의 모든 호출이 42501 로
    튕긴다. 클라이언트가 PostgREST 를 직접 부르는 구조라 프론트 가드는 우회된다.
  */
  const allowed =
    permission?.actor === actor && permission?.allowed === true && me?.role === "admin";
  return (
    <Shell showTabs={allowed}>
      {error ? (
        <div role="alert" className="app-elevated rounded-surface bg-card p-5">
          <p className="text-sm text-muted-foreground">운영 권한을 확인하지 못했어요.</p>
          <Button variant="outline" className="mt-3" onClick={() => setRetry((n) => n + 1)}>
            다시 확인하기
          </Button>
        </div>
      ) : !ready || !me || permission?.actor !== actor ? (
        <p role="status" className="text-sm text-muted-foreground">
          불러오는 중…
        </p>
      ) : allowed ? (
        <div key={actor}>
          <Outlet />
        </div>
      ) : (
        <p className="text-sm text-muted-foreground">운영자만 볼 수 있는 화면입니다.</p>
      )}
    </Shell>
  );
}

function Shell({ children, showTabs }: { children: React.ReactNode; showTabs: boolean }) {
  const navigate = useNavigate();
  const [query, setQuery] = useState("");
  const [searchError, setSearchError] = useState(false);
  const pathname = useRouterState({ select: (state) => state.location.pathname });
  const main = useRef<HTMLElement>(null);
  useKeepFieldVisible(main, pathname, true);
  useEffect(() => {
    main.current?.scrollTo(0, 0);
    const frame = requestAnimationFrame(() => main.current?.scrollTo(0, 0));
    return () => cancelAnimationFrame(frame);
  }, [pathname]);

  function searchMember(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const q = query.trim();
    if (!q) return;
    if (q.includes("@") || /\d{7,}/.test(q)) {
      setSearchError(true);
      return;
    }
    setSearchError(false);
    void navigate({ to: "/admin/members", search: { q } });
  }

  /*
    스크롤을 여기서 직접 쥔다.

    styles.css 가 html·body 에 overflow:hidden 을 걸어 문서 스크롤을 잠갔다
    (iOS 에서 본문이 상태바 밑으로 지나가고 키보드가 헤더를 밀어 올리던 문제).
    사용자 화면은 AppScreen 의 main 이 스크롤을 맡지만 운영 화면은 그 프레임
    밖이라, 이걸 안 주면 목록이 쌓이는 순간 아래가 잘려 안 보인다.

    레이아웃이 사용자 화면(AppScreen)과 다르다. 모바일 폭에 갇힌 프레임은
    표를 보기에 나쁘고, 운영자는 데스크톱에서 본다.
  */
  return (
    <div className="app-form-screen flex h-dvh bg-background">
      {showTabs ? (
        <aside className="hidden w-60 shrink-0 flex-col border-r border-border bg-card px-4 pb-5 pt-6 lg:flex">
          <div className="flex items-center gap-3 px-2">
            <Logo size="sm" />
            <span className="text-sm font-semibold text-muted-foreground">운영</span>
          </div>
          <form onSubmit={searchMember} className="relative mt-6">
            <Search
              className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
              aria-hidden="true"
            />
            <Input
              value={query}
              onChange={(e) => {
                setQuery(e.target.value);
                setSearchError(false);
              }}
              className="min-h-11 pl-9"
              placeholder="이름 검색"
              aria-label="회원 이름 검색"
            />
          </form>
          {searchError ? (
            <p className="mt-2 px-1 text-xs text-destructive" role="alert">
              이메일은 회원 화면에서 검색해 주세요.
            </p>
          ) : null}
          <nav
            aria-label="운영 메뉴"
            className="mt-5 min-h-0 flex-1 space-y-5 overflow-y-auto overscroll-contain"
          >
            {NAV.map((group) => (
              <div key={group.label}>
                <p className="px-2 text-2xs font-semibold uppercase tracking-wider text-muted-foreground">
                  {group.label}
                </p>
                <div className="mt-1 space-y-0.5">
                  {group.items.map((item) => {
                    const Icon = item.icon;
                    return (
                      <Link
                        key={item.to}
                        to={item.to}
                        activeOptions={{ exact: item.exact ?? false }}
                        className="pressable flex min-h-11 items-center gap-2.5 rounded-control px-3 py-2 text-sm text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none data-[status=active]:bg-primary data-[status=active]:font-semibold data-[status=active]:text-primary-foreground"
                      >
                        <Icon className="size-4" aria-hidden="true" />
                        {item.label}
                      </Link>
                    );
                  })}
                </div>
              </div>
            ))}
          </nav>
        </aside>
      ) : null}

      <div className="flex min-w-0 flex-1 flex-col">
        <header
          className="relative z-20 shrink-0 border-b border-border px-4 lg:hidden"
          style={{ paddingTop: "var(--safe-top)" }}
        >
          <div className="flex items-center gap-3 pb-3">
            <Logo size="sm" />
            <span className="text-sm font-semibold text-muted-foreground">운영</span>
          </div>
          {showTabs ? (
            <nav aria-label="운영 메뉴" className="flex items-center gap-1 pb-3">
              {MOBILE_NAV.map((item) => (
                <Link
                  key={item.to}
                  to={item.to}
                  activeOptions={{ exact: item.exact ?? false }}
                  className="pressable flex min-h-11 flex-1 items-center justify-center rounded-control px-1 text-xs font-medium text-muted-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none data-[status=active]:bg-primary data-[status=active]:font-semibold data-[status=active]:text-primary-foreground"
                >
                  {item.label}
                </Link>
              ))}
              <DropdownMenu modal={false}>
                <DropdownMenuTrigger asChild>
                  <Button
                    variant={
                      MOBILE_MORE.some((item) => pathname.startsWith(item.to)) ? "default" : "ghost"
                    }
                    size="sm"
                    className="flex-1 px-2"
                  >
                    더보기
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-56 rounded-surface border-0 p-2">
                  {MOBILE_MORE.map((item) => (
                    <DropdownMenuItem key={item.to} asChild className="min-h-11 rounded-control">
                      <Link to={item.to}>
                        <item.icon className="size-4" aria-hidden="true" />
                        {item.label}
                      </Link>
                    </DropdownMenuItem>
                  ))}
                </DropdownMenuContent>
              </DropdownMenu>
            </nav>
          ) : null}
        </header>
        <main
          ref={main}
          tabIndex={0}
          className="min-h-0 flex-1 overflow-y-auto overscroll-contain focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring focus-visible:outline-none"
          style={{ paddingBottom: "var(--safe-bottom)" }}
        >
          <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8 lg:py-8">{children}</div>
        </main>
      </div>
    </div>
  );
}
