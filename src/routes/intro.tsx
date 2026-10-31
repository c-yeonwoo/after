import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Heart, Ticket, X } from "lucide-react";
import { toast } from "sonner";

import { AppScreen } from "@/components/app/AppScreen";
import { SafetyMenu } from "@/components/app/SafetyMenu";
import { GuideNote } from "@/components/app/GuideNote";
import { ProfileDetail } from "@/components/app/ProfileDetail";
import { IntroductionReason } from "@/components/app/IntroductionReason";
import { AssistantMark } from "@/components/assistant/AssistantMark";
import { Button } from "@/components/ui/button";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { BRAND } from "@/lib/brand";
import { toProfileView } from "@/lib/profileView";
import {
  ensureOpenIntro,
  getOpenIntroWithCandidate,
  homeStateV2,
  introTeaser,
  getMeetingByIntro,
  myPendingCandidate,
  passIntro,
  paymentsEnabled,
  remainingCandidates,
  submitAffinity,
  type IntroTeaser,
  type Meeting,
  type PublicProfile,
} from "@/lib/api";
import { useMe } from "@/lib/me";

export const Route = createFileRoute("/intro")({
  head: () => ({
    meta: [
      { title: `이번 소개 — ${BRAND.name}` },
      {
        name: "description",
        content: "한 사람의 소개를 읽고, 마음이 가는 만남을 천천히 정합니다.",
      },
      { property: "og:title", content: `이번 소개 — ${BRAND.name}` },
      { property: "og:description", content: "훑어보는 피드 없이, 한 사람씩 순서대로." },
    ],
  }),
  component: IntroPage,
});

function IntroPage() {
  const { me, ready } = useMe();
  const isMale = me?.gender === "male";
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const generation = useRef(0);
  const accountEpoch = useRef(0);
  const sending = useRef(false);
  const passButton = useRef<HTMLButtonElement>(null);

  const [loading, setLoading] = useState(true);
  const [loadedAccount, setLoadedAccount] = useState<string | null>(null);
  const [loadError, setLoadError] = useState(false);
  const [preparationMessage, setPreparationMessage] = useState<string | null>(null);
  const [candidate, setCandidate] = useState<PublicProfile | null>(null);
  const [introId, setIntroId] = useState<string | null>(null);
  const [meeting, setMeeting] = useState<Meeting | null>(null);
  const [passTarget, setPassTarget] = useState<{
    id: string;
    name: string;
    introId: string | null;
    male: boolean;
    accountId: string;
  } | null>(null);
  const [hasLikes, setHasLikes] = useState(false);
  /** 여성 평가 큐에 남은 사람 수. 소진이 다가오는 걸 미리 알 수 있어야 한다. */
  const [remaining, setRemaining] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  /*
    열람 게이트(v2). 진입만으로 소개 티켓이 빠지면 안 되므로, 열린 소개가 없을
    때는 큐·티켓 상태만 읽어 두고 사용자가 누를 때 비로소 open_intro() 를 부른다.
  */
  const [gate, setGate] = useState<{
    queued: number;
    tickets: number;
    teaser: IntroTeaser | null;
  } | null>(null);
  const [paid, setPaid] = useState<boolean | null>(null);
  /** 연 소개에 운영팀이 남긴 한 줄(s50). */
  const [reason, setReason] = useState<string | null>(null);

  async function load() {
    if (!me) return;
    const current = ++generation.current;
    setLoadedAccount(me.id);
    setLoading(true);
    setLoadError(false);
    try {
      const h = await homeStateV2();
      if (current !== generation.current) return;
      if (h.me?.id && h.me.id !== me.id) throw new Error("account changed");
      setHasLikes(Boolean(h.intro_progress?.has_likes));
      if (!h.readiness.ready && !h.has_open_intro && !h.meeting) {
        setPreparationMessage(
          h.primary_state === "paused"
            ? "소개를 쉬고 있어요. 홈에서 다시 받을 수 있습니다."
            : h.primary_state === "photos_pending"
              ? "사진을 확인하는 중이에요. 검수가 끝나면 새 소개를 볼 수 있습니다."
              : "새 소개를 보려면 먼저 준비를 마쳐주세요.",
        );
        setCandidate(null);
        setGate(null);
        return;
      }
      setPreparationMessage(null);
      if (isMale) {
        const paymentMode = await paymentsEnabled();
        if (current !== generation.current) return;
        setPaid(paymentMode);
        /*
        **여기서 open_intro() 를 부르지 않는다.** v2 부터 그 호출은 소개 티켓
        1장을 차감하므로, 탭을 열기만 해도 5,000원이 빠지게 된다. 이미 열려 있는
        소개만 읽고, 없으면 게이트를 띄워 사용자가 누를 때 연다.
      */
        const existing = await getOpenIntroWithCandidate();
        if (current !== generation.current) return;
        if (existing) {
          const pendingMeeting = await getMeetingByIntro(existing.intro.id);
          if (current !== generation.current) return;
          setGate(null);
          setCandidate(existing.candidate);
          setIntroId(existing.intro.id);
          setReason(existing.intro.reason ?? null);
          setMeeting(pendingMeeting);
        } else {
          const teaser = await introTeaser();
          if (current !== generation.current) return;
          setGate({ queued: h.queued_intros, tickets: h.intro_tickets, teaser });
          setCandidate(null);
          setIntroId(null);
          setMeeting(null);
        }
      } else {
        // 여성 소개 탭은 **평가 큐 전용**이다.
        // 예전에는 대기 중인 만남 요청이 있으면 그 요청자를 대신 띄웠는데,
        // 그러면 평가할 후보가 남아 있어도 평가를 계속할 수 없었다.
        // 요청은 성격이 다른 이벤트라 /requests 와 홈이 담당한다.
        // 후보와 남은 수를 함께 받는다 — 화면이 "이번이 마지막"을 말할 수 있어야 한다.
        const [next, left] = await Promise.all([myPendingCandidate(), remainingCandidates()]);
        if (current !== generation.current) return;
        setCandidate(next);
        setRemaining(left);
        setMeeting(null);
      }
    } catch {
      if (current === generation.current) setLoadError(true);
    } finally {
      if (current === generation.current) setLoading(false);
    }
  }

  useEffect(() => {
    accountEpoch.current += 1;
    generation.current += 1;
    setPassTarget(null);
    setHasLikes(false);
    sending.current = false;
    setBusy(false);
    if (!ready) return;
    if (!me) {
      navigate({ to: "/" });
      return;
    }
    setLoading(true);
    void load();
    return () => {
      generation.current += 1;
      accountEpoch.current += 1;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, me?.id, isMale]);

  if (!ready || !me || loadedAccount !== me.id || loading) {
    return (
      <AppScreen title="이번 소개">
        <p className="mt-16 text-center text-sm text-muted-foreground">불러오는 중입니다…</p>
      </AppScreen>
    );
  }

  if (loadError) {
    return (
      <AppScreen title="이번 소개">
        <div role="alert" className="app-elevated mt-10 rounded-surface bg-card p-6">
          <p className="text-sm">소개 상태를 불러오지 못했습니다.</p>
          <Button className="mt-4" variant="outline" onClick={() => void load()}>
            다시 확인
          </Button>
        </div>
      </AppScreen>
    );
  }

  if (preparationMessage) {
    return (
      <AppScreen title="이번 소개">
        <div className="app-elevated mt-10 rounded-surface bg-card p-6">
          <p className="text-sm">{preparationMessage}</p>
          <Button className="mt-4" onClick={() => navigate({ to: "/home" })}>
            내 상태 확인하기
          </Button>
        </div>
      </AppScreen>
    );
  }

  if (!candidate) {
    return (
      <AppScreen title="이번 소개">
        {/*
          남성은 원인이 셋이라 문장도 셋이어야 한다(v2).

            ① 큐에 카드가 있고 티켓도 있다 → 열 수 있다. 확인을 받고 차감한다.
            ② 카드는 있는데 티켓이 없다     → 살 수 있다. 상점으로 보낸다.
            ③ 카드가 없다                  → 운영자를 기다린다. 할 일이 없다.

          하나로 뭉개면 티켓만 사면 볼 수 있는 사람에게 "기다려 주세요" 라고
          말하거나, 큐가 빈 사람에게 결제를 권하게 된다.
        */}
        {isMale && gate ? (
          gate.queued === 0 ? (
            <div className="app-elevated mt-10 rounded-surface bg-card px-6 py-10 text-center">
              <p className="text-sm font-medium">아직 도착한 소개가 없습니다</p>
              <p className="mt-1.5 text-xs leading-relaxed text-muted-foreground">
                소개가 준비되면 알려드릴게요.
              </p>
            </div>
          ) : (
            <div className="app-elevated mt-6 rounded-surface bg-card px-5 py-6">
              {/*
                열기 전 공개(D2 ①). 예전에는 상대 정보가 0개인 채로 "소개 티켓 1장 쓰고 열기"
                만 있었다 — 5,000원짜리 뽑기였다. 이제 무엇을 여는지 알고 연다. 이름·사진·
                소개글은 열어야 보인다. "먼저 관심" 같은 말은 쓰지 않는다(D4).
              */}
              {gate.teaser ? (
                <TeaserCard teaser={gate.teaser} />
              ) : (
                <p className="text-center text-sm font-medium">
                  소개 {gate.queued}건이 도착했습니다
                </p>
              )}

              {gate.tickets > 0 || paid === false ? (
                <>
                  <Button
                    size="lg"
                    className="mt-6 w-full"
                    disabled={busy}
                    onClick={async () => {
                      if (sending.current || !me) return;
                      sending.current = true;
                      const account = accountEpoch.current;
                      setBusy(true);
                      try {
                        const r = await ensureOpenIntro();
                        if (account !== accountEpoch.current) return;
                        queryClient.removeQueries({
                          queryKey: ["member-home", me.id],
                          exact: true,
                        });
                        if (r.ok) {
                          await load();
                        } else if (r.reason === "no_intro_ticket") {
                          toast.error("소개 티켓이 없습니다.");
                          await load();
                        } else {
                          toast.error("지금은 열 수 있는 소개가 없습니다.");
                          await load();
                        }
                      } catch {
                        if (account === accountEpoch.current) {
                          toast.error("열람 결과를 확인하지 못했어요. 상태를 다시 확인할게요.");
                          await load();
                        }
                      } finally {
                        if (account === accountEpoch.current) {
                          sending.current = false;
                          setBusy(false);
                        }
                      }
                    }}
                  >
                    <Ticket className="size-4" aria-hidden="true" />
                    {paid === false ? "베타 무료로 열기" : "소개 티켓 1장 쓰고 열기"}
                  </Button>
                  {/* 소멸이라는 사실을 누르기 전에 말한다 — 열고 나서 알면 늦다. */}
                  <p className="mt-3 text-2xs leading-relaxed text-muted-foreground">
                    {paid === false
                      ? "베타 기간에는 소개 열람에 결제한 티켓을 사용하지 않습니다."
                      : `보유 ${gate.tickets}장 · 열람에 1장이 사용되며 되돌릴 수 없습니다.`}
                  </p>
                </>
              ) : (
                <>
                  <Button
                    size="lg"
                    className="mt-6 w-full"
                    onClick={() => navigate({ to: "/store", search: { kind: "intro" as const } })}
                  >
                    소개 티켓 신청하기
                  </Button>
                  <p className="mt-3 text-2xs leading-relaxed text-muted-foreground">
                    소개 프로필을 열려면 소개 티켓 1장이 필요합니다.
                  </p>
                </>
              )}
            </div>
          )
        ) : (
          <div className="app-elevated mt-10 rounded-surface bg-card px-6 py-10 text-center">
            <p className="text-sm font-medium">
              {hasLikes ? "마음을 남겼어요" : "지금 살펴볼 소개를 모두 확인했어요"}
            </p>
            <p className="mt-1.5 text-xs leading-relaxed text-muted-foreground">
              {hasLikes
                ? "애프터가 소개를 살펴봐요. 만남 요청이 오면 홈에서 확인할 수 있어요."
                : "새 소개가 준비되면 이어서 보여드릴게요."}
            </p>
            <Button asChild variant="outline" className="mt-5">
              <Link to="/home">홈에서 진행 확인</Link>
            </Button>
          </div>
        )}
      </AppScreen>
    );
  }

  // 뷰가 이미 나이를 계산해서 준다 — 생일은 나가지 않는다(S8).
  const view = toProfileView(candidate);

  const maleHasRequest = isMale && Boolean(meeting);

  /*
    소개 화면의 주요 행동. AppScreen 의 footer 슬롯으로 넘긴다.

    예전에는 여기서 직접 `fixed bottom-0` 을 깔고 탭바 높이만큼 아래 여백을
    손으로 뺐는데, iOS 실기기에서 버튼과 탭바 사이가 6.3pt 까지 좁아져
    '만남 티켓 쓰기' 를 누르려다 `대화` 탭으로 새는 일이 났다. 흐름 안의
    슬롯에 두면 간격이 계산이 아니라 배치가 된다.
  */
  const actions = maleHasRequest ? null : (
    <div className="flex flex-col gap-2">
      {/* 그리드로 반씩 나눈다 — flex-1 은 글자 폭에 밀려 오른쪽 버튼이 카드 밖으로 8px 나갔다. */}
      <div className="grid grid-cols-2 gap-2">
        <Button
          ref={passButton}
          variant="ghost"
          size="lg"
          className="w-full min-w-0 bg-muted text-foreground"
          disabled={busy}
          onClick={() => {
            if (!me || !candidate.id || sending.current) return;
            setPassTarget({
              id: candidate.id,
              name: candidate.name ?? "이분",
              introId,
              male: isMale,
              accountId: me.id,
            });
          }}
        >
          <X className="size-4" aria-hidden="true" />
          {/*
              양쪽 다 되돌릴 수 없다. 남성은 pass_intro() → intro_exclusions 에
              append-only 로 기록되고, 여성은 affinities 의 unique(from_id,to_id)
              때문에 재평가가 막히며 그 상대의 소개는 영영 열리지 않는다.
              "다음에"는 한국어로 "나중에 다시"라 결과와 정반대였다(진단 UX-4).
            */}
          {isMale ? "이 소개 넘기기" : "관심 없어요"}
        </Button>
        {isMale ? (
          <Button
            size="lg"
            className="intro-primary-button w-full min-w-0"
            onClick={() => navigate({ to: "/ticket" })}
          >
            <Ticket className="size-4" aria-hidden="true" />
            {paid === false ? "만남 요청하기" : "만남 티켓 쓰기"}
          </Button>
        ) : (
          <Button
            size="lg"
            className="intro-primary-button w-full min-w-0"
            disabled={busy}
            onClick={async () => {
              if (sending.current) return;
              sending.current = true;
              const current = generation.current;
              const account = accountEpoch.current;
              setBusy(true);
              try {
                await submitAffinity(candidate.id!, "like", me?.id);
                if (current !== generation.current) return;
                queryClient.removeQueries({ queryKey: ["member-home", me?.id], exact: true });
                toast.success("좋아요를 남겼어요.", {
                  description: "만남 확정은 아니에요. 요청이 오면 홈에서 확인할 수 있어요.",
                  duration: 7000,
                  action: { label: "홈에서 확인", onClick: () => navigate({ to: "/home" }) },
                });
                await load();
              } catch (error) {
                if (current === generation.current) {
                  if ((error as { code?: string }).code === "23505") {
                    toast("이미 답한 소개예요. 다음 소개를 확인할게요.");
                    await load();
                  } else if (["42501", "23514"].includes((error as { code?: string }).code ?? "")) {
                    toast("소개 상태가 바뀌었어요. 다시 확인할게요.");
                    await load();
                  } else toast.error("좋아요를 저장하지 못했어요. 다시 눌러주세요.");
                }
              } finally {
                if (account === accountEpoch.current) {
                  sending.current = false;
                  setBusy(false);
                }
              }
            }}
          >
            <Heart className="size-4" aria-hidden="true" />
            좋아요
          </Button>
        )}
      </div>
      {isMale ? null : (
        <p className="mt-2 text-center text-2xs text-muted-foreground">
          {remaining !== null && remaining <= 1
            ? "지금 보시는 분이 마지막 소개예요."
            : remaining !== null
              ? `이분 외 ${remaining - 1}명의 소개가 남아 있어요.`
              : "마음이 가는 분에게 좋아요를 남겨주세요."}
        </p>
      )}
    </div>
  );

  return (
    <AppScreen
      title="이번 소개"
      footer={actions}
      /*
        소개받은 프로필 자체가 부적절할 수 있다. 만나기 전에도 신고할 수 있어야
        한다 — 이 자리가 없으면 "만난 뒤에만 신고 가능"이 된다.
      */
      action={
        candidate.id ? (
          <SafetyMenu
            targetId={candidate.id}
            targetName={candidate.name ?? "이분"}
            kind="profile"
            onDone={() => load()}
          />
        ) : null
      }
    >
      {isMale && reason && !maleHasRequest ? (
        <div className="mb-5">
          <IntroductionReason reason={reason} />
        </div>
      ) : null}

      <div className="mb-5">
        <GuideNote assistant>
          {maleHasRequest
            ? meeting?.confirmed_at
              ? "약속이 정해졌어요. 상세에서 시간과 장소를 확인해 주세요."
              : meeting?.prefs_submitted_at
                ? "상대가 가능한 시간을 보냈어요. 약속할 시간을 골라주세요."
                : "요청을 전달했어요. 아직 상대의 답변을 기다리고 있어요."
            : isMale
              ? "프로필을 읽어보세요. 마음이 가면 날짜와 장소를 함께 제안해요."
              : "어떤 분인지 천천히 읽어보세요. 호감을 보내면 만남 요청이 올 때 알려드릴게요."}
        </GuideNote>
      </div>

      <ProfileDetail
        key={candidate.id}
        p={view}
        viewer={toProfileView(me)}
        assistantSignature={<AssistantMark />}
        introductionTarget={candidate.id ?? undefined}
      />
      {candidate.id && meeting?.confirmed_at && !meeting.cancelled_at ? (
        <Link
          to="/conversation-prep"
          search={{ target: candidate.id }}
          className="assistant-suggestion mt-4 mb-5 flex items-center justify-between gap-3"
        >
          만나기 전 대화 팁 보기<span aria-hidden="true">→</span>
        </Link>
      ) : null}

      {maleHasRequest ? (
        <div className="app-elevated mt-8 rounded-surface bg-card px-5 py-5 text-sm">
          <p className="font-semibold text-foreground">
            {meeting?.confirmed_at
              ? "대화가 열렸습니다"
              : meeting?.prefs_submitted_at
                ? "날짜를 고르면 대화가 열립니다"
                : "상대의 답변을 기다리는 중입니다"}
          </p>
          <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
            {meeting?.confirmed_at
              ? "정해진 약속을 확인하고 이야기를 이어가세요."
              : meeting?.prefs_submitted_at
                ? "가능한 날짜를 받았습니다. 하나를 확정해 주세요."
                : "가능한 날과 취향을 여쭤봤어요. 답이 오면 알려드릴게요."}
          </p>
          <Button
            className="mt-4 w-full"
            size="lg"
            onClick={() =>
              meeting?.confirmed_at
                ? navigate({ to: "/chats" })
                : meeting?.prefs_submitted_at
                  ? navigate({ to: "/schedule", search: { meetingId: meeting.id } })
                  : navigate({ to: "/ticket" })
            }
          >
            {meeting?.confirmed_at
              ? "대화 이어가기"
              : meeting?.prefs_submitted_at
                ? "날짜 고르기"
                : "진행 상황 보기"}
          </Button>
        </div>
      ) : null}

      <AlertDialog
        open={Boolean(passTarget)}
        onOpenChange={(open) => {
          if (!open && !sending.current) setPassTarget(null);
        }}
      >
        <AlertDialogContent
          className="max-h-[85dvh] w-[calc(100%_-_2.5rem)] overflow-y-auto rounded-surface"
          onCloseAutoFocus={(event) => {
            if (passButton.current) {
              event.preventDefault();
              passButton.current.focus();
            }
          }}
        >
          <AlertDialogHeader>
            <AlertDialogTitle>
              {passTarget?.male
                ? "이 소개를 넘기시겠어요?"
                : `${passTarget?.name ?? "이분"}님을 넘길까요?`}
            </AlertDialogTitle>
            <AlertDialogDescription className="break-keep text-pretty leading-relaxed">
              {passTarget?.male
                ? "이분은 앞으로 소개되지 않고, 상대에게도 회원님이 소개되지 않습니다. 되돌릴 수 없어요."
                : "이분은 다시 소개되지 않아요. 관심 없다는 답은 상대에게 전하지 않습니다."}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={busy}>취소</AlertDialogCancel>
            <AlertDialogAction
              disabled={busy}
              onClick={async (e) => {
                e.preventDefault();
                if (!passTarget || passTarget.accountId !== me?.id || sending.current) return;
                if (passTarget.male && !passTarget.introId) return;
                sending.current = true;
                const current = generation.current;
                const account = accountEpoch.current;
                setBusy(true);
                try {
                  if (passTarget.male) await passIntro(passTarget.introId!);
                  else await submitAffinity(passTarget.id, "pass", passTarget.accountId);
                  if (current !== generation.current) return;
                  queryClient.removeQueries({ queryKey: ["member-home", me?.id], exact: true });
                  setPassTarget(null);
                  toast("소개를 넘겼어요.");
                  if (passTarget.male) navigate({ to: "/home" });
                  else await load();
                } catch (error) {
                  if (current === generation.current) {
                    if ((error as { code?: string }).code === "23505") {
                      setPassTarget(null);
                      toast("이미 답한 소개예요. 다음 소개를 확인할게요.");
                      await load();
                    } else if (
                      ["42501", "23514", "P0002"].includes((error as { code?: string }).code ?? "")
                    ) {
                      setPassTarget(null);
                      toast("소개 상태가 바뀌었어요. 다시 확인할게요.");
                      await load();
                    } else toast.error("처리하지 못했어요. 다시 시도해 주세요.");
                  }
                } finally {
                  if (account === accountEpoch.current) {
                    sending.current = false;
                    setBusy(false);
                  }
                }
              }}
            >
              {busy ? "처리 중…" : "넘기기"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </AppScreen>
  );
}

/** 열기 전 공개 — 나이·직업·한 줄 소개·같이 적은 것·운영팀 한 줄. */
function TeaserCard({ teaser }: { teaser: IntroTeaser }) {
  const meta = [teaser.age !== null ? `${teaser.age}세` : null, teaser.job]
    .filter(Boolean)
    .join(" · ");
  return (
    <div>
      <p className="text-xs font-medium text-muted-foreground">
        도착한 소개
        {teaser.delivered > 1 ? ` · 한 번에 한 분씩, ${teaser.delivered}건 중 첫 번째` : ""}
      </p>
      {meta ? <p className="mt-3 text-base font-semibold text-foreground">{meta}</p> : null}
      {teaser.headline ? (
        <p className="serif mt-2 text-lg leading-[1.5] text-foreground">
          <span className="text-primary-strong">“</span>
          {teaser.headline}
        </p>
      ) : null}
      {teaser.shared.length > 0 ? (
        <div className="mt-4">
          <p className="text-xs font-medium text-muted-foreground">두 분이 같이 적은 것</p>
          <p className="mt-1 text-sm text-foreground">{teaser.shared.join(" · ")}</p>
        </div>
      ) : null}
      {teaser.reason ? (
        <div className="mt-4 border-t border-border pt-4">
          <p className="text-xs font-medium text-muted-foreground">애프터 운영팀이 전하는 말</p>
          <p className="mt-1.5 text-base leading-[1.7] text-foreground">{teaser.reason}</p>
        </div>
      ) : null}
      <p className="mt-4 text-xs text-muted-foreground">이름·사진·소개글은 열면 보여요.</p>
    </div>
  );
}
