import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect } from "react";
import { ArrowRight, CalendarCheck, Check, MessageCircle, Sparkles } from "lucide-react";

import { AppScreen } from "@/components/app/AppScreen";
import { Button } from "@/components/ui/button";
import { BRAND, HUBS } from "@/lib/brand";
import { getCandidate } from "@/lib/candidates";
import { useFlow, useMe } from "@/lib/store";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/home")({
  head: () => ({
    meta: [
      { title: `홈 — ${BRAND.name}` },
      {
        name: "description",
        content: "오늘의 소개 상태와 다음 단계를 한 화면에서 확인합니다.",
      },
      { property: "og:title", content: `홈 — ${BRAND.name}` },
      { property: "og:description", content: "소개 도착 · 채팅 오픈 · 만남 확정까지의 진행 상황." },
    ],
  }),
  component: HomePage,
});

const STEPS = [
  { id: "intro", label: "소개 도착" },
  { id: "answer", label: "서로 확인" },
  { id: "chat", label: "채팅 오픈" },
  { id: "meet", label: "만남 확정" },
] as const;

function HomePage() {
  const { me, ready } = useMe();
  const { flow } = useFlow();
  const navigate = useNavigate();

  useEffect(() => {
    if (ready && !me) navigate({ to: "/onboarding" });
  }, [ready, me, navigate]);

  const candidate = flow.introId ? getCandidate(flow.introId) : null;
  const hub = HUBS.find((h) => h.id === me?.hubId);

  const doneIndex = flow.meetupAt ? 3 : flow.chatOpen ? 2 : flow.myAnswer ? 1 : 0;

  return (
    <AppScreen>
      <p className="mt-4 text-sm text-muted-foreground">
        {hub?.label ?? "테헤란로·역삼권"}
      </p>
      <h1 className="mt-1 text-2xl leading-snug font-semibold tracking-tight">
        {me?.basics.name ? `${me.basics.name}님,` : "안녕하세요,"}
        <br />
        {flow.meetupAt
          ? "만남이 잡혔어요."
          : flow.chatOpen
            ? "대화가 열렸어요."
            : flow.myAnswer === "pass"
              ? "다음 소개를 준비하고 있어요."
              : candidate
                ? "오늘 소개가 도착했어요."
                : "곧 소개를 보내드릴게요."}
      </h1>

      {/* 진행 단계 */}
      <ol className="mt-6 flex items-center gap-1.5" aria-label="진행 단계">
        {STEPS.map((s, i) => (
          <li key={s.id} className="flex-1">
            <div
              className={cn(
                "h-1 rounded-full transition-colors",
                i <= doneIndex ? "bg-primary" : "bg-muted",
              )}
            />
            <p
              className={cn(
                "mt-2 text-[0.65rem]",
                i <= doneIndex ? "font-medium text-primary-strong" : "text-muted-foreground",
              )}
            >
              {s.label}
            </p>
          </li>
        ))}
      </ol>

      {/* 메인 카드 */}
      {candidate && flow.myAnswer !== "pass" ? (
        <div className="mt-7 overflow-hidden rounded-2xl border border-border bg-card shadow-card">
          <div className="bg-gradient-brand px-6 py-5">
            <p className="text-xs font-medium text-primary-foreground/80">이번 소개</p>
            <p className="mt-1 text-lg font-semibold text-primary-foreground">
              {candidate.name} · 만 {candidate.age}
            </p>
            <p className="mt-0.5 text-xs text-primary-foreground/80">
              {candidate.job} · {candidate.distance}
            </p>
          </div>
          <div className="px-6 py-5">
            <p className="font-serif text-base leading-snug">“{candidate.headline}”</p>
            <div className="mt-4 flex flex-wrap gap-1.5">
              {candidate.interests.slice(0, 4).map((i) => (
                <span key={i} className="rounded-full bg-muted px-3 py-1 text-xs">
                  {i}
                </span>
              ))}
            </div>
            <Button asChild className="mt-5 w-full" size="lg">
              <Link to="/intro">
                {flow.chatOpen ? "프로필 다시 보기" : "프로필 열어보기"}
                <ArrowRight className="size-4" aria-hidden="true" />
              </Link>
            </Button>
          </div>
        </div>
      ) : (
        <div className="mt-7 rounded-2xl border border-dashed border-border bg-card/60 px-6 py-10 text-center">
          <Sparkles className="mx-auto size-5 text-primary-strong" aria-hidden="true" />
          <p className="mt-3 text-sm font-medium">준비 중인 소개가 있습니다</p>
          <p className="mt-1.5 text-xs leading-relaxed text-muted-foreground">
            같은 퇴근길에서 겹치는 한 사람만 골라 보내드립니다. 보통 2~3일 안에 도착해요.
          </p>
        </div>
      )}

      {/* 다음 할 일 */}
      <section className="mt-8">
        <h2 className="text-xs font-semibold tracking-wide text-primary-strong">다음 단계</h2>
        <ul className="mt-3 space-y-2">
          <NextItem
            done={Boolean(flow.myAnswer)}
            icon={<Sparkles className="size-4" aria-hidden="true" />}
            title="소개 프로필 확인하고 답하기"
            to="/intro"
          />
          <NextItem
            done={flow.chatOpen}
            icon={<MessageCircle className="size-4" aria-hidden="true" />}
            title="약속 잡는 대화 나누기"
            to="/chats"
            locked={!flow.chatOpen}
            lockedNote="양쪽이 좋다고 하면 열립니다"
          />
          <NextItem
            done={Boolean(flow.meetupAt)}
            icon={<CalendarCheck className="size-4" aria-hidden="true" />}
            title="만날 날짜 확정하기"
            to="/chats"
            locked={!flow.chatOpen}
            lockedNote="대화가 열린 뒤 진행합니다"
          />
        </ul>
      </section>
    </AppScreen>
  );
}

function NextItem({
  done,
  icon,
  title,
  to,
  locked,
  lockedNote,
}: {
  done: boolean;
  icon: React.ReactNode;
  title: string;
  to: string;
  locked?: boolean;
  lockedNote?: string;
}) {
  const inner = (
    <div
      className={cn(
        "flex items-center gap-3 rounded-xl border border-border bg-card px-4 py-3.5",
        locked && "opacity-60",
      )}
    >
      <span
        className={cn(
          "flex size-8 shrink-0 items-center justify-center rounded-full",
          done ? "bg-primary text-primary-foreground" : "bg-muted text-primary-strong",
        )}
      >
        {done ? <Check className="size-4" aria-hidden="true" /> : icon}
      </span>
      <span className="min-w-0">
        <span className="block text-sm font-medium">{title}</span>
        {locked && lockedNote ? (
          <span className="block text-xs text-muted-foreground">{lockedNote}</span>
        ) : null}
      </span>
    </div>
  );

  if (locked) return <li>{inner}</li>;
  return (
    <li>
      <Link to={to} className="block focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none rounded-xl">
        {inner}
      </Link>
    </li>
  );
}
