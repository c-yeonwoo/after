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

/**
 * 잘 맞았던 사람 태그.
 *
 * ── 덕목을 물으면 정답이 생긴다 ──
 * 예전 목록은 "약속을 잘 지키는 사람" · "감정 표현이 솔직한 사람" 처럼 **덕목**
 * 이었다. 마다할 이유가 없는 항목이라 선택이 그쪽으로 몰리고, 그러면 이 값으로
 * 두 사람을 구분할 수 없다. 모두가 같은 답을 고르는 질문은 정보를 만들지 않는다.
 *
 * 그래서 **성향을 마주 보게** 놓는다. 짝을 이루는 두 항목 중 어느 쪽에도 우열이
 * 없으므로, 고르는 순간 취향이 실제로 드러난다. 둘 다 고르는 것도 막지 않는다 —
 * "어느 쪽이든 괜찮다" 역시 의미 있는 답이다.
 *
 * 순서도 짝끼리 붙여 둔다. 목록을 훑는 사람이 대비를 먼저 읽어야 고르기 쉽다.
 */
export const MATCH_TAGS = [
  "말수가 적은 편인 사람",
  "말이 많고 활발한 사람",
  "계획을 세워 두는 사람",
  "그때그때 정하는 사람",
  "집에서 쉬는 걸 좋아하는 사람",
  "밖으로 나가는 걸 좋아하는 사람",
  "관심사가 뚜렷한 사람",
  "새로운 걸 잘 시도하는 사람",
  "유머 코드가 잘 맞는 사람",
  "조용히 들어 주는 사람",
];

/**
 * 이번 만남에서 이야기하고 싶은 주제.
 *
 * ── 처음 만나는 자리에서 꺼낼 수 있는 것만 ──
 * 예전 목록에는 "돈 쓰는 기준" · "가족과의 거리" · "실패한 도전" ·
 * "쓸데없이 진지한 토론" 이 있었다. 초면에 이걸 하고 싶다고 누를 사람이 없다.
 * 누르지 않는 항목은 자리만 차지하면서 남은 항목으로 선택을 몰아 버린다.
 *
 * 취향은 주제의 **깊이**가 아니라 **어느 영역에 관심이 있는지**에서 갈린다.
 * 음악을 고른 사람과 운동을 고른 사람은 이미 충분히 다르다. 그래서 전부
 * 일상적인 영역으로 바꾸고, 대신 영역을 넓게 펼쳐 둔다.
 */
export const TOPIC_TAGS = [
  "요즘 빠져 있는 것",
  "최근에 본 영화나 드라마",
  "좋아하는 음악",
  "먹는 것 이야기",
  "자주 가는 동네와 가게",
  "여행 다녀온 이야기",
  "주말 보내는 방식",
  "운동과 몸 쓰는 일",
  "일 이야기",
  "반려동물",
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

/**
 * 앞말의 받침에 따라 조사를 고른다.
 *
 * 예전에는 `과(와)` 를 문자열 그대로 붙여서, 완성된 소개글에 그 괄호가 그대로
 * 나왔다("...약속을 잘 지키는 사람과(와) 잘 맞았습니다"). 상대에게 보이는
 * 글이므로 괄호 표기는 쓸 수 없다.
 *
 * 한글 음절은 유니코드에서 가나다순으로 촘촘히 배열되어 있고, 한 글자당 종성이
 * 28개이므로 (코드 - 0xAC00) % 28 이 0이면 받침이 없다. 한글이 아닌 글자로
 * 끝나면(영문·숫자) 판정할 근거가 없으므로 받침 없는 쪽을 쓴다.
 */
function josa(word: string, withBatchim: string, withoutBatchim: string) {
  const last = word.trim().slice(-1);
  const code = last.charCodeAt(0);
  if (code < 0xac00 || code > 0xd7a3) return `${word}${withoutBatchim}`;
  return `${word}${(code - 0xac00) % 28 === 0 ? withoutBatchim : withBatchim}`;
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

  /*
    태그와 자유 입력을 **각자 완성된 문장으로** 만든 뒤 잇는다. 예전에는 자유
    입력을 적으면 "잘 맞았습니다" 가 통째로 사라져서, 태그 목록만 마침표를 달고
    덩그러니 남았다("말수가 적은 편인 사람, 계획을 세워 두는 사람. 대화가 편한
    분이면 좋겠어요."). 두 값의 유무를 한 템플릿에서 분기하려다 생긴 일이라,
    문장을 따로 만들고 합치는 쪽으로 바꾼다.
  */
  const matchSentence = p.matchTags.length
    ? `${josa(p.matchTags.join(", "), "과", "와")} 잘 맞았습니다.`
    : "";
  const matchNote = p.matchNote.trim();
  if (matchSentence || matchNote) {
    lines.push([matchSentence, matchNote].filter(Boolean).join(" "));
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
