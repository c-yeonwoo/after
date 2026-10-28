import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect } from "react";
import { AppScreen } from "@/components/app/AppScreen";
import { ProfileRevisionEditor } from "@/components/assistant/ProfileRevisionEditor";
import { useMe } from "@/lib/me";

export const Route = createFileRoute("/assistant-profile")({
  head: () => ({
    meta: [{ title: "매니저와 프로필 다듬기 — 애프터" }, { name: "robots", content: "noindex" }],
  }),
  component: AssistantProfilePage,
});

function AssistantProfilePage() {
  const { me, ready } = useMe();
  const navigate = useNavigate();
  useEffect(() => {
    if (ready && !me) void navigate({ to: "/login" });
  }, [me, ready, navigate]);
  return (
    <AppScreen
      title="프로필 다듬기"
      back="/home"
      hideTabs
      keyboardAware
      footer={<div id="profile-revision-footer" />}
    >
      {me?.onboarding_step && me.onboarding_step >= 7 ? (
        <ProfileRevisionEditor key={me.id} owner={me.id} />
      ) : ready ? (
        <div className="py-8">
          <p>프로필을 먼저 준비해 주세요.</p>
          <Link
            className="mt-3 inline-flex min-h-11 items-center text-sm font-semibold text-primary-strong"
            to="/signup"
            search={{ prepare: true }}
          >
            프로필 준비하기
          </Link>
        </div>
      ) : (
        <p className="py-8 text-sm text-muted-foreground" role="status">
          프로필을 불러오고 있어요.
        </p>
      )}
    </AppScreen>
  );
}
