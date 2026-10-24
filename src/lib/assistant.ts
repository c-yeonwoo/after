import type { Profile } from "./api";
export {
  assistantIntent,
  type AssistantIntent,
} from "../../supabase/functions/_shared/assistant-workflow";

/** Navigation only. Introduction eligibility remains exclusively server-owned. */
export function accountChecksComplete(profile: Profile, carrier: boolean): boolean {
  return Boolean(
    profile.terms_agreed_at &&
    profile.privacy_agreed_at &&
    profile.company_email &&
    (carrier ? profile.identity_verified_at : profile.phone_verified_at),
  );
}
