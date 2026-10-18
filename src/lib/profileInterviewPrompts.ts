import type { StorySectionId } from "@/lib/profileStory";

/** Input-only prompts. Published story questions remain in profileStory.ts. */
export const PROFILE_INTERVIEW_PROMPTS = {
  daily_life: {
    question: "최근 퇴근 후 기억에 남는 작은 순간이 있나요?",
    guide: "집에 돌아오는 길처럼, 떠오르는 장면 하나만 적어 주세요.",
  },
  getting_closer: {
    question: "누군가와 어색함이 풀렸던 순간이 있나요?",
    guide: "함께 있던 때나 오간 말을 한두 문장으로 적어도 좋아요.",
  },
  conversation: {
    question: "요즘 누군가에게 들려주고 싶은 이야기가 있나요?",
    guide: "최근 본 것처럼 가벼운 이야기부터 적어도 좋아요.",
  },
} as const satisfies Record<StorySectionId, { question: string; guide: string }>;
