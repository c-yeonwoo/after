/**
 * 적응형 프로필 작성 — 선택한 관심사에 따라 후속 질문이 달라집니다.
 * (Step 3에서 실제 AI 생성으로 교체 예정. 지금은 규칙 기반 초안.)
 */

export type Interest = {
  id: string;
  label: string;
  /** 이 관심사를 고른 사람에게만 나오는 후속 질문 */
  followUp: string;
  placeholder: string;
};

export const INTEREST_GROUPS: { id: string; title: string; items: Interest[] }[] = [
  {
    id: "move",
    title: "몸 쓰는 일",
    items: [
      {
        id: "running",
        label: "러닝",
        followUp: "요즘 주로 어디서, 어떤 속도로 뛰세요?",
        placeholder: "예: 퇴근하고 양재천 5km, 기록보다 그날 컨디션대로.",
      },
      {
        id: "gym",
        label: "웨이트·필라테스",
        followUp: "운동은 하루 중 언제 넣는 편이에요?",
        placeholder: "예: 출근 전 7시. 안 하면 하루가 안 풀려요.",
      },
      {
        id: "hiking",
        label: "등산·산책",
        followUp: "최근에 좋았던 코스 하나만 알려주세요.",
        placeholder: "예: 인왕산 저녁 코스. 해 질 때 서울이 다 보여요.",
      },
      {
        id: "tennis",
        label: "테니스·클라이밍",
        followUp: "얼마나 오래 하셨고, 지금 재미있는 지점은 어디예요?",
        placeholder: "예: 2년째. 이제야 랠리가 길어져서 재밌어요.",
      },
    ],
  },
  {
    id: "taste",
    title: "먹고 마시는 취향",
    items: [
      {
        id: "food",
        label: "맛집 탐험",
        followUp: "누가 물으면 꼭 데려가는 집이 있나요?",
        placeholder: "예: 역삼 골목 노포 백반집. 반찬이 매일 바뀌어요.",
      },
      {
        id: "coffee",
        label: "커피",
        followUp: "커피는 어떤 식으로 즐기세요?",
        placeholder: "예: 산미 있는 원두로 핸드드립. 주말 아침 루틴이에요.",
      },
      {
        id: "wine",
        label: "와인·위스키",
        followUp: "요즘 마음에 든 한 병이 있다면?",
        placeholder: "예: 가벼운 피노누아. 취하려고 마시진 않아요.",
      },
      {
        id: "cook",
        label: "요리",
        followUp: "제일 자신 있는 메뉴는 뭐예요?",
        placeholder: "예: 파스타. 재료 세 개 넘어가면 귀찮아합니다.",
      },
    ],
  },
  {
    id: "quiet",
    title: "혼자 채우는 시간",
    items: [
      {
        id: "book",
        label: "책",
        followUp: "최근에 읽고 오래 남은 책은요?",
        placeholder: "예: 에세이보다 인터뷰집을 좋아해요.",
      },
      {
        id: "movie",
        label: "영화·시리즈",
        followUp: "취향을 한 편으로 요약하면?",
        placeholder: "예: 사건보다 사람 얼굴 오래 보여주는 영화.",
      },
      {
        id: "music",
        label: "음악·공연",
        followUp: "요즘 반복해서 듣는 것은?",
        placeholder: "예: 재즈 라이브. 한 달에 한 번은 공연 보러 가요.",
      },
      {
        id: "game",
        label: "게임",
        followUp: "어떤 걸 붙잡고 계세요?",
        placeholder: "예: 짧게 끊어 하는 인디 게임 위주.",
      },
    ],
  },
  {
    id: "life",
    title: "그 밖의 결",
    items: [
      {
        id: "travel",
        label: "여행",
        followUp: "여행은 계획형이에요, 즉흥형이에요?",
        placeholder: "예: 숙소만 잡고 나머지는 그날 정해요.",
      },
      {
        id: "pet",
        label: "반려동물",
        followUp: "같이 사는 친구를 소개해 주세요.",
        placeholder: "예: 다섯 살 고양이. 사람보다 낯을 안 가려요.",
      },
      {
        id: "side",
        label: "사이드 프로젝트",
        followUp: "지금 만들고 있는 것은?",
        placeholder: "예: 주말마다 작은 웹서비스 하나씩.",
      },
      {
        id: "art",
        label: "전시·사진",
        followUp: "최근에 다녀와서 좋았던 곳은?",
        placeholder: "예: 소규모 사진전. 사람 적은 평일 저녁에 가요.",
      },
    ],
  },
];

export const ALL_INTERESTS: Interest[] = INTEREST_GROUPS.flatMap((g) => g.items);

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
  const labels = p.interests
    .map((id) => ALL_INTERESTS.find((i) => i.id === id)?.label)
    .filter(Boolean) as string[];

  const details = p.interests
    .map((id) => p.details[id]?.trim())
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
