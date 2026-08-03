/**
 * 적응형 프로필 작성 — 직접 적은 관심사에 따라 후속 질문이 달라집니다.
 * (Step 3에서 실제 AI 생성으로 교체 예정. 지금은 규칙 기반 초안.)
 */

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

/**
 * 전체 답변을 바탕으로 한 줄 소개 후보를 제안합니다.
 * (지금은 규칙 기반 초안 — 이후 AI 생성으로 교체)
 */
export function suggestHeadlines(p: ProfileDraft, job?: string): string[] {
  const labels = p.interests.map((v) => v.trim()).filter(Boolean);
  const first = labels[0];
  const second = labels[1];
  const match = p.matchTags[0];
  const topic = p.topics[0];
  const role = job?.trim();

  const out = [
    first && second
      ? `${first}과 ${second} 사이에서 평일 저녁을 채우는 사람.`
      : first
        ? `${first}에 시간을 쓰는 걸 아까워하지 않는 사람.`
        : "평일 저녁을 잘 쓰는 사람이 되고 싶어요.",
    role && first
      ? `낮에는 ${role}, 저녁에는 ${first}에 진심입니다.`
      : first
        ? `일이 끝나면 ${first}으로 하루를 마무리합니다.`
        : "하루의 끝을 조용히 정리하는 걸 좋아합니다.",
    match
      ? `${match}과 오래 이야기하는 저녁을 좋아합니다.`
      : topic
        ? `${topic}에 대해 오래 이야기할 수 있는 사람.`
        : "말이 잘 통하는 저녁 한 번이면 충분합니다.",
  ];

  return Array.from(new Set(out.filter(Boolean))).slice(0, 3);
}

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

/**
 * 씨앗(키워드) → 가지(후속 질문).
 * 적은 키워드의 결에 맞춰 질문 하나만 되묻습니다. (이후 AI 생성으로 교체)
 */
const FOLLOW_UP_RULES: { match: RegExp; q: (label: string) => string }[] = [
  {
    match: /러닝|달리기|헬스|운동|클라이밍|요가|수영|자전거|테니스|골프|필라테스/,
    q: (l) => `${l}, 얼마나 자주 하세요?`,
  },
  {
    match: /영화|드라마|시리즈|넷플|극장|책|독서|소설|에세이/,
    q: (l) => `요즘 본 ${l} 중 하나만 꼽자면?`,
  },
  { match: /음악|기타|피아노|밴드|공연|페스티벌|노래/, q: (l) => `요즘 자주 듣는 ${l}은?` },
  { match: /커피|핸드드립|카페|차|와인|위스키|맥주|술/, q: (l) => `${l}, 어떤 걸 좋아하세요?` },
  { match: /요리|베이킹|맛집|음식|빵/, q: (l) => `${l}, 요즘 꽂힌 건?` },
  { match: /여행|캠핑|등산|산책|드라이브|바다/, q: (l) => `${l}, 최근에 간 곳은?` },
];

export function followUpFor(label: string): string {
  const clean = label.trim();
  if (!clean) return "";
  const hit = FOLLOW_UP_RULES.find((r) => r.match.test(clean));
  return hit ? hit.q(clean) : `${clean}, 한 줄로 덧붙인다면?`;
}
