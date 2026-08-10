import { defineConfig, loadEnv, type PluginOption, type UserConfig } from "vite";
import { tanstackStart } from "@tanstack/react-start/plugin/vite";
import viteReact from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import tsConfigPaths from "vite-tsconfig-paths";

/**
 * 빌드 타깃이 둘이다.
 *
 *   npm run build      웹 — Nitro(Cloudflare Workers). SSR 로 HTML 을 런타임에 만든다.
 *   npm run build:app  앱 — SPA 셸. Capacitor 가 번들할 정적 dist/ 를 만든다.
 *
 * 나눈 이유: Capacitor 는 webDir 의 정적 index.html 을 읽는데 Nitro 빌드는
 * .output/ 에 진입점 HTML 이 없다(서버가 런타임에 만드니까). 그렇다고 웹까지
 * SPA 로 내리면 랜딩의 SEO 를 버리게 된다 — 랜딩은 로그인 전 화면이라 SSR 이
 * 실제로 값을 한다.
 *
 * 앱 쪽에서 SSR 을 잃는 대가는 작다. 로그인 뒤 화면은 전부 개인화된 데이터라
 * 서버가 미리 그릴 것이 거의 없고, 셸은 __root 의 shellComponent(RootShell)가
 * 담당한다.
 *
 * ── 이 파일의 유래 ──
 *
 * 원래 `@lovable.dev/vite-tanstack-config` 가 플러그인 구성을 통째로 들고 있었다.
 * 그 래퍼를 걷어내면서 **우리에게 필요한 것만** 여기로 옮겼다. 래퍼가 함께 넣던
 * Lovable 전용 플러그인(에디터 브리지, HMR 게이트, 샌드박스 감지, 빌드 진단,
 * 에셋 프록시)은 우리 배포 경로에서 하는 일이 없어 가져오지 않았다.
 */
export default defineConfig(async ({ command, mode }): Promise<UserConfig> => {
  const forApp = process.env.BUILD_TARGET === "app";
  const isDevBuild = command === "build" && mode === "development";

  /*
    VITE_* 를 import.meta.env 에 **명시적으로** 주입한다.

    Vite 가 클라이언트 번들에는 알아서 넣어 주지만, TanStack Start 의 서버 환경과
    Nitro 빌드에는 자동으로 닿지 않는다. 이게 없으면 `VITE_SUPABASE_URL 가 설정되지
    않았습니다`(src/lib/supabase.ts)로 런타임에 죽는다.
  */
  const envDefine = Object.fromEntries(
    Object.entries(loadEnv(mode, process.cwd(), "VITE_")).map(([key, value]) => [
      `import.meta.env.${key}`,
      JSON.stringify(value),
    ]),
  );

  const plugins: PluginOption[] = [
    tailwindcss(),
    tsConfigPaths(),
    tanstackStart({
      // 서버 전용 모듈이 클라이언트 번들로 새는 것을 빌드 단계에서 막는다.
      importProtection: {
        behavior: "error",
        client: { files: ["**/server/**"], specifiers: ["server-only"] },
      },
      // TanStack Start 의 서버 엔트리를 src/server.ts(SSR 에러 래퍼)로 돌린다.
      server: { entry: "server" },

      // 셸 파일명을 index.html 로 바꾼다. 기본값 "/_shell" 은 웹 서버가 미지의
      // 경로를 셸로 넘겨주는 구성을 전제한 이름인데, Capacitor 는 webDir 에서
      // index.html 을 직접 연다 — 이름이 다르면 빈 화면이 뜬다.
      ...(forApp ? { spa: { enabled: true, prerender: { outputPath: "/index" } } } : {}),

      /*
        운영자 화면은 **앱 번들에 넣지 않는다.**

        Capacitor 빌드는 웹 자산을 통째로 앱 안에 복사하므로, 여기에 어드민이
        섞이면 번들이 커지고 심사에서 "숨은 기능"으로 오해받을 여지도 생긴다.
        운영자는 웹으로만 들어온다.

        라우트 파일명이 `admin.` 으로 시작하는 것을 앱 빌드에서 제외한다.
        서버 권한은 어차피 RLS(is_admin())가 쥐고 있어서 이건 노출 축소이지
        보안 장치가 아니다 — 보안은 DB 에 있다.

        생성 경로를 갈라 두는 것이 중요하다. routeTree.gen.ts 는 **커밋되는
        파일**이라, 앱 빌드가 그걸 덮어쓰면 admin 라우트가 사라진 버전이 남고
        tsc 가 admin.tsx 에서 실패한다 — 어느 빌드를 마지막에 돌렸느냐에 따라
        타입 검사 결과가 뒤집힌다. 앱 빌드는 자기 트리를 따로 만든다.
      */
      ...(forApp
        ? {
            router: {
              routeFileIgnorePattern: "^admin\\.",
              // srcDirectory 기준 상대 경로다(start-plugin-core/schema.js).
              // "src/" 를 붙이면 src/src/... 로 해석돼 조용히 무시된다.
              generatedRouteTree: "routeTree.app.gen.ts",
            },
          }
        : {}),
    }),
    viteReact(),
  ];

  /*
    배포 플러그인은 웹 빌드에만 넣는다.

    앱 빌드에서 켜 두면 출력이 .output/ 로 가는데 TanStack Start 의 프리렌더러는
    dist/server/server.js 를 찾기 때문에 "Cannot find module .../dist/server/server.js"
    로 프리렌더가 통째로 죽는다.
  */
  if (command === "build" && !forApp) {
    const { nitro } = await import("nitro/vite");
    plugins.push(nitro({ preset: "cloudflare-module" }));
  }

  return {
    define: envDefine,

    // 개발 모드 빌드(= build:app)에서는 프로덕션 최적화를 걸지 않는다.
    ...(isDevBuild
      ? {
          environments: {
            client: { define: { "process.env.NODE_ENV": JSON.stringify("development") } },
          },
          /*
            keepNames 는 esbuild 옵션인데 Vite 의 ESBuildOptions 타입에는 없다
            (통과만 시킨다). 컴포넌트·함수 이름이 살아 있어야 개발 빌드의
            스택트레이스가 읽히므로 유지하고, 타입만 좁힌다.
          */
          esbuild: { keepNames: true } as UserConfig["esbuild"],
        }
      : {}),

    css: { transformer: "lightningcss" as const },

    resolve: {
      // tsconfig 의 "@/*" 와 짝을 맞춘다. tsConfigPaths 가 있어도 SSR·Nitro 환경에서
      // 해석이 갈리는 경우가 있어 명시해 둔다.
      /*
        배열 형태를 쓴다 — 정규식 find 가 필요하기 때문이다.

        앱 빌드는 admin 이 빠진 라우트 트리를 쓴다. router.tsx 가
        "./routeTree.gen" 을 정적으로 import 하고 있어서 트리 파일만 따로 만들어
        봐야 아무도 쓰지 않는다(실제로 앱 번들에 어드민이 그대로 들어갔다).
        조건부 import 는 정적 분석 대상이라 못 쓰므로 여기서 갈아끼운다.
      */
      alias: [
        ...(forApp
          ? [
              {
                find: /^\.\/routeTree\.gen$/,
                replacement: `${process.cwd()}/src/routeTree.app.gen.ts`,
              },
            ]
          : []),
        // tsconfig 의 "@/*" 와 짝을 맞춘다. tsConfigPaths 가 있어도 SSR·Nitro
        // 환경에서 해석이 갈리는 경우가 있어 명시해 둔다.
        { find: "@", replacement: `${process.cwd()}/src` },
      ],
      // 같은 패키지가 두 벌 로드되면 React 훅과 QueryClient 컨텍스트가 깨진다.
      dedupe: [
        "react",
        "react-dom",
        "react/jsx-runtime",
        "react/jsx-dev-runtime",
        "@tanstack/react-query",
        "@tanstack/query-core",
      ],
    },

    optimizeDeps: {
      include: [
        "react",
        "react-dom",
        "react-dom/client",
        "react/jsx-runtime",
        "react/jsx-dev-runtime",
      ],
    },

    server: {
      proxy: {
        // 개발 편의: 로컬 Mailpit 의 메일함을 같은 오리진으로 노출한다.
        // 브라우저에서 127.0.0.1:55324 를 직접 호출하면 CORS 로 막히기 때문이다.
        //
        // 이건 **dev 서버 전용 설정**이다 — 프로덕션 빌드에는 vite dev server 가
        // 존재하지 않으므로 이 경로도 존재하지 않는다. 인증을 우회하는 것이 아니라
        // 실제로 발송된 코드를 읽어와 정상 검증을 태우기 위한 것이다.
        "/__dev/mail": {
          target: "http://127.0.0.1:55324",
          changeOrigin: true,
          rewrite: (path: string) => path.replace(/^\/__dev\/mail/, ""),
        },
      },
    },

    plugins,
  };
});
