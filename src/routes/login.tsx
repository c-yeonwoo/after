import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { AlertCircle } from "lucide-react";
import { toast } from "sonner";

import { Logo } from "@/components/Logo";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { BRAND, isCompanyEmail } from "@/lib/brand";
import {
  authErrorMessage,
  devFetchLatestOtp,
  requestEmailCode,
  signInExisting,
  useMe,
} from "@/lib/api";

export const Route = createFileRoute("/login")({
  head: () => ({
    meta: [
      { title: `로그인 — ${BRAND.name}` },
      {
        name: "description",
        content: "가입한 회사 이메일로 인증 코드를 받아 다시 로그인합니다.",
      },
    ],
  }),
  component: LoginPage,
});

function LoginPage() {
  const navigate = useNavigate();
  const { me, ready } = useMe();
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [codeSent, setCodeSent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [autoFilled, setAutoFilled] = useState(false);

  // 이미 로그인돼 있으면 로그인 화면을 보여줄 이유가 없다.
  useEffect(() => {
    if (ready && me) navigate({ to: "/home" });
  }, [ready, me, navigate]);

  const emailValid = email.includes("@") && isCompanyEmail(email);

  return (
    <div className="flex min-h-dvh flex-col bg-background px-6">
      <header
        className="flex items-center"
        style={{ paddingTop: "calc(env(safe-area-inset-top, 0px) + 1.5rem)" }}
      >
        <Logo size="sm" />
      </header>

      <main className="flex-1 pt-12">
        <h1 className="headline text-3xl">다시 오셨네요</h1>
        <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
          가입할 때 인증한 회사 이메일로 코드를 보내드립니다. 비밀번호는 없습니다.
        </p>

        <div className="mt-8">
          <label className="text-sm font-semibold" htmlFor="login-email">
            회사 이메일
          </label>
          <Input
            id="login-email"
            type="email"
            autoComplete="email"
            className="mt-2"
            placeholder="name@company.co.kr"
            value={email}
            onChange={(e) => {
              setEmail(e.target.value);
              setError(null);
            }}
            disabled={codeSent}
          />
          {!codeSent ? (
            <p className="mt-2 text-sm text-muted-foreground">개인 메일은 사용할 수 없습니다.</p>
          ) : null}
        </div>

        {codeSent ? (
          <div className="mt-6">
            <label className="text-sm font-semibold" htmlFor="login-code">
              인증 코드 6자리
            </label>
            <Input
              id="login-code"
              inputMode="numeric"
              autoComplete="one-time-code"
              maxLength={6}
              className="mt-2 tracking-[0.4em]"
              placeholder="000000"
              value={code}
              onChange={(e) => {
                setCode(e.target.value.replace(/\D/g, "").slice(0, 6));
                setError(null);
              }}
            />
            <p className="mt-2 text-sm text-muted-foreground">
              {autoFilled
                ? "개발환경이라 방금 발송된 코드를 자동으로 채웠습니다."
                : "메일로 받은 6자리를 입력해 주세요."}
            </p>
          </div>
        ) : null}

        {error ? (
          <p
            role="alert"
            className="mt-4 flex items-start gap-1.5 text-sm font-medium text-destructive"
          >
            <AlertCircle className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
            <span>{error}</span>
          </p>
        ) : null}

        <div className="mt-8">
          {codeSent ? (
            <Button
              className="w-full"
              size="lg"
              disabled={code.length !== 6 || busy}
              onClick={async () => {
                setError(null);
                setBusy(true);
                try {
                  const result = await signInExisting(email, code);
                  if (result.kind === "no-profile") {
                    toast("가입이 완료되지 않은 계정입니다. 이어서 진행해 주세요.");
                    navigate({ to: "/signup" });
                    return;
                  }
                  if (result.kind === "incomplete") {
                    toast("남은 가입 절차를 마쳐주세요.");
                    navigate({ to: "/signup" });
                    return;
                  }
                  navigate({ to: "/home" });
                } catch (err) {
                  setError(authErrorMessage(err));
                } finally {
                  setBusy(false);
                }
              }}
            >
              {busy ? "확인 중…" : "로그인"}
            </Button>
          ) : (
            <Button
              className="w-full"
              size="lg"
              disabled={!emailValid || busy}
              onClick={async () => {
                setError(null);
                setBusy(true);
                try {
                  await requestEmailCode(email);
                  setCodeSent(true);
                  toast.success("인증 코드를 보냈습니다.");
                  const dev = await devFetchLatestOtp(email);
                  if (dev) {
                    setCode(dev);
                    setAutoFilled(true);
                  }
                } catch (err) {
                  setError(authErrorMessage(err));
                } finally {
                  setBusy(false);
                }
              }}
            >
              {busy ? "보내는 중…" : "인증 코드 받기"}
            </Button>
          )}

          {codeSent ? (
            <Button
              variant="ghost"
              className="mt-2 w-full"
              disabled={busy}
              onClick={() => {
                setCodeSent(false);
                setCode("");
                setAutoFilled(false);
                setError(null);
              }}
            >
              이메일 다시 입력
            </Button>
          ) : null}
        </div>
      </main>

      <footer
        className="pt-8"
        style={{ paddingBottom: "calc(env(safe-area-inset-bottom, 0px) + 1.5rem)" }}
      >
        <p className="text-center text-sm text-muted-foreground">
          아직 가입하지 않으셨나요?{" "}
          <Link to="/signup" className="font-semibold text-primary-strong underline">
            가입하기
          </Link>
        </p>
      </footer>
    </div>
  );
}
