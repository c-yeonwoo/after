import { createFileRoute, Link, Outlet, useNavigate } from "@tanstack/react-router";
import {
  CalendarCheck,
  Camera,
  HeartHandshake,
  LayoutDashboard,
  PackageCheck,
  Search,
  Settings2,
  ShieldCheck,
  Users,
  MapPin,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { useCallback, useEffect, useState } from "react";

import { Logo } from "@/components/Logo";
import { Input } from "@/components/ui/input";
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
    items: [{ to: "/admin", label: "운영 홈", exact: true, icon: LayoutDashboard }],
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
    ],
  },
  {
    label: "거래와 시스템",
    items: [
      { to: "/admin/orders", label: "주문", icon: PackageCheck },
      { to: "/admin/system", label: "시스템", icon: Settings2 },
    ],
  },
];

const FLAT_NAV = NAV.flatMap((g) => g.items);

function AdminLayout() {
  const { me, ready } = useMe();
  const navigate = useNavigate();
  const [isAdmin, setIsAdmin] = useState<boolean | null>(null);

  useEffect(() => {
    if (ready && !me) navigate({ to: "/login" });
  }, [ready, me, navigate]);

  const check = useCallback(async () => {
    setIsAdmin(await amIAdmin());
  }, []);

  useEffect(() => {
    if (ready && me) void check();
  }, [ready, me, check]);

  /*
    여기서 하는 권한 확인은 화면을 감추는 것이지 보안이 아니다. 실제 방어는
    서버의 is_admin() 이고, 그걸 통과 못 하면 자식 화면의 모든 호출이 42501 로
    튕긴다. 클라이언트가 PostgREST 를 직접 부르는 구조라 프론트 가드는 우회된다.
  */
  return (
    <Shell showTabs={isAdmin === true}>
      {!ready || isAdmin === null ? (
        <p className="text-sm text-muted-foreground">불러오는 중…</p>
      ) : isAdmin ? (
        <Outlet />
      ) : (
        <p className="text-sm text-muted-foreground">운영자만 볼 수 있는 화면입니다.</p>
      )}
    </Shell>
  );
}

function Shell({ children, showTabs }: { children: React.ReactNode; showTabs: boolean }) {
  const navigate = useNavigate();
  const [query, setQuery] = useState("");

  function searchMember(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const q = query.trim();
    if (!q) return;
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
    <div className="flex h-dvh bg-background">
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
              onChange={(e) => setQuery(e.target.value)}
              className="h-9 pl-9"
              placeholder="회원 검색"
              aria-label="회원 검색"
            />
          </form>
          <nav className="mt-5 min-h-0 flex-1 space-y-5 overflow-y-auto">
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
                        className="flex items-center gap-2.5 rounded-md px-2.5 py-2 text-sm text-muted-foreground transition-colors hover:bg-muted hover:text-foreground data-[status=active]:bg-muted data-[status=active]:font-semibold data-[status=active]:text-foreground"
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
          className="shrink-0 border-b border-border px-4 lg:hidden"
          style={{ paddingTop: "var(--safe-top)" }}
        >
          <div className="flex items-center gap-3 pb-3">
            <Logo size="sm" />
            <span className="text-sm font-semibold text-muted-foreground">운영</span>
          </div>
          {showTabs ? (
            <nav className="-mb-px flex gap-1 overflow-x-auto">
              {FLAT_NAV.map((item) => (
                <Link
                  key={item.to}
                  to={item.to}
                  activeOptions={{ exact: item.exact ?? false }}
                  className="shrink-0 border-b-2 border-transparent px-3 py-2 text-sm text-muted-foreground transition-colors hover:text-foreground data-[status=active]:border-primary data-[status=active]:font-semibold data-[status=active]:text-foreground"
                >
                  {item.label}
                </Link>
              ))}
            </nav>
          ) : null}
        </header>
        <main className="min-h-0 flex-1 overflow-y-auto">
          <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8 lg:py-8">{children}</div>
        </main>
      </div>
    </div>
  );
}
