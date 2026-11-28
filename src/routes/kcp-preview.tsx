import { createFileRoute, Link } from "@tanstack/react-router";
import { createClient } from "@supabase/supabase-js";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { OTP_MIN_LENGTH, OTP_MAX_LENGTH } from "@/lib/api";
import { carrierIdentityError } from "@/lib/carrierIdentity";
import type { Database } from "@/lib/database.types";
import { createSignupSession } from "@/lib/signupSession";
import { StepShell } from "@/components/onboarding/StepShell";

export const Route = createFileRoute("/kcp-preview")({
  head: () => ({
    meta: [
      { title: "휴대폰 본인확인 테스트 · 애프터" },
      { name: "robots", content: "noindex,nofollow" },
      { name: "referrer", content: "no-referrer" },
    ],
  }),
  component: DevicePreview,
});

function createDeviceClient() {
  const client = createClient<Database>(
    import.meta.env.VITE_SUPABASE_URL,
    import.meta.env.VITE_SUPABASE_ANON_KEY,
    {
      auth: {
        storage: window.sessionStorage,
        storageKey: "after-kcp-qa-auth",
        detectSessionInUrl: false,
        flowType: "pkce",
      },
    },
  );
  return { client, signup: createSignupSession(client, "after-kcp-qa") };
}

let tab: ReturnType<typeof createDeviceClient> | undefined;
const device = () => (tab ??= createDeviceClient());
type Step = "loading" | "email" | "code" | "consent" | "done";

function DevicePreview() {
  const [step, setStep] = useState<Step>("loading");
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [terms, setTerms] = useState(false);
  const [privacy, setPrivacy] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [hasConsent, setHasConsent] = useState(false);

  async function enter() {
    const { client, signup } = device();
    const allowed = await client.functions.invoke("signup-identity", {
      body: { action: "preview-access" },
    });
    if (allowed.error || !allowed.data?.allowed) {
      setStep("email");
      setError("테스트 접근을 확인할 수 없어요. 초대된 이메일과 연결 상태를 확인해 주세요.");
      return;
    }
    setStep("consent");
    const current = await signup.loadSignupSession();
    if (current) setHasConsent(true);
    const query = new URLSearchParams(window.location.search);
    const id = query.get("identityVerificationId");
    if (id || query.has("code")) {
      window.history.replaceState(window.history.state, "", "/kcp-preview");
      if (!id || id !== signup.pendingSignupIdentity())
        throw new Error("verification result mismatch");
      if (query.has("code")) {
        setError("본인확인을 완료하지 않았어요. 준비되면 다시 시도해 주세요.");
        return;
      }
      if (!(await signup.finishSignupIdentity(id)).verified) throw new Error("not verified");
      setStep("done");
    } else if (current?.verified) {
      setStep("done");
    }
  }

  useEffect(() => {
    let mounted = true;
    setBusy(true);
    void device()
      .client.auth.getSession()
      .then(async ({ data }) => {
        if (!mounted) return;
        if (data.session) await enter();
        else setStep("email");
      })
      .catch((e: unknown) => {
        if (mounted) {
          setStep((s) => (s === "loading" ? "email" : s));
          setError(carrierIdentityError(e));
        }
      })
      .finally(() => {
        if (mounted) setBusy(false);
      });
    return () => {
      mounted = false;
    };
  }, []);

  async function submit() {
    if (busy) return;
    setBusy(true);
    setError("");
    const { client, signup } = device();
    try {
      if (step === "email") {
        const sent = await client.functions.invoke("signup-identity", {
          body: { action: "preview-email", email: email.trim() },
        });
        if (sent.error || !sent.data?.requested) throw new Error("email unavailable");
        setCode("");
        setStep("code");
      } else if (step === "code") {
        const verified = await client.auth.verifyOtp({
          email: email.trim(),
          token: code,
          type: "email",
        });
        if (verified.error || !verified.data.session) throw new Error("email code");
        setCode("");
        await enter();
      } else if (step === "consent") {
        if (!(await signup.loadSignupSession())) {
          if (!(terms && privacy)) {
            setHasConsent(false);
            setError("테스트를 계속하려면 약관을 다시 확인해 주세요.");
            return;
          }
          await signup.beginSignup();
          setHasConsent(true);
        }
        const result = await signup.startSignupIdentity();
        if (!result.verified) throw new Error("not verified");
        setStep("done");
      }
    } catch (e) {
      const message = e instanceof Error ? e.message : "";
      if (message === "verification redirecting") return;
      setError(
        message === "email unavailable"
          ? "코드를 요청할 수 없어요. 잠시 후 다시 시도해 주세요."
          : message === "email code"
            ? "코드가 만료됐거나 일치하지 않아요. 이메일을 다시 확인해 주세요."
            : carrierIdentityError(e),
      );
    } finally {
      setBusy(false);
    }
  }

  const login = step === "email" || step === "code";
  const title = {
    loading: "테스트 세션을 확인하고 있어요",
    email: "초대받은 이메일을 확인해요",
    code: "메일로 받은 코드를 입력해 주세요",
    consent: "내 휴대폰으로 본인확인",
    done: "본인·성인 확인을 마쳤어요",
  }[step];
  const label =
    step === "email" ? "인증 코드 받기" : step === "code" ? "코드 확인" : "KCP 본인확인 열기";
  const disabled =
    busy ||
    (step === "email" && !email.trim()) ||
    (step === "code" && code.length < OTP_MIN_LENGTH) ||
    (step === "consent" && !hasConsent && !(terms && privacy));
  return (
    <StepShell
      step={step === "done" ? 3 : login || step === "loading" ? 1 : 2}
      total={3}
      eyebrow="휴대폰 실기기 테스트"
      title={title}
      assistant={false}
      description={
        step === "consent"
          ? "실제 통신사 인증을 진행해요. 결과는 임시 가입 세션에 기록하며 회원 프로필은 만들지 않아요."
          : step === "done"
            ? "KCP 서버에서 인증 결과를 확인했어요. 이 탭을 닫아도 돼요."
            : undefined
      }
      footer={
        step === "done" ? (
          <Button asChild className="w-full">
            <Link to="/">애프터로 돌아가기</Link>
          </Button>
        ) : step === "loading" ? null : (
          <Button type="submit" form="device-preview" disabled={disabled} className="w-full">
            {busy ? "확인 중…" : label}
          </Button>
        )
      }
    >
      <form
        id="device-preview"
        className="space-y-4"
        onSubmit={(event) => {
          event.preventDefault();
          if (!disabled) void submit();
        }}
      >
        {step === "email" && (
          <label className="grid gap-2">
            이메일
            <Input
              type="email"
              autoComplete="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </label>
        )}
        {step === "code" && (
          <>
            <label className="grid gap-2">
              인증 코드
              <Input
                inputMode="numeric"
                autoComplete="one-time-code"
                maxLength={OTP_MAX_LENGTH}
                value={code}
                onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
              />
            </label>
            <Button
              type="button"
              variant="ghost"
              disabled={busy}
              onClick={() => {
                setStep("email");
                setCode("");
                setError("");
              }}
            >
              이메일 변경 · 코드 다시 받기
            </Button>
          </>
        )}
        {step === "consent" && !hasConsent && (
          <div className="space-y-4">
            <label className="flex items-center gap-3">
              <input type="checkbox" checked={terms} onChange={(e) => setTerms(e.target.checked)} />
              <span>
                <Link to="/terms" target="_blank" className="underline">
                  이용약관
                </Link>{" "}
                동의 (필수)
              </span>
            </label>
            <label className="flex items-center gap-3">
              <input
                type="checkbox"
                checked={privacy}
                onChange={(e) => setPrivacy(e.target.checked)}
              />
              <span>
                <Link to="/privacy" target="_blank" className="underline">
                  개인정보 수집·이용
                </Link>{" "}
                동의 (필수)
              </span>
            </label>
          </div>
        )}
        {error && (
          <p role="alert" className="text-sm text-destructive">
            {error}
          </p>
        )}
      </form>
    </StepShell>
  );
}
