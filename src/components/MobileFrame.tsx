import type { ReactNode } from "react";
import { useRouterState } from "@tanstack/react-router";

import { cn } from "@/lib/utils";

/**
 * 가입을 마치기 전의 동선. 이 화면들은 **테마와 무관하게 자두 밤**이다.
 *
 * ── 왜 라우트로 정하나 ──
 * 세션 유무로 정하면 두 군데서 어긋난다. 가입 4단계(회사 메일 인증)에서 계정이
 * 이미 만들어지므로 그 순간 색이 뒤집히고, 콜드 스타트에서는 세션을 읽기 전까지
 * 한 프레임 동안 잘못된 배경이 깜빡인다. 라우트는 첫 렌더에 이미 정해져 있다.
 */
const PRE_MEMBER_ROUTES = new Set(["/", "/login", "/signup"]);

/**
 * 모바일 전용 뷰 셸.
 * 넓은 화면에서도 앱은 항상 모바일 폭(최대 430px)으로 중앙 정렬됩니다.
 *
 * 높이를 뷰포트에 못박고 넘침을 잘라낸다 — 문서가 스크롤되지 않아야 각 화면이
 * "상하단 바 고정 + 본문만 스크롤" 프레임을 만들 수 있다(styles.css 참고).
 *
 * ── 배경 전환은 딱 한 번만 일어난다 ──
 * 예전에는 랜딩·로그인만 자두 밤이고 가입부터 테마를 따랐다. 그래서 밝은 테마
 * 사용자는 랜딩(어두움) → 가입(밝음) 에서 색이 뒤집혔는데, **그 지점이 아무
 * 의미가 없었다** — 같은 흐름의 연속이다. (원래 이유는 팔레트가 두 벌이라 섞을
 * 수 없어서였고, 자두→로즈 한 계열로 통일하면서 그 이유가 사라졌다.)
 *
 * 이제 가입을 마칠 때 한 번만 바뀐다. "밖 → 안" 이라는 뜻이 생기고, 가입을
 * 끝낸 것이 밝아지는 보상처럼 읽힌다.
 */
export function MobileFrame({ children }: { children: ReactNode }) {
  const { pathname, editing } = useRouterState({
    select: (s) => ({
      pathname: s.location.pathname,
      /*
        `/signup?edit=1` 은 **로그인한 회원이 프로필을 고치는** 화면이다. 가입
        화면과 라우트를 공유하지만 이미 "안" 에 있는 사람이므로 테마를 따른다.
      */
      editing: (s.location.search as { edit?: unknown }).edit != null,
    }),
  });

  const preMember = PRE_MEMBER_ROUTES.has(pathname) && !editing;

  return (
    <div
      className="flex justify-center overflow-hidden bg-muted/40"
      /*
        키보드가 차지하는 만큼 프레임 자체를 줄인다. Keyboard.resize 를 none 으로
        둬서 웹뷰는 그대로이므로(capacitor.config.ts), 가려지는 영역을 여기서
        걷어내야 입력창이 키보드 위로 올라온다. 웹에서는 --keyboard-height 가
        0 이라 그냥 100dvh 다.
      */
      style={{ height: "calc(100dvh - var(--keyboard-height))" }}
    >
      <div
        className={cn(
          "relative h-full w-full max-w-[430px] overflow-hidden bg-background shadow-frame",
          preMember && "brand-surface",
        )}
      >
        {children}
      </div>
    </div>
  );
}
