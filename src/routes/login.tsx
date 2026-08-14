import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { AlertCircle } from "lucide-react";
import { toast } from "sonner";

import { Logo } from "@/components/Logo";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { BRAND, isCompanyEmail } from "@/lib/brand";
import { authErrorMessage, devFetchLatestOtp, requestEmailCode, signInExisting } from "@/lib/api";
import { useMe } from "@/lib/me";

export const Route = createFileRoute("/login")({
  head: () => ({
    meta: [
      { title: `로그인 — ${BRAND.short}` },
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

  const emailValid = email.includes("@") && isCompanyEmail(email);

  return (
    <div className="flex h-full flex-col overflow-hidden bg-background px-6">
      <header className="flex shrink-0 items-center" style={{ paddingTop: "var(--safe-top)" }}>
        <Logo size="sm" />
      </header>

      <main className="min-h-0 flex-1 overflow-y-auto overscroll-contain pt-12">
        <h1 className="headline text-3xl">다시 오셨네요</h1>
        {/*
          코드 단계에서는 이 설명을 접는다.

          키보드가 올라오면 본문이 짧아져서 **로그인 버튼이 화면 밖으로
          밀린다**(iOS 검증). 코드를 받은 사람은 이 문장을 이미 읽었고, 지금
          필요한 것은 입력칸과 누를 버튼이다 — 자리를 그쪽에 준다.
        */}
        {!codeSent ? (
          <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
            가입할 때 인증한 회사 이메일로 코드를 보내드립니다. 비밀번호는 없습니다.
          </p>
        ) : null}

        {/*
          코드를 보낸 뒤에는 입력칸 대신 보낸 주소를 한 줄로 적는다.

          비활성 입력칸은 라벨·필드로 70px 넘게 차지하는데, 그 자리가 없어서
          로그인 버튼이 키보드 밖으로 밀렸다(iOS 검증). 주소를 바꿀 길은 바로
          아래 "이메일 다시 입력" 이 열어 두므로, 여기서 필요한 것은 **어디로
          보냈는지 확인** 하는 것뿐이다.

          "…으로" 가 아니라 "주소로" 라고 쓴다 — 조사는 앞 글자의 받침에 따라
          갈리는데 이메일 끝은 무엇이든 올 수 있어서 어느 쪽을 박아도 틀리는
          주소가 생긴다.
        */}
        {codeSent ? (
          <p className="mt-6 text-sm text-muted-foreground">
            <span className="font-semibold text-foreground">{email}</span> 주소로 코드를 보냈습니다.
          </p>
        ) : (
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
            />
            <p className="mt-2 text-sm text-muted-foreground">개인 메일은 사용할 수 없습니다.</p>
          </div>
        )}

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

        {/*
          코드 단계에서는 이 묶음을 화면 안으로 끌어온다(아래 useEffect).

          iOS 검증에서 코드 6자리를 넣은 직후 **로그인 버튼이 화면에서
          사라졌다.** 키보드가 올라오면 본문이 그만큼 짧아지고 버튼은 스크롤
          아래로 밀리는데, 숫자 키패드에는 완료 키가 없어서 "다 입력했는데
          누를 것이 없는" 상태가 된다.

          처음엔 sticky bottom-0 으로 붙여 봤다가 되돌렸다 — 버튼이 본문 위에
          떠서 **인증 코드 입력칸을 가렸다.** 입력한 숫자를 못 보게 만드는
          해결은 해결이 아니다. 자리를 옮기지 않고 스크롤만 맞춘다.
        */}
        <div ref={actionsRef} className="mt-8">
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
                  // 탈퇴·제명 계정은 OTP 자체는 통과한다(auth.users 가 남아 있다).
                  // signInExisting 이 이미 로그아웃시켰으므로 여기선 알리기만 한다.
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

      {/*
        가입 안내도 코드 단계에서는 접는다 — 본문 높이를 70pt 가까이 잡아먹어서
        로그인 버튼이 들어갈 자리를 없앤다. 코드를 받은 사람에게 "아직 가입하지
        않으셨나요?" 는 지금 필요한 안내가 아니다.
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
