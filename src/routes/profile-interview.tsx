import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect } from "react";
import { toast } from "sonner";
import { AppScreen } from "@/components/app/AppScreen";
import { ProfileInterviewV3 } from "@/components/onboarding/ProfileInterviewV3";
import { publishProfileInterviewV3, recordMyAiDecision } from "@/lib/api";
import { editableBasics } from "@/lib/profileEditing";
import { useMe } from "@/lib/me";

export const Route = createFileRoute("/profile-interview")({
  head: () => ({
    meta: [{ title: "프로필 인터뷰 — 애프터" }, { name: "robots", content: "noindex" }],
  }),
  component: ProfileInterviewPage,
});

function ProfileInterviewPage() {
  const { me, ready, setMe } = useMe();
  const navigate = useNavigate();
  useEffect(() => {
    if (ready && !me) void navigate({ to: "/login", replace: true });
    else if (ready && me && me.onboarding_step < 7)
      void navigate({ to: "/signup", search: { prepare: true }, replace: true });
  }, [me, ready, navigate]);
  if (!me || me.onboarding_step < 7)
    return (
      <AppScreen title="프로필 인터뷰" back="/profile-edit" hideTabs>
        <p className="py-8 text-sm" role="status">
          프로필을 확인하고 있어요.
        </p>
      </AppScreen>
    );
  const basics = editableBasics(me);
  return (
    <ProfileInterviewV3
      key={me.id}
      userId={me.id}
      member={me}
      basics={basics}
      editing
      progressStep={1}
      progressTotal={1}
      onBack={() => void navigate({ to: "/profile-edit" })}
      onDone={async (revision, runId, decision) => {
        const saved = await publishProfileInterviewV3(revision, basics);
        setMe(saved);
        if (runId && decision) void recordMyAiDecision(runId, decision).catch(() => undefined);
        toast.success("프로필을 저장했어요.");
        void navigate({ to: "/profile", replace: true });
      }}
    />
  );
}
