import type { ReactNode } from "react";

/**
 * 모바일 전용 뷰 셸.
 * 넓은 화면에서도 앱은 항상 모바일 폭(최대 430px)으로 중앙 정렬됩니다.
 *
 * 높이를 뷰포트에 못박고 넘침을 잘라낸다 — 문서가 스크롤되지 않아야 각 화면이
 * "상하단 바 고정 + 본문만 스크롤" 프레임을 만들 수 있다(styles.css 참고).
 */
export function MobileFrame({ children }: { children: ReactNode }) {
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
      <div className="relative h-full w-full max-w-[430px] overflow-hidden bg-background shadow-frame">
        {children}
      </div>
    </div>
  );
}
