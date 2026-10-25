import type { ProfileStoryV3 } from "@/lib/profileStory";

/** Display only known product labels, including for already-generated receipts. */
export function profileRevisionSummary(before: ProfileStoryV3, after: ProfileStoryV3): string {
  const labels: string[] = [];
  if (before.headline !== after.headline) labels.push("한 줄 소개");
  if (before.summary !== after.summary) labels.push("짧은 소개");
  const sections = [
    ["daily_life", "일상 답변"],
    ["getting_closer", "만남 이야기"],
    ["conversation", "대화 이야기"],
  ] as const;
  for (const [id, label] of sections) {
    if (
      before.sections.find((section) => section.id === id)?.answer !==
      after.sections.find((section) => section.id === id)?.answer
    )
      labels.push(label);
  }
  if (JSON.stringify(before.conversationHooks) !== JSON.stringify(after.conversationHooks))
    labels.push("대화 실마리");
  if (!labels.length) return "바뀐 내용을 함께 확인해 주세요.";
  if (labels.length > 2)
    return `${labels.slice(0, 2).join(" · ")} 등 ${labels.length}곳을 다듬었어요.`;
  const joined = labels.join(" · ");
  const last = joined.charCodeAt(joined.length - 1);
  const particle = (last - 0xac00) % 28 === 0 ? "를" : "을";
  return `${joined}${particle} 다듬었어요.`;
}
