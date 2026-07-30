/**
 * AI 인터뷰 질문 세트 (Step 3에서 실제 AI 대화로 교체 예정).
 * 지금은 고정 질문 + 로컬 요약 생성으로 흐름만 검증합니다.
 */
export type InterviewQuestion = {
  id: string;
  prompt: string;
  placeholder: string;
};

export const INTERVIEW_QUESTIONS: InterviewQuestion[] = [
  {
    id: "weekday",
    prompt: "퇴근 후 평일 저녁은 보통 어떻게 보내세요?",
    placeholder: "예: 회사 근처에서 러닝하고, 집에서 책 읽는 편이에요.",
  },
  {
    id: "values",
    prompt: "관계에서 절대 양보하기 어려운 것 하나를 꼽는다면?",
    placeholder: "예: 서로의 일하는 시간을 존중해 주는 것.",
  },
  {
    id: "conflict",
    prompt: "의견이 부딪혔을 때 본인은 어떤 방식으로 푸는 편인가요?",
    placeholder: "예: 바로 말하기보다 하루 정리한 뒤 대화하는 편이에요.",
  },
  {
    id: "ideal",
    prompt: "어떤 결의 사람과 잘 맞는다고 느끼셨나요?",
    placeholder: "예: 말이 빠르지 않고, 자기 일에 꾸준한 사람.",
  },
  {
    id: "cafe",
    prompt: "첫 만남 카페에서 40분 동안 무슨 이야기를 하고 싶으세요?",
    placeholder: "예: 요즘 빠져 있는 것, 그리고 앞으로 살고 싶은 방식.",
  },
];

export function buildDraftIntro(answers: Record<string, string>) {
  const parts = INTERVIEW_QUESTIONS.map((q) => answers[q.id]?.trim()).filter(
    (a): a is string => Boolean(a),
  );
  if (parts.length === 0) return "";
  return [
    `평일 저녁은 ${parts[0] ?? "조용히 보내는"} 사람입니다.`,
    parts[1] ? `관계에서는 "${parts[1]}"을(를) 가장 중요하게 봅니다.` : "",
    parts[3] ? `${parts[3]} 같은 결의 사람과 이야기가 잘 통했습니다.` : "",
    parts[4] ? `첫 카페에서는 ${parts[4]} 이야기를 나누고 싶어요.` : "",
  ]
    .filter(Boolean)
    .join(" ");
}
