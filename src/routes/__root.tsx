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
import { BRAND } from "@/lib/brand";
import { MobileFrame } from "@/components/MobileFrame";
import { THEME_INIT_SCRIPT, ThemeProvider } from "@/lib/theme";
import { MeProvider } from "@/lib/me";
import { watchKeyboard } from "@/lib/keyboard";
import { hideSplash } from "@/lib/native";

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
      { title: `${BRAND.name} — 직장인 1:1 소개 서비스` },
      {
        name: "description",
        content: "퇴근하고 만나기 좋은 거리에, 좋은 사람 한 명. 스와이프 없는 1:1 소개 서비스.",
      },
      { property: "og:title", content: `${BRAND.name} — 직장인 1:1 소개 서비스` },
      {
        property: "og:description",
        content: "퇴근하고 만나기 좋은 거리에, 좋은 사람 한 명.",
      },
      { property: "og:site_name", content: "Eclipse" },

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
      /*
        Fraunces 하나만 받는다 — 워드마크(400)와 랜딩 히어로(900)가 같은 서체다.

        예전에는 Archivo Black 이었다. 기하 그로테스크라 "딱딱하다" 는 지적이
        정확했고, 단일 웨이트(400)라 히어로에 굵기를 줄 수도 없었다. Fraunces 는
        가변 서체라 한 파일로 두 역할을 덮는다 — 요청 수가 늘지 않는다.

        SOFT·WONK 축이 이 서체를 고른 이유다. 후리를 둥글게(SOFT) 하고 몇 글자를
        살짝 기울이면(WONK) 세리프인데도 격식이 빠진다. 축 값은 styles.css 에서
        정하는데, 폰트 URL 에 축 범위를 함께 요청해야 그 값이 실제로 적용된다.
      */
      {
        rel: "stylesheet",
        href: "https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght,SOFT,WONK@9..144,400..900,0..100,0..1&display=swap",
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

  // 첫 화면이 그려진 뒤에 스플래시를 걷는다 — 자동으로 걷으면 흰 섬광이 낀다.
  useEffect(() => void hideSplash(), []);

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
