import { useState } from "react";
import { AlertCircle } from "lucide-react";

import { Button } from "@/components/ui/button";
import { carrierIdentityError, startCarrierIdentity } from "@/lib/carrierIdentity";
import { isNative } from "@/lib/native";

export function CarrierIdentityForm({
  onVerified,
  verifyIdentity = startCarrierIdentity,
}: {
  onVerified: (birth: string) => void | Promise<void>;
  verifyIdentity?: () => Promise<string>;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function verify() {
    setBusy(true);
    setError(null);
    try {
      const birth = await verifyIdentity();
      await onVerified(birth);
    } catch (cause) {
      setError(carrierIdentityError(cause));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-5">
      <p className="text-sm leading-relaxed text-muted-foreground">
        본인 명의 휴대폰으로 성인 여부를 확인합니다. 확인한 번호와 생년월일은 상대에게 보이지
        않아요.
      </p>
      {isNative ? (
        <p className="text-sm text-muted-foreground">
          앱 내 본인확인은 준비 중입니다. 웹에서 먼저 확인해 주세요.
        </p>
      ) : null}
      {error ? (
        <p role="alert" className="flex items-start gap-1.5 text-sm font-medium text-destructive">
          <AlertCircle className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
          <span>{error}</span>
        </p>
      ) : null}
      <Button className="w-full" size="lg" disabled={busy || isNative} onClick={verify}>
        {busy ? "확인 중…" : "본인·성인 확인하기"}
      </Button>
    </div>
  );
}
