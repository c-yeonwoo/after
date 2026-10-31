import { publicProfileSignals } from "../../supabase/functions/_shared/profile-signals";
import type { Basics } from "@/components/onboarding/basics";
import type { Profile } from "@/lib/api";
import {
  CHOICE_QUESTIONS,
  storyFromAnswers,
  type ProfileStoryV3,
  type StorySectionId,
} from "@/lib/profileStory";

export type StoryStage =
  | "start"
  | "choices0"
  | "choices1"
  | "choices2"
  | "story0"
  | "story1"
  | "story2"
  | "analyzing"
  | "followups"
  | "understanding"
  | "review"
  | "preview"
  | "error";

export type ProfileInterviewV3Data = {
  version: 3;
  stage: StoryStage;
  mode: "interview" | "manual";
  basics: Basics;
  answers: Record<StorySectionId, string>;
  choices: Record<string, string[]>;
  choiceCustom: Record<string, string>;
  followups: Record<string, string>;
  followupIds: string[];
  publicIds: string[];
  understanding: { text: string; sourceIds: string[] }[];
  contradictions: string[];
  understandingConfirmed: boolean;
  story: ProfileStoryV3 | null;
  generatedStory: ProfileStoryV3 | null;
  generatedRunId?: number;
  sourceRevision: number;
  storySourceRevision: number;
  generationError?: string;
};

export const FOLLOWUP_LABELS: Record<string, string> = {
  walk: "걷는 시간은 어떤 점이 좋아요?",
  series: "최근 기억에 남은 영화나 드라마가 있나요?",
  conversation: "어떤 이야기가 나오면 편해지나요?",
  food: "요즘 자주 먹는 저녁 메뉴가 있나요?",
  music: "요즘 자주 듣는 음악이 있나요?",
  weekend: "쉬는 날 가장 편한 시간은 언제인가요?",
};

export function newProfileInterviewV3(
  member: Profile | null,
  basics: Basics,
): ProfileInterviewV3Data {
  const answers = {
    daily_life: member?.evening_note ?? "",
    getting_closer: member?.known_as ?? "",
    conversation: member?.topic_note ?? "",
  };
  const preferences = member?.profile_preferences as
    | { choices?: Record<string, unknown>; choiceCustom?: Record<string, unknown> }
    | null
    | undefined;
  const choices = Object.fromEntries(
    CHOICE_QUESTIONS.map((question) => {
      const old = preferences?.choices?.[question.id];
      return [
        question.id,
        Array.isArray(old)
          ? question.options.filter((option) => old.includes(option)).slice(0, question.max)
          : [],
      ];
    }),
  );
  const choiceCustom = Object.fromEntries(
    CHOICE_QUESTIONS.flatMap((question) => {
      const old = preferences?.choiceCustom?.[question.id];
      return typeof old === "string" && old.length <= 100 ? [[question.id, old]] : [];
    }),
  );
  const approved = publicProfileSignals(member?.profile_public_signals);
  const publicChoices = CHOICE_QUESTIONS.flatMap((question) =>
    (approved[question.id] ?? []).map(
      (option) =>
        `choice:${question.id}:${(question.options as readonly string[]).indexOf(option)}`,
    ),
  );
  const existing = member?.profile_story;
  const story = isStory(existing) ? existing : null;
  return {
    version: 3,
    stage: story ? "preview" : "start",
    mode: "interview",
    basics,
    answers,
    choices,
    choiceCustom,
    followups: {},
    followupIds: [],
    publicIds: [
      "answer:daily_life",
      "answer:getting_closer",
      "answer:conversation",
      ...publicChoices,
    ],
    understanding: [],
    contradictions: [],
    understandingConfirmed: false,
    story,
    generatedStory: null,
    sourceRevision: 0,
    storySourceRevision: 0,
  };
}

function isStory(value: unknown): value is ProfileStoryV3 {
  return !!value && typeof value === "object" && (value as { version?: number }).version === 3;
}

export function isProfileInterviewV3Data(value: unknown): value is ProfileInterviewV3Data {
  if (!value || typeof value !== "object") return false;
  const data = value as Partial<ProfileInterviewV3Data>;
  return (
    data.version === 3 &&
    typeof data.stage === "string" &&
    !!data.basics &&
    typeof data.basics === "object" &&
    !!data.answers &&
    typeof data.answers === "object" &&
    !!data.choices &&
    typeof data.choices === "object" &&
    !!data.choiceCustom &&
    typeof data.choiceCustom === "object" &&
    Array.isArray(data.publicIds) &&
    Array.isArray(data.followupIds) &&
    typeof data.sourceRevision === "number" &&
    typeof data.storySourceRevision === "number"
  );
}

/** Upgrade a member's unpublished v2 work without rewriting anything already public. */
export function migrateInterviewV2(
  raw: unknown,
  member: Profile | null,
  basics: Basics,
): ProfileInterviewV3Data {
  if (isProfileInterviewV3Data(raw)) return { ...raw, basics: { ...basics, ...raw.basics } };
  const old = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
  const profile =
    old.profile && typeof old.profile === "object" ? (old.profile as Record<string, unknown>) : {};
  const fresh = newProfileInterviewV3(member, basics);
  const answers = {
    daily_life:
      typeof profile.eveningNote === "string" ? profile.eveningNote : fresh.answers.daily_life,
    getting_closer:
      typeof profile.knownAs === "string" ? profile.knownAs : fresh.answers.getting_closer,
    conversation:
      typeof profile.topicNote === "string" ? profile.topicNote : fresh.answers.conversation,
  };
  const legacyIntro = typeof old.intro === "string" ? old.intro.trim() : "";
  const legacyHeadline = typeof profile.headline === "string" ? profile.headline.trim() : "";
  const migrated =
    legacyIntro.length >= 5 && legacyHeadline.length >= 3 && !fresh.story
      ? storyFromAnswers({ daily_life: legacyIntro.slice(0, 240) })
      : null;
  if (migrated) {
    migrated.headline = legacyHeadline.slice(0, 35);
    migrated.summary = legacyIntro.slice(0, 300);
  }
  return {
    ...fresh,
    stage: "start",
    basics:
      old.basics && typeof old.basics === "object"
        ? { ...basics, ...(old.basics as Partial<Basics>) }
        : basics,
    answers,
    story: fresh.story ?? migrated,
    mode: old.mode === "manual" ? "manual" : "interview",
  };
}

export function sourceIdsFor(data: ProfileInterviewV3Data): string[] {
  const ids: string[] = [];
  for (const [id, text] of Object.entries(data.answers)) if (text.trim()) ids.push(`answer:${id}`);
  for (const question of CHOICE_QUESTIONS) {
    for (const option of data.choices[question.id] ?? []) {
      const index = question.options.findIndex((candidate) => candidate === option);
      if (index >= 0) ids.push(`choice:${question.id}:${index}`);
    }
    if (data.choiceCustom[question.id]?.trim()) ids.push(`choice:${question.id}:custom`);
  }
  for (const [id, text] of Object.entries(data.followups))
    if (text.trim()) ids.push(`followup:${id}`);
  return ids;
}

export function hasStoryMaterial(data: ProfileInterviewV3Data): boolean {
  return (
    data.answers.daily_life.trim().length >= 5 ||
    data.answers.getting_closer.trim().length >= 5 ||
    data.answers.conversation.trim().length >= 5 ||
    Object.entries(data.choices).some(
      ([id, options]) => !["contact", "planning"].includes(id) && options.length > 0,
    ) ||
    Object.entries(data.choiceCustom).some(
      ([id, text]) => !["contact", "planning"].includes(id) && text.trim().length >= 5,
    )
  );
}
