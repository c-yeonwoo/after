import { cn } from "@/lib/utils";

/**
 * 애프터 로고.
 *
 * 해가 지평선에 걸리고, 지평선은 오른쪽으로 이어진다 — 하루가 끝난 **다음**
 * 장면. 브랜드 이름과 태그라인("퇴근 후, 하루의 다음 장면에서 만나는 사람")이
 * 말하는 것을 그대로 그린 것이고, 코럴(#c72b10)이 원래 노을색이라 색과 형태가
 * 같은 이야기를 한다.
 *
 * 이전 마크는 겹친 두 원이었다. 소개팅 앱에서 가장 흔한 은유인 데다 반투명
 * 도형 셋이 겹쳐 16~24px 에서 얼룩으로 뭉갰다(여러 크기로 나란히 렌더해 확인한
 * 뒤 교체). 지금은 도형 둘·단색이라 파비콘 크기까지 형태가 남는다.
 *
 * 좌우 비대칭이 의도다. 해가 왼쪽에 있고 선이 오른쪽으로 더 길게 나가면
 * "지고 난 뒤에도 이어진다"가 되는데, 대칭으로 두면 모자처럼 정적으로 읽혔다.
 *
 * currentColor 를 쓴다 — 얹히는 자리(코럴 배경의 앱 아이콘, 종이 배경의 헤더)에
 * 따라 색을 물려받아야 한다.
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
      <span className={cn("wordmark truncate lowercase", size === "sm" ? "text-lg" : "text-xl")}>
        after
      </span>
    </span>
  );
}
