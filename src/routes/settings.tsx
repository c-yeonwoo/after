import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { toast } from "sonner";

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

import { AppScreen } from "@/components/app/AppScreen";
import { BRAND } from "@/lib/brand";
import { setFeedbackEmails, setPaused, withdrawAccount } from "@/lib/api";
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
  const [confirmWithdraw, setConfirmWithdraw] = useState(false);

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
          조용히 환불되므로 편의가 아니라 상대에 대한 의무다. 대신 아래
          "잠시 쉬기"로 새 소개 자체를 멈출 수 있다 — 그게 진짜 필요한 것이었다.
        */}
        <div className="mt-3 rounded-surface border border-dashed border-border px-5 py-4">
          <p className="text-sm font-medium">만남 진행 알림</p>
          <p className="mt-1.5 text-xs leading-relaxed text-muted-foreground">
            요청 도착 · 답변 도착 · 만남 확정은 끌 수 없습니다. 요청을 못 보시면 24시간 뒤 상대의
            티켓이 자동 환불되기 때문입니다. 당분간 소개를 받지 않으시려면 아래 잠시 쉬기를 켜
            주세요.
          </p>
        </div>
      </section>

      {/* ── 잠시 쉬기 ───────────────────────────
        의미를 좁게 둔다: 새 소개만 멈춘다. 진행 중인 요청·약속은 그대로다 —
        상대가 이미 티켓을 썼다면 그 돈이 걸려 있으므로 내가 쉬겠다고 그 약속을
        깰 수는 없다. 그 사실을 화면에서도 분명히 말한다.
      */}
      <section className="mt-9">
        <h2 className="text-sm font-semibold">잠시 쉬기</h2>
        <label className="mt-3 flex min-h-14 cursor-pointer items-center gap-3.5 rounded-surface border border-border bg-card px-5">
          <input
            type="checkbox"
            className="size-5 shrink-0 accent-primary"
            checked={me.paused_at !== null}
            disabled={busy}
            onChange={async (e) => {
              const next = e.target.checked;
              setBusy(true);
              try {
                await setPaused(next);
                await refresh();
                toast.success(next ? "새 소개를 멈췄습니다." : "다시 소개를 받습니다.");
              } catch (err) {
                toast.error(err instanceof Error ? err.message : "설정을 바꾸지 못했습니다.");
              } finally {
                setBusy(false);
              }
            }}
          />
          <span className="min-w-0 flex-1">
            <span className="block text-sm font-medium">새 소개 받지 않기</span>
            <span className="block text-xs leading-relaxed text-muted-foreground">
              진행 중인 요청과 약속은 그대로 남습니다. 언제든 다시 켜실 수 있습니다.
            </span>
          </span>
        </label>
      </section>

      {/* ── 탈퇴 ─────────────────────────────── */}
      <section className="mt-9 border-t border-border pt-6">
        <h2 className="text-sm font-semibold">탈퇴</h2>
        <p className="mt-1.5 text-xs leading-relaxed text-muted-foreground">
          프로필과 사진, 작성하신 내용이 삭제됩니다. 진행 중인 약속은 취소되고 상대의 티켓은 전액
          환불됩니다. 결제·환불 기록은 법령상 보존 기간까지 남습니다.
        </p>
        <button
          type="button"
          disabled={busy}
          onClick={() => setConfirmWithdraw(true)}
          className="mt-4 min-h-12 w-full rounded-control border border-destructive/40 text-sm font-medium text-destructive transition-colors hover:bg-destructive/8 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none disabled:opacity-60"
        >
          탈퇴하기
        </button>
      </section>

      <AlertDialog open={confirmWithdraw} onOpenChange={setConfirmWithdraw}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>정말 탈퇴하시겠어요?</AlertDialogTitle>
            <AlertDialogDescription>
              <b className="font-semibold text-foreground">되돌릴 수 없습니다.</b> 프로필과 작성하신
              내용이 삭제되고 같은 회사 메일로 다시 가입하셔도 이전 기록은 복구되지 않습니다. 당분간
              쉬고 싶으신 거라면 위의 <b className="font-semibold text-foreground">잠시 쉬기</b>를
              써 주세요.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>취소</AlertDialogCancel>
            <AlertDialogAction
              disabled={busy}
              onClick={async () => {
                setBusy(true);
                try {
                  await withdrawAccount();
                  navigate({ to: "/" });
                } catch (err) {
                  toast.error(err instanceof Error ? err.message : "탈퇴에 실패했습니다.");
                  setBusy(false);
                }
              }}
            >
              탈퇴하기
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </AppScreen>
  );
}
