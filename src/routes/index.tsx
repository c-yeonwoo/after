import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect } from "react";
import { ArrowRight } from "lucide-react";

import { BRAND } from "@/lib/brand";
import { Logo } from "@/components/Logo";
import { useMe } from "@/lib/me";
import { Button } from "@/components/ui/button";

const OG_IMAGE = `https://${BRAND.domain}/og-image.png`;

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: `${BRAND.name} — ${BRAND.tagline}` },
      { name: "description", content: BRAND.description },
      { property: "og:title", content: `${BRAND.name} — ${BRAND.tagline}` },
      { property: "og:description", content: BRAND.description },
      { property: "og:type", content: "website" },
      { property: "og:locale", content: "ko_KR" },
      /*
        카카오톡·인스타 링크 카드에 이미지가 없었다. twitter:card 는
        summary_large_image 라고 선언해 놓고 이미지를 주지 않아 선언이 어긋나 있었다.
      */
      { property: "og:image", content: OG_IMAGE },
      { property: "og:image:width", content: "1200" },
      { property: "og:image:height", content: "630" },
      { name: "twitter:card", content: "summary_large_image" },
      { name: "twitter:image", content: OG_IMAGE },
    ],
  }),
  component: Landing,
});

/*
  랜딩 — 소개장(D3) · 퇴근 동선 위의 약속(D1-B), 2026-10-10.

  예전 랜딩은 한 화면이 전부였고(스크롤 막힘, 이미지 0장) 경쟁사도 하는 두 문장
  (회사 이메일 인증 · 한 번에 한 사람)만 말했다. 회사 메일을 내기 전에 사용자가
  아는 것이 세 문장뿐이었다.

  지금은 첫 화면에 약속 하나와 시작 버튼을 두고, 스크롤하면 (1) 소개가 어떻게
  생겼는지(화면 예시) (2) 진행 세 단계 (3) 비용과 반환을 읽는다.

  쓰지 않는 말: "먼저 관심을 보낸 사람"(창업자 결정 — 구조상 전제일 뿐 문구로
  내세우지 않는다), 앞으로의 유료 가격(베타 모집 원칙, instagram-beta-launch.md),
  "만남 보장"·대기 기간 같은 근거 없는 약속.
*/
function Landing() {
  const navigate = useNavigate();
  const { me, ready } = useMe();

  // 이미 로그인한 사용자는 완료 상태에 맞는 화면으로 보낸다.
  useEffect(() => {
    if (ready && me) navigate({ to: me.onboarding_step < 7 ? "/signup" : "/home" });
  }, [ready, me, navigate]);
  function start() {
    navigate({ to: me && me.onboarding_step >= 7 ? "/home" : "/signup" });
  }

  return (
    <div className="flex h-full flex-col overflow-hidden bg-background">
      <header
        className="z-20 shrink-0 bg-background px-6 pb-3"
        style={{ paddingTop: "var(--safe-top)" }}
      >
        <div className="flex min-w-0 items-center justify-between gap-2">
          <Logo size="sm" className="min-w-0 shrink" />
          <Link
            to="/login"
            className="pressable inline-flex min-h-11 items-center rounded-control px-3 text-sm font-medium text-muted-foreground hover:bg-muted hover:text-foreground"
          >
            로그인
          </Link>
        </div>
      </header>

      <main className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-6">
        <section className="pt-7 pb-12">
          <h1 className="break-keep text-[clamp(1.875rem,8.3vw,2.25rem)] leading-[1.25] font-semibold tracking-[-0.045em] text-foreground">
            하루 끝에,
            <br />
            <span className="text-primary-strong">설레는 시작.</span>
          </h1>
          <p className="mt-4 text-[0.9375rem] leading-relaxed text-muted-foreground">
            나와 잘 맞는 직장인을 한 사람씩.
            <br />
            소개부터 만날 약속까지 함께해요.
          </p>
          <div className="mt-6 overflow-hidden rounded-[1.25rem] bg-ink">
            <img
              src="/brand/after-hours.jpg"
              alt=""
              width="768"
              height="960"
              fetchPriority="high"
              className="h-[clamp(10rem,27svh,14rem)] w-full object-cover object-bottom"
            />
          </div>
          <Button type="button" onClick={start} className="mt-6 min-h-[52px] w-full text-base">
            애프터 시작하기 <ArrowRight aria-hidden="true" />
          </Button>
          <p className="mt-3 text-center text-xs text-muted-foreground">
            무료 베타 진행 중 · 회사 이메일로 가입해요
          </p>
        </section>

        <section aria-labelledby="sample-title" className="pb-12">
          <p className="text-xs font-medium text-primary-strong">한 번에 한 사람</p>
          <h2
            id="sample-title"
            className="mt-2 text-2xl leading-snug font-semibold text-foreground"
          >
            조건 너머의 이야기를 읽어요.
          </h2>
          <SampleIntro />
        </section>

        <section aria-labelledby="steps-title" className="border-t border-border py-10">
          <h2 id="steps-title" className="text-2xl font-semibold text-foreground">
            소개에서 약속까지.
          </h2>
          <ol className="mt-5 space-y-5">
            {[
              ["나를 소개해요", "회사 이메일을 확인하고, 사진과 짧은 답변으로 나를 알려요."],
              ["한 사람씩 소개받아요", "운영팀이 확인한 소개를 읽고, 더 알아갈지 결정해요."],
              [
                "만날 시간을 정해요",
                "가까운 장소와 평일 저녁 시간을 제안하면 상대가 고를 수 있어요.",
              ],
            ].map(([title, body], i) => (
              <li key={title} className="grid grid-cols-[2rem_1fr] gap-x-3">
                <span className="flex size-8 items-center justify-center rounded-full bg-surface-subtle text-xs font-semibold text-foreground tabular-nums">
                  {String(i + 1).padStart(2, "0")}
                </span>
                <div>
                  <p className="text-base leading-snug font-semibold text-foreground">{title}</p>
                  <p className="mt-1 text-sm leading-relaxed text-muted-foreground">{body}</p>
                </div>
              </li>
            ))}
          </ol>
        </section>

        <section aria-labelledby="cost-title" className="border-t border-border py-10">
          <h2 id="cost-title" className="text-base font-semibold text-foreground">
            무료 베타 안내
          </h2>
          <p className="mt-4 text-base leading-relaxed text-foreground">
            지금은 결제를 받지 않아요.
          </p>
          <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
            소개가 도착하면 무료로 확인하고 만남을 요청할 수 있어요. 소개까지 걸리는 시간은 참여
            상황에 따라 다르고, 만남은 두 분의 선택으로 정해집니다.
          </p>
          <Button type="button" onClick={start} className="mt-7 min-h-[52px] w-full text-base">
            애프터 시작하기 <ArrowRight aria-hidden="true" />
          </Button>
          <p className="mt-3 text-center text-xs text-muted-foreground">
            회사 이메일 주소는 상대에게 공개되지 않아요.
          </p>
        </section>
        <footer
          className="border-t border-border pt-3"
          style={{ paddingBottom: "var(--safe-bottom)" }}
        >
          <nav className="flex flex-wrap items-center justify-center gap-x-1 text-xs text-muted-foreground">
            <Link
              to="/support"
              className="inline-flex min-h-11 items-center px-2 underline underline-offset-2"
            >
              고객 지원
            </Link>
            <Link
              to="/terms"
              className="inline-flex min-h-11 items-center px-2 underline underline-offset-2"
            >
              이용약관
            </Link>
            <Link
              to="/privacy"
              className="inline-flex min-h-11 items-center px-2 underline underline-offset-2"
            >
              개인정보 처리방침
            </Link>
            <Link
              to="/delete-account"
              className="inline-flex min-h-11 items-center px-2 underline underline-offset-2"
            >
              계정 삭제
            </Link>
          </nav>
        </footer>
      </main>
    </div>
  );
}

/**
 * 화면 예시 — 실제 회원이 아니다. 라벨로 분명히 밝힌다.
 * 실제 회원 문장을 쓰려면 그 회원의 동의가 필요하고, 지금은 그런 회원이 없다.
 */
function SampleIntro() {
  return (
    <figure className="mt-5 rounded-[1.25rem] border border-border bg-card px-5 pt-5 pb-6">
      <figcaption className="text-xs font-medium text-muted-foreground">
        소개 예시 · 가상의 프로필
      </figcaption>
      <p className="mt-4 text-2xl leading-[1.3] font-semibold text-foreground">
        지원 <span className="font-sans text-base font-medium text-muted-foreground">31</span>
      </p>
      <p className="mt-0.5 text-sm text-muted-foreground">회계</p>
      <blockquote className="mt-4 border-l-2 border-brand-blush pl-3.5">
        <p className="serif break-keep text-pretty text-lg leading-[1.45] text-foreground">
          퇴근하고 한강까지 뛰는 게 요즘 제일 좋아하는 시간이에요.
        </p>
      </blockquote>
      <p className="mt-4 break-keep text-pretty text-[0.9375rem] leading-[1.55] text-foreground/80">
        처음 만나는 자리라면 길게 걷기보다 가볍게 저녁을 먹으며 이야기하는 쪽이 편해요. 최근에 본
        전시 이야기를 나누고 싶어요.
      </p>
    </figure>
  );
}
