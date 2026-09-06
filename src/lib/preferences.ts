/**
 * 취향 문답.
 *
 * ── 왜 양자택일인가 ──
 * 자유 서술은 읽는 사람이 해석해야 하고, 척도(1~5)는 가운데로 몰린다. 둘 중
 * 하나를 고르게 하면 답이 곧 값이 되고, 두 사람의 답을 그대로 맞춰 볼 수 있다.
 *
 * ── 우열이 없어야 한다 ──
 * "약속을 잘 지키는 사람" 같은 덕목을 물으면 정답이 생기고, 정답이 있는 질문은
 * 모두가 같은 답을 고른다. 모두가 같은 답을 고르는 질문은 정보를 만들지 않는다.
 * 아래 문항은 어느 쪽에도 우열이 없다 — 그래서 실제로 사람이 갈린다.
 *
 * ── 번호는 영영 바뀌지 않는다 ──
 * DB(preference_answers)에는 **번호만** 쌓인다. 문구는 여기서 다듬어도 되지만
 * `id` 를 바꾸거나 재사용하면 **옛 답이 새 질문의 답으로 둔갑한다.**
 * 문항을 내릴 때는 `retired: true` 로 표시하고 번호는 비워 둔 채 남긴다.
 *
 * `options` 의 순서가 DB 의 choice 값이다 — 0번이 왼쪽, 1번이 오른쪽.
 * 순서를 바꾸면 쌓인 답의 의미가 뒤집힌다. 바꾸지 말 것.
 */
export type PreferenceQuestion = {
  id: number;
  prompt: string;
  options: readonly [string, string];
  /** 내린 문항. 번호는 남겨 두고 화면에는 안 나온다. */
  retired?: boolean;
};

export const PREFERENCE_QUESTIONS: readonly PreferenceQuestion[] = [
  { id: 1, prompt: "주말 아침에 눈이 일찍 떠지면", options: ["바로 나간다", "더 눕는다"] },
  {
    id: 2,
    prompt: "처음 가는 식당을 고를 때",
    options: ["검색해서 고른다", "걷다가 들어간다"],
  },
  {
    id: 3,
    prompt: "약속 시간이 비면",
    options: ["미리 도착해 기다린다", "딱 맞춰 간다"],
  },
  { id: 4, prompt: "연락은", options: ["자주 짧게", "가끔 길게"] },
  { id: 5, prompt: "쉬는 날이 하루 생기면", options: ["사람을 만난다", "혼자 보낸다"] },
  { id: 6, prompt: "대화가 잠깐 끊기면", options: ["말을 꺼낸다", "그대로 둔다"] },
  { id: 7, prompt: "여행지에서", options: ["계획대로 움직인다", "그날 정한다"] },
  {
    id: 8,
    prompt: "새로 배우는 것은",
    options: ["한 가지를 오래", "여러 가지를 조금씩"],
  },
  { id: 9, prompt: "집에 있을 때 소리는", options: ["음악이나 영상", "조용한 편"] },
] as const;

export const ACTIVE_QUESTIONS = PREFERENCE_QUESTIONS.filter((q) => !q.retired);

/** 번호로 문항을 찾는다. 내린 문항도 찾힌다 — 큐레이션 화면이 옛 답을 그려야 한다. */
export function questionById(id: number): PreferenceQuestion | undefined {
  return PREFERENCE_QUESTIONS.find((q) => q.id === id);
}

/**
 * 아직 답하지 않은 문항 중 앞의 몇 개.
 *
 * 한 번에 세 개만 보여준다. 아홉 개를 한 화면에 늘어놓으면 설문이 되고, 설문은
 * 시작하기 전에 닫힌다. 세 개는 "지금 해치울 수 있다" 로 읽히는 분량이다.
 */
export const DAILY_QUESTION_COUNT = 3;

export function nextQuestions(
  answered: ReadonlyMap<number, number>,
  count = DAILY_QUESTION_COUNT,
): PreferenceQuestion[] {
  return ACTIVE_QUESTIONS.filter((q) => !answered.has(q.id)).slice(0, count);
}
