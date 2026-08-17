import { useEffect, useRef, type ReactNode } from "react";
import { Link, useRouterState } from "@tanstack/react-router";
import { ArrowLeft, Heart, Home, MessageCircle, User } from "lucide-react";

import { Logo } from "@/components/Logo";
import { cn } from "@/lib/utils";

/**
 * 탭 라벨은 성별과 무관하게 "소개" 하나로 둔다.
 * 여성은 소개받은 사람을 평가하고 남성은 소개받은 한 사람을 읽는다 — 하는 일은
 * 다르지만 둘 다 "소개"가 대상이라 라벨을 나눌 만큼의 차이는 아니었다.
 */
const TABS = [
  { to: "/home", label: "홈", icon: Home },
  { to: "/intro", label: "소개", icon: Heart },
  { to: "/chats", label: "대화", icon: MessageCircle },
  { to: "/me", label: "나", icon: User },
] as const;

/**
 * 앱 화면의 공통 프레임.
 *
 * 높이를 뷰포트에 못박고 **본문만 스크롤한다.** 헤더와 탭바는 흐름 안에 있고
 * 움직이지 않는다 — sticky/fixed 가 아니다.
 *
 * 원래는 문서 전체가 스크롤되고 헤더가 sticky 였는데, iOS 에서 두 가지가 깨졌다.
 * 본문이 반투명 헤더 뒤로 지나가 상태바까지 비쳤고, 키보드가 뜰 때 WKWebView 가
 * 문서를 밀어 올려 헤더가 시계와 겹쳤다. 스크롤 주체를 본문으로 내리면 둘 다
 * 구조적으로 불가능해진다.
 */
export function AppScreen({
  title,
  action,
  children,
  hideTabs,
  /**
   * 본문의 스크롤을 **자식에게 넘긴다.**
   * 대화방처럼 "로그만 스크롤 + 입력창 고정"을 자식이 직접 짜야 하는 화면용.
   * 기본값은 본문이 통째로 스크롤되는 일반형이다.
   */
  fill,
  /**
   * 탭 루트가 아닌 화면에는 항상 돌아갈 길을 준다.
   * 히스토리 대신 **명시적 경로**를 받는다 — 딥링크나 새로고침으로 들어온 경우
   * history.back() 은 앱 밖으로 나가버린다.
   */
  back,
  /**
   * 본문 아래·탭바 위에 고정되는 행동 영역(주요 CTA 등).
   *
   * 화면이 각자 `fixed bottom-0` 으로 깔면 탭바와 높이를 맞추느라 여백을
   * 손으로 계산하게 되고, 실제로 소개 화면에서 버튼과 탭바 사이가 6.3pt 까지
   * 좁아져 오탭이 났다. 흐름 안의 슬롯으로 두면 간격이 계산이 아니라 배치가 된다.
   */
  footer,
}: {
  title?: string;
  action?: ReactNode;
  children: ReactNode;
  hideTabs?: boolean;
  fill?: boolean;
  back?: string;
  footer?: ReactNode;
}) {
  const pathname = useRouterState({ select: (s) => s.location.pathname });

  /*
    화면이 바뀌면 **본문을 맨 위로 되돌린다.**

    AppScreen 은 모든 탭·하위 화면이 함께 쓰는 껍데기라, 라우트가 바뀌어도
    React 는 이 `<main>` DOM 노드를 재사용한다. 그래서 앞 화면에서 스크롤한
    위치가 그대로 남아, 다음 화면이 중간부터 열린다 — 환경설정에 들어갔더니
    첫 줄이 반쯤 잘린 채 시작하는 상태를 실기기에서 그대로 봤다.

    라우터의 scrollRestoration 은 여기에 닿지 않는다. 그건 문서 스크롤(혹은
    등록된 스크롤러)을 다루는데, 이 앱에서 스크롤하는 건 문서가 아니라 이
    요소다. 네이티브 화면 전환은 항상 맨 위에서 시작하므로 그 쪽에 맞춘다.
  */
  const mainRef = useRef<HTMLElement>(null);
  useEffect(() => {
    /*
      다음 프레임에 한 번 더 되돌린다.

      effect 안에서 한 번만 하면 **브라우저·라우터가 나중에 스크롤을 복원해**
      덮어쓴다. 실기기에서 환경설정이 두 번째 방문부터 중간에서 열렸고, 원인이
      이 순서였다. rAF 로 한 프레임 뒤에 한 번 더 하면 우리 쪽이 마지막이 된다.
    */
    const reset = () => mainRef.current?.scrollTo({ top: 0 });
    reset();
    const raf = requestAnimationFrame(reset);
    return () => cancelAnimationFrame(raf);
  }, [pathname]);

  return (
    <div
      className="flex h-full flex-col overflow-hidden bg-background"
      /*
        탭바도 footer 도 없는 화면은 마지막 자식이 화면 밑변에 그대로 닿는다
        — 홈 인디케이터 자리를 여기서 비워 준다. 탭바·footer 가 있으면 그쪽이
        이미 var(--safe-bottom) 을 들고 있으므로 겹쳐 넣지 않는다.
      */
      style={hideTabs && !footer ? { paddingBottom: "var(--safe-bottom)" } : undefined}
    >
      <header
        className="z-20 shrink-0 bg-background pb-3"
        style={{
          paddingTop: "var(--safe-top)",
          paddingLeft: "max(env(safe-area-inset-left, 0px), 1.5rem)",
          paddingRight: "max(env(safe-area-inset-right, 0px), 1.5rem)",
        }}
      >
        <div className="flex min-w-0 items-center gap-2">
          {back ? (
            <Link
              to={back}
              aria-label="뒤로"
              className="-ml-2 inline-flex size-11 shrink-0 items-center justify-center rounded-full text-foreground transition-colors hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
            >
              <ArrowLeft className="size-5" aria-hidden="true" />
            </Link>
          ) : null}
          {title ? (
            <h1 className="headline min-w-0 flex-1 truncate text-xl">{title}</h1>
          ) : (
            <Logo size="sm" className="min-w-0 flex-1 shrink" />
          )}
          {action}
        </div>
      </header>

      <main
        ref={mainRef}
        className={cn(
          "mx-auto w-full min-h-0 flex-1 px-6 pt-1",
          // 스크롤하는 유일한 지점. overscroll-contain 은 본문 끝에서 더 당겼을 때
          // 스크롤이 문서로 새어 나가는 것을 막는다.
          fill ? "flex flex-col" : "overflow-y-auto overscroll-contain",
        )}
        style={fill ? undefined : { paddingBottom: "1.5rem" }}
      >
        {children}
      </main>

      {footer ? (
        <div
          className="z-30 shrink-0 border-t border-border/70 bg-background px-6 pt-3"
          /*
            탭바와의 간격. 0.75rem 이면 실측 12.3pt 라 대화 화면 입력창(15.3pt)
            보다 좁았다 — 티켓을 쓰는 자리라 더 후하게 둔다.
          */
          style={{ paddingBottom: hideTabs ? "calc(var(--safe-bottom) + 0.5rem)" : "1rem" }}
        >
          {footer}
        </div>
      ) : null}

      {hideTabs ? null : (
        <nav
          className="z-30 shrink-0 border-t-2 border-foreground/10 bg-background"
          style={{ paddingBottom: "var(--safe-bottom)" }}
          aria-label="주요 메뉴"
        >
          <ul className="flex items-stretch">
            {TABS.map((t) => {
              const active = pathname === t.to || pathname.startsWith(`${t.to}/`);
              const Icon = t.icon;
              return (
                <li key={t.to} className="flex-1">
                  <Link
                    to={t.to}
                    aria-current={active ? "page" : undefined}
                    className={cn(
                      "flex min-h-14 flex-col items-center justify-center gap-1 pt-2 text-2xs font-semibold transition-colors",
                      "focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none",
                      active ? "text-primary-strong" : "text-muted-foreground",
                    )}
                  >
                    <Icon className="size-5" aria-hidden="true" strokeWidth={active ? 2.6 : 1.9} />
                    {t.label}
                  </Link>
                </li>
              );
            })}
          </ul>
        </nav>
      )}
    </div>
  );
}
