import js from "@eslint/js";
import eslintPluginPrettier from "eslint-plugin-prettier/recommended";
import globals from "globals";
import reactHooks from "eslint-plugin-react-hooks";
import reactRefresh from "eslint-plugin-react-refresh";
import tseslint from "typescript-eslint";

export default tseslint.config(
  {
    ignores: [
      "dist",
      ".output",
      ".vinxi",
      // 생성 파일 — 포맷을 고쳐도 재생성 때마다 되돌아간다.
      // database.types.ts: `supabase gen types typescript --local`
      // routeTree.gen.ts:  TanStack Router 파일 기반 라우팅
      "src/lib/database.types.ts",
      "src/routeTree.gen.ts",
      // 워크트리는 레포 안에 소스 사본을 통째로 만든다. 지우기 전까지 eslint 가
      // 그 사본까지 검사해서 lint 가 빨갛게 뜬다(실제로 1,255건이 떴다).
      // .gitignore 에는 이미 있지만 eslint 는 그걸 읽지 않는다.
      ".claude/**",
      /*
        Capacitor 가 만드는 네이티브 프로젝트. `cap sync` 가 빌드된 웹 자산을
        ios/App/App/public/ 으로 복사하기 때문에, 여기를 검사하면 **미니파이된
        번들**에 prettier 규칙을 걸어 248건이 떴다(실제로 그렇게 떴다).
        ios/.gitignore 에는 이미 있지만 eslint 는 그걸 읽지 않는다 —
        위의 워크트리와 같은 함정이다.
      */
      "ios/**",
    ],
  },
  {
    extends: [js.configs.recommended, ...tseslint.configs.recommended],
    files: ["**/*.{ts,tsx}"],
    languageOptions: {
      ecmaVersion: 2020,
      globals: globals.browser,
    },
    plugins: {
      "react-hooks": reactHooks,
      "react-refresh": reactRefresh,
    },
    rules: {
      ...reactHooks.configs.recommended.rules,
      "no-restricted-imports": [
        "error",
        {
          paths: [
            {
              name: "server-only",
              message:
                "TanStack Start does not use the Next.js `server-only` package. Rename the module to `*.server.ts` or mark it with `@tanstack/react-start/server-only`.",
            },
          ],
        },
      ],
      "react-refresh/only-export-components": ["warn", { allowConstantExport: true }],
      "@typescript-eslint/no-unused-vars": "off",
    },
  },
  eslintPluginPrettier,
  {
    // src/components/ui/* 는 shadcn 원본을 그대로 들여온 코드다.
    // 컴포넌트와 cva variants 를 한 파일에서 함께 export 하는 게 upstream 의
    // 의도된 패턴(`export { Button, buttonVariants }`)이라 이 규칙은 영구히
    // 만족시킬 수 없다. 우리가 작성·수정하는 파일이 아니므로 규칙을 끈다 —
    // 고칠 수 없는 경고가 남아 있으면 lint 출력을 무시하는 습관이 생긴다.
    files: ["src/components/ui/**/*.{ts,tsx}"],
    rules: {
      "react-refresh/only-export-components": "off",
    },
  },
);
