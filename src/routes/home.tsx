import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { ArrowRight, Check, Clock } from "lucide-react";
import { toast } from "sonner";

import { MeetingSummary } from "@/components/app/MeetingSummary";
import { MIN_PHOTOS } from "@/components/onboarding/basics";
import { AppScreen } from "@/components/app/AppScreen";
import { Button } from "@/components/ui/button";
import { GuideNote } from "@/components/app/GuideNote";
import { NoShowPrompt } from "@/components/app/NoShowPrompt";
import { LiveRefreshNotice } from "@/components/app/LiveRefreshNotice";
import { BRAND } from "@/lib/brand";
import {
  markMet,
  meetPlacesForMe,
  type Meeting,
  type PublicProfile,
  type HomeStateV2,
} from "@/lib/api";
import { useMe } from "@/lib/me";
import { useMemberHome } from "@/lib/useMemberHome";
import { AssistantDock } from "@/components/assistant/AssistantDock";
import { ProfilePreparationHome } from "@/components/assistant/ProfilePreparationHome";
import { assistantWelcome } from "@/lib/assistantExperience";

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
      return "곧, 만나겠네요.";
    case "profile_incomplete":
      return "소개받을 준비를 해볼까요?";
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
      return "언제 만나볼까요?";
    case "schedule_waiting":
      return "답변을 기다리고 있어요.";
    case "request_received":
      return "만남 요청이 왔어요.";
    case "request_waiting":
      return "마음을 전했어요.";
    case "intro_available":
      return isMale ? "새로운 분이 도착했어요." : "어떤 분인지 살펴볼까요?";
    case "intro_delivered":
      return "소개가 도착했어요.";
    case "paused":
      return "소개를 잠시 쉬고 있어요.";
    case "waiting":
      return "아직 새 소개가 없어요.";
  }
}

function HomePage() {
  const { me, ready } = useMe();
  const navigate = useNavigate();
  const live = useMemberHome(me?.id, ready && Boolean(me && me.onboarding_step >= 7));
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
  const requestCount = serverState?.request_count ?? 0;
  const loading = live.isPending && !live.isPaused;
  const loadError = (live.isError || live.isPaused) && !live.data;
  // 환불 기한 카운트다운용. 서버 시각이 권위이고 이건 표시 전용이다.
  const [now, setNow] = useState<number | null>(null);
  const serverClockOffset = useRef(0);

  useEffect(() => {
    if (ready && !me) navigate({ to: "/" });
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
    : live.isError || live.isPaused
      ? "최신 상태를 확인하지 못했어요."
      : primaryState
        ? primaryState === "waiting" && !isMale && serverState?.intro_progress?.has_likes
          ? "마음을 남긴 소개가 있어요."
          : stateHeadline(primaryState, isMale)
        : "지금 상태를 확인하고 있어요.";
  const hasPriorityContent = Boolean(
    loading ||
    loadError ||
    meeting ||
    (!isMale && requestCount > 0) ||
    (blocksNewIntro &&
      ["photos_pending", "profile_incomplete", "policy_required"].includes(primaryState ?? "")) ||
    candidate ||
    (isMale && queued > 0),
  );
  const welcome = assistantWelcome(currentProfile?.name, now);

  if (ready && me && me.onboarding_step < 7) return <ProfilePreparationHome profile={me} />;

  if (!ready || !me) {
    return (
      <AppScreen>
        <p className="mt-16 text-center text-sm text-muted-foreground">불러오는 중입니다…</p>
      </AppScreen>
    );
  }

  return (
    <AppScreen keyboardAware footer={<div id="assistant-home-composer" />}>
      <div className="home-greeting assistant-home-greeting" aria-label="애프터 매니저 안내">
        <div className="assistant-home-status min-w-0">
          <h1 className="text-xl leading-snug font-semibold tracking-[-0.025em] break-keep">
            <span className="[overflow-wrap:anywhere]">{welcome.greeting}</span>
          </h1>
          <p className="mt-2 break-keep text-sm leading-relaxed text-muted-foreground">
            {welcome.invitation}
          </p>
        </div>
      </div>

      <div className="home-progress mt-5">
        <h2 className="break-keep text-base font-semibold leading-relaxed">{headline}</h2>
        {!live.isError &&
        !live.isPaused &&
        primaryState === "waiting" &&
        !isMale &&
        serverState?.intro_progress?.has_likes ? (
          <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
            만남 요청이 오면 날짜를 보고 결정해요.
          </p>
        ) : null}
      </div>

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
      {hasPriorityContent ? (
        <div className="mt-5">
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
                : "날짜를 확인하고 답해 주세요."}
            </GuideNote>
          ) : meeting ? (
            <>
              <WaitingCard
                now={now}
                deadlineAt={serverState?.deadline_at ?? null}
                paid={introPaymentsEnabled === true}
              />
              <Link
                to="/chats"
                className="mt-2 flex min-h-11 items-center gap-2 text-sm font-semibold"
              >
                요청·약속 확인
                <ArrowRight className="size-4" aria-hidden="true" />
              </Link>
            </>
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
                    ? "마음을 남긴 소개가 있어요. 요청이 오면 날짜를 보고 결정해요."
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

      <AssistantDock
        key={me.id}
        showIdentity
        hasMeeting={
          loading || loadError || live.isError || live.isPaused ? undefined : Boolean(meeting)
        }
        hasOpenIntro={
          loading || loadError || live.isError || live.isPaused
            ? undefined
            : Boolean(serverState?.has_open_intro)
        }
        state={loadError || live.isError || live.isPaused ? undefined : (primaryState ?? undefined)}
        status={
          live.isError || live.isPaused
            ? "연결이 끊겨 최신 상태를 확인하지 못했어요. 위의 다시 확인하기를 눌러주세요."
            : headline
        }
        counterpartId={candidate?.id}
      />
    </AppScreen>
  );
}

/** 소개가 도착한 상태 — 상세는 /intro 가 담당하므로 여기선 최소한만 보여준다. */
function CandidatePreview({ candidate, isMale }: { candidate: PublicProfile; isMale: boolean }) {
  return (
    <div className="introduction-arrival overflow-hidden rounded-surface">
      <div className="px-5 pt-5 pb-6">
        <p className="text-2xl leading-[1.3] font-semibold">
          {candidate.name}
          {candidate.age !== null ? (
            <span className="ml-2 text-base text-muted-foreground">{candidate.age}</span>
          ) : null}
        </p>
        <p className="mt-1 text-xs text-muted-foreground">{candidate.job}</p>
        {candidate.headline ? (
          <p className="mt-4 line-clamp-2 break-keep break-words text-lg leading-[1.5] font-medium text-foreground">
            {candidate.headline}
          </p>
        ) : null}
      </div>
      <Link
        to="/intro"
        className="app-primary-button pressable mx-5 mb-5 flex min-h-12 items-center justify-between gap-2 rounded-control bg-primary px-4 text-sm font-semibold text-primary-foreground hover:bg-primary-hover focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
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
          className="app-primary-button min-h-12 rounded-control bg-primary text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary-hover focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none disabled:opacity-60"
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
  const [mapUrl, setMapUrl] = useState<string | null>(null);
  useEffect(() => {
    setMapUrl(null);
    if (!meeting.place_id) return;
    let alive = true;
    meetPlacesForMe()
      .then((places) => {
        if (alive)
          setMapUrl(places.find((place) => place.id === meeting.place_id)?.map_url ?? null);
      })
      .catch(() => undefined);
    return () => {
      alive = false;
    };
  }, [meeting.place_id]);
  return (
    <section className="home-appointment" aria-label="다음 약속">
      <div className="mb-3 flex items-center justify-between gap-3">
        <h2 className="min-w-0 break-keep font-semibold">
          {counterpart?.name ? `${counterpart.name}님과의 약속` : "다음 약속"}
        </h2>
        <span className="flex shrink-0 items-center gap-1 text-xs font-semibold">
          <Check className="size-3.5" aria-hidden="true" />
          확정
        </span>
      </div>
      <MeetingSummary
        scheduledAt={meeting.scheduled_at}
        placeName={meeting.place_name}
        placeUrl={mapUrl}
      />
      <Link
        to="/chat/$id"
        params={{ id: meeting.id }}
        className="home-appointment-action pressable"
      >
        약속 보기
        <ArrowRight className="size-4" aria-hidden="true" />
      </Link>
    </section>
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
      className="app-primary-button flex min-h-14 items-center justify-center gap-2 bg-primary text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary-hover focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
    >
      {children}
      <ArrowRight className="size-4" aria-hidden="true" />
    </Link>
  );
}
