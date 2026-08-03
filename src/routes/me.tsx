import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect } from "react";
import { ArrowRight, Pencil } from "lucide-react";

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
import { signOut, useMe } from "@/lib/api";

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
    if (ready && !me) navigate({ to: "/signup" });
  }, [ready, me, navigate]);

  if (!me) {
    return (
      <AppScreen title="내 프로필">
        <p className="mt-10 text-sm text-muted-foreground">프로필을 불러오는 중입니다.</p>
      </AppScreen>
    );
  }

  const details = (me.details as Record<string, string> | null) ?? {};

  const view: ProfileView = {
    name: me.name ?? "",
    age: me.birth ? ageFrom(me.birth) : null,
    job: me.job ?? "",
    mbti: me.mbti || undefined,
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
      {/*
        소개 화면과 같은 <ProfileDetail> 을 쓴다 — 내 프로필을 상대가 보는 모습
        그대로 확인할 수 있어야 하기 때문이다. 그 의도를 문장으로 밝힌다.
      */}
      <p className="mb-4 rounded-surface bg-muted/60 px-4 py-3 text-xs leading-relaxed text-muted-foreground">
        소개가 열린 상대에게는 아래 그대로 보입니다. 회사 이메일과 피드백은 공개되지 않습니다.
      </p>

      <ProfileDetail p={view} />

      {/*
        약관·처리방침은 지금까지 가입 화면에서만 볼 수 있었다. 가입 뒤에도
        자신이 동의한 내용을 다시 확인할 수 있어야 하므로 설정 성격의 이 화면에 둔다.
      */}
      <section className="mt-10 border-t border-border pt-5">
        <h2 className="text-3xs font-semibold tracking-[0.16em] text-muted-foreground uppercase">
          약관 · 문의
        </h2>
        <ul className="mt-2">
          {[
            { to: "/terms", label: "이용약관" },
            { to: "/privacy", label: "개인정보 처리방침" },
          ].map((l) => (
            <li key={l.to}>
              <Link
                to={l.to}
                className="flex min-h-12 items-center justify-between border-b border-border/70 text-sm text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
              >
                {l.label}
                <ArrowRight className="size-4 text-muted-foreground" aria-hidden="true" />
              </Link>
            </li>
          ))}
        </ul>

        <button
          type="button"
          onClick={async () => {
            await signOut();
            navigate({ to: "/" });
          }}
          className="mt-5 min-h-11 w-full text-xs text-muted-foreground underline underline-offset-4"
        >
          로그아웃
        </button>
      </section>
    </AppScreen>
  );
}
