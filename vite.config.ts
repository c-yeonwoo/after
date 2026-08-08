// @lovable.dev/vite-tanstack-config already includes the following — do NOT add them manually
// or the app will break with duplicate plugins:
//   - TanStack devtools (dev-only, first), tanstackStart, viteReact, tailwindcss, tsConfigPaths,
//     nitro (build-only using cloudflare as a default target), VITE_* env injection, @ path alias,
//     React/TanStack dedupe, error logger plugins, and sandbox detection (port/host/strictPort).
// You can pass additional config via defineConfig({ vite: { ... }, etc... }) if needed.
import { defineConfig } from "@lovable.dev/vite-tanstack-config";

/**
 * 빌드 타깃이 둘이다.
 *
 *   npm run build      웹 — Nitro(Cloudflare Workers). SSR 로 HTML 을 런타임에 만든다.
 *   npm run build:app  앱 — SPA 셸. Capacitor 가 번들할 정적 dist/ 를 만든다.
 *
 * 나눈 이유: Capacitor 는 webDir 의 정적 index.html 을 읽는데 Nitro 빌드는
 * .output/ 에 진입점 HTML 이 없다(서버가 런타임에 만드니까). 그렇다고 웹까지
 * SPA 로 내리면 랜딩의 SEO 를 버리게 된다 — 랜딩은 로그인 전 화면이라
 * SSR 이 실제로 값을 한다.
 *
 * 앱 쪽에서 SSR 을 잃는 대가는 작다. 로그인 뒤 화면은 전부 개인화된 데이터라
 * 서버가 미리 그릴 것이 거의 없고, 셸은 __root 의 shellComponent(RootShell)가
 * 이미 담당하고 있었다.
 *
 * 원격 URL 로드(Capacitor server.url)도 가능하지만 고르지 않았다 — 앱이 사실상
 * 웹뷰 껍데기가 되어 App Store 심사 4.2(최소 기능)에 걸릴 위험이 크고,
 * 네트워크가 없으면 첫 화면조차 안 뜬다.
 */
const forApp = process.env.BUILD_TARGET === "app";

export default defineConfig({
  // 앱 빌드에서는 배포 플러그인을 끈다. 켜 두면 출력이 .output/ 로 가는데
  // TanStack Start 의 프리렌더러는 dist/server/server.js 를 찾기 때문에
  // "Cannot find module .../dist/server/server.js" 로 프리렌더가 통째로 죽는다.
  nitro: forApp ? false : undefined,

  tanstackStart: {
    // Redirect TanStack Start's bundled server entry to src/server.ts (our SSR error wrapper).
    // nitro/vite builds from this
    server: { entry: "server" },

    // 셸 파일명을 index.html 로 바꾼다. 기본값 "/_shell" 은 웹 서버가 미지의
    // 경로를 셸로 넘겨주는 구성을 전제한 이름인데, Capacitor 는 webDir 에서
    // index.html 을 직접 연다 — 이름이 다르면 빈 화면이 뜬다.
    ...(forApp ? { spa: { enabled: true, prerender: { outputPath: "/index" } } } : {}),
  },
  vite: {
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
          rewrite: (path) => path.replace(/^\/__dev\/mail/, ""),
        },
      },
    },
  },
});
