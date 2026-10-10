import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect } from "react";

import { BRAND, COVERAGE_LABEL } from "@/lib/brand";
import { Logo } from "@/components/Logo";
import { useMe } from "@/lib/me";

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
            className="inline-flex min-h-11 items-center rounded-full px-3 text-sm font-semibold text-foreground underline underline-offset-4"
          >
            로그인
          </Link>
        </div>
      </header>

      <main className="min-h-0 flex-1 overflow-y-auto px-6">
        <section className="flex min-h-[calc(100svh-14rem)] flex-col justify-center pt-6 pb-10">
          <p className="text-sm font-medium text-muted-foreground">{COVERAGE_LABEL} 직장인 소개</p>
          <h1 className="serif mt-4 text-[clamp(2rem,9.6vw,2.5rem)] leading-[1.28] font-bold text-foreground">
            퇴근 후,
            <br />한 사람과의 약속.
          </h1>
          <p className="mt-5 text-[1.0625rem] leading-[1.65] text-foreground">
            회사 근처, 평일 저녁.
            <br />한 사람을 소개하고, 만날 약속까지 함께 정해요.
          </p>
          <button
            type="button"
            onClick={start}
            className="mt-8 flex min-h-[52px] w-full items-center justify-center rounded-control bg-primary px-4 text-base font-semibold text-primary-foreground transition-colors hover:opacity-90 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
          >
            가입하고 시작하기
          </button>
          <p className="mt-3 text-center text-sm text-muted-foreground">
            회사 이메일 주소는 상대에게 공개되지 않아요.
          </p>
        </section>

        <section aria-labelledby="sample-title" className="pb-12">
          <h2 id="sample-title" className="text-base font-semibold text-foreground">
            소개는 이렇게 도착해요
          </h2>
          <SampleIntro />
        </section>

        <section aria-labelledby="steps-title" className="border-t border-border py-10">
          <h2 id="steps-title" className="text-base font-semibold text-foreground">
            이렇게 진행돼요
          </h2>
          <ol className="mt-5 space-y-5">
            {[
              [
                "회사 이메일과 휴대폰으로 확인하고, 소개장을 써요.",
                "사진 세 장을 올리고 짧은 질문 네 개에 답하면, 그 문장으로 소개장 초안을 함께 다듬어요.",
              ],
              [
                "한 번에 한 사람의 소개가 도착해요.",
                "운영팀이 확인한 소개를 한 분씩 천천히 읽어요. 넘기는 피드는 없어요.",
              ],
              [
                "회사 근처 평일 저녁으로 약속을 정해요.",
                "약속이 확정되면 대화가 열려요. 채팅만 하다 흐지부지되지 않게요.",
              ],
            ].map(([title, body], i) => (
              <li key={title} className="grid grid-cols-[1.75rem_1fr] gap-x-2">
                <span className="serif text-lg leading-[1.4] font-bold text-primary-strong">
                  {i + 1}
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
            비용과 반환
          </h2>
          <ul className="mt-4 space-y-3 text-base leading-relaxed text-foreground">
            <li>지금은 무료 베타예요. 결제를 받지 않아요.</li>
            <li>
              만남을 요청했는데 상대가 거절하거나 24시간 안에 답하지 않으면, 쓰신 만남 티켓을
              돌려드려요.
            </li>
            <li>
              만남이나 기간을 보장하지는 않아요. 소개는 참여하는 분들과 서로의 선택에 따라 와요.
            </li>
          </ul>
        </section>
      </main>

      <footer
        className="z-10 shrink-0 border-t border-border bg-background px-6 pt-3"
        style={{ paddingBottom: "calc(var(--safe-bottom) + 0.5rem)" }}
      >
        <nav className="flex items-center justify-center gap-1 text-sm text-muted-foreground">
          <Link
            to="/support"
            className="inline-flex min-h-11 items-center px-2 underline underline-offset-2"
          >
            고객 지원
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
    </div>
  );
}

/**
 * 화면 예시 — 실제 회원이 아니다. 라벨로 분명히 밝힌다.
 * 실제 회원 문장을 쓰려면 그 회원의 동의가 필요하고, 지금은 그런 회원이 없다.
 */
function SampleIntro() {
  return (
    <figure className="mt-4 rounded-surface border border-border bg-card p-5 shadow-card">
      <p className="text-xs font-medium text-muted-foreground">화면 예시 · 실제 회원이 아니에요</p>
      <p className="serif mt-4 text-2xl leading-[1.3] font-bold text-foreground">
        지원 <span className="font-sans text-base font-medium text-muted-foreground">31</span>
      </p>
      <p className="mt-0.5 text-sm text-muted-foreground">회계 · {COVERAGE_LABEL}</p>
      <blockquote className="relative mt-5 pl-6">
        <span
          aria-hidden="true"
          className="serif absolute top-[-0.3rem] left-0 text-[2rem] leading-none text-primary-strong"
        >
          “
        </span>
        <p className="serif text-lg leading-[1.5] text-foreground">
          퇴근하고 한강까지 뛰는 게 요즘 제일 좋아하는 시간이에요.
        </p>
      </blockquote>
      <p className="serif mt-4 text-base leading-[1.8] text-foreground">
        처음 만나는 자리라면 길게 걷기보다 가볍게 저녁을 먹으며 이야기하는 쪽이 편해요. 최근에 본
        전시 이야기를 나누고 싶어요.
      </p>
    </figure>
  );
}
