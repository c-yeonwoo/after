import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { toast } from "sonner";

import { AppScreen } from "@/components/app/AppScreen";
import { PhoneVerifyForm } from "@/components/app/PhoneVerifyForm";
import { BRAND } from "@/lib/brand";
import { useMe } from "@/lib/me";

export const Route = createFileRoute("/verify-phone")({
  head: () => ({ meta: [{ title: `휴대폰 인증 — ${BRAND.name}` }] }),
  component: VerifyPhone,
});

/**
 * 휴대폰 인증 전에 가입한 회원용(s54). 가입 흐름에는 인증 단계가 들어가 있고,
 * 이 화면은 홈 안내에서만 들어온다. 인증하기 전까지는 소개 대상이 아니다.
 */
function VerifyPhone() {
  const navigate = useNavigate();
  const { refresh } = useMe();
  return (
    <AppScreen title="휴대폰 인증" back="/home" hideTabs>
      <p className="mt-2 mb-8 text-sm leading-relaxed text-muted-foreground">
        한 사람이 한 계정만 쓰도록 번호를 한 번 확인해요. 인증하면 소개가 다시 시작돼요.
      </p>
      <PhoneVerifyForm
        onVerified={async () => {
          await refresh();
          toast.success("휴대폰 인증을 마쳤어요.");
          navigate({ to: "/home" });
        }}
      />
    </AppScreen>
  );
}
