import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect } from "react";
import { ArrowRight, CalendarCheck, Check, MessageCircle, Sparkles } from "lucide-react";

import { AppScreen } from "@/components/app/AppScreen";
import { GuideNote } from "@/components/app/GuideNote";
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
      <p className="mt-4 text-[0.62rem] font-semibold tracking-[0.16em] uppercase text-muted-foreground">
        {hub?.label ?? "강남·역삼권"}
      </p>
      <h1 className="headline mt-2 text-[1.9rem]">
        {me?.basics.name ? `${me.basics.name}님,` : "안녕하세요,"}
        <br />
        <span className="text-primary">
          {flow.meetupAt
            ? "만남이 잡혔어요."
            : flow.chatOpen
              ? "대화가 열렸어요."
              : flow.myAnswer === "pass"
                ? "다음 소개 준비 중."
                : candidate
                  ? "오늘 소개가 도착했어요."
                  : "곧 소개를 보내드릴게요."}
        </span>
      </h1>

      <div className="mt-5">
        <GuideNote>
          {flow.meetupAt
            ? "약속이 확정됐어요. 만나기 전날 자정에 사적인 대화가 열립니다."
            : flow.chatOpen
              ? "이제 날짜와 장소만 정하면 됩니다. 대화 탭에서 이어가세요."
              : flow.myAnswer === "pass"
                ? "이번 소개는 넘겼어요. 다음 사람을 고르는 중입니다."
                : candidate
                  ? "프로필을 천천히 읽어보고 답해주세요. 답은 상대에게 바로 보이지 않습니다."
                  : "지금은 기다리는 단계예요. 준비되면 알려드릴게요."}
        </GuideNote>
      </div>


      <ol className="mt-6 flex items-center gap-1.5" aria-label="진행 단계">
        {STEPS.map((s, i) => (
          <li key={s.id} className="flex-1">
            <div
              className={cn(
                "h-1.5 rounded-full transition-colors",
                i <= doneIndex ? "bg-primary" : "bg-foreground/10",
              )}
            />
            <p
              className={cn(
                "mt-2 text-[0.65rem]",
                i <= doneIndex ? "font-semibold text-foreground" : "text-muted-foreground",
              )}
            >
              {s.label}
            </p>
          </li>
        ))}
      </ol>

      {/* 메인 카드 */}
      {candidate && flow.myAnswer !== "pass" ? (
        <div className="mt-7 overflow-hidden rounded-[2rem] bg-foreground text-background">
          <div className="px-6 pt-6">
            <div className="flex items-start justify-between gap-2">
              <span className="text-[0.6rem] font-semibold tracking-[0.16em] uppercase opacity-70">
                This intro
              </span>
              <span className="rounded-full bg-primary px-3 py-1 text-[0.65rem] font-semibold text-primary-foreground">
                {candidate.area}
              </span>
            </div>
            <p className="headline mt-5 text-[1.7rem]">
              {candidate.name}
              <span className="ml-2 text-[1rem] opacity-60">만 {candidate.age}</span>
            </p>
            <p className="mt-1 text-xs opacity-70">{candidate.job}</p>
            <p className="mt-4 text-[0.95rem] leading-snug">“{candidate.headline}”</p>
            <div className="mt-4 flex flex-wrap gap-1.5 pb-6">
              {candidate.interests.slice(0, 4).map((i) => (
                <span
                  key={i}
                  className="rounded-full border border-background/30 px-3 py-1 text-[0.7rem]"
                >
                  {i}
                </span>
              ))}
            </div>
          </div>
          <Link
            to="/intro"
            className="headline flex items-center justify-center gap-2 bg-primary py-5 text-base text-primary-foreground transition-colors hover:bg-primary/90"
          >
            {flow.chatOpen ? "프로필 다시 보기" : "프로필 열어보기"}
            <ArrowRight className="size-4" aria-hidden="true" />
          </Link>
        </div>
      ) : (
        <div className="mt-7 rounded-[2rem] border-2 border-dashed border-foreground/20 px-6 py-10 text-center">
          <Sparkles className="mx-auto size-5 text-primary" aria-hidden="true" />
          <p className="headline mt-3 text-base">준비 중인 소개가 있습니다</p>
          <p className="mt-2 text-xs leading-relaxed text-muted-foreground">
            같은 퇴근길에서 겹치는 한 사람만 골라 보내드립니다. 보통 2~3일 안에 도착해요.
          </p>
        </div>
      )}


      {/* 다음 할 일 */}
      <section className="mt-8">
        <h2 className="text-[0.62rem] font-semibold tracking-[0.16em] uppercase text-muted-foreground">
          다음 단계
        </h2>
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
        "flex items-center gap-3 rounded-2xl border-2 border-foreground/10 bg-card px-4 py-4",
        locked && "opacity-50",
      )}
    >
      <span
        className={cn(
          "flex size-9 shrink-0 items-center justify-center rounded-full",
          done ? "bg-primary text-primary-foreground" : "bg-foreground text-background",
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
