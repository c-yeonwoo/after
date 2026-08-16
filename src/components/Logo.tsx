import { useId } from "react";

import { BRAND } from "@/lib/brand";
import { cn } from "@/lib/utils";

/**
 * 로고 마크 — 같은 크기의 원 둘. 하나는 채워져 있고 하나는 열려 있다.
 *
 * ── 무엇을 그린 것인가 ──
 * 이름을 그림으로 설명하지 않는다. 앞선 마크(지평선에 걸린 해)가 올드하게 읽힌
 * 이유가 그것이었다 — "이클립스" 을 해와 지평선으로 받아 적은 구조였다.
 *
 * 대신 이 서비스가 하는 일을 그린다. 한 번에 **한 사람만** 소개하고(원 둘, 그
 * 이상 없음), 그중 한 사람은 **아직 열리지 않았다**(윤곽만). 사선으로 놓아
 * 하나는 내려가고 하나는 올라오게 했다 — 저녁이라는 시간을 해를 그리지 않고
 * 리듬으로만 남긴 자리다.
 *
 * ── 왜 면 + 선인가 ──
 * 후보를 실제 크기로 렌더해 비교했다(16·20·24·32·56px, 명/암, 코럴 타일).
 *   · 윤곽 원 둘: 16px 에서 두 링이 붙어 뭉갠다. 앞서 접은 "누운 하트" 와 같은 실패.
 *   · 면 둘: 16px 에서 이음선이 사라져 땅콩 하나로 읽힌다.
 *   · **면 하나 + 링 하나**: 두 요소의 성격이 달라 작아져도 둘로 읽힌다.
 * 질량과 선을 대비시키는 것이 같은 것 둘을 나란히 두는 것보다 작은 크기에서
 * 강하다 — 이 마크의 형태를 결정한 관찰이다.
 *
 * 겹치는 자리는 mask 로 잘라 이음선을 만든다. 링을 그냥 얹으면 채운 원과 붙어
 * 한 덩이가 된다.
 *
 * currentColor 를 쓴다 — 얹히는 자리(코럴 배경의 앱 아이콘, 종이 배경의 헤더)에
 * 따라 색을 물려받아야 한다.
 *
 * ⚠️ 파비콘은 이 파일이 아니라 public/favicon.svg 가 따로 들고 있다. 16px 타일
 * 안에서는 마크가 10px 남짓으로 들어가 링이 버티지 못해서, 그쪽은 링을 더 두껍게
 * 뽑은 별도 자산이다. 이 마크를 고치면 그 파일도 함께 고쳐야 한다.
 */
export function LogoMark({ className }: { className?: string }) {
  // 한 화면에 마크가 둘 이상 있을 수 있다(헤더 + 푸터). id 가 겹치면 mask 참조가
  // 먼저 정의된 쪽으로 몰린다.
  const maskId = `logo-seam-${useId()}`;

  return (
    <svg
      viewBox="0 0 32 32"
      fill="none"
      aria-hidden="true"
      className={cn("size-7 text-primary", className)}
    >
      {/* 채운 원보다 조금 크게 파서 두 원 사이에 빈 틈을 남긴다 */}
      <mask id={maskId}>
        <rect width="32" height="32" fill="#fff" />
        <circle cx="12.2" cy="19.8" r="9.2" fill="#000" />
      </mask>
      <circle
        cx="19.8"
        cy="12.2"
        r="7.4"
        stroke="currentColor"
        strokeWidth="3.2"
        mask={`url(#${maskId})`}
      />
      <circle cx="12.2" cy="19.8" r="7.8" fill="currentColor" />
    </svg>
  );
}

export function Logo({ className, size = "md" }: { className?: string; size?: "sm" | "md" }) {
  return (
    <span className={cn("flex min-w-0 items-center gap-2", className)}>
      <LogoMark className={cn("shrink-0", size === "sm" ? "size-6" : "size-7")} />
      {/*
        워드마크는 **정식 라틴 표기**다. 전에는 `after` 한 단어였는데 그건 정식명도
        약칭도 영문명도 아니었다 — 도메인은 eclps.kr 이고, 영어 `after` 는
        전치사라 단독으로는 이름처럼 읽히지 않는다.

        lowercase 를 걷었다. 고유명사이므로 대문자를 살린다.
      */}
      <span className={cn("wordmark truncate", size === "sm" ? "text-lg" : "text-xl")}>
        {BRAND.nameEn}
      </span>
    </span>
  );
}
