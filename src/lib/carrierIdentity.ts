import { supabase } from "@/lib/supabase";

/** 공급자 계약/시크릿 및 DB 게이트 검증 전에는 빌드에서 열지 않는다. */
export const carrierIdentityEnabled = import.meta.env.VITE_CARRIER_IDENTITY_ENABLED === "true";

type StartResult = { identityVerificationId: string; storeId: string; channelKey: string };

async function invoke<T>(body: Record<string, string>): Promise<T> {
  const { data, error } = await supabase.functions.invoke<T>("carrier-identity", { body });
  if (error) {
    let reason = "verification unavailable";
    try {
      const payload = await (error as { context?: Response }).context?.json();
      if (typeof payload?.error === "string") reason = payload.error;
    } catch {
      // 인증기관 응답 전문과 개인정보는 화면에 내보내지 않는다.
    }
    throw new Error(reason);
  }
  return data as T;
}

export function carrierIdentityError(error: unknown): string {
  const reason = error instanceof Error ? error.message : "";
  if (reason.includes("adult only")) return "만 19세 이상만 이용할 수 있어요.";
  if (reason.includes("phone in use") || reason.includes("identity already in use"))
    return "이미 다른 계정에서 확인된 신원입니다. 고객센터로 문의해 주세요.";
  if (reason.includes("daily limit"))
    return "오늘 인증 시도 횟수를 넘었어요. 내일 다시 시도해 주세요.";
  if (reason.includes("verification expired")) return "인증 시간이 지났어요. 다시 시작해 주세요.";
  if (reason.includes("not configured"))
    return "본인확인 준비 중입니다. 잠시 후 다시 시도해 주세요.";
  if (reason.includes("not verified")) return "본인확인을 완료하지 못했어요. 다시 시도해 주세요.";
  return "본인확인을 마치지 못했어요. 잠시 후 다시 시도해 주세요.";
}

const PENDING_KEY = "after-carrier-identity-id";

export async function startCarrierIdentity(): Promise<string> {
  const started = await invoke<StartResult>({ action: "start" });
  sessionStorage.setItem(PENDING_KEY, started.identityVerificationId);
  const PortOne = await import("@portone/browser-sdk/v2");
  const result = await PortOne.requestIdentityVerification({
    storeId: started.storeId,
    channelKey: started.channelKey,
    identityVerificationId: started.identityVerificationId,
    redirectUrl: `${window.location.origin}/verify-phone`,
  });
  // 모바일은 리다이렉트되므로 이 지점에 돌아오지 않는다.
  if (!result || result.code) throw new Error("not verified");
  return finishCarrierIdentity(started.identityVerificationId);
}

export async function finishCarrierIdentity(id: string): Promise<string> {
  if (sessionStorage.getItem(PENDING_KEY) !== id) throw new Error("verification expired");
  const result = await invoke<{ verified: true; birth: string }>({
    action: "complete",
    identityVerificationId: id,
  });
  sessionStorage.removeItem(PENDING_KEY);
  return result.birth;
}

export function pendingCarrierIdentity(): string | null {
  return sessionStorage.getItem(PENDING_KEY);
}
