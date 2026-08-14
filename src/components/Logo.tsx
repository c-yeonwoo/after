import { BRAND } from "@/lib/brand";
import { cn } from "@/lib/utils";

/**
 * 로고 마크 — **교체 예정 자산이다.**
 *
 * 지금은 지평선에 걸린 해다. 이름("애프터선셋")을 그림으로 그대로 설명하는
 * 구조인데, 그게 올드하게 읽히는 원인이라는 판단이 나와 새 마크를 외부에서
 * 받기로 했다. 그때까지 자리만 지킨다.
 *
 * 검토했다가 접은 것 둘 — 기록으로 남긴다:
 *   · **윤슬**(물 위의 빛) 두 줄을 아래에 깔았었다. 24px 까지는 버텼지만,
 *     이름을 그림으로 설명하는 방향 자체를 강화하는 것이라 함께 뺐다.
 *   · **누운 하트 반쪽**으로도 읽히게 만드는 안. 32px 이상에서만 겨우 읽혀
 *     파비콘 크기를 감당하지 못했다.
 *
 * currentColor 를 쓴다 — 얹히는 자리(코럴 배경의 앱 아이콘, 종이 배경의 헤더)에
 * 따라 색을 물려받아야 한다. 새 마크도 이 조건은 유지해야 한다.
 */
export function LogoMark({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 32 32"
      fill="none"
      aria-hidden="true"
      className={cn("size-7 text-primary", className)}
    >
      {/* 지평선 위로 드러난 부분만 남긴다 */}
      <clipPath id="after-horizon">
        <rect x="0" y="0" width="32" height="20.6" />
      </clipPath>
      <circle cx="12.8" cy="15.27" r="8.6" fill="currentColor" clipPath="url(#after-horizon)" />
      <path d="M3.2 20.6h25.6" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" />
    </svg>
  );
}

export function Logo({ className, size = "md" }: { className?: string; size?: "sm" | "md" }) {
  return (
    <span className={cn("flex min-w-0 items-center gap-2", className)}>
      <LogoMark className={cn("shrink-0", size === "sm" ? "size-6" : "size-7")} />
      {/*
        워드마크는 **정식 라틴 표기**다. 전에는 `after` 한 단어였는데 그건 정식명도
        약칭도 영문명도 아니었다 — 도메인은 aftersunset.kr 이고, 영어 `after` 는
        전치사라 단독으로는 이름처럼 읽히지 않는다.

        lowercase 를 걷었다. 고유명사이므로 대문자를 살린다.
      */}
      <span className={cn("wordmark truncate", size === "sm" ? "text-lg" : "text-xl")}>
        {BRAND.nameEn}
      </span>
    </span>
  );
}
