import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";

import { AppScreen } from "@/components/app/AppScreen";
import { CarrierIdentityForm } from "@/components/app/CarrierIdentityForm";
import { PhoneVerifyForm } from "@/components/app/PhoneVerifyForm";
import { Button } from "@/components/ui/button";
import { signOut } from "@/lib/api";
import { BRAND } from "@/lib/brand";
import {
  carrierIdentityEnabled,
  carrierIdentityError,
  finishCarrierIdentity,
  pendingCarrierIdentity,
} from "@/lib/carrierIdentity";
import { useMe } from "@/lib/me";

export const Route = createFileRoute("/verify-phone")({
  head: () => ({ meta: [{ title: `본인 확인 — ${BRAND.name}` }] }),
  component: VerifyPhone,
});

/**
 * 휴대폰 인증 전에 가입한 회원용(s54). 가입 흐름에는 인증 단계가 들어가 있고,
 * 이 화면은 홈 안내에서만 들어온다. 인증하기 전까지는 소개 대상이 아니다.
 */
function VerifyPhone() {
  const navigate = useNavigate();
  const { me, refresh } = useMe();
  const processedReturn = useRef(false);
  const [returning, setReturning] = useState(false);
  const [returnError, setReturnError] = useState<string | null>(null);

  useEffect(() => {
    if (!carrierIdentityEnabled || processedReturn.current) return;
    const query = new URLSearchParams(window.location.search);
    const id = query.get("identityVerificationId");
    const code = query.get("code");
    if (!id && !code) return;
    processedReturn.current = true;
    window.history.replaceState(null, "", "/verify-phone");
    if (code || !id || pendingCarrierIdentity() !== id) {
      setReturnError("본인확인을 완료하지 못했어요. 다시 시도해 주세요.");
      return;
    }
    setReturning(true);
    finishCarrierIdentity(id)
      .then(async () => {
        await refresh();
        toast.success("본인·성인 확인을 마쳤어요.");
        void navigate({ to: me && me.onboarding_step < 7 ? "/signup" : "/home", replace: true });
      })
      .catch((error: unknown) => setReturnError(carrierIdentityError(error)))
      .finally(() => setReturning(false));
  }, [me, navigate, refresh]);

  const title = carrierIdentityEnabled ? "본인·성인 확인" : "휴대폰 인증";
  return (
    <AppScreen title={title} back={carrierIdentityEnabled ? "/support" : "/home"} hideTabs>
      <p className="mt-2 mb-8 text-sm leading-relaxed text-muted-foreground">
        {carrierIdentityEnabled
          ? "본인 명의 휴대폰으로 확인하면 소개를 시작할 수 있어요."
          : "한 사람이 한 계정만 쓰도록 번호를 한 번 확인해요. 인증하면 소개가 다시 시작돼요."}
      </p>
      {returning ? (
        <p className="text-sm text-muted-foreground">인증 결과를 확인하고 있어요…</p>
      ) : null}
      {returnError ? (
        <p role="alert" className="mb-4 text-sm text-destructive">
          {returnError}
        </p>
      ) : null}
      {!returning &&
        (carrierIdentityEnabled ? (
          <CarrierIdentityForm
            onVerified={async () => {
              await refresh();
              toast.success("본인·성인 확인을 마쳤어요.");
              navigate({ to: me && me.onboarding_step < 7 ? "/signup" : "/home" });
            }}
          />
        ) : (
          <PhoneVerifyForm
            onVerified={async () => {
              await refresh();
              toast.success("휴대폰 인증을 마쳤어요.");
              navigate({ to: "/home" });
            }}
          />
        ))}
      {carrierIdentityEnabled ? (
        <div className="mt-6 flex items-center justify-center gap-4 text-sm">
          <Link to="/support" className="text-muted-foreground underline">
            인증에 문제가 있나요?
          </Link>
          <Button
            variant="ghost"
            size="sm"
            onClick={async () => {
              await signOut();
              navigate({ to: "/", replace: true });
            }}
          >
            로그아웃
          </Button>
        </div>
      ) : null}
    </AppScreen>
  );
}
