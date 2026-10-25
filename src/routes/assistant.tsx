import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect } from "react";
import { AppScreen } from "@/components/app/AppScreen";
import { AssistantConversation } from "@/components/assistant/AssistantConversation";
import { useMe } from "@/lib/me";

export const Route = createFileRoute("/assistant")({
  validateSearch: (s: Record<string, unknown>) => ({
    panel: s.panel === "memory" ? ("memory" as const) : ("chat" as const),
  }),
  head: () => ({ meta: [{ title: "나와 비서 — 애프터" }, { name: "robots", content: "noindex" }] }),
  component: AssistantPage,
});

function AssistantPage() {
  const { me, ready } = useMe();
  const { panel } = Route.useSearch();
  const navigate = useNavigate();
  useEffect(() => {
    if (ready && !me) void navigate({ to: "/login" });
  }, [me, ready, navigate]);
  return me && me.onboarding_step >= 7 ? (
    <AssistantConversation key={me.id} owner={me.id} panel={panel} />
  ) : (
    <AppScreen title="나와 비서" back="/home" hideTabs>
      <p className="py-8">프로필을 준비하면 비서와 이야기를 나눌 수 있어요.</p>
    </AppScreen>
  );
}
