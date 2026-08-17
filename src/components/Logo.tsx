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
      className={cn("size-7 text-primary-strong", className)}
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
    <span
      className={cn(
        "wordmark inline-flex min-w-0 items-baseline whitespace-nowrap",
        size === "sm" ? "text-2xl" : "text-3xl",
        className,
      )}
      /*
        스크린리더에는 한국어 정식명을 준다. 안에 들어 있는 글자는 `eclıpse`
        (점 없는 i)라 그대로 읽히면 이상하고, 마크는 aria-hidden 이다.
      */
      aria-label={BRAND.name}
      role="img"
    >
      {/*
        ── 워드마크 ──
        마크를 옆에 세우지 않는다. **i 의 점이 마크다.**

        전에는 [마크] + "Eclipse" 였다. 마크와 글자가 각자 서 있어서 둘의 관계를
        읽는 사람이 만들어야 했고, 워드마크 자체는 폰트를 깐 것 이상이 아니었다.
        점 자리에 마크를 얹으면 이름 안에 일식이 한 번 더 들어가고, 어떤 서체를
        쓰더라도 이 조합은 우리 것이 된다.

        `ı`(U+0131, 점 없는 i)를 쓴다 — 일반 `i` 를 두고 점을 가리는 것보다,
        애초에 점이 없는 글자를 쓰는 편이 서체가 바뀌어도 안전하다.
      */}
      <span aria-hidden="true">ecl</span>
      <span className="relative inline-block" aria-hidden="true">
        {"\u0131"}
        {/*
          점의 위치·크기는 em 으로 잡는다. 워드마크가 18px 로도 48px 로도 쓰이므로
          px 로 두면 한쪽에서 어긋난다. 값은 Fraunces 의 어센더 높이에 맞춘 실측.
        */}
        {/*
          점만 브랜드 색을 쓴다(LogoMark 의 기본값 = primary-strong). 글자는 주변
          색을 물려받는다 — 랜딩에서는 흰 글자 + 분홍 점, 밝은 화면에서는 잉크
          글자 + 진한 로즈 점이 된다. 일식이 이름 안에서 빛나는 자리다.
        */}
        <LogoMark className="absolute bottom-[0.78em] left-1/2 size-[0.42em] -translate-x-1/2" />
      </span>
      <span aria-hidden="true">pse</span>
    </span>
  );
}
