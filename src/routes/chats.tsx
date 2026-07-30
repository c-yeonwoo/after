import { createFileRoute, Link } from "@tanstack/react-router";

import { AppScreen } from "@/components/app/AppScreen";
import { BRAND } from "@/lib/brand";
import { getCandidate } from "@/lib/candidates";
import { useFlow } from "@/lib/store";

export const Route = createFileRoute("/chats")({
  head: () => ({
    meta: [
      { title: `대화 — ${BRAND.name}` },
      {
        name: "description",
        content: "약속을 잡는 데 필요한 만큼의 대화. 열린 대화 목록을 확인합니다.",
      },
      { property: "og:title", content: `대화 — ${BRAND.name}` },
      { property: "og:description", content: "양쪽이 좋다고 했을 때만 열리는 1:1 대화." },
    ],
  }),
  component: ChatsPage,
});

function ChatsPage() {
  const { flow } = useFlow();
  const candidate = flow.chatOpen && flow.introId ? getCandidate(flow.introId) : null;
  const last = flow.messages.at(-1);

  return (
    <AppScreen title="대화">
      {candidate ? (
        <ul className="mt-3 space-y-2">
          <li>
            <Link
              to="/chat/$id"
              params={{ id: candidate.id }}
              className="flex items-center gap-3 rounded-xl border border-border bg-card px-4 py-4 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
            >
              <span className="flex size-11 shrink-0 items-center justify-center rounded-full bg-primary/12 font-serif text-lg text-primary-strong">
                {candidate.name.slice(0, 1)}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-sm font-medium">
                  {candidate.name} · {candidate.job}
                </span>
                <span className="block truncate text-xs text-muted-foreground">
                  {last ? last.text : "대화가 열렸습니다. 먼저 인사해 보세요."}
                </span>
              </span>
            </Link>
          </li>
        </ul>
      ) : (
        <div className="mt-16 rounded-2xl border border-dashed border-border px-6 py-12 text-center">
          <p className="text-sm font-medium">아직 열린 대화가 없습니다</p>
          <p className="mt-1.5 text-xs leading-relaxed text-muted-foreground">
            양쪽이 좋다고 하면 이곳에서 대화가 열립니다.
          </p>
        </div>
      )}
    </AppScreen>
  );
}
