import type { Basics } from "@/components/onboarding/basics";
import type { Profile } from "@/lib/api";
import { newProfileInterviewV3 } from "@/lib/profileInterviewV3";
import {
  STORY_QUESTIONS,
  storyFromAnswers,
  validProfileStory,
  type ProfileStoryV3,
} from "@/lib/profileStory";

export function editableBasics(member: Profile): Basics {
  return {
    name: member.name ?? "",
    birth: member.birth ?? "",
    job: member.job ?? "",
    photos: member.photo_paths ?? (member.photo_url ? [member.photo_url] : []),
    mbti: member.mbti ?? "",
    smoking: member.smoking ?? "",
    drinking: member.drinking ?? "",
    religion: member.religion ?? "",
  };
}

export function editableStory(member: Profile): ProfileStoryV3 {
  if (validProfileStory(member.profile_story)) return structuredClone(member.profile_story);
  const story = storyFromAnswers({ daily_life: (member.intro ?? "").slice(0, 240) });
  return {
    ...story,
    headline: (member.headline ?? "").slice(0, 35),
    summary: (member.intro ?? "").slice(0, 300),
  };
}

/** Start from the published profile, never an abandoned signup/edit draft. */
export function profileEditDraft(member: Profile, basics: Basics, story: ProfileStoryV3) {
  const draft = newProfileInterviewV3(member, basics);
  const preferences = member.profile_preferences as {
    choices?: Record<string, string[]>;
    choiceCustom?: Record<string, string>;
  } | null;
  return {
    ...draft,
    stage: "preview" as const,
    mode: "manual" as const,
    story,
    answers: Object.fromEntries(
      STORY_QUESTIONS.map((question) => [
        question.id,
        story.sections.find((section) => section.id === question.id)?.answer ?? "",
      ]),
    ) as typeof draft.answers,
    publicIds: story.sections.map((section) => `answer:${section.id}`),
    sourceRevision: 0,
    storySourceRevision: 0,
    choices: preferences?.choices ?? draft.choices,
    choiceCustom: preferences?.choiceCustom ?? draft.choiceCustom,
  };
}

export function profileStoryIssues(story: ProfileStoryV3): string[] {
  const issues: string[] = [];
  if (story.headline.trim().length < 3) issues.push("한 줄 소개 3자 이상");
  if (story.summary.trim().length < 5) issues.push("짧은 소개 5자 이상");
  for (const section of story.sections) {
    if (section.answer.trim().length < 5)
      issues.push(
        `${STORY_QUESTIONS.find((q) => q.id === section.id)?.question ?? "답변"} 5자 이상`,
      );
  }
  if (!story.sections.length) issues.push("공개 답변 1개 이상");
  if (!issues.length && !validProfileStory(story)) issues.push("연락처·링크가 없는 소개글");
  return issues;
}
