import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect } from "react";
import { Pencil } from "lucide-react";

import { AppScreen } from "@/components/app/AppScreen";
import { ProfileDetail } from "@/components/app/ProfileDetail";
import { BRAND } from "@/lib/brand";
import { useMe } from "@/lib/me";
import { toProfileView } from "@/lib/profileView";

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

  const view = toProfileView(me);

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
