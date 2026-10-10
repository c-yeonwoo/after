import { useState } from "react";
import { AlertCircle } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { phoneErrorMessage, sendPhoneCode, verifyPhoneCode, type Profile } from "@/lib/api";

/**
 * 휴대폰 인증 (s54). 가입 단계와 기존 회원용 화면(/verify-phone)이 같이 쓴다.
 *
 * 번호를 보내면 서버가 정규화한 번호(+82…)를 돌려주고, 확인은 그 번호로 한다 —
 * 사람이 하이픈을 넣었든 안 넣었든 서버가 본 번호와 같아야 코드가 맞는다.
 */
export function PhoneVerifyForm({ onVerified }: { onVerified: (p: Profile) => void }) {
  const [raw, setRaw] = useState("");
  const [phone, setPhone] = useState<string | null>(null);
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hint, setHint] = useState<string | null>(null);

  async function send() {
    setError(null);
    setBusy(true);
    try {
      const r = await sendPhoneCode(raw);
      setPhone(r.phone);
      // 로컬 개발에서만 서버가 코드를 돌려준다(문자 키가 없을 때).
      if (r.devCode) {
        setCode(r.devCode);
        setHint("로컬 개발 환경이라 인증번호를 자동으로 채웠어요.");
      } else {
        setHint("문자로 받은 6자리를 입력해 주세요. 3분 동안 쓸 수 있어요.");
      }
    } catch (err) {
      setError(phoneErrorMessage(err instanceof Error ? err.message : undefined));
    } finally {
      setBusy(false);
    }
  }

  async function verify() {
    if (!phone) return;
    setError(null);
    setBusy(true);
    try {
      onVerified(await verifyPhoneCode(phone, code));
    } catch (err) {
      setError(phoneErrorMessage(err instanceof Error ? err.message : undefined));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-5">
      <div>
        <label className="text-sm font-semibold text-foreground" htmlFor="phone">
          휴대폰 번호
        </label>
        <div className="mt-2 flex gap-2">
          <Input
            id="phone"
            type="tel"
            inputMode="numeric"
            autoComplete="tel"
            placeholder="010-0000-0000"
            value={raw}
            onChange={(e) => {
              setRaw(e.target.value);
              setPhone(null);
              setCode("");
            }}
          />
          <Button
            variant="outline"
            className="shrink-0"
            disabled={raw.replace(/\D/g, "").length < 10 || busy}
            onClick={send}
          >
            {phone ? "다시 받기" : "인증번호 받기"}
          </Button>
        </div>
        <p className="mt-2 text-sm text-muted-foreground">
          번호는 상대에게 보이지 않아요. 한 번호로 한 계정만 만들 수 있어요.
        </p>
      </div>

      {phone ? (
        <div>
          <label className="text-sm font-semibold text-foreground" htmlFor="phone-code">
            인증번호
          </label>
          <Input
            id="phone-code"
            inputMode="numeric"
            autoComplete="one-time-code"
            maxLength={6}
            placeholder="000000"
            className="mt-2 tracking-[0.4em]"
            value={code}
            onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
          />
          {hint ? <p className="mt-2 text-sm text-muted-foreground">{hint}</p> : null}
        </div>
      ) : null}

      {error ? (
        <p role="alert" className="flex items-start gap-1.5 text-sm font-medium text-destructive">
          <AlertCircle className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
          <span>{error}</span>
        </p>
      ) : null}

      <Button
        className="w-full"
        size="lg"
        disabled={!phone || code.length !== 6 || busy}
        onClick={verify}
      >
        {busy ? "확인 중…" : "인증하고 계속"}
      </Button>
    </div>
  );
}
