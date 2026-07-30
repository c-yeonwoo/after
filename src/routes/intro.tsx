import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { Heart, X } from "lucide-react";
import { toast } from "sonner";

import { AppScreen } from "@/components/app/AppScreen";
import { ProfileDetail } from "@/components/app/ProfileDetail";
import { Button } from "@/components/ui/button";
import { BRAND } from "@/lib/brand";
import { getCandidate } from "@/lib/candidates";
import { saveFlow, useFlow } from "@/lib/store";

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
  const { flow } = useFlow();
  const navigate = useNavigate();
  const candidate = flow.introId ? getCandidate(flow.introId) : null;

  if (!candidate || flow.myAnswer === "pass") {
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

  const answered = Boolean(flow.myAnswer);

  return (
    <AppScreen title="이번 소개">
      <p className="mb-5 rounded-xl bg-muted/70 px-4 py-3 text-xs leading-relaxed text-muted-foreground">
        서로 좋다고 해야 대화가 열립니다. 상대에게는 내 선택이 바로 보이지 않습니다.
      </p>

      <ProfileDetail
        p={{
          name: candidate.name,
          age: candidate.age,
          job: candidate.job,
          mbti: candidate.mbti,
          smoking: candidate.smoking,
          drinking: candidate.drinking,
          area: candidate.area,
          distance: candidate.distance,
          headline: candidate.headline,
          intro: candidate.intro,
          interests: candidate.interests,
          matchTags: candidate.matchTags,
          topics: candidate.topics,
          answers: candidate.answers,
        }}
      />

      {answered ? (
        <div className="mt-8 rounded-xl border border-border bg-card px-4 py-4 text-sm">
          <p className="font-medium text-primary-strong">좋다고 답했습니다</p>
          <p className="mt-1 text-xs text-muted-foreground">
            {flow.chatOpen ? "대화가 열렸어요. 대화 탭에서 이어가세요." : "상대의 답을 기다리는 중입니다."}
          </p>
          {flow.chatOpen ? (
            <Button
              className="mt-4 w-full"
              size="lg"
              onClick={() => navigate({ to: "/chat/$id", params: { id: candidate.id } })}
            >
              대화 이어가기
            </Button>
          ) : null}
        </div>
      ) : (
        <div
          className="fixed inset-x-0 bottom-0 z-30 mx-auto w-full max-w-[430px] border-t border-border/70 bg-background/95 px-5 pt-3 backdrop-blur-xl"
          style={{ paddingBottom: "calc(env(safe-area-inset-bottom, 0px) + 5rem)" }}
        >
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="lg"
              className="flex-1"
              onClick={() => {
                saveFlow({ myAnswer: "pass", chatOpen: false });
                toast("다음 소개를 준비할게요.");
                navigate({ to: "/home" });
              }}
            >
              <X className="size-4" aria-hidden="true" />
              다음에
            </Button>
            <Button
              size="lg"
              className="flex-1"
              onClick={() => {
                saveFlow({ myAnswer: "yes", chatOpen: true });
                toast.success("서로 좋다고 했어요. 대화가 열렸습니다.");
                navigate({ to: "/chat/$id", params: { id: candidate.id } });
              }}
            >
              <Heart className="size-4" aria-hidden="true" />
              좋아요
            </Button>
          </div>
        </div>
      )}
    </AppScreen>
  );
}
