import { supabase } from "@/lib/supabase";
import { POLICY_VERSION } from "@/lib/policy";

export type SignupSession = {
  policyVersion: string;
  acceptedAt: string;
  expiresAt: string;
  verified: boolean;
  gender?: "male" | "female" | null;
  birth?: string | null;
};
const KEY = "after-signup-session";
const PENDING_KEY = "after-signup-identity";

export const signupToken = () => sessionStorage.getItem(KEY);
export const pendingSignupIdentity = () => sessionStorage.getItem(PENDING_KEY);
export function clearSignupSession() {
  sessionStorage.removeItem(KEY);
  sessionStorage.removeItem(PENDING_KEY);
}

export async function beginSignup(): Promise<SignupSession> {
  const token = Array.from(crypto.getRandomValues(new Uint8Array(32)), (b) =>
    b.toString(16).padStart(2, "0"),
  ).join("");
  const { data, error } = await supabase.rpc("begin_signup", {
    p_token: token,
    p_policy_version: POLICY_VERSION,
  });
  if (error) throw error;
  sessionStorage.setItem(KEY, token);
  sessionStorage.removeItem(PENDING_KEY);
  return data as unknown as SignupSession;
}

export async function loadSignupSession(): Promise<SignupSession | null> {
  const token = signupToken();
  if (!token) return null;
  const { data, error } = await supabase.rpc("signup_session_status", { p_token: token });
  if (error) {
    if (error.code === "P0002" || error.code === "PT409") {
      clearSignupSession();
      return null;
    }
    // A network failure must not discard a completed carrier verification.
    throw error;
  }
  return data as unknown as SignupSession;
}

async function invoke<T>(body: Record<string, string>): Promise<T> {
  const token = signupToken();
  if (!token) throw new Error("signup expired");
  const { data, error } = await supabase.functions.invoke<T>("signup-identity", {
    body: { ...body, token },
  });
  if (error) {
    const response = (error as { context?: Response }).context;
    let message = "verification unavailable";
    try {
      const payload = await response?.json();
      if (typeof payload?.error === "string") message = payload.error;
    } catch {
      // Provider response bodies can contain private identity information.
    }
    throw new Error(message);
  }
  return data as T;
}

export async function startSignupIdentity(): Promise<SignupSession> {
  const current = await loadSignupSession();
  if (current?.verified) return current;
  const pending = pendingSignupIdentity();
  if (pending) {
    try {
      return await finishSignupIdentity(pending);
    } catch (error) {
      const reason = error instanceof Error ? error.message : "";
      if (!["not verified", "verification expired"].includes(reason)) throw error;
      sessionStorage.removeItem(PENDING_KEY);
    }
  }
  const started = await invoke<{
    identityVerificationId: string;
    storeId: string;
    channelKey: string;
  }>({ action: "start" });
  sessionStorage.setItem(PENDING_KEY, started.identityVerificationId);
  const PortOne = await import("@portone/browser-sdk/v2");
  const result = await PortOne.requestIdentityVerification({
    ...started,
    redirectUrl: `${window.location.origin}/signup`,
  });
  if (!result || result.code) {
    sessionStorage.removeItem(PENDING_KEY);
    throw new Error("not verified");
  }
  return finishSignupIdentity(started.identityVerificationId);
}

export async function finishSignupIdentity(id: string): Promise<SignupSession> {
  if (pendingSignupIdentity() !== id) throw new Error("verification expired");
  const result = await invoke<SignupSession>({ action: "complete", identityVerificationId: id });
  sessionStorage.removeItem(PENDING_KEY);
  return result;
}
