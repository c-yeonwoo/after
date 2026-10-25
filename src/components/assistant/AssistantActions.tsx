import { Link, useRouterState } from "@tanstack/react-router";
import { ArrowUpRight } from "lucide-react";
import { visibleAssistantActions, type AssistantAction } from "@/lib/assistantExperience";

const style =
  "assistant-suggestion inline-flex min-h-11 items-center gap-1.5 text-sm font-semibold";
export function AssistantActions({
  actions,
  counterpartId,
}: {
  actions: AssistantAction[];
  counterpartId?: string | null;
}) {
  const pathname = useRouterState({ select: (state) => state.location.pathname });
  const visibleActions = visibleAssistantActions(actions, pathname, counterpartId);
  if (visibleActions.length === 0) return null;

  return (
    <div className="mt-3 flex flex-wrap gap-2">
      {visibleActions.map((action) => {
        const content = (label: string) => (
          <>
            {label}
            <ArrowUpRight className="size-4" aria-hidden="true" />
          </>
        );
        switch (action) {
          case "account":
            return (
              <Link key={action} className={style} to="/signup" search={{ prepare: true }}>
                {content("준비 이어가기")}
              </Link>
            );
          case "profile":
            return (
              <Link key={action} className={style} to="/profile">
                {content("내 프로필 보기")}
              </Link>
            );
          case "edit":
            return (
              <Link key={action} className={style} to="/signup" search={{ edit: true }}>
                {content("프로필 수정하기")}
              </Link>
            );
          case "intro":
            return (
              <Link key={action} className={style} to="/intro">
                {content("소개 확인하기")}
              </Link>
            );
          case "meeting":
            return (
              <Link key={action} className={style} to="/ticket">
                {content("만남 요청 확인")}
              </Link>
            );
          case "store":
            return (
              <Link key={action} className={style} to="/store">
                {content("티켓·가격 확인")}
              </Link>
            );
          case "schedule":
            return (
              <Link key={action} className={style} to="/assistant-schedule">
                {content("비서와 일정 정리")}
              </Link>
            );
          case "availability":
            return (
              <Link key={action} className={style} to="/availability">
                {content("가능한 시간 보기")}
              </Link>
            );
          case "requests":
            return (
              <Link key={action} className={style} to="/requests">
                {content("도착한 요청 보기")}
              </Link>
            );
          case "appointments":
            return (
              <Link key={action} className={style} to="/chats">
                {content("약속 상세 보기")}
              </Link>
            );
          case "memory":
            return (
              <Link key={action} className={style} to="/assistant" search={{ panel: "memory" }}>
                {content("기억 관리")}
              </Link>
            );
          case "support":
            return (
              <Link key={action} className={style} to="/support">
                {content("고객센터")}
              </Link>
            );
          case "home":
            return (
              <Link key={action} className={style} to="/home">
                {content("홈에서 확인")}
              </Link>
            );
          case "prepare":
            return counterpartId ? (
              <Link
                key={action}
                className={style}
                to="/conversation-prep"
                search={{ target: counterpartId }}
              >
                {content("대화 준비하기")}
              </Link>
            ) : null;
        }
      })}
    </div>
  );
}
