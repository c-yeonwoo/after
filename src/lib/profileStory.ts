export const STORY_QUESTIONS = [
  { id: "daily_life", questionId: "daily_life_v1", question: "퇴근 후에는 어떻게 보내세요?" },
  { id: "getting_closer", questionId: "getting_closer_v1", question: "어떤 만남에서 편해지나요?" },
  {
    id: "conversation",
    questionId: "conversation_v1",
    question: "만나면 어떤 이야기를 나누고 싶나요?",
  },
] as const;

export type StorySectionId = (typeof STORY_QUESTIONS)[number]["id"];
export type StorySection = {
  id: StorySectionId;
  questionId: string;
  questionVersion: number;
  question: string;
  answer: string;
};
export type ProfileStoryV3 = {
  version: 3;
  headline: string;
  summary: string;
  sections: StorySection[];
  conversationHooks: string[];
  publishedRevision: number;
};

export const CHOICE_QUESTIONS = [
  {
    id: "rhythm",
    title: "퇴근 후 시간이 생기면 주로 어떻게 보내세요?",
    max: 2,
    options: ["혼자 푹 쉬기", "운동하기", "사람 만나기", "취미에 몰입하기", "동네 돌아보기"],
  },
  {
    id: "first_date",
    title: "처음 만날 때 편한 자리는 어떤 쪽인가요?",
    max: 2,
    options: ["짧게 커피", "함께 걷기", "식사하며 대화", "가벼운 술자리", "활동이나 체험"],
  },
  {
    id: "contact",
    title: "일하는 날에는 어떻게 연락하는 편인가요?",
    max: 1,
    options: ["틈틈이 짧게", "여유 생길 때 모아서", "퇴근 후 편하게", "미리 정한 방식 없음"],
  },
  {
    id: "planning",
    title: "약속은 어떻게 정할 때 편하세요?",
    max: 1,
    options: ["며칠 전에 정하기", "당일 상황 보고", "큰 틀만 정하기", "상대와 함께 맞추기"],
  },
  {
    id: "closeness",
    title: "어떤 순간에 상대와 가까워졌다고 느끼나요?",
    max: 2,
    options: ["일상을 나눌 때", "함께 무언가 할 때", "작은 배려를 느낄 때", "생각을 깊이 나눌 때"],
  },
  {
    id: "topics",
    title: "만나면 자연스럽게 꺼내고 싶은 이야기는요?",
    max: 3,
    options: [
      "요즘 일상",
      "영화·드라마",
      "음식",
      "운동",
      "음악",
      "여행",
      "하는 일",
      "중요하게 생각하는 것",
    ],
  },
] as const;

export type ChoiceId = (typeof CHOICE_QUESTIONS)[number]["id"];
export type ChoiceAnswers = Partial<Record<ChoiceId, string[]>>;

export function validProfileStory(value: unknown): value is ProfileStoryV3 {
  if (!value || typeof value !== "object") return false;
  const story = value as Partial<ProfileStoryV3>;
  if (
    story.version !== 3 ||
    typeof story.headline !== "string" ||
    story.headline.trim().length < 3 ||
    story.headline.length > 35 ||
    /^(음|모름|몰라요|없어요|그냥)[.。!…\s]*$/u.test(story.headline.trim()) ||
    typeof story.summary !== "string" ||
    story.summary.trim().length < 5 ||
    story.summary.length > 300 ||
    !Array.isArray(story.sections) ||
    story.sections.length < 1 ||
    story.sections.length > 3 ||
    !Array.isArray(story.conversationHooks) ||
    story.conversationHooks.length > 2 ||
    typeof story.publishedRevision !== "number" ||
    !Number.isSafeInteger(story.publishedRevision) ||
    story.publishedRevision < 0 ||
    story.conversationHooks.some((hook) => typeof hook !== "string" || hook.length > 100) ||
    /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}|(?:\+?82[- .]?)?0?1[016789][-. ]?\d{3,4}[-. ]?\d{4}|https?:\/\/\S+/i.test(
      JSON.stringify(story),
    )
  )
    return false;
  const seen = new Set<string>();
  return story.sections.every((section) => {
    if (!section || typeof section !== "object") return false;
    const expected = STORY_QUESTIONS.find((question) => question.id === section.id);
    if (!expected || seen.has(section.id)) return false;
    seen.add(section.id);
    return (
      section.questionId === expected.questionId &&
      section.questionVersion === 1 &&
      section.question === expected.question &&
      typeof section.answer === "string" &&
      section.answer.trim().length >= 5 &&
      section.answer.length <= 240
    );
  });
}

export function storyFromAnswers(answers: Partial<Record<StorySectionId, string>>): ProfileStoryV3 {
  const sections = STORY_QUESTIONS.flatMap((question) => {
    const answer = answers[question.id]?.trim() ?? "";
    return answer.length >= 5
      ? [
          {
            id: question.id,
            questionId: question.questionId,
            questionVersion: 1,
            question: question.question,
            answer: answer.slice(0, 240),
          },
        ]
      : [];
  });
  return {
    version: 3,
    headline: "",
    summary: "",
    sections,
    conversationHooks: [],
    publishedRevision: 0,
  };
}
