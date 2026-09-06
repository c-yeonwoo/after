import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { ArrowRight, CalendarCheck, Clock } from "lucide-react";
import { toast } from "sonner";

import { AppScreen } from "@/components/app/AppScreen";
import { Switch } from "@/components/ui/switch";
import { GuideNote } from "@/components/app/GuideNote";
import { NoShowPrompt } from "@/components/app/NoShowPrompt";
import { BRAND, HUBS, PRIMARY_HUB } from "@/lib/brand";
import {
  homeState,
  markMet,
  setPaused,
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
  const { me, ready, refresh } = useMe();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [candidate, setCandidate] = useState<PublicProfile | null>(null);
  /** 큐에서 전송된 카드 수 · 소개 티켓 보유량(v2). 홈의 안내 근거다. */
  const [queued, setQueued] = useState(0);
  const [introTickets, setIntroTickets] = useState(0);
  const [meeting, setMeeting] = useState<Meeting | null>(null);
  const [noShow, setNoShow] = useState<NoShowReport | null>(null);
  // 여성은 동시에 여러 건을 받을 수 있다 — 개수를 세어 목록으로 보낸다.
  const [requestCount, setRequestCount] = useState(0);
  // 환불 기한 카운트다운용. 서버 시각이 권위이고 이건 표시 전용이다.
  const [now, setNow] = useState<number | null>(null);

  useEffect(() => {
    if (ready && !me) navigate({ to: "/" });
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
      const state = await homeState();
      /*
        **여기서 소개를 열지 않는다.** 예전에는 열린 소개가 없으면 openIntro() 를
        대신 불러줬는데, v2 부터 그 호출은 소개 티켓 1장을 차감한다 — 홈을 열기만
        해도 5,000원이 빠지게 된다. 홈은 "도착했다" 까지만 말하고, 차감은 /intro
        의 열람 확인이 받는다.
      */
      if (cancelled) return;
      setCandidate(state.candidate);
      setMeeting(state.meeting);
      setRequestCount(state.request_count);
      setNoShow(state.pending_no_show);
      setQueued(state.queued_intros);
      setIntroTickets(state.intro_tickets);
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
            : isMale && queued > 0
              ? "소개가 도착했어요."
              : isMale
                ? "기다리는 단계예요."
                : "지금은 쉬어가는 중이에요.";

  return (
    <AppScreen>
      <p className="mt-4 text-3xs font-semibold tracking-[0.16em] text-muted-foreground uppercase">
        {hub?.label ?? PRIMARY_HUB.label}
      </p>
      {/*
        예전에는 아랫줄을 브랜드 색으로 칠했다. 그런데 그 자리에 오는 문장은
        "상대의 답변을 기다리는 중." 처럼 **행동이 아니라 상태**다. 화면에서
        가장 크고 진한 색이 누를 수 없는 것을 가리키고 있었고, 바로 아래 카드와
        버튼까지 같은 분홍이라 화면 전체가 한 색으로 덮였다.

        색을 빼고 굵기와 크기로만 위계를 만든다. 이름 줄을 흐리게 내리면
        상태 문장이 저절로 앞으로 나온다. 분홍은 **누를 수 있는 것**에만 남긴다.
      */}
      <h1 className="headline mt-2 text-3xl leading-[1.35]">
        <span className="text-muted-foreground">{me?.name ? `${me.name}님,` : "안녕하세요,"}</span>
        <br />
        {headline}
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
        ) : isMale && queued > 0 ? (
          /*
            큐에 카드가 도착한 상태. 여는 데 소개 티켓 1장이 들어가므로 홈에서
            바로 열지 않고 /intro 의 확인 화면으로 보낸다 — 돈이 빠지는 행동을
            링크 한 번으로 일으키지 않는다.
          */
          <GuideNote
            introduce
            action={
              <CardAction to="/intro">
                {introTickets > 0 ? "소개 열어보기" : "소개 티켓 사기"}
              </CardAction>
            }
          >
            {queued > 1
              ? `소개 ${queued}건이 도착했어요. 한 번에 한 분씩 열어 보실 수 있습니다.`
              : "소개가 도착했어요. 프로필을 열면 만남으로 이어갈지 정하실 수 있습니다."}
            {introTickets === 0 ? " 열람에는 소개 티켓 1장이 필요합니다." : ""}
          </GuideNote>
        ) : (
          // "보통 2~3일 안에 보내드립니다"라고 약속했었다. 근거가 코드에 없다 —
          // 이제는 운영자가 큐를 세워야 소개가 나가므로 기간을 말할 수 없다.
          // 조건을 말한다.
          <GuideNote introduce>
            {isMale
              ? "소개는 회원님을 먼저 좋다고 한 분들 중에서 골라 보내드립니다. 준비되면 바로 알려드릴게요."
              : "지금은 평가할 분이 없습니다. 새로 가입한 분이 생기면 이어서 보여드릴게요."}
          </GuideNote>
        )}
      </div>

      {/*
        진행 중인 만남이 없을 때만 띄운다. 약속이 잡혀 있으면 화면에 이미 할 일이
        있고, 그때 "소개 받기" 스위치는 지금 하는 일과 무관한 잡음이다.
      */}
      {!loading && !meeting && !noShow ? (
        <ReadinessPanel
          isMale={isMale}
          paused={me?.paused_at !== null && me?.paused_at !== undefined}
          introTickets={introTickets}
          onToggle={async (next) => {
            try {
              await setPaused(next);
              await refresh();
              toast.success(next ? "새 소개를 멈췄습니다." : "다시 소개를 받습니다.");
            } catch (err) {
              toast.error(err instanceof Error ? err.message : "설정을 바꾸지 못했습니다.");
            }
          }}
        />
      ) : null}

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

/**
 * 소개 받기 스위치 + 준비 상태.
 *
 * ── 왜 홈에 두는가 ──
 * 기다리는 화면에는 읽을 것 하나뿐이고 **누를 것이 없었다.** 남성이 로그인해서
 * 소개가 아직 없으면 할 수 있는 일이 0개다. 그 화면을 며칠 동안 다시 열게 하는
 * 것은 무리다.
 *
 * 없던 기능을 만들지는 않는다. `set_paused` 는 이미 있고 환경설정 안에 묻혀
 * 있었다. 지금 상태를 말하는 자리와 그 상태를 바꾸는 자리는 같아야 한다.
 *
 * ── 기다리는 기간을 말하지 않는 이유 ──
 * 예전에 "보통 2~3일 안에 보내드립니다" 가 있었고 근거가 코드에 없어서 지웠다.
 * 지금도 소개는 운영자가 큐를 세워야 나가므로 기간을 약속할 수 없다. 대신
 * **말할 수 있는 사실**을 적는다: 지금 받는 중인지, 열 준비가 됐는지.
 */
function ReadinessPanel({
  isMale,
  paused,
  introTickets,
  onToggle,
}: {
  isMale: boolean;
  paused: boolean;
  introTickets: number;
  onToggle: (next: boolean) => Promise<void>;
}) {
  const [busy, setBusy] = useState(false);

  return (
    <section className="mt-6" aria-label="소개 설정">
      <div className="overflow-hidden rounded-surface border border-border bg-card">
        <div className="flex min-h-16 items-center gap-3.5 px-5">
          <span className="min-w-0 flex-1">
            <span className="block text-sm font-semibold">
              {paused ? "지금은 쉬는 중입니다" : "소개를 받는 중입니다"}
            </span>
            <span className="mt-0.5 block text-xs leading-relaxed text-muted-foreground">
              {paused
                ? "새 소개가 오지 않습니다. 진행 중인 약속은 그대로입니다."
                : isMale
                  ? "회원님을 먼저 좋다고 한 분들 중에서 골라 보내드립니다."
                  : "새로 가입한 분이 생기면 이어서 보여드립니다."}
            </span>
          </span>
          {/*
            체크박스가 아니라 스위치다. 왼쪽 체크박스는 "동의합니다" 처럼 읽히고,
            이건 동의가 아니라 켜고 끄는 값이다. 켜짐이 곧 "받는 중" 이라
            체크 표시보다 손잡이가 움직이는 편이 상태를 잘 말한다.
          */}
          <Switch
            aria-label={paused ? "소개 다시 받기" : "소개 잠시 멈추기"}
            checked={!paused}
            disabled={busy}
            onCheckedChange={async (on) => {
              setBusy(true);
              try {
                await onToggle(!on);
              } finally {
                setBusy(false);
              }
            }}
          />
        </div>

        {/*
          남성에게만 붙는 줄. 소개가 도착해도 티켓이 없으면 열지 못하므로,
          "지금 열 수 있는가" 가 기다리는 동안 알아 둘 값이다. 여성은 티켓을
          쓰지 않으므로 이 줄이 없다.
        */}
        {isMale && !paused ? (
          <div className="flex min-h-14 items-center gap-3.5 border-t border-border px-5">
            <span className="min-w-0 flex-1 text-xs leading-relaxed text-muted-foreground">
              {introTickets > 0
                ? `소개가 오면 바로 열 수 있습니다. 소개 티켓 ${introTickets}장 보유.`
                : "소개를 열려면 소개 티켓 1장이 필요합니다."}
            </span>
            {introTickets === 0 ? (
              <Link
                to="/store"
                search={{ kind: "intro" as const }}
                className="shrink-0 text-xs font-semibold text-foreground underline underline-offset-4"
              >
                티켓 보기
              </Link>
            ) : null}
          </div>
        ) : null}
      </div>
    </section>
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
 * 약속 시각이 지난 만남 — 제품 이름이 '이클립스'인데 이 상태가 없었다(진단 UX-10).
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
        {/* 약속 장소는 지도 앱에 옮겨 넣게 된다 — 선택을 열어 둔다. */}
        <p data-selectable className="mt-1 text-sm text-primary-foreground/90">
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
      /*
        카드 안에 뜬 알약이 아니라 **카드 밑변 전체**를 쓰는 막대다. 안에 뜬
        버튼은 카드 속의 또 다른 카드로 읽혀서, 읽을 것과 누를 것의 경계가
        흐려졌다. CandidatePreview 의 링크와 같은 모양으로 맞춘다.
      */
      className="flex min-h-14 items-center justify-center gap-2 bg-primary text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary/90 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
    >
      {children}
      <ArrowRight className="size-4" aria-hidden="true" />
    </Link>
  );
}
