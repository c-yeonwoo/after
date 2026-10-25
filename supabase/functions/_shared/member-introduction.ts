import { containsContact, scrubUserText, type SourceMap } from "./ai-grounding.ts";
import { pairSources, type PairPublicProfile } from "./pair-material.ts";

export type PublicEvidence = {
  person: "self" | "other";
  field: string;
  quote: string;
};
export type MemberIntroduction = {
  portrait: { text: string; sources: PublicEvidence[] }[];
  connections: {
    text: string;
    selfSources: PublicEvidence[];
    otherSources: PublicEvidence[];
  }[];
  questions: { text: string; sources: PublicEvidence[] }[];
};
export type MemberIntroductionBrief = MemberIntroduction & {
  viewerId: string;
  targetId: string;
  sourceFingerprint: string;
  promptVersion: string;
  expiresAt: string;
  cached: boolean;
};

/** Deliberately excludes identity, pictures, MBTI and all private preferences. */
export function introductionSources(profile: PairPublicProfile): SourceMap {
  const source = pairSources(profile);
  delete source.job;
  // Redacted contact material does not become a quotable conversation topic.
  return Object.fromEntries(
    Object.entries(source).filter(([, value]) => value.trim() && !containsContact(value)),
  );
}

const unsafe =
  /MBTI|\b[IE][NS][FT][JP]\b|궁합|사주|운명|보장|무조건|애착유형|회피형|트라우마|연봉|성적\s*(?:매력|취향|관계)|\d+\s*%|먼저.*(?:호감|좋아)|당신을.*좋아|회원님을.*좋아|추천\s*점수|잘\s*맞는\s*확률|외모\s*(?:점수|등급)/iu;
const compact = (value: string) => value.replace(/\s+/g, " ").trim();
const validText = (value: unknown, min: number, max: number): value is string =>
  typeof value === "string" &&
  value.trim().length >= min &&
  value.length <= max &&
  !containsContact(value) &&
  !unsafe.test(value);

export function validMemberIntroduction(
  value: unknown,
  self: SourceMap,
  other: SourceMap,
): value is MemberIntroduction {
  if (!value || typeof value !== "object") return false;
  const brief = value as MemberIntroduction;
  const evidence = (items: unknown, person?: "self" | "other") =>
    Array.isArray(items) &&
    items.length >= 1 &&
    items.length <= 3 &&
    items.every((item: PublicEvidence) => {
      if (
        !item ||
        !["self", "other"].includes(item.person) ||
        (person && item.person !== person) ||
        typeof item.field !== "string" ||
        typeof item.quote !== "string"
      )
        return false;
      const quote = compact(item.quote);
      const source = (item.person === "self" ? self : other)[item.field];
      return (
        quote.length >= 5 &&
        quote.length <= 100 &&
        Boolean(source && compact(source).includes(quote)) &&
        !containsContact(quote) &&
        !unsafe.test(quote)
      );
    });
  if (
    !Array.isArray(brief.portrait) ||
    brief.portrait.length < 1 ||
    brief.portrait.length > 3 ||
    !Array.isArray(brief.connections) ||
    brief.connections.length > 2 ||
    !Array.isArray(brief.questions) ||
    brief.questions.length > 2
  )
    return false;
  return (
    brief.portrait.every(
      (item) => item && validText(item.text, 20, 280) && evidence(item.sources, "other"),
    ) &&
    brief.connections.every(
      (item) =>
        item &&
        validText(item.text, 20, 240) &&
        evidence(item.selfSources, "self") &&
        evidence(item.otherSources, "other"),
    ) &&
    brief.questions.every(
      (item) => item && validText(item.text, 15, 180) && evidence(item.sources),
    ) &&
    new Set(brief.portrait.map((item) => compact(item.text))).size === brief.portrait.length
  );
}

export function hasIntroductionMaterial(sources: SourceMap): boolean {
  return Object.values(sources).some((value) => scrubUserText(value, 300).length >= 15);
}
