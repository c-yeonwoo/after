import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect } from "react";
import { AppScreen } from "@/components/app/AppScreen";
import { AssistantConversation } from "@/components/assistant/AssistantConversation";
import { useMe } from "@/lib/me";
import { useMemberHome } from "@/lib/useMemberHome";
import { assistantStatusText } from "../../supabase/functions/_shared/assistant-workflow";

export const Route = createFileRoute("/assistant")({
  validateSearch: (s: Record<string, unknown>) => ({
    panel: s.panel === "memory" ? ("memory" as const) : ("chat" as const),
  }),
  head: () => ({ meta: [{ title: "나와 비서 — 애프터" }, { name: "robots", content: "noindex" }] }),
  component: AssistantPage,
});

function AssistantPage() {
  const { me, ready } = useMe();
  const home = useMemberHome(me?.id, ready && Boolean(me && me.onboarding_step >= 7));
  const state = home.isError || home.isPaused ? undefined : home.data?.state;
  const { panel } = Route.useSearch();
  const navigate = useNavigate();
  useEffect(() => {
    if (ready && !me) void navigate({ to: "/login" });
  }, [me, ready, navigate]);
  return me && me.onboarding_step >= 7 ? (
    <AssistantConversation
      key={me.id}
      owner={me.id}
      panel={panel}
      context={{
        status: state
          ? assistantStatusText(state.primary_state)
          : "최신 상태를 확인하지 못했어요. 홈에서 다시 확인해 주세요.",
        state: state?.primary_state,
        counterpartId: state?.candidate?.id,
        hasMeeting: state ? Boolean(state.meeting) : undefined,
        hasOpenIntro: state ? Boolean(state.has_open_intro) : undefined,
      }}
    />
  ) : (
    <AppScreen title="나와 비서" back="/home" hideTabs>
      <p className="py-8">프로필을 준비하면 비서와 이야기를 나눌 수 있어요.</p>
    </AppScreen>
  );
}
