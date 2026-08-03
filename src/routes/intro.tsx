import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Heart, Ticket, X } from "lucide-react";
import { toast } from "sonner";

import { AppScreen } from "@/components/app/AppScreen";
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
import {
  DRINKING_OPTIONS,
  RELIGION_OPTIONS,
  SMOKING_OPTIONS,
} from "@/components/onboarding/basics";
import { followUpFor } from "@/components/onboarding/profile";
import { BRAND, HUBS } from "@/lib/brand";
import {
  ensureOpenIntro,
  getMeetingByIntro,
  myPendingCandidate,
  passIntro,
  submitAffinity,
  useMe,
  type Meeting,
  type PublicProfile,
} from "@/lib/api";

export const Route = createFileRoute("/intro")({
  head: () => ({
    meta: [
      { title: `이번 소개 — ${BRAND.name}` },
      {
        name: "description",
        content: "한 번에 한 사람. 소개받은 상대의 프로필을 읽고 좋다/다음에를 선택합니다.",
      },
      { property: "og:title", content: `이번 소개 — ${BRAND.name}` },
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
  const [busy, setBusy] = useState(false);

  async function load() {
    if (!me) return;
    if (isMale) {
      const opened = await ensureOpenIntro();
      if (!opened) {
        setCandidate(null);
        setIntroId(null);
        setMeeting(null);
        setLoading(false);
        return;
      }
      setCandidate(opened.candidate);
      setIntroId(opened.intro.id);
      setMeeting(await getMeetingByIntro(opened.intro.id));
    } else {
      // 여성 소개 탭은 **평가 큐 전용**이다.
      // 예전에는 대기 중인 만남 요청이 있으면 그 요청자를 대신 띄웠는데,
      // 그러면 평가할 후보가 남아 있어도 평가를 계속할 수 없었다.
      // 요청은 성격이 다른 이벤트라 /requests 와 홈이 담당한다.
      setCandidate(await myPendingCandidate(me.hub_id));
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
        <div className="mt-16 rounded-2xl border border-dashed border-border px-6 py-12 text-center">
          <p className="text-sm font-medium">지금은 열려 있는 소개가 없습니다</p>
          <p className="mt-1.5 text-xs leading-relaxed text-muted-foreground">
            다음 소개가 준비되면 알려드릴게요.
          </p>
        </div>
      </AppScreen>
    );
  }

  // 뷰가 이미 나이를 계산해서 준다 — 생일은 나가지 않는다(S8).
  const age = candidate.age;
  const details = (candidate.details as Record<string, string> | null) ?? {};
  const answers = (candidate.interests ?? [])
    .map((v) => v.trim())
    .filter(Boolean)
    .map((label) => ({ q: followUpFor(label), a: (details[label] ?? "").trim() }))
    .filter((x) => x.a);

  const maleAnswered = isMale && Boolean(meeting);

  return (
    <AppScreen title="이번 소개">
      <div className="mb-4">
        <GuideNote>
          {maleAnswered
            ? "답을 받았습니다. 다음 단계는 제가 안내하겠습니다."
            : "오늘 소개할 한 분입니다. 편하게 읽고 답해 주세요."}
        </GuideNote>
      </div>

      <ProfileDetail
        p={{
          name: candidate.name ?? "",
          age,
          job: candidate.job ?? "",
          mbti: candidate.mbti ?? undefined,
          smoking: SMOKING_OPTIONS.find((o) => o.id === candidate.smoking)?.label,
          drinking: DRINKING_OPTIONS.find((o) => o.id === candidate.drinking)?.label,
          religion: RELIGION_OPTIONS.find((o) => o.id === candidate.religion)?.label,
          area: HUBS.find((h) => h.id === candidate.hub_id)?.label,
          photo: candidate.photo_url ?? undefined,
          headline: candidate.headline ?? "",
          intro: candidate.intro ?? "",
          interests: candidate.interests ?? [],
          matchTags: candidate.match_tags ?? [],
          topics: candidate.topics ?? [],
          answers,
        }}
      />

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
      ) : (
        <div
          className="fixed inset-x-0 bottom-0 z-30 mx-auto w-full max-w-[430px] border-t border-border/70 bg-background/95 px-6 pt-3 backdrop-blur-xl"
          style={{ paddingBottom: "calc(env(safe-area-inset-bottom, 0px) + 5rem)" }}
        >
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
              한 번 답하면 이분은 다시 소개되지 않습니다.
            </p>
          )}
        </div>
      )}

      {/* 하단 고정 버튼에 가리지 않도록 여백 */}
      {maleAnswered ? null : <div aria-hidden="true" className="h-20" />}

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
