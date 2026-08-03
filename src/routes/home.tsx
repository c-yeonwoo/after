import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { ArrowRight, CalendarCheck, Clock } from "lucide-react";
import { toast } from "sonner";

import { AppScreen } from "@/components/app/AppScreen";
import { GuideNote } from "@/components/app/GuideNote";
import { NoShowPrompt } from "@/components/app/NoShowPrompt";
import { BRAND, HUBS } from "@/lib/brand";
import {
  homeState,
  markMet,
  openIntro,
  type Meeting,
  type NoShowReport,
  type PublicProfile,
} from "@/lib/api";
import { useMe } from "@/lib/me";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/home")({
  head: () => ({
    meta: [
      { title: `홈 — ${BRAND.name}` },
      { name: "description", content: "지금 해야 할 일 하나와 진행 상황을 확인합니다." },
      { property: "og:title", content: `홈 — ${BRAND.name}` },
      { property: "og:description", content: "소개 도착 · 채팅 오픈 · 만남 확정까지의 진행 상황." },
    ],
  }),
  component: HomePage,
});

/**
 * 퍼널 4단계. 홈에서 상태를 말하는 곳은 (1) 헤드라인 (2) 이 진행바 뿐이다.
 * 예전에는 헤드라인·세라 카드·진행바·"다음 단계" 리스트 네 곳이 같은 변수를
 * 서로 다른 문장으로 반복했다 — 이 제품은 동시에 진행되는 일이 항상 하나이므로
 * (불변식 2) 요약할 것이 없고, 대시보드 패턴 자체가 맞지 않았다.
 */
const STEPS = ["소개 도착", "서로 확인", "날짜 조율", "만남 확정 · 대화 오픈"] as const;

function formatWhen(iso: string) {
  const d = new Date(iso);
  const date = d.toLocaleDateString("ko-KR", { month: "long", day: "numeric", weekday: "short" });
  const time = d.toLocaleTimeString("ko-KR", { hour: "numeric", minute: "2-digit" });
  return `${date} ${time}`;
}

/** 남은 시간을 "N시간 M분" 으로. 이미 지났으면 null. */
function remaining(deadlineIso: string, now: number) {
  const left = new Date(deadlineIso).getTime() - now;
  if (left <= 0) return null;
  const h = Math.floor(left / 3_600_000);
  const m = Math.floor((left % 3_600_000) / 60_000);
  return h > 0 ? `${h}시간 ${m}분` : `${m}분`;
}

function HomePage() {
  const { me, ready } = useMe();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [candidate, setCandidate] = useState<PublicProfile | null>(null);
  const [meeting, setMeeting] = useState<Meeting | null>(null);
  const [noShow, setNoShow] = useState<NoShowReport | null>(null);
  // 여성은 동시에 여러 건을 받을 수 있다 — 개수를 세어 목록으로 보낸다.
  const [requestCount, setRequestCount] = useState(0);
  // 환불 기한 카운트다운용. 서버 시각이 권위이고 이건 표시 전용이다.
  const [now, setNow] = useState<number | null>(null);

  useEffect(() => {
    if (ready && !me) navigate({ to: "/signup" });
  }, [ready, me, navigate]);

  // 하이드레이션 불일치를 피하려고 마운트 후에만 시각을 잡는다.
  useEffect(() => {
    setNow(Date.now());
    const t = window.setInterval(() => setNow(Date.now()), 60_000);
    return () => window.clearInterval(t);
  }, []);

  useEffect(() => {
    if (!ready || !me) return;
    let cancelled = false;
    (async () => {
      let state = await homeState();
      // 남성인데 열린 소개가 없으면 한 번 열고 다시 읽는다. 평소엔 1회,
      // 새 소개가 필요한 순간에만 2회다. home_state() 는 읽기 전용이라
      // 여기서 오픈을 대신하지 않는다.
      if (!cancelled && me.gender === "male" && !state.has_open_intro && !state.meeting) {
        try {
          await openIntro();
          state = await homeState();
        } catch (err) {
          // P0002 = 자격 있는 후보가 아직 없음. 정상 상태다.
          if ((err as { code?: string })?.code !== "P0002") throw err;
        }
      }
      if (cancelled) return;
      setCandidate(state.candidate);
      setMeeting(state.meeting);
      setRequestCount(state.request_count);
      setNoShow(state.pending_no_show);
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [ready, me]);

  const hub = HUBS.find((h) => h.id === me?.hub_id);
  const isMale = me?.gender === "male";

  /**
   * 약속 시각이 지났는데 아직 성사 여부를 답하지 않은 상태.
   * now 가 null 인 첫 렌더(하이드레이션 대비)에는 판정하지 않는다.
   */
  const awaitingOutcome = Boolean(
    meeting?.confirmed_at &&
    meeting.scheduled_at &&
    !meeting.completed_at &&
    now !== null &&
    new Date(meeting.scheduled_at).getTime() < now,
  );

  const step = meeting?.confirmed_at ? 3 : meeting?.prefs_submitted_at ? 2 : meeting ? 1 : 0;

  const headline = awaitingOutcome
    ? "어떠셨어요?"
    : meeting?.confirmed_at
      ? "만남이 잡혔어요."
      : meeting?.prefs_submitted_at
        ? isMale
          ? "날짜만 고르면 돼요."
          : "전달했어요. 답을 기다리는 중."
        : meeting
          ? isMale
            ? "상대의 답변을 기다리는 중."
            : "만나고 싶다는 요청이 왔어요."
          : candidate
            ? isMale
              ? "오늘 소개가 도착했어요."
              : "평가할 프로필이 있어요."
            : isMale
              ? "기다리는 단계예요."
              : "지금은 쉬어가는 중이에요.";

  return (
    <AppScreen>
      <p className="mt-4 text-3xs font-semibold tracking-[0.16em] text-muted-foreground uppercase">
        {hub?.label ?? "강남·역삼권"}
      </p>
      <h1 className="headline mt-2 text-3xl leading-[1.35]">
        {me?.name ? `${me.name}님,` : "안녕하세요,"}
        <br />
        <span className="text-primary">{headline}</span>
      </h1>

      {noShow ? (
        <div className="mt-5">
          <NoShowPrompt report={noShow} onResolved={() => setNoShow(null)} />
        </div>
      ) : null}

      {/*
        세라의 말과 "지금 할 일"을 한 카드로 합쳤다.
        따로 두면 같은 내용을 두 번 말하게 된다 — 예전 "다음 단계" 리스트와 같은 중복이었다.
        확정 상태처럼 카드 자체가 정보를 다 담는 경우엔 세라가 굳이 말하지 않는다.
      */}
      <div className="mt-5">
        {loading ? (
          <div className="rounded-surface border border-border bg-card px-6 py-10 text-center">
            <p className="text-sm text-muted-foreground">불러오는 중입니다…</p>
          </div>
        ) : awaitingOutcome && meeting ? (
          <AfterMeetingCard
            meeting={meeting}
            counterpart={candidate}
            onDone={(m) => setMeeting(m)}
          />
        ) : meeting?.confirmed_at ? (
          <ConfirmedCard meeting={meeting} counterpart={candidate} />
        ) : meeting?.prefs_submitted_at ? (
          // S7: 확정 전까지는 대화가 열리지 않는다 — 세라가 중개한다.
          isMale ? (
            <GuideNote
              introduce
              action={
                <CardAction to="/schedule" search={{ meetingId: meeting.id }}>
                  날짜 고르기
                </CardAction>
              }
            >
              가능한 날짜를 받아왔어요. 하나를 고르시면 대화가 열립니다.
            </GuideNote>
          ) : (
            <GuideNote introduce>
              보내주신 날짜를 전달했어요. 상대가 고르면 대화가 열립니다.
            </GuideNote>
          )
        ) : !isMale && requestCount > 0 ? (
          // 여러 남성이 동시에 티켓을 쓸 수 있다 — 한 건만 보여주면 나머지는
          // 답을 못 받고 24시간 뒤 자동 환불된다.
          <GuideNote introduce action={<CardAction to="/requests">요청 확인하기</CardAction>}>
            {requestCount > 1
              ? `만나고 싶다는 요청이 ${requestCount}건 도착했어요. 각각 따로 답하실 수 있습니다.`
              : "만나고 싶다는 요청이 도착했어요. 가능한 날짜만 알려 주시면 됩니다."}
          </GuideNote>
        ) : meeting ? (
          <WaitingCard meeting={meeting} now={now} />
        ) : candidate ? (
          <>
            <GuideNote introduce>
              천천히 읽어보고 답해 주세요. 답은 상대에게 바로 보이지 않습니다.
            </GuideNote>
            <div className="mt-4">
              <CandidatePreview candidate={candidate} isMale={isMale} />
            </div>
          </>
        ) : (
          // "보통 2~3일 안에 보내드립니다"라고 약속했었다. 근거가 코드에 없다 —
          // open_intro() 는 상대의 like 가 생기는 **즉시** 열리거나, 없으면
          // 영원히 열리지 않는다. 기간을 말하는 대신 조건을 말한다.
          <GuideNote introduce>
            {isMale
              ? "소개는 상대가 먼저 회원님을 선택했을 때 열립니다. 선택이 들어오면 바로 알려드릴게요."
              : "지금은 평가할 분이 없습니다. 새로 가입한 분이 생기면 이어서 보여드릴게요."}
          </GuideNote>
        )}
      </div>

      {/*
        진행 위치 — 며칠 걸리는 과정이라 위치 정보는 남기되, 부수적으로 다룬다.
        만남이 끝난 뒤에는 감춘다. 이 퍼널은 "만남 확정"에서 끝나므로 그 이후에도
        4/4 를 띄우면 아직 진행 중인 일이 남은 것처럼 읽힌다.
      */}
      {awaitingOutcome ? null : (
        <section className="mt-8" aria-label="진행 단계">
          <div className="flex items-center gap-1.5">
            {STEPS.map((label, i) => (
              <div
                key={label}
                className={cn(
                  "h-1 flex-1 rounded-full transition-colors",
                  i <= step ? "bg-primary" : "bg-foreground/10",
                )}
              />
            ))}
          </div>
          <p className="mt-2 text-2xs text-muted-foreground">
            {step + 1}/4 · <span className="font-semibold text-foreground">{STEPS[step]}</span>
          </p>
        </section>
      )}
    </AppScreen>
  );
}

/** 소개가 도착한 상태 — 상세는 /intro 가 담당하므로 여기선 최소한만 보여준다. */
function CandidatePreview({ candidate, isMale }: { candidate: PublicProfile; isMale: boolean }) {
  return (
    <div className="overflow-hidden rounded-surface border border-border bg-card shadow-card">
      <div className="bg-gradient-to-br from-accent/40 via-card to-card px-5 pt-5 pb-6">
        <p className="text-3xs font-semibold tracking-[0.16em] text-muted-foreground uppercase">
          {isMale ? "오늘의 소개" : "평가할 프로필"}
        </p>
        <p className="headline mt-3 text-2xl">
          {candidate.name}
          {candidate.age !== null ? (
            <span className="ml-2 text-base text-muted-foreground">{candidate.age}</span>
          ) : null}
        </p>
        <p className="mt-1 text-xs text-muted-foreground">{candidate.job}</p>
        {candidate.headline ? (
          <p className="mt-3 line-clamp-2 text-sm leading-snug text-foreground/90">
            “{candidate.headline}”
          </p>
        ) : null}
      </div>
      <Link
        to="/intro"
        className="headline flex min-h-14 items-center justify-center gap-2 bg-primary text-base text-primary-foreground transition-colors hover:bg-primary/90 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
      >
        {isMale ? "프로필 열어보기" : "읽고 답하기"}
        <ArrowRight className="size-4" aria-hidden="true" />
      </Link>
    </div>
  );
}

/**
 * 티켓을 쓰고 상대 응답을 기다리는 상태.
 * 24시간 무응답이면 자동 환불되므로(P3) 남은 시간을 실제로 보여준다 —
 * 지금까지는 "24시간 안에 오지 않으면" 이라는 정적 문구뿐이었다.
 */
function WaitingCard({ meeting, now }: { meeting: Meeting; now: number | null }) {
  // 티켓 차감과 만남 생성이 같은 트랜잭션이라 created_at 이 기한 기준이 된다.
  const deadline = new Date(new Date(meeting.created_at).getTime() + 24 * 3_600_000).toISOString();
  const left = now === null ? null : remaining(deadline, now);

  return (
    <div className="rounded-surface border border-border bg-card px-5 py-5 shadow-card">
      <p className="flex items-center gap-1.5 text-3xs font-semibold tracking-[0.16em] text-muted-foreground uppercase">
        <Clock className="size-3.5" aria-hidden="true" />
        기다리는 중
      </p>
      <p className="headline mt-2.5 text-lg">상대의 답변을 기다리고 있어요</p>
      <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
        {left ? (
          <>
            <span className="font-semibold text-foreground">{left}</span> 안에 답이 없으면 티켓은
            자동으로 환불됩니다.
          </>
        ) : (
          "곧 환불 처리됩니다. 티켓은 다시 사용하실 수 있습니다."
        )}
      </p>
    </div>
  );
}

/**
 * 약속 시각이 지난 만남 — 제품 이름이 '애프터'인데 이 상태가 없었다(진단 UX-10).
 *
 * 홈의 상태 기계가 confirmed_at 에서 끝나 있어서, 이틀 지난 약속에도 "만남이
 * 잡혔어요"와 지난 시각에 대한 "열립니다"가 그대로 남았다. 그리고 북극성인
 * 첫 만남 성사율의 유일한 원천(mark_met)에 닿는 길이 대화방 안 텍스트 링크
 * 하나뿐이었다(UX-11). 이 카드가 그 두 가지를 같이 해결한다.
 */
function AfterMeetingCard({
  meeting,
  counterpart,
  onDone,
}: {
  meeting: Meeting;
  counterpart: PublicProfile | null;
  onDone: (m: Meeting) => void;
}) {
  const navigate = useNavigate();
  const [busy, setBusy] = useState(false);
  const who = counterpart?.name ? `${counterpart.name}님과` : "";

  return (
    <div className="overflow-hidden rounded-surface border border-border bg-card shadow-card">
      <div className="px-5 pt-5 pb-4">
        <p className="text-3xs font-semibold tracking-[0.16em] text-muted-foreground uppercase">
          지난 만남
        </p>
        <p className="headline mt-2 text-xl">{who ? `${who} 만나셨나요?` : "만나셨나요?"}</p>
        {meeting.scheduled_at ? (
          <p className="mt-1.5 text-sm text-muted-foreground">
            {formatWhen(meeting.scheduled_at)} · {meeting.place_name}
          </p>
        ) : null}
      </div>
      <div className="grid grid-cols-2 gap-2 px-5 pb-5">
        <button
          type="button"
          disabled={busy}
          onClick={() => navigate({ to: "/feedback", search: { meetingId: meeting.id } })}
          className="min-h-12 rounded-control border border-border text-sm font-semibold transition-colors hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none disabled:opacity-60"
        >
          못 만났어요
        </button>
        <button
          type="button"
          disabled={busy}
          onClick={async () => {
            setBusy(true);
            try {
              // 북극성 기록. 성사 여부만 먼저 받고, 자세한 후기는 다음 화면에서.
              onDone(await markMet(meeting.id));
              toast.success("기록했습니다. 어떠셨는지도 여쭤볼게요.");
              navigate({ to: "/feedback", search: { meetingId: meeting.id } });
            } catch (err) {
              toast.error(err instanceof Error ? err.message : "기록에 실패했습니다.");
            } finally {
              setBusy(false);
            }
          }}
          className="min-h-12 rounded-control bg-primary text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary/90 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none disabled:opacity-60"
        >
          {busy ? "기록하는 중…" : "만났어요"}
        </button>
      </div>
    </div>
  );
}

/** 만남이 확정된 상태 — 날짜·장소·사적 대화 오픈 시각을 홈이 책임진다. */
function ConfirmedCard({
  meeting,
  counterpart,
}: {
  meeting: Meeting;
  counterpart: PublicProfile | null;
}) {
  return (
    <div className="overflow-hidden rounded-surface border border-border bg-card shadow-card">
      <div className="bg-gradient-brand px-5 py-5">
        <p className="flex items-center gap-1.5 text-3xs font-semibold tracking-[0.16em] text-primary-foreground/85 uppercase">
          <CalendarCheck className="size-3.5" aria-hidden="true" />
          만남 확정
        </p>
        {meeting.scheduled_at ? (
          <p className="headline mt-2.5 text-xl text-primary-foreground">
            {formatWhen(meeting.scheduled_at)}
          </p>
        ) : null}
        <p className="mt-1 text-sm text-primary-foreground/90">
          {meeting.place_name}
          {counterpart?.name ? ` · ${counterpart.name}님과` : ""}
        </p>
      </div>
      <div className="px-5 py-4">
        {meeting.private_opens_at ? (
          <p className="text-xs leading-relaxed text-muted-foreground">
            사적인 대화는{" "}
            <span className="font-semibold text-foreground">
              {formatWhen(meeting.private_opens_at)}
            </span>
            에 열립니다.
          </p>
        ) : null}
        <Link
          to="/chats"
          className="mt-3 flex min-h-12 items-center justify-center gap-2 rounded-control border border-border text-sm font-semibold transition-colors hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
        >
          대화방 열기
          <ArrowRight className="size-4" aria-hidden="true" />
        </Link>
      </div>
    </div>
  );
}

/** 세라 카드 안에 들어가는 단일 행동 버튼. */
function CardAction({
  to,
  search,
  children,
}: {
  to: string;
  search?: Record<string, string>;
  children: React.ReactNode;
}) {
  return (
    <Link
      to={to}
      search={search}
      className="flex min-h-12 items-center justify-center gap-2 rounded-control bg-primary px-5 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary/90 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
    >
      {children}
      <ArrowRight className="size-4" aria-hidden="true" />
    </Link>
  );
}
