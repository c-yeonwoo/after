import { createFileRoute, Link, useNavigate, useRouterState } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { AppScreen } from "@/components/app/AppScreen";
import { Button } from "@/components/ui/button";
import { authErrorMessage } from "@/lib/api";
import { useMe } from "@/lib/me";
import { clearSignupSession, loadSignupSession, signupToken } from "@/lib/signupSession";
import { supabase } from "@/lib/supabase";
import { forgetWaveInvite, rememberWaveInvite, waveInviteCode } from "@/lib/waveInvite";

export const Route = createFileRoute("/invite")({
  head: () => ({
    meta: [{ title: "애프터 · 베타 초대장" }, { name: "robots", content: "noindex,nofollow" }],
  }),
  component: WaveInvitation,
});

function WaveInvitation() {
  const nav = useNavigate();
  const { me, ready } = useMe();
  const [status, setStatus] = useState("loading");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [canRestart, setCanRestart] = useState(false);
  const [retry, setRetry] = useState(0);
  const hash = useRouterState({ select: (s) => s.location.hash });
  useEffect(() => {
    if (!ready) return;
    let live = true;
    setStatus("loading");
    setCanRestart(false);
    setError("");
    void (async () => {
      try {
        const code = waveInviteCode(window.location.hash);
        if (!code) {
          if (live) setStatus("invalid");
          return;
        }
        const { data, error } = await supabase.rpc("open_wave_invite", { p_code: code });
        if (error) throw error;
        if (live) setStatus(data);
      } catch {
        if (live) setStatus("error");
      }
    })();
    return () => {
      live = false;
    };
  }, [ready, me?.id, retry, hash]);

  async function proceed(login = false, restart = false) {
    if (busy) return;
    setBusy(true);
    setError("");
    try {
      const code = waveInviteCode(window.location.hash);
      if (!code) {
        setStatus("invalid");
        return;
      }
      if (me) {
        const { error } = await supabase.rpc("join_wave_invite", { p_code: code });
        if (error) throw error;
        clearSignupSession();
        forgetWaveInvite();
        await nav({ to: "/home", replace: true });
      } else {
        if (login && status === "used") {
          rememberWaveInvite(code);
          await nav({ to: "/login", search: { next: "/invite" } });
          return;
        }
        const session = !login && !restart && (await loadSignupSession());
        const { error } = await supabase.rpc("start_wave_signup", {
          p_code: code,
          ...(session ? { p_token: signupToken()! } : {}),
        });
        if (error) throw error;
        if (restart) clearSignupSession();
        rememberWaveInvite(code);
        if (login) await nav({ to: "/login", search: { next: "/invite" } });
        else await nav({ to: "/signup", search: { wave: true } });
      }
    } catch (err) {
      setError(authErrorMessage(err));
      setCanRestart((err as { message?: string } | null)?.message === "different invite session");
    } finally {
      setBusy(false);
    }
  }

  return (
    <AppScreen title="베타 초대장" hideTabs>
      <div className="mx-auto max-w-md pt-10">
        {status === "loading" ? (
          <p role="status">초대장을 확인하고 있어요.</p>
        ) : status === "error" ? (
          <>
            <p role="alert">초대장을 불러오지 못했어요.</p>
            <Button className="mt-4" onClick={() => setRetry((n) => n + 1)}>
              다시 확인
            </Button>
          </>
        ) : status === "invalid" || status === "used" ? (
          <>
            <h1 className="headline text-2xl">
              {status === "used" ? "이미 사용한 초대장이에요" : "초대 링크를 확인해 주세요"}
            </h1>
            <p className="mt-2 text-sm text-muted-foreground">
              {status === "used"
                ? "이미 참여하셨다면 가입한 계정으로 돌아갈 수 있어요."
                : "초대한 분에게 내 링크를 다시 요청해 주세요."}
            </p>
            {status === "used" && !me && (
              <Button className="mt-5 w-full" disabled={busy} onClick={() => void proceed(true)}>
                참여한 계정으로 로그인
              </Button>
            )}
            {error && (
              <p role="alert" className="mt-2 text-sm text-destructive">
                {error}
              </p>
            )}
            <Link to="/" className="mt-6 inline-flex py-3 text-sm underline">
              애프터 둘러보기
            </Link>
          </>
        ) : (
          <>
            <h1 className="headline text-3xl">
              {status === "mine" ? "첫 베타에 참여 중이에요" : "애프터 베타에 초대해요"}
            </h1>
            <p className="mt-3 text-base leading-relaxed">
              {status === "mine"
                ? "홈에서 내 진행 상황을 확인해 보세요."
                : me
                  ? "지금 쓰는 계정으로 베타에 참여할 수 있어요."
                  : "어떤 사람을 만나고 싶은지 프로필에 담아 주세요. 프로필이 승인되면 매니저가 첫 소개를 준비해요."}
            </p>
            {status !== "mine" && (
              <p className="mt-4 text-sm text-muted-foreground">
                베타 참여는 무료예요. 운영팀은 초대장별로 가입과 소개 진행 상황을 확인해요.
              </p>
            )}
            <Button
              size="lg"
              className="mt-8 w-full"
              disabled={busy}
              onClick={() => void proceed()}
            >
              {busy
                ? "확인 중…"
                : status === "mine"
                  ? "홈으로 가기"
                  : me
                    ? "이 계정으로 참여하기"
                    : "초대로 가입하기"}
            </Button>
            {canRestart && (
              <div className="mt-3">
                <p className="text-sm text-muted-foreground">
                  새로 시작하면 이전 가입에서 진행한 본인 확인도 다시 받아요.
                </p>
                <Button
                  variant="outline"
                  className="mt-2 w-full"
                  disabled={busy}
                  onClick={() => void proceed(false, true)}
                >
                  이 초대로 처음부터 가입
                </Button>
              </div>
            )}
            {!me && (
              <Button
                variant="ghost"
                className="mt-2 w-full"
                disabled={busy}
                onClick={() => void proceed(true)}
              >
                이미 가입했어요 · 로그인
              </Button>
            )}
            {error && (
              <p role="alert" className="mt-3 text-sm text-destructive">
                {error}
              </p>
            )}
          </>
        )}
      </div>
    </AppScreen>
  );
}
