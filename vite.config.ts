// @lovable.dev/vite-tanstack-config already includes the following — do NOT add them manually
// or the app will break with duplicate plugins:
//   - TanStack devtools (dev-only, first), tanstackStart, viteReact, tailwindcss, tsConfigPaths,
//     nitro (build-only using cloudflare as a default target), VITE_* env injection, @ path alias,
//     React/TanStack dedupe, error logger plugins, and sandbox detection (port/host/strictPort).
// You can pass additional config via defineConfig({ vite: { ... }, etc... }) if needed.
import { defineConfig } from "@lovable.dev/vite-tanstack-config";

export default defineConfig({
  tanstackStart: {
    // Redirect TanStack Start's bundled server entry to src/server.ts (our SSR error wrapper).
    // nitro/vite builds from this
    server: { entry: "server" },
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
