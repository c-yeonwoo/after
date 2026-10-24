import { containsContact, type SourceMap } from "./ai-grounding.ts";

export type ConversationPreparation = {
  topics: {
    title: string;
    question: string;
    followup: string;
    sourceField: string;
    quote: string;
  }[];
  advice?: {
    kind: "start" | "respect" | "pace";
    text: string;
    sourceField: string;
    quote: string;
  }[];
};

export function validConversationPreparation(
  value: ConversationPreparation,
  sources: SourceMap,
): boolean {
  if (!value || !Array.isArray(value.topics) || value.topics.length < 1 || value.topics.length > 3)
    return false;
  const forbidden =
    /MBTI|\b[IE][NS][FT][JP]\b|궁합|사주|운명|보장|무조건|성격이|애착유형|회피형|트라우마|성적|연봉|\d+\s*%|먼저.*(?:호감|좋아)/iu;
  return (
    (value.advice === undefined ||
      (Array.isArray(value.advice) &&
        value.advice.length === 3 &&
        new Set(value.advice.map((t) => t?.kind)).size === 3 &&
        value.advice.every((t) => {
          if (
            !t ||
            !["start", "respect", "pace"].includes(t.kind) ||
            ![t.text, t.sourceField, t.quote].every((v) => typeof v === "string")
          )
            return false;
          const quote = t.quote.replace(/\s+/g, " ").trim();
          return (
            t.text.length >= 15 &&
            t.text.length <= 220 &&
            quote.length >= 5 &&
            quote.length <= 100 &&
            !!sources[t.sourceField]?.replace(/\s+/g, " ").includes(quote) &&
            !containsContact(t.text + " " + quote) &&
            !forbidden.test(t.text)
          );
        }))) &&
    value.topics.every((topic) => {
      if (
        !topic ||
        ![topic.title, topic.question, topic.followup, topic.quote, topic.sourceField].every(
          (v) => typeof v === "string",
        )
      )
        return false;
      const source = sources[topic.sourceField]?.replace(/\s+/g, " ");
      const quote = topic.quote.replace(/\s+/g, " ").trim();
      const text = [topic.title, topic.question, topic.followup, quote].join(" ");
      return (
        topic.title.length >= 2 &&
        topic.title.length <= 35 &&
        topic.question.length >= 10 &&
        topic.question.length <= 140 &&
        topic.followup.length >= 10 &&
        topic.followup.length <= 160 &&
        quote.length >= 5 &&
        quote.length <= 100 &&
        Boolean(source?.includes(quote)) &&
        !containsContact(text) &&
        !forbidden.test(text)
      );
    }) &&
    new Set(value.topics.map((t) => t.question.trim())).size === value.topics.length
  );
}
