import { createFileRoute, Link, Outlet, useNavigate } from "@tanstack/react-router";
import { useCallback, useEffect, useState } from "react";

import { Logo } from "@/components/Logo";
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
const TABS: { to: string; label: string; exact?: boolean }[] = [
  // 대시보드만 exact 다. 아니면 /admin/members 에서도 활성으로 잡힌다.
  { to: "/admin", label: "대시보드", exact: true },
  { to: "/admin/members", label: "회원" },
  { to: "/admin/photos", label: "사진 검수" },
  { to: "/admin/reports", label: "신고" },
  { to: "/admin/meetings", label: "만남" },
];

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
    <div className="flex h-dvh flex-col bg-background">
      <header
        className="shrink-0 border-b border-border px-6"
        style={{ paddingTop: "var(--safe-top)" }}
      >
        <div className="mx-auto flex max-w-6xl items-center gap-3 pb-3">
          <Logo size="sm" />
          <span className="text-sm font-semibold text-muted-foreground">운영</span>
        </div>
        {showTabs ? (
          <nav className="mx-auto -mb-px flex max-w-6xl gap-1 overflow-x-auto">
            {TABS.map((t) => (
              <Link
                key={t.to}
                to={t.to}
                activeOptions={{ exact: t.exact ?? false }}
                className="shrink-0 border-b-2 border-transparent px-3 py-2 text-sm text-muted-foreground transition-colors hover:text-foreground data-[status=active]:border-primary data-[status=active]:font-semibold data-[status=active]:text-foreground"
              >
                {t.label}
              </Link>
            ))}
          </nav>
        ) : null}
      </header>
      <main className="min-h-0 flex-1 overflow-y-auto">
        <div className="mx-auto max-w-6xl px-6 py-8">{children}</div>
      </main>
    </div>
  );
}
