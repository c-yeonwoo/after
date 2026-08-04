import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { toast } from "sonner";

import { AppScreen } from "@/components/app/AppScreen";
import { BRAND } from "@/lib/brand";
import { setFeedbackEmails } from "@/lib/api";
import { useMe } from "@/lib/me";
import { useTheme } from "@/lib/theme";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/settings")({
  head: () => ({
    meta: [
      { title: `환경설정 — ${BRAND.name}` },
      { name: "description", content: "화면 테마와 알림 수신을 설정합니다." },
    ],
  }),
  component: SettingsPage,
});

const THEMES = [
  { id: "system", label: "시스템" },
  { id: "light", label: "밝게" },
  { id: "dark", label: "어둡게" },
] as const;

function SettingsPage() {
  const { me, ready, refresh } = useMe();
  const { choice, setChoice } = useTheme();
  const navigate = useNavigate();
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (ready && !me) navigate({ to: "/signup" });
  }, [ready, me, navigate]);

  if (!me) {
    return (
      <AppScreen title="환경설정" back="/me">
        <p className="mt-16 text-center text-sm text-muted-foreground">불러오는 중입니다…</p>
      </AppScreen>
    );
  }

  return (
    <AppScreen title="환경설정" back="/me">
      <section className="mt-5">
        <h2 className="text-sm font-semibold">화면</h2>
        <p className="mt-1 text-xs text-muted-foreground">
          기본은 기기 설정을 따릅니다. 이 앱은 주로 퇴근 후에 열립니다.
        </p>
        <div className="mt-3 grid grid-cols-3 gap-1.5" role="group" aria-label="화면 테마">
          {THEMES.map((o) => (
            <button
              key={o.id}
              type="button"
              aria-pressed={choice === o.id}
              onClick={() => setChoice(o.id)}
              className={cn(
                "min-h-11 rounded-control border text-sm transition-colors",
                "focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none",
                choice === o.id
                  ? "border-primary bg-primary/12 font-medium text-primary-strong"
                  : "border-border bg-card text-foreground",
              )}
            >
              {o.label}
            </button>
          ))}
        </div>
      </section>

      <section className="mt-9">
        <h2 className="text-sm font-semibold">알림</h2>
        <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
          가입할 때 인증한 회사 메일로 보냅니다.
        </p>

        <label className="mt-4 flex min-h-14 cursor-pointer items-center gap-3.5 rounded-surface border border-border bg-card px-5">
          <input
            type="checkbox"
            className="size-5 shrink-0 accent-primary"
            checked={me.feedback_emails}
            disabled={busy}
            onChange={async (e) => {
              const next = e.target.checked;
              setBusy(true);
              try {
                await setFeedbackEmails(next);
                await refresh();
              } catch (err) {
                toast.error(err instanceof Error ? err.message : "설정을 바꾸지 못했습니다.");
              } finally {
                setBusy(false);
              }
            }}
          />
          <span className="min-w-0 flex-1">
            <span className="block text-sm font-medium">만남 후 후기 요청</span>
            <span className="block text-xs text-muted-foreground">
              만나신 다음 날 한 번만 보냅니다.
            </span>
          </span>
        </label>

        {/*
          진행 알림은 끌 수 없다. 요청이 온 걸 모르면 24시간 뒤 상대의 티켓이
          조용히 환불되므로, 이건 편의가 아니라 상대에 대한 의무다.
          정말 쉬고 싶은 사람에게 필요한 건 알림 해제가 아니라 후보 풀에서
          빠지는 "잠시 쉬기"이고, 그건 아직 없다 — 없는 것을 있는 척하지 않는다.
        */}
        <div className="mt-3 rounded-surface border border-dashed border-border px-5 py-4">
          <p className="text-sm font-medium">만남 진행 알림</p>
          <p className="mt-1.5 text-xs leading-relaxed text-muted-foreground">
            요청 도착 · 답변 도착 · 만남 확정은 끌 수 없습니다. 요청을 못 보시면 24시간 뒤 상대의
            티켓이 자동 환불되기 때문입니다.
          </p>
        </div>
      </section>
    </AppScreen>
  );
}
