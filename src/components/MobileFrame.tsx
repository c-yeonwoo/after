import type { ReactNode } from "react";

/**
 * 모바일 전용 뷰 셸.
 * 넓은 화면에서도 앱은 항상 모바일 폭(최대 430px)으로 중앙 정렬됩니다.
 */
export function MobileFrame({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-screen justify-center bg-muted/40">
      <div className="relative w-full max-w-[430px] bg-background shadow-[0_0_60px_-20px_rgba(0,0,0,0.6)]">
        {children}
      </div>
    </div>
  );
}
