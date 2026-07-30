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
        <ul className="mt-4 space-y-3">
          <li>
            <Link
              to="/chat/$id"
              params={{ id: candidate.id }}
              className="group relative block overflow-hidden rounded-[var(--radius-surface)] border border-border bg-card p-5 transition-transform focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none active:scale-[0.99]"
            >
              <span
                aria-hidden
                className="pointer-events-none absolute inset-0 bg-[radial-gradient(120%_90%_at_100%_0%,var(--coral-100),transparent_60%)] opacity-90"
              />
              <span className="relative flex items-center gap-4">
                <span className="relative shrink-0">
                  <span className="block rounded-full bg-gradient-to-br from-coral-400 to-brand-400 p-[2.5px]">
                    <img
                      src={candidate.photo}
                      alt={`${candidate.name} 프로필 사진`}
                      className="size-16 rounded-full border-2 border-card object-cover"
                      loading="lazy"
                    />
                  </span>
                  <span className="absolute right-0 bottom-0 size-3.5 rounded-full border-2 border-card bg-coral-600" />
                </span>

                <span className="min-w-0 flex-1">
                  <span className="flex items-baseline gap-2">
                    <span className="truncate font-display text-lg leading-tight tracking-tight">
                      {candidate.name}
                    </span>
                    <span className="truncate text-xs text-muted-foreground">
                      {candidate.age} · {candidate.job}
                    </span>
                  </span>
                  <span className="mt-1.5 block truncate text-sm leading-relaxed text-foreground/80">
                    {last ? last.text : "대화가 열렸습니다. 먼저 인사해 보세요."}
                  </span>
                  <span className="mt-2.5 inline-flex items-center gap-1.5 rounded-[var(--radius-control)] bg-coral-600/10 px-2.5 py-1 text-[11px] font-medium tracking-wide text-coral-600 uppercase">
                    {last ? "대화 중" : "새 대화"}
                  </span>
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
