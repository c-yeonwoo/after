import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect } from "react";
import { Pencil, Sparkles } from "lucide-react";

import { AppScreen } from "@/components/app/AppScreen";
import { ProfileDetail } from "@/components/app/ProfileDetail";
import { AssistantMark } from "@/components/assistant/AssistantMark";
import { BRAND } from "@/lib/brand";
import { useMe } from "@/lib/me";
import { toProfileView } from "@/lib/profileView";
import { useAssistantFlags } from "@/lib/useAssistantFlags";

export const Route = createFileRoute("/profile")({
  head: () => ({
    meta: [
      { title: `내 프로필 — ${BRAND.name}` },
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
  const capabilities = useAssistantFlags(me?.id);

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

  const view = toProfileView(me);

  return (
    <AppScreen
      title="내 프로필"
      back="/me"
      action={
        <Link
          to="/signup"
          search={{ edit: true as const }}
          className="pressable inline-flex min-h-11 items-center gap-1.5 rounded-control bg-muted px-3 text-sm font-medium text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
        >
          <Pencil className="size-3.5" aria-hidden="true" />
          사진·기본정보
        </Link>
      }
    >
      {capabilities.data?.profileEdit ? (
        <Link
          to="/assistant-profile"
          className="mb-5 flex min-h-12 items-center gap-3 rounded-control bg-muted/60 px-4 text-sm font-semibold"
        >
          <Sparkles className="size-4 text-primary-strong" aria-hidden="true" />
          소개글 함께 다듬기
        </Link>
      ) : null}
      <ProfileDetail p={view} own assistantSignature={<AssistantMark />} />
    </AppScreen>
  );
}
