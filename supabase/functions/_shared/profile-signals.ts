/** Choice IDs and option order are stable: saved public consent references their indices. */
export const PROFILE_CHOICES = [
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
  {
    id: "relationship_goal",
    title: "어떤 관계를 기대하나요?",
    max: 1,
    options: [
      "좋은 사람과 진지한 연애",
      "천천히 알아가는 연애",
      "결혼도 생각하는 연애",
      "아직 알아가는 중",
    ],
  },
  {
    id: "care",
    title: "바쁜 날, 어떤 배려가 편한가요?",
    max: 2,
    options: [
      "짧게 안부 전하기",
      "이야기 들어주기",
      "혼자 쉴 시간 존중하기",
      "작은 약속 꾸준히 지키기",
    ],
  },
] as const;

export const PRIVATE_CHOICE_IDS = ["contact", "planning"] as const;
export const INTERVIEW_CHOICE_PAGES = [
  ["rhythm", "first_date"],
  ["contact", "planning"],
  ["relationship_goal", "care"],
] as const;
export const SIGNAL_LABELS: Record<string, string> = {
  rhythm: "퇴근 후",
  first_date: "첫 만남",
  closeness: "가까워지는 순간",
  topics: "대화 소재",
  relationship_goal: "원하는 관계",
  care: "편한 배려",
};
export type PublicProfileSignals = Record<string, string[]>;

/** Accept only explicit, published, known options. Never consume profile_preferences here. */
export function publicProfileSignals(value: unknown): PublicProfileSignals {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  const result: PublicProfileSignals = {};
  for (const question of PROFILE_CHOICES) {
    if (!(question.id in SIGNAL_LABELS)) continue;
    const picked = (value as Record<string, unknown>)[question.id];
    if (!Array.isArray(picked)) continue;
    const known = question.options
      .filter((option) => picked.includes(option))
      .slice(0, question.max);
    if (known.length) result[question.id] = known;
  }
  return result;
}

export function publicSignalRows(value: unknown) {
  return Object.entries(publicProfileSignals(value)).map(([id, values]) => ({
    id,
    label: SIGNAL_LABELS[id],
    values,
  }));
}
export function comparePublicSignals(self: unknown, other: unknown) {
  const a = publicProfileSignals(self),
    b = publicProfileSignals(other);
  const common: { id: string; label: string; values: string[] }[] = [];
  const differences: { id: string; label: string; self: string[]; other: string[] }[] = [];
  let compared = 0;
  for (const [id, values] of Object.entries(a)) {
    if (!b[id]?.length) continue;
    compared++;
    const same = values.filter((value) => b[id].includes(value));
    if (same.length) common.push({ id, label: SIGNAL_LABELS[id], values: same });
    else if (["first_date", "relationship_goal", "care"].includes(id))
      differences.push({ id, label: SIGNAL_LABELS[id], self: values, other: b[id] });
  }
  return { common, differences, compared };
}
