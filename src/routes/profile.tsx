import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect } from "react";
import { Pencil } from "lucide-react";

import { AppScreen } from "@/components/app/AppScreen";
import { ProfileDetail, type ProfileView } from "@/components/app/ProfileDetail";
import {
  DRINKING_OPTIONS,
  RELIGION_OPTIONS,
  SMOKING_OPTIONS,
  ageFrom,
} from "@/components/onboarding/basics";
import { followUpFor } from "@/components/onboarding/profile";
import { BRAND, HUBS } from "@/lib/brand";
import { useMe } from "@/lib/me";

export const Route = createFileRoute("/profile")({
  head: () => ({
    meta: [
      { title: `내 프로필 — ${BRAND.short}` },
      { name: "description", content: "소개가 열린 상대에게 보이는 내 모습을 그대로 확인합니다." },
    ],
  }),
  component: ProfilePage,
});

/**
 * 내 프로필 — 마이페이지에서 떼어낸 화면(S13).
 *
 * 소개 화면과 같은 <ProfileDetail> 을 쓴다. 내 프로필을 상대가 보는 모습
 * 그대로 확인할 수 있어야 하기 때문이다 — 별도 레이아웃을 만들면 "실제로는
 * 어떻게 보이나"를 확인할 수 없게 된다.
 */
function ProfilePage() {
  const { me, ready } = useMe();
  const navigate = useNavigate();

  useEffect(() => {
    if (ready && !me) navigate({ to: "/" });
  }, [ready, me, navigate]);

  if (!me) {
    return (
      <AppScreen title="내 프로필" back="/me">
        <p className="mt-16 text-center text-sm text-muted-foreground">불러오는 중입니다…</p>
      </AppScreen>
    );
  }

  const details = (me.details as Record<string, string> | null) ?? {};
  const view: ProfileView = {
    name: me.name ?? "",
    age: me.birth ? ageFrom(me.birth) : null,
    job: me.job ?? "",
    mbti: me.mbti ?? undefined,
    smoking: SMOKING_OPTIONS.find((o) => o.id === me.smoking)?.label,
    drinking: DRINKING_OPTIONS.find((o) => o.id === me.drinking)?.label,
    religion: RELIGION_OPTIONS.find((o) => o.id === me.religion)?.label,
    area: HUBS.find((h) => h.id === me.hub_id)?.label,
    photo: me.photo_url || undefined,
    headline: me.headline ?? "",
    intro: me.intro ?? "",
    interests: me.interests.map((v) => v.trim()).filter(Boolean),
    matchTags: me.match_tags,
    topics: me.topics,
    answers: me.interests
      .map((v) => v.trim())
      .filter(Boolean)
      .map((label) => ({ q: followUpFor(label), a: (details[label] ?? "").trim() }))
      .filter((x) => x.a),
  };

  return (
    <AppScreen
      title="내 프로필"
      back="/me"
      action={
        <Link
          to="/signup"
          search={{ edit: true as const }}
          className="inline-flex min-h-11 items-center gap-1 rounded-full border border-border px-3 text-xs font-medium text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
        >
          <Pencil className="size-3.5" aria-hidden="true" />
          수정
        </Link>
      }
    >
      <p className="mb-4 rounded-surface bg-muted/60 px-4 py-3 text-xs leading-relaxed text-muted-foreground">
        소개가 열린 상대에게는 아래 그대로 보입니다. 회사 이메일과 피드백은 공개되지 않습니다.
      </p>

      <ProfileDetail p={view} />
    </AppScreen>
  );
}
