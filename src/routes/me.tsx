import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect } from "react";
import { ArrowRight, Pencil } from "lucide-react";

import { AppScreen } from "@/components/app/AppScreen";
import { ProfileDetail, type ProfileView } from "@/components/app/ProfileDetail";
import { Button } from "@/components/ui/button";
import {
  DRINKING_OPTIONS,
  RELIGION_OPTIONS,
  SMOKING_OPTIONS,
  ageFrom,
} from "@/components/onboarding/basics";
import { followUpFor } from "@/components/onboarding/profile";
import { BRAND, HUBS } from "@/lib/brand";
import { resetAll, useMe } from "@/lib/store";

export const Route = createFileRoute("/me")({
  head: () => ({
    meta: [
      { title: `내 프로필 — ${BRAND.name}` },
      {
        name: "description",
        content: "직장 인증과 적응형 인터뷰로 만든 내 소개 프로필을 확인하고 수정합니다.",
      },
      { property: "og:title", content: `내 프로필 — ${BRAND.name}` },
      { property: "og:description", content: "상대에게 보이는 내 소개를 그대로 확인하세요." },
    ],
  }),
  component: MePage,
});

function MePage() {
  const { me, ready } = useMe();
  const navigate = useNavigate();

  useEffect(() => {
    if (ready && !me) navigate({ to: "/onboarding" });
  }, [ready, me, navigate]);

  if (!me) {
    return (
      <AppScreen title="내 프로필">
        <p className="mt-10 text-sm text-muted-foreground">프로필을 불러오는 중입니다.</p>
      </AppScreen>
    );
  }

  const view: ProfileView = {
    name: me.basics.name,
    age: ageFrom(me.basics.birth),
    job: me.basics.job,
    mbti: me.basics.mbti || undefined,
    smoking: SMOKING_OPTIONS.find((o) => o.id === me.basics.smoking)?.label,
    drinking: DRINKING_OPTIONS.find((o) => o.id === me.basics.drinking)?.label,
    religion: RELIGION_OPTIONS.find((o) => o.id === me.basics.religion)?.label,
    area: HUBS.find((h) => h.id === me.hubId)?.label,
    photo: me.basics.photo || undefined,
    headline: me.profile.headline,
    intro: me.intro,
    interests: me.profile.interests.map((v) => v.trim()).filter(Boolean),
    matchTags: me.profile.matchTags,
    topics: me.profile.topics,
    answers: me.profile.interests
      .map((v) => v.trim())
      .filter(Boolean)
      .map((label) => ({ q: followUpFor(label), a: (me.profile.details[label] ?? "").trim() }))
      .filter((x) => x.a),

  };

  return (
    <AppScreen
      title="내 프로필"
      action={
        <Link
          to="/onboarding"
          search={{ edit: true as const }}
          className="inline-flex min-h-9 items-center gap-1 rounded-full border border-border px-3 text-xs font-medium text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
        >
          <Pencil className="size-3.5" aria-hidden="true" />
          수정
        </Link>
      }
    >



      <ProfileDetail p={view} />

      <div className="mt-7 space-y-3">
        <Button asChild className="w-full" size="lg">
          <Link to="/home">
            홈으로
            <ArrowRight className="size-4" aria-hidden="true" />
          </Link>
        </Button>
        <button
          type="button"
          onClick={() => {
            resetAll();
            navigate({ to: "/" });
          }}
          className="w-full py-2 text-xs text-muted-foreground underline underline-offset-4"
        >
          데모 데이터 초기화
        </button>
      </div>
    </AppScreen>
  );
}
