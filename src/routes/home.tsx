import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { ArrowRight, Clock } from "lucide-react";
import { toast } from "sonner";

import { NotificationBell } from "@/components/app/NotificationBell";
import { MeetingCheckin } from "@/components/app/MeetingCheckin";
import { MeetingSummary } from "@/components/app/MeetingSummary";
import { MIN_PHOTOS } from "@/components/onboarding/basics";
import { AppScreen } from "@/components/app/AppScreen";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { GuideNote } from "@/components/app/GuideNote";
import { NoShowPrompt } from "@/components/app/NoShowPrompt";
import { LiveRefreshNotice } from "@/components/app/LiveRefreshNotice";
import { BRAND, HUBS } from "@/lib/brand";
import {
  homeStateV2,
  markMet,
  meetPlacesForMe,
  paymentsEnabled,
  setPaused,
  type Meeting,
  type PublicProfile,
  type HomeStateV2,
} from "@/lib/api";
import { useMe } from "@/lib/me";
import { myMeetWindow, type MeetWindow } from "@/lib/meetWindow";
import { useMemberLiveQuery } from "@/lib/useMemberLiveQuery";

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

function stateHeadline(state: HomeStateV2["primary_state"], isMale: boolean): string {
  switch (state) {
    case "account_unavailable":
      return "계정 상태를 확인해주세요.";
    case "report_response_required":
      return "확인이 필요한 신고가 있어요.";
    case "meeting_outcome_required":
      return "만나보셨나요?";
    case "meeting_confirmed":
      return "만남이 잡혔어요.";
    case "profile_incomplete":
      return "소개받을 준비를 마저 해주세요.";
    case "policy_required":
      return "약관을 확인해 주세요.";
    case "identity_required":
      return "본인 확인이 필요해요.";
    case "phone_required":
      return "휴대폰 인증이 필요해요.";
    case "photos_required":
      return "사진을 다시 확인해주세요.";
    case "photos_pending":
      return "사진을 확인하고 있어요.";
    case "schedule_selection":
      return "가능한 날짜를 골라주세요.";
    case "schedule_waiting":
      return "답변을 기다리고 있어요.";
    case "request_received":
      return "만남 요청이 왔어요.";
    case "request_waiting":
      return "상대의 답변을 기다리고 있어요.";
    case "intro_available":
      return isMale ? "소개가 열려 있어요." : "살펴볼 소개가 있어요.";
    case "intro_delivered":
      return "소개가 도착했어요.";
    case "paused":
      return "소개를 잠시 쉬고 있어요.";
    case "waiting":
      return isMale ? "소개를 준비하고 있어요." : "새 소개를 기다리고 있어요.";
  }
}

function HomePage() {
  const { me, ready, refresh } = useMe();
  const navigate = useNavigate();
  const live = useMemberLiveQuery(
    "member-home",
    me?.id,
    async (signal) => {
      const [stateResult, paymentResult, windowResult] = await Promise.allSettled([
        homeStateV2(signal),
        paymentsEnabled(),
        myMeetWindow(),
      ]);
      if (stateResult.status === "rejected") throw stateResult.reason;
      if (stateResult.value.me?.id && stateResult.value.me.id !== me?.id)
        throw new Error("로그인한 계정이 바뀌었어요.");
      return {
        state: stateResult.value,
        payments: paymentResult.status === "fulfilled" ? paymentResult.value : null,
        window: windowResult.status === "fulfilled" ? windowResult.value : null,
      };
    },
    ready && Boolean(me && me.onboarding_step >= 7),
  );
  const serverState = live.data?.state ?? null;
  const currentProfile = serverState?.me ?? me;
  const candidate = serverState?.candidate ?? null;
  const meeting = serverState?.meeting ?? null;
  const noShow = serverState?.pending_no_show?.responded_at
    ? null
    : (serverState?.pending_no_show ?? null);
  const queued = serverState?.queued_intros ?? 0;
  const introTickets = serverState?.ticket_summary?.intro_available ?? 0;
  const introPaymentsEnabled = live.data?.payments ?? null;
  const meetWindow = live.data?.window ?? null;
  const requestCount = serverState?.request_count ?? 0;
  const loading = live.isPending && !live.isPaused;
  const loadError = (live.isError || live.isPaused) && !live.data;
  // 환불 기한 카운트다운용. 서버 시각이 권위이고 이건 표시 전용이다.
  const [now, setNow] = useState<number | null>(null);
  const serverClockOffset = useRef(0);

  useEffect(() => {
    if (ready && !me) navigate({ to: "/" });
    if (ready && me && me.onboarding_step < 7) navigate({ to: "/signup" });
  }, [ready, me, navigate]);

  // 하이드레이션 불일치를 피하려고 마운트 후에만 시각을 잡는다.
  useEffect(() => {
    setNow(Date.now() + serverClockOffset.current);
    const t = window.setInterval(() => setNow(Date.now() + serverClockOffset.current), 60_000);
    return () => window.clearInterval(t);
  }, []);

  useEffect(() => {
    const serverTime = Date.parse(serverState?.as_of ?? "");
    if (Number.isFinite(serverTime)) {
      serverClockOffset.current = serverTime - Date.now();
      setNow(Date.now() + serverClockOffset.current);
    }
  }, [serverState?.as_of]);

  const hub = HUBS.find((h) => h.id === currentProfile?.hub_id);
  const isMale = me?.gender === "male";
  const primaryState = serverState?.primary_state;
  const needsPhone = primaryState === "identity_required" || primaryState === "phone_required";
  const photoCount = currentProfile?.photo_paths?.length ?? 0;
  const needsPhotos = primaryState === "photos_required";
  const blocksNewIntro = Boolean(
    primaryState &&
    [
      "profile_incomplete",
      "policy_required",
      "identity_required",
      "phone_required",
      "photos_required",
      "photos_pending",
    ].includes(primaryState),
  );

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

  const headline = loadError
    ? "상태를 확인할 수 없어요."
    : primaryState
      ? primaryState === "waiting" && !isMale && serverState?.intro_progress?.has_likes
        ? "마음을 남긴 소개가 있어요."
        : stateHeadline(primaryState, isMale)
      : "지금 상태를 확인하고 있어요.";

  if (!ready || !me || me.onboarding_step < 7) {
    return (
      <AppScreen>
        <p className="mt-16 text-center text-sm text-muted-foreground">불러오는 중입니다…</p>
      </AppScreen>
    );
  }

  return (
    <AppScreen action={<NotificationBell />}>
      <p className="mt-5 text-xs font-medium text-muted-foreground">
        {currentProfile?.name ? `${currentProfile.name}님의 애프터` : "나의 애프터"}
        {hub ? ` · ${hub.label}` : ""}
      </p>
      {/*
        예전에는 아랫줄을 브랜드 색으로 칠했다. 그런데 그 자리에 오는 문장은
        "상대의 답변을 기다리는 중." 처럼 **행동이 아니라 상태**다. 화면에서
        가장 크고 진한 색이 누를 수 없는 것을 가리키고 있었고, 바로 아래 카드와
        버튼까지 같은 분홍이라 화면 전체가 한 색으로 덮였다.

        강조색을 빼고 굵기와 크기로만 위계를 만든다. 이름 줄을 흐리게 내리면
        상태 문장이 저절로 앞으로 나온다. 살구색은 작은 포인트와 선택 상태에 쓴다.
      */}
      <h1 className="mt-3 max-w-[19rem] text-[1.75rem] leading-[1.35] font-semibold tracking-[-0.035em]">
        {headline}
      </h1>

      {(live.isError || live.isPaused) && live.data ? (
        <LiveRefreshNotice retry={() => void live.refetch()} />
      ) : null}

      {!loadError && noShow ? (
        <div className="mt-5">
          <NoShowPrompt
            key={noShow.id}
            report={noShow}
            onInteractionStart={live.beginInteraction}
            onResolved={() =>
              live.update((previous) => ({
                ...previous,
                state: { ...previous.state, pending_no_show: null },
              }))
            }
          />
        </div>
      ) : null}

      {/*
        안내와 "지금 할 일"을 한 카드로 합쳤다.
        따로 두면 같은 내용을 두 번 말하게 된다 — 예전 "다음 단계" 리스트와 같은 중복이었다.
        확정 상태처럼 카드 자체가 정보를 다 담는 경우엔 별도 안내를 보태지 않는다.
      */}
      <div className="mt-7">
        {loading ? (
          <div className="rounded-surface border border-border bg-card px-6 py-10 text-center">
            <p className="text-sm text-muted-foreground">불러오는 중입니다…</p>
          </div>
        ) : loadError ? (
          <div role="alert" className="rounded-surface border border-border bg-card p-6">
            <p className="text-sm text-muted-foreground">현재 진행 상태를 불러오지 못했습니다.</p>
            <Button className="mt-4" variant="outline" onClick={() => void live.refetch()}>
              다시 확인
            </Button>
          </div>
        ) : awaitingOutcome && meeting ? (
          <AfterMeetingCard
            key={meeting.id}
            meeting={meeting}
            counterpart={candidate}
            onInteractionStart={live.beginInteraction}
            onDone={(m) =>
              live.update((previous) => ({
                ...previous,
                state: { ...previous.state, meeting: m },
              }))
            }
          />
        ) : meeting?.confirmed_at ? (
          <ConfirmedCard meeting={meeting} counterpart={candidate} />
        ) : meeting?.prefs_submitted_at ? (
          // S7: 확정 전까지는 대화가 열리지 않는다 — 자동 안내로 전달한다.
          isMale ? (
            <GuideNote
              action={
                <CardAction to="/schedule" search={{ meetingId: meeting.id }}>
                  날짜 고르기
                </CardAction>
              }
            >
              가능한 날짜를 받아왔어요. 하나를 고르시면 대화가 열립니다.
            </GuideNote>
          ) : (
            <GuideNote>보내주신 날짜를 전달했어요. 상대가 고르면 대화가 열립니다.</GuideNote>
          )
        ) : !isMale && requestCount > 0 ? (
          // 여러 남성이 동시에 티켓을 쓸 수 있다 — 한 건만 보여주면 나머지는
          // 답을 못 받고 24시간 뒤 자동 환불된다.
          <GuideNote action={<CardAction to="/requests">요청 확인하기</CardAction>}>
            {requestCount > 1
              ? `만나고 싶다는 요청이 ${requestCount}건 도착했어요. 각각 따로 답하실 수 있습니다.`
              : "만나고 싶다는 요청이 도착했어요. 날짜를 확인하고 답해 주세요."}
          </GuideNote>
        ) : meeting ? (
          <WaitingCard
            now={now}
            deadlineAt={serverState?.deadline_at ?? null}
            paid={introPaymentsEnabled === true}
          />
        ) : blocksNewIntro ? (
          primaryState === "photos_pending" ? (
            <GuideNote>사진 검수가 끝나면 새 소개를 받을 수 있어요.</GuideNote>
          ) : primaryState === "profile_incomplete" ? (
            <GuideNote
              action={
                <CardAction to="/signup" search={{ edit: "1" }}>
                  프로필 확인하기
                </CardAction>
              }
            >
              아직 확인할 정보가 있어요.
            </GuideNote>
          ) : primaryState === "policy_required" ? (
            <GuideNote action={<CardAction to="/consent">내용 확인하기</CardAction>}>
              새 소개를 받으려면 현재 약관에 동의해 주세요.
            </GuideNote>
          ) : null
        ) : candidate ? (
          /*
            "답은 상대에게 바로 보이지 않습니다" 는 여성의 평가에만 맞는 말이다. 남성에게
            여기 오는 candidate 는 이미 연 소개라 답할 것이 없다 — 예전에는 둘 다에게
            같은 안내가 붙어 남성 화면이 사실과 다른 말을 했다.
          */
          <>
            {isMale ? null : (
              <GuideNote>
                {serverState?.intro_progress?.has_likes
                  ? "마음을 남긴 소개가 있어요. 만남 요청이 오면 홈에서 확인할 수 있어요."
                  : "좋아요는 만남 확정이 아니에요. 요청이 오면 날짜를 보고 결정해요."}
              </GuideNote>
            )}
            <div className={isMale ? undefined : "mt-4"}>
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
            action={
              introTickets > 0 || introPaymentsEnabled === false ? (
                <CardAction to="/intro">소개 열어보기</CardAction>
              ) : (
                <CardAction to="/store" search={{ kind: "intro" }}>
                  {introPaymentsEnabled === null
                    ? "티켓 확인하기"
                    : introPaymentsEnabled
                      ? "소개 티켓 구매하기"
                      : "무료 티켓 신청하기"}
                </CardAction>
              )
            }
          >
            {queued > 1
              ? `${queued}건의 소개가 기다리고 있어요. 한 분씩 확인해 보세요.`
              : "한 분의 소개가 기다리고 있어요."}
            {introTickets === 0 && introPaymentsEnabled !== false
              ? introPaymentsEnabled === null
                ? " 티켓 안내를 확인해 주세요."
                : introPaymentsEnabled
                  ? " 열람에는 소개 티켓 1장이 필요해요."
                  : " 열람 전에 무료 티켓을 신청해 주세요."
              : ""}
          </GuideNote>
        ) : null}
      </div>

      {!isMale &&
      !meeting &&
      !candidate &&
      requestCount === 0 &&
      !blocksNewIntro &&
      primaryState !== "paused" &&
      serverState?.intro_progress?.has_likes ? (
        <div className="mt-5">
          <GuideNote>
            애프터가 어울릴 소개를 살펴봐요. 만남 요청이 오면 이곳에서 확인할 수 있어요.
          </GuideNote>
        </div>
      ) : null}

      {(needsPhone || needsPhotos) && !loading && !loadError && blocksNewIntro ? (
        <section className="mt-8 border-t border-border pt-5" aria-labelledby="home-ready-title">
          <h2 id="home-ready-title" className="text-sm font-semibold text-foreground">
            새 소개를 받으려면
          </h2>
          <div className="mt-2 divide-y divide-border">
            {needsPhone ? (
              <Link
                to="/verify-phone"
                className="flex min-h-14 items-center justify-between gap-3 py-3 text-sm text-foreground"
              >
                <span>
                  {primaryState === "identity_required" ? "본인·성인 확인" : "휴대폰 인증"}
                </span>
                <ArrowRight className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
              </Link>
            ) : null}
            {needsPhotos ? (
              <Link
                to="/signup"
                search={{ edit: true }}
                className="flex min-h-14 items-center justify-between gap-3 py-3 text-sm text-foreground"
              >
                <span>
                  {currentProfile?.photo_state === "rejected" ? "사진 다시 올리기" : "사진 추가"}
                </span>
                {photoCount < MIN_PHOTOS ? (
                  <span className="ml-auto text-xs text-muted-foreground">
                    {photoCount}/{MIN_PHOTOS}장
                  </span>
                ) : null}
                <ArrowRight className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
              </Link>
            ) : null}
          </div>
        </section>
      ) : null}

      {/*
        진행 중인 만남이 없을 때만 띄운다. 약속이 잡혀 있으면 화면에 이미 할 일이
        있고, 그때 "소개 받기" 스위치는 지금 하는 일과 무관한 잡음이다.
      */}
      {/*
        소개가 도착한 상태에서는 띄우지 않는다. 같은 화면에서 "도착했어요" 와 "준비되면
        알려드릴게요" 가 함께 보였다 — 도착했으면 할 일은 위 카드 하나다.
      */}
      {!loading &&
      !loadError &&
      (serverState?.readiness.ready || primaryState === "paused") &&
      !needsPhone &&
      !needsPhotos &&
      !meeting &&
      !noShow &&
      !candidate &&
      !(isMale && queued > 0) ? (
        <ReadinessPanel
          isMale={isMale}
          paused={currentProfile?.paused_at !== null && currentProfile?.paused_at !== undefined}
          introTickets={introTickets}
          introPaymentsEnabled={introPaymentsEnabled}
          meetWindow={meetWindow}
          onToggle={async (next) => {
            const release = live.beginInteraction();
            try {
              await setPaused(next);
              await refresh();
              toast.success(next ? "새 소개를 멈췄습니다." : "다시 소개를 받습니다.");
            } catch (err) {
              toast.error(err instanceof Error ? err.message : "설정을 바꾸지 못했습니다.");
            } finally {
              release();
            }
          }}
        />
      ) : null}
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
  introPaymentsEnabled,
  meetWindow,
  onToggle,
}: {
  isMale: boolean;
  paused: boolean;
  introTickets: number;
  introPaymentsEnabled: boolean | null;
  meetWindow: MeetWindow | null;
  onToggle: (next: boolean) => Promise<void>;
}) {
  const [busy, setBusy] = useState(false);

  return (
    <section className="mt-4" aria-label="소개 설정">
      <div className="app-elevated overflow-hidden rounded-surface bg-card">
        <div className="readiness-status flex min-h-24 items-center gap-3.5 px-5 py-4">
          <span className="min-w-0 flex-1">
            <span className="block text-sm font-semibold">
              {paused ? "소개 쉬어가기" : "새 소개 받기"}
            </span>
            <span className="mt-1 block text-xs leading-relaxed">
              {paused
                ? "새 소개가 오지 않습니다. 진행 중인 약속은 그대로입니다."
                : "새 소개는 이곳에서 확인할 수 있어요."}
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
              {introPaymentsEnabled === false
                ? "베타 기간에는 무료로 열 수 있어요."
                : introTickets > 0
                  ? `소개 티켓 ${introTickets}장 보유`
                  : introPaymentsEnabled === null
                    ? "티켓 안내를 확인할 수 없습니다."
                    : introPaymentsEnabled
                      ? "소개를 열려면 소개 티켓 1장이 필요합니다."
                      : "소개가 오면 무료 티켓을 신청할 수 있습니다."}
            </span>
            {introTickets === 0 && introPaymentsEnabled !== false ? (
              <Link
                to="/store"
                search={{ kind: "intro" as const }}
                className="shrink-0 text-xs font-semibold text-foreground underline underline-offset-4"
              >
                {introPaymentsEnabled === null
                  ? "티켓 보기"
                  : introPaymentsEnabled
                    ? "티켓 보기"
                    : "무료로 신청"}
              </Link>
            ) : null}
          </div>
        ) : null}
        {!paused ? (
          <Link
            to="/availability"
            className="pressable flex min-h-14 items-center justify-between gap-3 border-t border-border px-5 text-sm hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
          >
            <span className="font-medium">만남 가능 시간</span>
            <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
              {meetWindow?.fresh ? "설정됨" : meetWindow ? "다시 확인" : "요일 설정"}
              <ArrowRight className="size-3.5" aria-hidden="true" />
            </span>
          </Link>
        ) : null}
      </div>
      {!paused ? (
        <img
          src="/brand/after-first-conversation.jpg"
          alt=""
          width="1536"
          height="1024"
          className="app-elevated mt-6 block h-auto w-full rounded-surface"
        />
      ) : null}
    </section>
  );
}

/** 소개가 도착한 상태 — 상세는 /intro 가 담당하므로 여기선 최소한만 보여준다. */
function CandidatePreview({ candidate, isMale }: { candidate: PublicProfile; isMale: boolean }) {
  return (
    <div className="overflow-hidden rounded-surface border border-border bg-card shadow-card">
      <div className="px-5 pt-5 pb-6">
        <p className="text-3xs font-semibold text-muted-foreground">
          {isMale ? "오늘의 소개" : "살펴볼 소개"}
        </p>
        <p className="mt-3 text-2xl leading-[1.3] font-semibold">
          {candidate.name}
          {candidate.age !== null ? (
            <span className="ml-2 text-base text-muted-foreground">{candidate.age}</span>
          ) : null}
        </p>
        <p className="mt-1 text-xs text-muted-foreground">{candidate.job}</p>
        {candidate.headline ? (
          <p className="serif mt-4 line-clamp-2 break-keep break-words border-l-2 border-brand-blush pl-3 text-lg leading-[1.5] text-foreground">
            {candidate.headline}
          </p>
        ) : null}
      </div>
      <Link
        to="/intro"
        className="pressable flex min-h-14 items-center justify-between gap-2 border-t border-border px-5 text-sm font-semibold text-foreground hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
      >
        {isMale ? "프로필 열어보기" : "읽고 답하기"}
        <ArrowRight className="size-4" aria-hidden="true" />
      </Link>
    </div>
  );
}

/**
 * 만남을 요청하고 상대 응답을 기다리는 상태. 유료 모드에서만 티켓 반환을 말한다.
 * 24시간 무응답이면 요청이 종료되므로(P3) 남은 시간을 실제로 보여준다 —
 * 지금까지는 "24시간 안에 오지 않으면" 이라는 정적 문구뿐이었다.
 */
function WaitingCard({
  now,
  deadlineAt,
  paid,
}: {
  now: number | null;
  deadlineAt: string | null;
  paid: boolean;
}) {
  const left = now === null || deadlineAt === null ? null : remaining(deadlineAt, now);

  return (
    <div className="rounded-surface border border-border bg-card px-5 py-5 shadow-card">
      <p className="flex items-center gap-1.5 text-3xs font-semibold text-muted-foreground">
        <Clock className="size-3.5" aria-hidden="true" />
        만남 요청
      </p>
      <p className="mt-2.5 text-sm leading-relaxed text-foreground">
        {deadlineAt === null ? (
          "상대의 답변을 기다리고 있어요."
        ) : left ? (
          <>
            <span className="font-semibold">{left}</span> 안에 답이 없으면{" "}
            {paid ? "사용한 만남 티켓이 돌아옵니다." : "이 요청은 종료돼요."}
          </>
        ) : paid ? (
          "답변 기한이 지났어요. 사용한 만남 티켓이 곧 돌아옵니다."
        ) : (
          "답변 기한이 지났어요. 요청 상태가 정리되는 중입니다."
        )}
      </p>
    </div>
  );
}

/**
 * 약속 시각이 지난 만남 — 종료 후 상태를 분리해 다음 행동을 안내한다.
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
  onInteractionStart,
}: {
  meeting: Meeting;
  counterpart: PublicProfile | null;
  onDone: (m: Meeting) => void;
  onInteractionStart: () => () => void;
}) {
  const navigate = useNavigate();
  const [busy, setBusy] = useState(false);
  const who = counterpart?.name ? `${counterpart.name}님과` : "";

  return (
    <div className="overflow-hidden rounded-surface border border-border bg-card shadow-card">
      <div className="px-5 pt-5 pb-4">
        <p className="text-3xs font-semibold text-muted-foreground">지난 만남</p>
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
            const release = onInteractionStart();
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
              release();
            }
          }}
          className="min-h-12 rounded-control bg-primary text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary-hover focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none disabled:opacity-60"
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
  /* 운영팀 장소로 정한 약속이면 지도 링크를 붙인다(s51). 직접 적은 장소엔 없다. */
  const [mapUrl, setMapUrl] = useState<string | null>(null);
  useEffect(() => {
    setMapUrl(null);
    if (!meeting.place_id) return;
    let alive = true;
    meetPlacesForMe()
      .then((list) => {
        if (alive) setMapUrl(list.find((p) => p.id === meeting.place_id)?.map_url ?? null);
      })
      .catch(() => undefined);
    return () => {
      alive = false;
    };
  }, [meeting.place_id]);

  return (
    <div className="overflow-hidden rounded-surface border border-border bg-card shadow-card">
      <div className="bg-selection px-5 py-5 text-selection-foreground">
        <MeetingSummary
          scheduledAt={meeting.scheduled_at}
          placeName={meeting.place_name}
          counterpartName={counterpart?.name}
        />
        {mapUrl ? (
          <a
            href={mapUrl}
            target="_blank"
            rel="noreferrer"
            className="mt-2 inline-flex min-h-11 items-center text-sm font-semibold text-selection-foreground underline underline-offset-4"
          >
            지도에서 보기
          </a>
        ) : null}
      </div>
      <div className="px-5 py-4">
        <MeetingCheckin
          key={`${meeting.id}:${meeting.schedule_revision}`}
          meetingId={meeting.id}
          embedded
        />
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
        <p className="mt-2 text-center text-xs text-muted-foreground">
          일정 변경·취소도 대화방에서 확인할 수 있어요.
        </p>
      </div>
    </div>
  );
}

/** 자동 안내 카드 안에 들어가는 단일 행동 버튼. */
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
      className="flex min-h-14 items-center justify-center gap-2 bg-primary text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary-hover focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
    >
      {children}
      <ArrowRight className="size-4" aria-hidden="true" />
    </Link>
  );
}
