/**
 * 적응형 프로필 작성 — 직접 적은 관심사에 따라 후속 질문이 달라집니다.
 * (Step 3에서 실제 AI 생성으로 교체 예정. 지금은 규칙 기반 초안.)
 */

/** 자유롭게 적은 관심사에 대한 후속 질문 */
export function followUpFor(label: string) {
  return `${label}, 어떤 식으로 즐기고 계세요?`;
}

/** 입력을 막지 않는 가벼운 예시 (플레이스홀더 용도) */
export const INTEREST_PLACEHOLDERS = [
  "예: 퇴근 후 러닝",
  "예: 오래된 영화 보기",
  "예: 주말 아침 핸드드립",
  "예: 동네 산책",
  "예: 사이드 프로젝트",
];

/** 이상형·잘 맞는 사람 태그 */
export const MATCH_TAGS = [
  "말이 느긋한 사람",
  "자기 일에 꾸준한 사람",
  "유머 코드가 맞는 사람",
  "질문을 잘하는 사람",
  "약속을 잘 지키는 사람",
  "혼자 있는 시간도 필요한 사람",
  "새로운 걸 잘 시도하는 사람",
  "감정 표현이 솔직한 사람",
];

/** 이번 만남에서 이야기하고 싶은 주제 */
export const TOPIC_TAGS = [
  "요즘 빠져 있는 것",
  "일 이야기",
  "인생 최고의 여행",
  "최근에 바꾼 생각",
  "돈 쓰는 기준",
  "가족과의 거리",
  "10년 뒤 살고 싶은 곳",
  "실패한 도전",
  "취향 자랑",
  "쓸데없이 진지한 토론",
];

export type ProfileDraft = {
  headline: string;
  interests: string[];
  details: Record<string, string>;
  matchTags: string[];
  matchNote: string;
  topics: string[];
  topicNote: string;
};

export const emptyProfile: ProfileDraft = {
  headline: "",
  interests: [],
  details: {},
  matchTags: [],
  matchNote: "",
  topics: [],
  topicNote: "",
};

export function buildIntro(p: ProfileDraft) {
  const labels = p.interests.map((v) => v.trim()).filter(Boolean);

  const details = p.interests
    .map((label) => p.details[label]?.trim())
    .filter((v): v is string => Boolean(v));

  const lines: string[] = [];
  if (p.headline.trim()) lines.push(p.headline.trim());
  if (labels.length) lines.push(`요즘은 ${labels.join(", ")}에 시간을 씁니다.`);
  if (details.length) lines.push(details.slice(0, 3).join(" "));
  if (p.matchTags.length || p.matchNote.trim()) {
    lines.push(
      `${p.matchTags.join(", ")}${p.matchTags.length && p.matchNote.trim() ? ". " : ""}${p.matchNote.trim()}${
        p.matchTags.length && !p.matchNote.trim() ? "과(와) 잘 맞았습니다." : ""
      }`,
    );
  }
  return lines.join("\n\n");
}
