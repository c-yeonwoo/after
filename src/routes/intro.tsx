import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Heart, Ticket, X } from "lucide-react";
import { toast } from "sonner";

import { AppScreen } from "@/components/app/AppScreen";
import { SafetyMenu } from "@/components/app/SafetyMenu";
import { GuideNote } from "@/components/app/GuideNote";
import { ProfileDetail } from "@/components/app/ProfileDetail";
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
  homeState,
  getMeetingByIntro,
  myPendingCandidate,
  passIntro,
  remainingCandidates,
  submitAffinity,
  type Meeting,
  type PublicProfile,
} from "@/lib/api";
import { useMe } from "@/lib/me";

export const Route = createFileRoute("/intro")({
  head: () => ({
    meta: [
      { title: `이번 소개 — ${BRAND.short}` },
      {
        name: "description",
        content: "한 번에 한 사람. 소개받은 상대의 프로필을 읽고 좋다/다음에를 선택합니다.",
      },
      { property: "og:title", content: `이번 소개 — ${BRAND.short}` },
      { property: "og:description", content: "훑어보는 피드 없이, 한 사람씩 순서대로." },
    ],
  }),
  component: IntroPage,
});

function IntroPage() {
  const { me } = useMe();
  const isMale = me?.gender === "male";
  const navigate = useNavigate();

  const [loading, setLoading] = useState(true);
  const [candidate, setCandidate] = useState<PublicProfile | null>(null);
  const [introId, setIntroId] = useState<string | null>(null);
  const [meeting, setMeeting] = useState<Meeting | null>(null);
  const [confirmPassOpen, setConfirmPassOpen] = useState(false);
  /** 여성 평가 큐에 남은 사람 수. 소진이 다가오는 걸 미리 알 수 있어야 한다. */
  const [remaining, setRemaining] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  /*
    열람 게이트(v2). 진입만으로 소개 티켓이 빠지면 안 되므로, 열린 소개가 없을
    때는 큐·티켓 상태만 읽어 두고 사용자가 누를 때 비로소 open_intro() 를 부른다.
  */
  const [gate, setGate] = useState<{ queued: number; tickets: number } | null>(null);

  async function load() {
    if (!me) return;
    if (isMale) {
      /*
        **여기서 open_intro() 를 부르지 않는다.** v2 부터 그 호출은 소개 티켓
        1장을 차감하므로, 탭을 열기만 해도 5,000원이 빠지게 된다. 이미 열려 있는
        소개만 읽고, 없으면 게이트를 띄워 사용자가 누를 때 연다.
      */
      const existing = await getOpenIntroWithCandidate();
      if (existing) {
        setGate(null);
        setCandidate(existing.candidate);
        setIntroId(existing.intro.id);
        setMeeting(await getMeetingByIntro(existing.intro.id));
      } else {
        const h = await homeState();
        setGate({ queued: h.queued_intros, tickets: h.intro_tickets });
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
      setCandidate(next);
      setRemaining(left);
      setMeeting(null);
    }
    setLoading(false);
  }

  useEffect(() => {
    setLoading(true);
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [me?.id, isMale]);

  if (loading) {
    return (
      <AppScreen title="이번 소개">
        <p className="mt-16 text-center text-sm text-muted-foreground">불러오는 중입니다…</p>
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
            <div className="mt-16 rounded-2xl border border-dashed border-border px-6 py-12 text-center">
              <p className="text-sm font-medium">아직 도착한 소개가 없습니다</p>
              <p className="mt-1.5 text-xs leading-relaxed text-muted-foreground">
                소개는 회원님을 먼저 좋다고 한 분들 중에서 골라 보내드립니다. 준비되면 바로
                알려드릴게요.
              </p>
            </div>
          ) : (
            <div className="mt-10 rounded-2xl border border-border bg-card px-6 py-8 text-center">
              <p className="text-sm font-medium">소개 {gate.queued}건이 도착했습니다</p>
              <p className="mt-1.5 text-xs leading-relaxed text-muted-foreground">
                한 번에 한 분씩 열어 보실 수 있습니다.
              </p>

              {gate.tickets > 0 ? (
                <>
                  <Button
                    size="lg"
                    className="mt-6 w-full"
                    disabled={busy}
                    onClick={async () => {
                      setBusy(true);
                      try {
                        const r = await ensureOpenIntro();
                        if (r.ok) {
                          await load();
                        } else if (r.reason === "no_intro_ticket") {
                          toast.error("소개 티켓이 없습니다.");
                          await load();
                        } else {
                          toast.error("지금은 열 수 있는 소개가 없습니다.");
                          await load();
                        }
                      } finally {
                        setBusy(false);
                      }
                    }}
                  >
                    <Ticket className="size-4" aria-hidden="true" />
                    소개 티켓 1장 쓰고 열기
                  </Button>
                  {/* 소멸이라는 사실을 누르기 전에 말한다 — 열고 나서 알면 늦다. */}
                  <p className="mt-3 text-2xs leading-relaxed text-muted-foreground">
                    보유 {gate.tickets}장 · 열람에 1장이 사용되며 되돌릴 수 없습니다.
                  </p>
                </>
              ) : (
                <>
                  <Button
                    size="lg"
                    className="mt-6 w-full"
                    onClick={() => navigate({ to: "/store", search: { kind: "intro" as const } })}
                  >
                    소개 티켓 사기
                  </Button>
                  <p className="mt-3 text-2xs leading-relaxed text-muted-foreground">
                    소개 프로필을 열려면 소개 티켓 1장이 필요합니다.
                  </p>
                </>
              )}
            </div>
          )
        ) : (
          <div className="mt-16 rounded-2xl border border-dashed border-border px-6 py-12 text-center">
            <p className="text-sm font-medium">평가할 분을 모두 보셨습니다</p>
            <p className="mt-1.5 text-xs leading-relaxed text-muted-foreground">
              새로 가입한 분이 생기면 이어서 보여드릴게요.
            </p>
          </div>
        )}
      </AppScreen>
    );
  }

  // 뷰가 이미 나이를 계산해서 준다 — 생일은 나가지 않는다(S8).
  const view = toProfileView(candidate);

  const maleAnswered = isMale && Boolean(meeting);

  /*
    소개 화면의 주요 행동. AppScreen 의 footer 슬롯으로 넘긴다.

    예전에는 여기서 직접 `fixed bottom-0` 을 깔고 탭바 높이만큼 아래 여백을
    손으로 뺐는데, iOS 실기기에서 버튼과 탭바 사이가 6.3pt 까지 좁아져
    '만남 티켓 쓰기' 를 누르려다 `대화` 탭으로 새는 일이 났다. 흐름 안의
    슬롯에 두면 간격이 계산이 아니라 배치가 된다.
  */
  const actions = maleAnswered ? null : (
    <div className="flex flex-col gap-2">
      <div className="flex gap-2">
        <Button
          variant="outline"
          size="lg"
          className="flex-1"
          disabled={busy}
          onClick={async () => {
            if (isMale) {
              // 되돌릴 수 없는 배제(D3). 확인 없이 진행하지 않는다 — O15.
              setConfirmPassOpen(true);
              return;
            }
            setBusy(true);
            try {
              await submitAffinity(candidate.id!, "pass");
              await load();
            } finally {
              setBusy(false);
            }
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
          <Button size="lg" className="flex-1" onClick={() => navigate({ to: "/ticket" })}>
            <Ticket className="size-4" aria-hidden="true" />
            만남 티켓 쓰기
          </Button>
        ) : (
          <Button
            size="lg"
            className="flex-1"
            disabled={busy}
            onClick={async () => {
              setBusy(true);
              try {
                await submitAffinity(candidate.id!, "like");
                toast.success("호감을 전달했습니다.");
                await load();
              } finally {
                setBusy(false);
              }
            }}
          >
            <Heart className="size-4" aria-hidden="true" />
            좋아요
          </Button>
        )}
      </div>
      {/*
          여성은 평가 건수가 많아 매번 확인 다이얼로그를 띄우면 벌처럼 느껴진다.
          대신 되돌릴 수 없다는 사실만 상시 노출한다 — 남성 쪽은 단발 결정이라
          다이얼로그를 유지한다.
        */}
      {isMale ? null : (
        <p className="mt-2 text-center text-2xs text-muted-foreground">
          {/*
              남은 수를 말해 준다. remainingCandidates() 는 S10 에서 만들어 뒀는데
              어느 화면도 쓰지 않고 있었다 — 소진이 임박한 걸 알 방법이 없었다.
              되돌릴 수 없다는 고지는 그대로 유지한다.
            */}
          {remaining !== null && remaining <= 1
            ? "지금 보시는 분이 마지막입니다. 한 번 답하면 다시 소개되지 않습니다."
            : remaining !== null
              ? `한 번 답하면 다시 소개되지 않습니다. 이분 외 ${remaining - 1}명 남았어요.`
              : "한 번 답하면 이분은 다시 소개되지 않습니다."}
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
      <div className="mb-4">
        {/*
          남성에게는 "이분이 먼저 골랐다"를 명시한다.
          open_intro() 의 불변식 1 이 이걸 보장한다 — 남성은 자신에게 like 를 준
          여성만 볼 수 있고, 없으면 P0002 로 아예 열리지 않는다. 그런데 이 사실이
          UI 어디에도 없었다. 3만원을 정당화하는 가장 강한 근거인데 화면은
          "오늘 소개할 한 분입니다"라고만 말했다.
          여성에게는 성립하지 않는 문장이므로(평가 큐다) 갈라 쓴다.
        */}
        <GuideNote>
          {maleAnswered
            ? "답을 받았습니다. 다음 단계는 제가 안내하겠습니다."
            : isMale
              ? "이분이 먼저 회원님을 좋다고 하셨어요. 편하게 읽고 답해 주세요."
              : "오늘 평가할 한 분입니다. 편하게 읽고 답해 주세요."}
        </GuideNote>
      </div>

      <ProfileDetail p={view} />

      {maleAnswered ? (
        <div className="mt-8 rounded-xl border border-border bg-card px-4 py-4 text-sm">
          <p className="font-medium text-primary-strong">
            {meeting?.prefs_submitted_at ? "대화가 열렸습니다" : "상대의 답변을 기다리는 중입니다"}
          </p>
          <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
            {meeting?.prefs_submitted_at
              ? "날짜와 장소만 정하면 됩니다."
              : "가능한 날과 취향을 여쭤봤어요. 답이 오면 대화가 열립니다."}
          </p>
          <Button
            className="mt-4 w-full"
            size="lg"
            onClick={() =>
              meeting?.prefs_submitted_at ? navigate({ to: "/chats" }) : navigate({ to: "/ticket" })
            }
          >
            {meeting?.prefs_submitted_at ? "대화 이어가기" : "진행 상황 보기"}
          </Button>
        </div>
      ) : null}

      <AlertDialog open={confirmPassOpen} onOpenChange={setConfirmPassOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>이 소개를 넘기시겠어요?</AlertDialogTitle>
            <AlertDialogDescription>
              <b className="font-semibold text-foreground">두 분은 다시 만나지 않습니다.</b> 이분은
              앞으로 소개되지 않고, 상대에게도 회원님이 소개되지 않습니다. 되돌릴 수 없습니다.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={busy}>취소</AlertDialogCancel>
            <AlertDialogAction
              disabled={busy}
              onClick={async (e) => {
                e.preventDefault();
                if (!introId) return;
                setBusy(true);
                try {
                  await passIntro(introId);
                  setConfirmPassOpen(false);
                  toast("넘겼습니다. 다음 소개를 준비할게요.");
                  navigate({ to: "/home" });
                } finally {
                  setBusy(false);
                }
              }}
            >
              넘기기
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </AppScreen>
  );
}
