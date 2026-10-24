import type { Profile } from "./api";

/** Navigation only. Introduction eligibility remains exclusively server-owned. */
export function accountChecksComplete(profile: Profile, carrier: boolean): boolean {
  return Boolean(
    profile.terms_agreed_at &&
    profile.privacy_agreed_at &&
    profile.company_email &&
    (carrier ? profile.identity_verified_at : profile.phone_verified_at),
  );
}

export type AssistantIntent = "status" | "profile" | "schedule" | "prepare" | "support" | "unknown";
export function assistantIntent(text: string): AssistantIntent {
  if (/취소|환불|신고|차단|결제|고객|문의/.test(text)) return "support";
  if (/대화|이야기|질문|주제|준비/.test(text)) return "prepare";
  if (/프로필|사진|소개글|인터뷰/.test(text)) return "profile";
  if (/일정|시간|요일|약속|장소/.test(text)) return "schedule";
  if (/상태|진행|언제|소개|기다|다음/.test(text)) return "status";
  return "unknown";
}
