import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useCallback, useEffect, useState } from "react";
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
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { BRAND } from "@/lib/brand";
import {
  KAKAO_PROVIDER,
  linkedProviders,
  linkKakao,
  PASSWORD_MIN_LENGTH,
  setFeedbackEmails,
  setPassword,
  setPaused,
  unlinkKakao,
  withdrawAccount,
} from "@/lib/api";
import { consumeAuthCode, isNative, NATIVE_REDIRECT, openAuthUrl } from "@/lib/native";
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
  const [pw, setPw] = useState("");
  /** 이 계정에 붙어 있는 로그인 수단. null 이면 아직 못 읽었다. */
  const [providers, setProviders] = useState<string[] | null>(null);

  useEffect(() => {
    if (ready && !me) navigate({ to: "/" });
  }, [ready, me, navigate]);

  const refreshProviders = useCallback(async () => {
    try {
      setProviders(await linkedProviders());
    } catch {
      // 못 읽으면 연결 여부를 모른다고 두는 편이 낫다 — 틀린 상태를 보여주는 것보다.
      setProviders(null);
    }
  }, []);

  /*
    카카오 연결에서 돌아오는 길.

    웹은 이 주소로 `?code=` 를 달고 돌아온다. 앱은 딥링크로 돌아오는데, 그건
    login.tsx 의 리스너가 이미 교환을 끝낸 뒤라 여기서는 목록만 다시 읽으면
    된다 — 앱은 화면이 살아 있는 채로 시트만 닫히므로 이 컴포넌트가 다시
    마운트되지 않는다. 그래서 창이 포커스를 되찾을 때도 한 번 읽는다.
  */
  useEffect(() => {
    let alive = true;
    void (async () => {
      if (typeof window !== "undefined" && window.location.search.includes("code=")) {
        try {
          if (await consumeAuthCode(window.location.href)) {
            window.history.replaceState({}, "", window.location.pathname);
            if (alive) toast.success("카카오를 연결했습니다.");
          }
        } catch (err) {
          if (alive) toast.error(err instanceof Error ? err.message : "연결하지 못했습니다.");
        }
      }
      if (alive) await refreshProviders();
    })();

    const onFocus = () => void refreshProviders();
    window.addEventListener("focus", onFocus);
    return () => {
      alive = false;
      window.removeEventListener("focus", onFocus);
    };
  }, [refreshProviders]);

  if (!me) {
    return (
      <AppScreen title="환경설정" back="/me">
        <p className="mt-16 text-center text-sm text-muted-foreground">불러오는 중입니다…</p>
      </AppScreen>
    );
  }

  const kakaoLinked = providers?.includes(KAKAO_PROVIDER) ?? false;

  // paused_at 의 의미가 성별로 다르다 — 아래 토글의 라벨과 설명이 갈린다.
  const isMale = me.gender === "male";

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
        {/*
          남성 쪽에는 효과가 하나 더 붙는다(v2). paused_at 은 여성 평가 큐에서
          빠지는 것 외에 **운영자가 세운 소개 카드도 오지 않게** 한다. 컬럼을
          늘리지 않고 같은 값을 쓰되, 라벨과 설명을 갈라 그 사실을 말한다.
        */}
        <h2 className="text-sm font-semibold">{isMale ? "소개 받기" : "잠시 쉬기"}</h2>
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
            <span className="block text-sm font-medium">
              {isMale ? "소개 받지 않기" : "새 소개 받지 않기"}
            </span>
            <span className="block text-xs leading-relaxed text-muted-foreground">
              {isMale
                ? "도착한 소개 카드도 더 이상 오지 않습니다. 진행 중인 요청과 약속은 그대로 남습니다."
                : "진행 중인 요청과 약속은 그대로 남습니다. 언제든 다시 켜실 수 있습니다."}
            </span>
          </span>
        </label>
      </section>

      {/* ── 비밀번호 ─────────────────────────── */}
      {/*
        비밀번호를 아직 안 가진 계정이 있다 — 이 기능 이전에 가입한 사람들이다.
        그들은 코드로 들어와 여기서 정한다. 그래서 "변경" 이 아니라 "설정" 이고,
        지금 값을 묻지 않는다(GoTrue updateUser 는 현재 비밀번호를 요구하지 않고,
        요구하면 애초에 없는 사람이 막힌다). 세션을 가진 사람만 닿는 화면이다.
      */}
      <section className="mt-9">
        <h2 className="text-sm font-semibold">비밀번호</h2>
        <p className="mt-1.5 text-xs leading-relaxed text-muted-foreground">
          다음 로그인부터 이메일과 이 비밀번호로 들어오실 수 있습니다. {PASSWORD_MIN_LENGTH}자 이상.
        </p>
        <Input
          id="settings-password"
          type="password"
          autoComplete="new-password"
          className="mt-3"
          value={pw}
          onChange={(e) => setPw(e.target.value)}
        />
        <Button
          variant="outline"
          className="mt-3 w-full"
          disabled={pw.length < PASSWORD_MIN_LENGTH || busy}
          onClick={async () => {
            setBusy(true);
            try {
              await setPassword(pw);
              setPw("");
              toast.success("비밀번호를 저장했습니다.");
            } catch (err) {
              toast.error(err instanceof Error ? err.message : "저장하지 못했습니다.");
            } finally {
              setBusy(false);
            }
          }}
        >
          저장
        </Button>
      </section>

      {/* ── 카카오 ───────────────────────────── */}
      {/*
        카카오는 **가입 수단이 아니라 재로그인 수단**이다. 여기서 연결해 둔
        사람만 로그인 화면의 카카오 버튼으로 들어올 수 있다 — 카카오로 계정을
        만들 수 있게 하면 회사 메일 인증이라는 이 서비스의 전제가 무너진다.
      */}
      <section className="mt-9">
        <h2 className="text-sm font-semibold">카카오</h2>
        <p className="mt-1.5 text-xs leading-relaxed text-muted-foreground">
          {kakaoLinked
            ? "카카오로 로그인하실 수 있습니다. 회사 메일과 비밀번호도 그대로 쓸 수 있습니다."
            : "연결하면 다음부터 카카오 한 번으로 로그인하실 수 있습니다. 프로필에는 아무것도 공개되지 않습니다."}
        </p>
        <Button
          variant="outline"
          className="mt-3 w-full"
          disabled={busy || providers === null}
          onClick={async () => {
            setBusy(true);
            try {
              if (kakaoLinked) {
                await unlinkKakao();
                await refreshProviders();
                toast.success("카카오 연결을 끊었습니다.");
              } else {
                /*
                  웹은 리다이렉트에 맡기고(skip=false), 앱은 URL 만 받아
                  시스템 브라우저로 연다 — 웹뷰 안에서 열면 제공자가 막는다.
                */
                const redirectTo = isNative
                  ? NATIVE_REDIRECT
                  : `${window.location.origin}/settings`;
                const url = await linkKakao(redirectTo, isNative);
                if (isNative && url) await openAuthUrl(url);
              }
            } catch (err) {
              toast.error(err instanceof Error ? err.message : "처리하지 못했습니다.");
            } finally {
              setBusy(false);
            }
          }}
        >
          {providers === null ? "불러오는 중…" : kakaoLinked ? "연결 끊기" : "카카오 연결하기"}
        </Button>
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
