import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  Outlet,
  Link,
  createRootRouteWithContext,
  useRouter,
  HeadContent,
  Scripts,
  useRouterState,
} from "@tanstack/react-router";
import { useEffect, type ReactNode } from "react";

import appCss from "../styles.css?url";
import { Toaster } from "@/components/ui/sonner";
import { MobileFrame } from "@/components/MobileFrame";
import { THEME_INIT_SCRIPT, ThemeProvider } from "@/lib/theme";
import { MeProvider } from "@/lib/me";
import { watchKeyboard } from "@/lib/keyboard";

function NotFoundComponent() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="max-w-md text-center">
        <h1 className="text-7xl font-bold text-foreground">404</h1>
        <h2 className="mt-4 text-xl font-semibold text-foreground">페이지를 찾을 수 없습니다</h2>
        <p className="mt-2 text-sm text-muted-foreground">주소가 바뀌었거나 삭제된 페이지입니다.</p>
        <div className="mt-6">
          <Link
            to="/"
            className="inline-flex min-h-11 items-center justify-center rounded-control bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
          >
            처음으로
          </Link>
        </div>
      </div>
    </div>
  );
}

function ErrorComponent({ error, reset }: { error: Error; reset: () => void }) {
  console.error(error);
  const router = useRouter();

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="max-w-md text-center">
        <h1 className="text-xl font-semibold tracking-tight text-foreground">
          화면을 불러오지 못했습니다
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">
          잠시 문제가 생겼습니다. 다시 시도하거나 처음으로 돌아가 주세요.
        </p>
        <div className="mt-6 flex flex-wrap justify-center gap-2">
          <button
            onClick={() => {
              router.invalidate();
              reset();
            }}
            className="inline-flex min-h-11 items-center justify-center rounded-control bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
          >
            다시 시도
          </button>
          <a
            href="/"
            className="inline-flex min-h-11 items-center justify-center rounded-control border border-input bg-background px-4 py-2 text-sm font-medium text-foreground transition-colors hover:bg-accent"
          >
            처음으로
          </a>
        </div>
      </div>
    </div>
  );
}

export const Route = createRootRouteWithContext<{ queryClient: QueryClient }>()({
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      {
        name: "viewport",
        content: "width=device-width, initial-scale=1, viewport-fit=cover",
      },
      { title: "애프터 — 강남·역삼 직장인 1:1 매칭" },
      {
        name: "description",
        content: "퇴근하고 만나기 좋은 거리에, 좋은 사람 한 명. 스와이프 없는 1:1 소개 서비스.",
      },
      { property: "og:title", content: "애프터 — 강남·역삼 직장인 1:1 매칭" },
      {
        property: "og:description",
        content: "퇴근하고 만나기 좋은 거리에, 좋은 사람 한 명.",
      },
      { property: "og:site_name", content: "After Sunset" },

      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
    links: [
      {
        rel: "stylesheet",
        href: appCss,
      },
      { rel: "preconnect", href: "https://fonts.googleapis.com" },
      { rel: "preconnect", href: "https://fonts.gstatic.com", crossOrigin: "anonymous" },
      { rel: "preconnect", href: "https://cdn.jsdelivr.net", crossOrigin: "anonymous" },
      {
        rel: "stylesheet",
        href: "https://cdn.jsdelivr.net/gh/orioncactus/pretendard@v1.3.9/dist/web/variable/pretendardvariable-dynamic-subset.min.css",
      },
      // Archivo Black 만 남긴다 — 워드마크 전용.
      // Instrument Serif 는 사용처가 0건이었고, Hind(5웨이트)는 한글 글리프가 없어
      // 한 줄 안에서 서체가 갈라지는 원인이었다. 둘 다 제거해 요청 6개를 줄였다.
      {
        rel: "stylesheet",
        href: "https://fonts.googleapis.com/css2?family=Archivo+Black&display=swap",
      },
      /*
        SVG 를 먼저 둔다 — 지원 브라우저는 이걸 쓰고 어느 크기에서도 선명하다.
        ico 는 그걸 못 읽는 브라우저용 폴백이라 뒤에 온다(16·32·48 3종 내장).
        예전 ico 는 256px 한 장 20KB 였는데, 탭에서 쓰는 16px 로 축소될 때
        브라우저 리샘플링에 맡겨져 뭉갰다.
      */
      { rel: "icon", href: "/favicon.svg", type: "image/svg+xml" },
      { rel: "icon", href: "/favicon.ico", sizes: "48x48" },
      { rel: "apple-touch-icon", href: "/apple-touch-icon.png" },
    ],
  }),

  shellComponent: RootShell,
  component: RootComponent,
  notFoundComponent: NotFoundComponent,
  errorComponent: ErrorComponent,
});

function RootShell({ children }: { children: ReactNode }) {
  return (
    // 한국어 제품이다. lang 은 스크린리더 발음뿐 아니라 CJK 줄바꿈 규칙과
    // 폰트 선택에도 영향을 준다 — "en" 이면 한글 줄바꿈이 어색해진다.
    <html lang="ko">
      <head>
        {/*
          첫 페인트 전에 .dark 를 붙인다. React 가 붙기를 기다리면 라이트로
          한 번 그려진 뒤 다크로 바뀐다(FOUC). head 안 동기 실행이라야 한다.
        */}
        <script dangerouslySetInnerHTML={{ __html: THEME_INIT_SCRIPT }} />
        <HeadContent />
      </head>
      <body>
        {children}
        <Scripts />
      </body>
    </html>
  );
}

function RootComponent() {
  const { queryClient } = Route.useRouteContext();

  /*
    운영자 화면은 모바일 프레임에 가두지 않는다.

    MobileFrame 은 어떤 화면이든 430px 로 묶는데, 운영 화면은 표와 지표를
    늘어놓는 자리라 그 폭에서 읽을 수가 없다. 실제로 max-w-5xl 을 줘도 프레임이
    이겨서 무의미해졌다. 운영자는 데스크톱에서 본다.
  */
  const isAdminRoute = useRouterState({
    select: (s) => s.location.pathname.startsWith("/admin"),
  });

  // 네이티브에서만 붙는다. 키보드 높이를 --keyboard-height 로 내려보낸다.
  useEffect(() => watchKeyboard(), []);

  return (
    <QueryClientProvider client={queryClient}>
      {/* Required: nested routes render here. Removing <Outlet /> breaks all child routes. */}
      <ThemeProvider>
        <MeProvider>
          {isAdminRoute ? (
            <Outlet />
          ) : (
            <MobileFrame>
              <Outlet />
            </MobileFrame>
          )}
        </MeProvider>
      </ThemeProvider>
      <Toaster position="top-center" />
    </QueryClientProvider>
  );
}
