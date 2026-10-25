import { PROFILE_INTERVIEW_PROMPTS } from "./profileInterviewPrompts";
import { FOLLOWUP_LABELS, type ProfileInterviewV3Data } from "./profileInterviewV3";
import { CHOICE_QUESTIONS, type StorySectionId } from "./profileStory";

const DETAIL_PROMPTS: Record<StorySectionId, string> = {
  daily_life: "그날 무엇을 하면서 시간을 보냈나요? 떠오르는 장면 하나만 더 적어도 좋아요.",
  getting_closer: "어떤 말이나 행동이 오갔나요? 실제로 편해졌던 순간 하나면 충분해요.",
  conversation: "그 이야기에서 어떤 부분을 나누고 싶나요? 기억에 남은 이유를 덧붙여도 좋아요.",
};

/** Optional writing help, never a completeness score or a condition for advancing. */
export function profileAnswerCoaching(id: StorySectionId, answer: string): string | null {
  const text = answer.trim();
  if (!text || text.replace(/\s/gu, "").length >= 36 || text.split(/\s+/u).length >= 8) return null;

  // A named topic can be something the member dislikes or has never tried.
  // Do not turn a negative or uncertain answer into an asserted preference.
  if (
    /없|싫|않|못|별로|모르|모름|아니|(?:^|\s|[은는을를도가])안(?=\s|[해하했함봐보봤봄읽먹듣걸걷만가갔좋])/u.test(
      text,
    )
  )
    return "그 답도 그대로 둘 수 있어요. 더 설명하고 싶다면 편한 방식이나 다른 관심사를 알려주세요.";

  if (id === "getting_closer") {
    if (/배려|챙|기억해/u.test(text))
      return "떠오르는 구체적인 말이나 행동이 있나요? 기억에 남았거나 바라는 모습을 들려주세요.";
    if (/말|대화|이야기/u.test(text))
      return "기억에 남았거나 듣고 싶은 말이 있나요? 어떤 반응이 편한지 들려주세요.";
    if (/함께|같이/u.test(text))
      return "같이 했거나 해보고 싶은 일이 있나요? 어떤 순간이 편한지 들려주세요.";
  }

  if (/영화|드라마|(?:^|\s)책|독서|웹툰|만화/u.test(text))
    return "이야기하고 싶은 장면이나 대목이 있나요? 있다면 관심이 간 이유를 들려주세요.";
  if (/음악|노래|공연/u.test(text))
    return "이야기하고 싶은 곡이나 공연이 있나요? 관심이 간 부분을 들려주세요.";
  if (/산책|걷|러닝|달리|운동|헬스|수영/u.test(text))
    return "해본 경험이나 해보고 싶은 장면이 있나요? 그중 어떤 점을 이야기하고 싶은지 들려주세요.";
  if (/요리|음식|맛집|먹/u.test(text))
    return "떠오르는 음식이나 해보고 싶은 요리가 있나요? 어떤 점이 궁금하거나 기억에 남는지 들려주세요.";
  if (id === "daily_life" && /집|쉬|휴식|잠/u.test(text))
    return "어떻게 쉬었을 때 특히 편했나요? 떠오르는 하루만 덧붙여도 좋아요.";
  return DETAIL_PROMPTS[id];
}

export type ProfileCoachingSource = { id: string; label: string; text: string };
type SourceInputs = Pick<
  ProfileInterviewV3Data,
  "answers" | "choices" | "choiceCustom" | "followups" | "publicIds"
>;

/** Resolve exact current input only. Generated prose is never treated as its own source. */
export function profileCoachingSources(
  data: SourceInputs,
  ids: readonly string[],
  visibility: "owner" | "public",
): ProfileCoachingSource[] {
  return [...new Set(ids)].flatMap((id) => {
    if (visibility === "public" && !data.publicIds.includes(id)) return [];
    const [kind, key, choice, extra] = id.split(":");
    let label: string | undefined;
    let text: string | undefined;

    if (
      kind === "answer" &&
      choice === undefined &&
      Object.hasOwn(PROFILE_INTERVIEW_PROMPTS, key)
    ) {
      label = PROFILE_INTERVIEW_PROMPTS[key as StorySectionId].question;
      text = data.answers[key as StorySectionId];
    } else if (kind === "followup" && choice === undefined && Object.hasOwn(FOLLOWUP_LABELS, key)) {
      label = FOLLOWUP_LABELS[key];
      text = data.followups[key];
    } else if (kind === "choice" && choice !== undefined && extra === undefined) {
      const question = CHOICE_QUESTIONS.find((item) => item.id === key);
      if (!question || (visibility === "public" && ["contact", "planning"].includes(key)))
        return [];
      label = question.title;
      if (choice === "custom") text = data.choiceCustom[key];
      else if (/^(0|[1-9]\d*)$/u.test(choice)) {
        const option = question.options[Number(choice)];
        if (option && data.choices[key]?.includes(option)) text = option;
      }
    }

    return label && text?.trim() ? [{ id, label, text }] : [];
  });
}
