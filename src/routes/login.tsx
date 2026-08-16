import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { AlertCircle } from "lucide-react";
import { toast } from "sonner";

import { Logo } from "@/components/Logo";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { BRAND } from "@/lib/brand";
import {
  authErrorMessage,
  devFetchLatestOtp,
  OTP_MAX_LENGTH,
  OTP_MIN_LENGTH,
  PASSWORD_MIN_LENGTH,
  requestEmailCode,
  signInExisting,
  signInWithPassword,
} from "@/lib/api";
import { useMe } from "@/lib/me";

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
  const [password, setPassword] = useState("");
  /*
    기본은 비밀번호다. 코드는 **잊었을 때의 길**로 남긴다.

    가입에서 회사 메일로 직장을 확인하는 것은 서비스의 근거라 한 번은 반드시
    거쳐야 하지만, 그 뒤 재로그인까지 매번 메일을 오가게 하면 기기를 바꾸거나
    앱을 다시 깔 때마다 메일함을 뒤져야 한다. 확인은 한 번, 이후는 비밀번호다.
  */
  const [mode, setMode] = useState<"password" | "code">("password");

  const actionsRef = useRef<HTMLDivElement>(null);

  // 이미 로그인돼 있으면 로그인 화면을 보여줄 이유가 없다.
  useEffect(() => {
    if (ready && me) navigate({ to: "/home" });
  }, [ready, me, navigate]);

  /*
    코드 단계로 넘어가면 버튼 줄까지 화면 안으로 끌어온다.

    키보드가 올라온 만큼 본문이 짧아져서, 그냥 두면 입력칸은 보이는데 누를
    버튼이 화면 밖에 있다(iOS 검증에서 실제로 그랬다). block: "end" 로 맞추면
    입력칸과 버튼이 함께 보이는 위치가 된다.
  */
  useEffect(() => {
    if (!codeSent) return;
    actionsRef.current?.scrollIntoView({ block: "end", behavior: "smooth" });
  }, [codeSent]);

  /*
    로그인에서는 **회사 메일 여부를 따지지 않는다.**

    개인 도메인 차단은 가입 규칙이다 — "직장이 확인된 사람만" 이라는 약속을 지키는
    자리는 가입이고, 로그인 시점의 계정은 이미 그 관문을 통과해 만들어졌다.

    여기서까지 막으면 두 가지가 깨진다.
      · 개인 도메인으로 만든 운영자 계정이 자기 화면에 못 들어간다.
      · PERSONAL_EMAIL_DOMAINS 에 도메인을 하나 추가하는 순간, 그 도메인으로 이미
        가입해 쓰고 있던 회원이 **자기 계정에서 잠긴다.** 목록은 앞으로도 늘어난다.

    존재하지 않는 주소를 넣으면 서버가 otp_disabled 로 거른다. 화면은 형식만 본다.
  */
  const emailValid = /.+@.+\..+/.test(email.trim());

  /** 로그인 성공 뒤 갈 곳. 코드·비밀번호 두 경로가 같은 판정을 써야 한다. */
  async function land(result: Awaited<ReturnType<typeof signInWithPassword>>) {
    if (result.kind === "closed") {
      setError(
        result.state === "withdrawn"
          ? "탈퇴한 계정입니다. 새로 가입해 주세요."
          : "이용이 중지된 계정입니다. 문의해 주세요.",
      );
      return;
    }
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
  }

  const onCode = mode === "code";

  return (
    <div className="brand-surface flex h-full flex-col overflow-hidden bg-background px-6">
      <header className="flex shrink-0 items-center" style={{ paddingTop: "var(--safe-top)" }}>
        <Logo size="sm" />
      </header>

      <main className="min-h-0 flex-1 overflow-y-auto overscroll-contain pt-12">
        <h1 className="headline text-3xl">다시 오셨네요</h1>
        {!codeSent ? (
          <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
            {onCode
              ? "가입할 때 인증한 이메일로 코드를 보내드립니다."
              : "가입할 때 정하신 비밀번호로 들어오세요."}
          </p>
        ) : null}

        {/*
          코드를 보낸 뒤에는 입력칸 대신 보낸 주소를 한 줄로 적는다 — 비활성
          입력칸이 라벨·필드로 70px 넘게 차지해서 버튼이 키보드 밖으로 밀렸다.
          "…으로" 가 아니라 "주소로" 라고 쓴다: 조사는 앞 글자의 받침에 따라
          갈리는데 이메일 끝은 무엇이든 올 수 있다.
        */}
        {codeSent ? (
          <p className="mt-6 text-sm text-muted-foreground">
            <span className="font-semibold text-foreground">{email}</span> 주소로 코드를 보냈습니다.
          </p>
        ) : (
          <div className="mt-8">
            <label className="text-sm font-semibold" htmlFor="login-email">
              가입한 이메일
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
            />
          </div>
        )}

        {!onCode ? (
          <div className="mt-6">
            <label className="text-sm font-semibold" htmlFor="login-password">
              비밀번호
            </label>
            <Input
              id="login-password"
              type="password"
              autoComplete="current-password"
              className="mt-2"
              value={password}
              onChange={(e) => {
                setPassword(e.target.value);
                setError(null);
              }}
            />
          </div>
        ) : null}

        {onCode && codeSent ? (
          <div className="mt-6">
            <label className="text-sm font-semibold" htmlFor="login-code">
              인증 코드
            </label>
            <Input
              id="login-code"
              inputMode="numeric"
              autoComplete="one-time-code"
              maxLength={OTP_MAX_LENGTH}
              className="mt-2 tracking-[0.4em]"
              placeholder="000000"
              value={code}
              onChange={(e) => {
                setCode(e.target.value.replace(/\D/g, "").slice(0, OTP_MAX_LENGTH));
                setError(null);
              }}
            />
            <p className="mt-2 text-sm text-muted-foreground">
              {autoFilled
                ? "개발환경이라 방금 발송된 코드를 자동으로 채웠습니다."
                : "메일로 받은 숫자를 입력해 주세요."}
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

        {/*
          코드 단계에서는 이 묶음을 화면 안으로 끌어온다(위 useEffect). 키보드가
          올라오면 본문이 짧아져 버튼이 스크롤 아래로 밀리는데, 숫자 키패드에는
          완료 키가 없어서 "다 입력했는데 누를 것이 없는" 상태가 된다.
        */}
        <div ref={actionsRef} className="mt-8">
          {!onCode ? (
            <Button
              className="w-full"
              size="lg"
              disabled={!emailValid || password.length < PASSWORD_MIN_LENGTH || busy}
              onClick={async () => {
                setError(null);
                setBusy(true);
                try {
                  await land(await signInWithPassword(email, password));
                } catch (err) {
                  setError(authErrorMessage(err));
                } finally {
                  setBusy(false);
                }
              }}
            >
              {busy ? "확인 중…" : "로그인"}
            </Button>
          ) : codeSent ? (
            <Button
              className="w-full"
              size="lg"
              disabled={code.length < OTP_MIN_LENGTH || busy}
              onClick={async () => {
                setError(null);
                setBusy(true);
                try {
                  await land(await signInExisting(email, code));
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

          {/*
            두 경로를 오가는 문. 비밀번호를 아직 안 만든 사람(이 기능 이전 가입자)과
            잊은 사람이 같은 문으로 들어온다 — 코드로 들어와서 설정에서 정하면 된다.
            그래서 별도의 재설정 흐름을 만들지 않았다.
          */}
          <Button
            variant="ghost"
            className="mt-2 w-full"
            disabled={busy}
            onClick={() => {
              setError(null);
              setCode("");
              setPassword("");
              setAutoFilled(false);
              setCodeSent(false);
              setMode(onCode ? "password" : "code");
            }}
          >
            {onCode ? "비밀번호로 로그인" : "비밀번호를 잊으셨나요? 코드로 로그인"}
          </Button>
        </div>
      </main>

      {/*
        가입 안내는 코드 입력 단계에서만 접는다 — 본문 높이를 70pt 가까이 잡아먹어
        로그인 버튼이 들어갈 자리를 없앤다.
      */}
      {!codeSent ? (
        <footer
          className="shrink-0 pt-8"
          style={{ paddingBottom: "calc(var(--safe-bottom) + 0.5rem)" }}
        >
          <p className="text-center text-sm text-muted-foreground">
            아직 가입하지 않으셨나요?{" "}
            <Link to="/signup" className="font-semibold text-primary-strong underline">
              가입하기
            </Link>
          </p>
        </footer>
      ) : null}
    </div>
  );
}
