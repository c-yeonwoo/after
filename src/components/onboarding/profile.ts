/**
 * 소개장 인터뷰 (2026-10-10 리부팅 C).
 *
 * 예전 가입은 관심사 칩·대화 주제 칩·잘 맞는 사람 칩을 고르게 하고, 그 칩으로
 * 소개글을 만들었다. 소개장(D3)은 "문장이 주인공"인데 본인 문장이 거의 들어가지
 * 않았다. 이제 질문 네 개에 한두 문장씩 답을 받고, 그 문장을 뼈대로 소개장을 쓴다.
 * 칩은 답 아래로 들어가 선택 보조가 된다 — 티저의 "같이 적은 것"(s50)과 운영자
 * 화면이 칩 값을 그대로 쓰기 때문에 없애지 않는다.
 */

export type InterviewKey = "eveningNote" | "knownAs" | "topicNote" | "matchNote";

export type InterviewQuestion = {
  key: InterviewKey;
  title: string;
  description: string;
  placeholder: string;
  examples: string[];
  /** 최소 글자 수. 0 이면 선택 답변이다. */
  min: number;
};

export const INTERVIEW_MAX = 300;

export const INTERVIEW: InterviewQuestion[] = [
  {
    key: "eveningNote",
    title: "퇴근하고 요즘 가장 기다려지는 시간은요?",
    description: "한두 문장이면 충분해요. 소개장의 첫 문단이 돼요.",
    placeholder: "예) 수요일 저녁엔 한강까지 뛰어요. 돌아오는 길에 듣는 음악이 좋아요.",
    examples: [
      "금요일 퇴근길에 동네 서점에 들러 한 권 고르는 시간이요.",
      "요즘은 저녁마다 30분씩 베이킹을 해요. 주말 아침에 먹을 빵이에요.",
    ],
    min: 10,
  },
  {
    key: "knownAs",
    title: "주변에서는 나를 어떤 사람이라고 해요?",
    description: "친구나 동료가 나를 소개할 때 하는 말을 떠올려 보세요.",
    placeholder: "예) 친구들은 제가 약속 장소를 제일 잘 고른대요.",
    examples: [
      "말수는 적은데 한번 웃기면 오래 웃긴다는 말을 들어요.",
      "회사에서는 뭐든 끝까지 챙기는 사람으로 통해요.",
    ],
    min: 10,
  },
  {
    key: "topicNote",
    title: "처음 만나는 자리에서 나누고 싶은 이야기는요?",
    description: "상대가 소개장을 읽고 먼저 꺼낼 수 있는 이야기면 좋아요.",
    placeholder: "예) 최근에 다녀온 여행이나, 요즘 읽는 책 이야기요.",
    examples: [
      "서로 자주 가는 동네 맛집을 하나씩 알려 주면 좋겠어요.",
      "요즘 보고 있는 드라마 이야기를 하고 싶어요.",
    ],
    min: 10,
  },
  {
    key: "matchNote",
    title: "어떤 사람과 함께 있을 때 편한가요?",
    description: "조건이 아니라 같이 있을 때의 느낌을 적어 주세요.",
    placeholder: "예) 말이 빠르지 않고, 제 이야기를 끝까지 들어 주는 사람이요.",
    examples: [
      "계획 없이 걷다가 마음에 드는 가게에 들어가는 걸 좋아하는 사람이요.",
      "농담을 주고받을 수 있는 사람이면 금방 편해져요.",
    ],
    min: 0,
  },
];

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
  eveningNote: string;
  knownAs: string;
  interests: string[];
  details: Record<string, string>;
  matchTags: string[];
  matchNote: string;
  topics: string[];
  topicNote: string;
};

export const emptyProfile: ProfileDraft = {
  headline: "",
  eveningNote: "",
  knownAs: "",
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

/** 문장 끝에 마침표가 없으면 붙인다. 문단으로 이어 붙일 때 문장이 뭉개지지 않게. */
function sentence(text: string) {
  const t = text.trim();
  if (!t) return "";
  return /[.?!]$/.test(t) ? t : `${t}.`;
}

/**
 * 규칙 기반 소개글 — 모델 호출이 실패해도 화면이 비지 않게 하는 초안이다.
 *
 * 인터뷰 답이 있으면 **본인 문장을 그대로** 문단으로 잇는다. 고쳐 쓰지 않는다 —
 * 규칙으로 다듬은 문장은 어색하고, 어색한 남의 말보다 투박한 내 말이 낫다.
 * 답이 없는 예전 회원(인터뷰 전 가입)은 키워드·칩으로 만든 예전 초안을 쓴다.
 */
export function buildIntro(p: ProfileDraft) {
  const own = [p.eveningNote, p.knownAs, p.topicNote, p.matchNote].map(sentence).filter(Boolean);
  if (own.length) return own.join("\n\n");

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
