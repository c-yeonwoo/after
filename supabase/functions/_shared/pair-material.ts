import { publicSignalRows } from "./profile-signals.ts";
import {
  containsContact,
  scrubUserText,
  validGroundedPairBrief,
  type SourceMap,
  type GroundedPairBrief,
  type Evidence,
} from "./ai-grounding.ts";

export type PairPublicProfile = {
  job?: string | null;
  profile_public_signals?: unknown;
  profile_story?: {
    version?: number;
    sections?: { id: string; question: string; answer: string }[];
  } | null;
  intro?: string | null;
  evening_note?: string | null;
  known_as?: string | null;
  topic_note?: string | null;
  match_note?: string | null;
  interests?: string[] | null;
  topics?: string[] | null;
  match_tags?: string[] | null;
  details?: Record<string, unknown> | null;
};

/** Only approved public copy. Never pass a whole profiles row to the model. */
export function pairSources(p: PairPublicProfile): SourceMap {
  const source: SourceMap = { job: scrubUserText(p.job, 80) };
  for (const row of publicSignalRows(p.profile_public_signals))
    source[`preference_${row.id}`] = `${row.label}: ${row.values.join(" · ")}`;
  if (p.profile_story?.version === 3 && Array.isArray(p.profile_story.sections)) {
    for (const section of p.profile_story.sections) {
      if (["daily_life", "getting_closer", "conversation"].includes(section.id))
        source[`story_${section.id}`] = scrubUserText(section.answer, 240);
    }
    return source;
  }
  for (const key of ["intro", "evening_note", "known_as", "topic_note", "match_note"] as const)
    source[key] = scrubUserText(p[key], 300);
  source.interests = (p.interests ?? [])
    .map((v) =>
      [scrubUserText(v, 40), scrubUserText(p.details?.[v], 200)].filter(Boolean).join(": "),
    )
    .join(" | ");
  for (const key of ["topics", "match_tags"] as const)
    source[key] = (p[key] ?? [])
      .map((v) => scrubUserText(v, 40))
      .filter(Boolean)
      .join(", ");
  return source;
}

export type Recommendation = { text: string; evidence: Evidence[] };
export type PairIntroductionBrief = GroundedPairBrief & { recommendation: Recommendation | null };

export function validPairIntroduction(
  brief: PairIntroductionBrief,
  a: SourceMap,
  b: SourceMap,
): boolean {
  if (!validGroundedPairBrief(brief, a, b)) return false;
  if (brief.recommendation === null) return true; // Not enough evidence is a valid result.
  const { text, evidence } = brief.recommendation;
  if (
    typeof text !== "string" ||
    text.trim().length < 20 ||
    text.length > 120 ||
    containsContact(text) ||
    /MBTI|궁합|사주|운명|성격이|보장|무조건|\d+\s*%|먼저.*(?:호감|좋아)|당신을.*좋아|회원님을.*좋아|추천\s*점수/iu.test(
      text,
    )
  )
    return false;
  if (!Array.isArray(evidence) || evidence.length < 2 || evidence.length > 4) return false;
  // Each side must be represented, with an exact quote from an allowlisted
  // source. The separate LLM verifier checks whether the actual prose follows.
  return (
    ["a", "b"].every((person) =>
      evidence.some((e) => {
        if (e.person !== person || typeof e.quote !== "string") return false;
        const quote = e.quote.replace(/\s+/g, " ").trim();
        const source = (person === "a" ? a : b)[e.sourceField]?.replace(/\s+/g, " ");
        return (
          quote.length >= 3 &&
          quote.length <= 80 &&
          source?.includes(quote) &&
          !containsContact(quote)
        );
      }),
    ) &&
    evidence.every((e) => {
      const source = e.person === "a" ? a : e.person === "b" ? b : {};
      const quote = typeof e.quote === "string" ? e.quote.replace(/\s+/g, " ").trim() : "";
      return (
        quote.length >= 3 &&
        quote.length <= 80 &&
        source[e.sourceField]?.replace(/\s+/g, " ").includes(quote) &&
        !containsContact(quote)
      );
    })
  );
}
