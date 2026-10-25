import { getProfile, type PublicProfile } from "./api";
import { supabase } from "./supabase";
import type { MemberIntroductionBrief } from "../../supabase/functions/_shared/member-introduction";

export type {
  MemberIntroductionBrief,
  PublicEvidence,
} from "../../supabase/functions/_shared/member-introduction";

export async function readIntroductionProfiles(owner: string, target: string) {
  const [self, other] = await Promise.all([getProfile(owner), getProfile(target)]);
  return self && other ? { self, other } : null;
}

export const introductionProfileFingerprint = (profiles: {
  self: PublicProfile;
  other: PublicProfile;
}) => JSON.stringify(profiles);

export async function introduceMember(target: string, requestId: string) {
  const { data, error } = await supabase.functions.invoke<
    MemberIntroductionBrief & { code?: string }
  >("introduce-member", { body: { target, requestId, consent: true } });
  if (error || data?.code || !data?.portrait?.length) {
    let code = data?.code;
    if (error && "context" in error && error.context instanceof Response) {
      try {
        code = (await error.context.json()).code;
      } catch {
        /* Use the generic recovery copy. */
      }
    }
    throw new Error(code ?? "generation_failed");
  }
  return data;
}

export const memberIntroductionError = (code: string) =>
  ({
    disabled: "비서 설명은 아직 준비 중이에요. 아래 프로필을 먼저 읽어보세요.",
    unavailable: "지금은 이 프로필을 확인할 수 없어요. 소개 화면을 다시 확인해 주세요.",
    unauthorized: "로그인을 다시 확인해 주세요.",
    changed: "프로필이 바뀌었어요. 새 내용으로 다시 살펴볼게요.",
    needs_material: "아직 소개할 이야기가 짧아요. 직접 적은 답변부터 읽어보세요.",
    daily_limit: "오늘 준비 횟수를 모두 썼어요. 이미 준비한 설명은 다시 볼 수 있어요.",
    in_progress: "이미 설명을 준비 중이에요. 잠시 후 다시 확인해 주세요.",
    duplicate_request: "요청을 이미 받았어요. 잠시 후 다시 확인해 주세요.",
    quality_failed: "공개 답변과 맞지 않는 표현이 있어 다시 준비해야 해요.",
    not_configured: "비서 설명을 점검하고 있어요. 잠시 후 다시 이용해 주세요.",
  })[code] ?? "설명을 마치지 못했어요. 연결을 확인하고 다시 시도해 주세요.";
