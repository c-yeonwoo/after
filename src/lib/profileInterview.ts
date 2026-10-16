import { emptyProfile, type ProfileDraft } from "../components/onboarding/profile";
import type { Basics } from "../components/onboarding/basics";

export type InterviewBasics = Pick<Basics, "name" | "birth" | "job" | "photos">;

export const CORE_QUESTIONS = [
  {
    key: "eveningNote",
    title: "요즘 퇴근 후나 쉬는 날, 어떻게 시간을 보내세요?",
    alternative: "최근에 쉬면서 좋았던 순간이 있었나요?",
    hint: "특별한 취미가 없어도 괜찮아요.",
    examples: ["집에서 밥 먹고 드라마 봐요.", "시간이 나면 동네를 걸어요."],
  },
  {
    key: "knownAs",
    title: "처음 만난 사람과는 어떻게 가까워지는 편인가요?",
    alternative: "첫 만남은 어떤 분위기면 편할까요?",
    hint: "말이 많아도, 천천히 친해져도 괜찮아요.",
    examples: ["처음에는 듣다가 익숙해지면 말이 많아져요.", "같이 걸으며 얘기하면 편해요."],
  },
  {
    key: "topicNote",
    title: "처음 만나면 어떤 이야기를 나눠보고 싶어요?",
    alternative: "요즘 자주 보거나 듣거나 찾아보는 게 있나요?",
    hint: "앞에서 적은 이야기로 해도 괜찮아요.",
    examples: ["요즘 보는 드라마요.", "서로 주말을 어떻게 보내는지요."],
  },
] as const;

export type CoreKey = (typeof CORE_QUESTIONS)[number]["key"];
export const FOLLOWUP_QUESTIONS = {
  walk: "산책할 때 어떤 점이 좋아요?",
  series: "최근에 기억에 남은 영화나 드라마가 있나요?",
  conversation: "어떤 이야기가 나오면 조금 편해져요?",
  food: "요즘 자주 먹는 저녁 메뉴가 있나요?",
  music: "요즘 자주 듣는 음악이 있나요?",
  weekend: "쉬는 날 가장 편한 시간은 언제인가요?",
} as const;
export type FollowupId = keyof typeof FOLLOWUP_QUESTIONS;

export type InterviewStage =
  "start" | "core0" | "core1" | "core2" | "deepen" | "review" | "preview";

export type ProfileInterviewData = {
  version: 2;
  stage: InterviewStage;
  profile: ProfileDraft;
  intro: string;
  skipped: CoreKey[];
  alternatives: CoreKey[];
  followupIds: FollowupId[];
  followupAnswers: Partial<Record<FollowupId, string>>;
  followupIndex: number;
  analyzed: boolean;
  suggestedTopics: string[];
  included: string[];
  mode: "interview" | "manual";
  basics?: InterviewBasics;
  /** Only the member can read this unpublished candidate. */
  generatedIntro?: string;
  generatedHeadlines?: string[];
  generatedRunId?: number;
  evidence?: { sourceField: string; quote: string }[];
};

export function newProfileInterview(existing?: {
  headline?: string | null;
  intro?: string | null;
  evening_note?: string | null;
  known_as?: string | null;
  interests?: string[] | null;
  details?: unknown;
  match_tags?: string[] | null;
  match_note?: string | null;
  topics?: string[] | null;
  topic_note?: string | null;
}): ProfileInterviewData {
  return {
    version: 2,
    stage: "start",
    profile: {
      ...emptyProfile,
      headline: existing?.headline ?? "",
      eveningNote: existing?.evening_note ?? "",
      knownAs: existing?.known_as ?? "",
      interests: existing?.interests ?? [],
      details: (existing?.details as Record<string, string>) ?? {},
      matchTags: existing?.match_tags ?? [],
      matchNote: existing?.match_note ?? "",
      topics: existing?.topics ?? [],
      topicNote: existing?.topic_note ?? "",
    },
    intro: existing?.intro ?? "",
    skipped: [],
    alternatives: [],
    followupIds: [],
    followupAnswers: {},
    followupIndex: 0,
    analyzed: false,
    suggestedTopics: [],
    included: [
      ...(existing?.evening_note ? ["eveningNote"] : []),
      ...(existing?.known_as ? ["knownAs"] : []),
      ...(existing?.topic_note ? ["topicNote"] : []),
      ...(existing?.match_note ? ["matchNote"] : []),
    ],
    mode: "interview",
  };
}

export function isProfileInterviewData(value: unknown): value is ProfileInterviewData {
  if (!value || typeof value !== "object") return false;
  const data = value as Partial<ProfileInterviewData>;
  return (
    data.version === 2 &&
    ["start", "core0", "core1", "core2", "deepen", "review", "preview"].includes(
      data.stage ?? "",
    ) &&
    !!data.profile &&
    typeof data.profile === "object" &&
    typeof data.intro === "string" &&
    Array.isArray(data.included) &&
    Array.isArray(data.skipped) &&
    Array.isArray(data.alternatives) &&
    Array.isArray(data.followupIds) &&
    !!data.followupAnswers &&
    typeof data.followupAnswers === "object" &&
    typeof data.followupIndex === "number" &&
    typeof data.analyzed === "boolean" &&
    (data.basics === undefined || isInterviewBasics(data.basics))
  );
}

export function isInterviewBasics(value: unknown): value is InterviewBasics {
  if (!value || typeof value !== "object") return false;
  const basics = value as Partial<InterviewBasics>;
  return (
    typeof basics.name === "string" &&
    typeof basics.birth === "string" &&
    typeof basics.job === "string" &&
    Array.isArray(basics.photos) &&
    basics.photos.every((path) => typeof path === "string")
  );
}

export function includedAnswers(data: ProfileInterviewData): { id: string; text: string }[] {
  const core = CORE_QUESTIONS.map(({ key }) => ({ id: key, text: data.profile[key].trim() }));
  const followups = data.followupIds.map((id) => ({
    id: `followup:${id}`,
    text: (data.followupAnswers[id] ?? "").trim(),
  }));
  return [...core, ...followups].filter(
    (answer) => answer.text && data.included.includes(answer.id),
  );
}

export function ownWordsDraft(data: ProfileInterviewData): { headline: string; intro: string } {
  const answers = includedAnswers(data).map(({ text }) =>
    /[.!?。]$/.test(text) ? text : `${text}.`,
  );
  const intro = answers.join(" ").slice(0, 300);
  const first = includedAnswers(data)[0]?.text ?? "";
  const headline = first
    .split(/[.!?。\n]/)[0]
    .trim()
    .slice(0, 35);
  return { headline, intro };
}

/** Contact details belong in the supported meeting flow, not a public card. */
export function hasContactDetail(value: string): boolean {
  return (
    /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i.test(value) ||
    /(?:\+?82[- .]?)?0?1[016789][-. ]?\d{3,4}[-. ]?\d{4}/.test(value) ||
    /https?:\/\/\S+/i.test(value)
  );
}
