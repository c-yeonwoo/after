/** Small deterministic checks around untrusted LLM prose; human approval stays required. */
import {
  validInterviewComposition,
  validPairBrief,
  validProfileComposition,
} from "./ai-quality.ts";

export function scrubUserText(value: unknown, max: number): string {
  if (typeof value !== "string") return "";
  return value
    .trim()
    .slice(0, max)
    .replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, "[이메일]")
    .replace(/(?:\+?82[- .]?)?0?1[016789][-. ]?\d{3,4}[-. ]?\d{4}/g, "[연락처]")
    .replace(/https?:\/\/\S+/gi, "[링크]");
}

export function containsContact(value: string): boolean {
  return (
    /\[(?:연락처|이메일|링크)\]/.test(value) ||
    /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i.test(value) ||
    /(?:\+?82[- .]?)?0?1[016789][-. ]?\d{3,4}[-. ]?\d{4}/.test(value) ||
    /https?:\/\/\S+/i.test(value)
  );
}

export type SourceMap = Record<string, string>;
export type Evidence = { person?: "a" | "b"; sourceField: string; quote: string };

function compact(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

function quoteInSource(evidence: Evidence, sources: SourceMap): boolean {
  const source = sources[evidence.sourceField];
  const quote = compact(evidence.quote);
  return Boolean(
    source && quote.length >= 3 && quote.length <= 80 && compact(source).includes(quote),
  );
}

export function validGroundedProfile(
  headlines: string[],
  intro: string,
  evidence: Evidence[],
  sources: SourceMap,
): boolean {
  return (
    validProfileComposition(headlines, intro) &&
    evidence.length >= 1 &&
    evidence.length <= 3 &&
    evidence.every(
      (item) =>
        quoteInSource(item, sources) &&
        compact(intro).includes(compact(item.quote)) &&
        !containsContact(item.quote),
    ) &&
    !containsContact(`${headlines.join(" ")} ${intro}`)
  );
}

export function validGroundedInterview(
  headlines: string[],
  intro: string,
  evidence: Evidence[],
  sources: SourceMap,
): boolean {
  return (
    validInterviewComposition(headlines, intro) &&
    evidence.length >= 1 &&
    evidence.length <= 3 &&
    evidence.every(
      (item) =>
        quoteInSource(item, sources) &&
        compact(intro).includes(compact(item.quote)) &&
        !containsContact(item.quote),
    ) &&
    !containsContact(`${headlines.join(" ")} ${intro}`)
  );
}

export type GroundedPairBrief = {
  commonGround: { insight: string; evidence: Evidence[] }[];
  conversationStarters: string[];
  considerations: string[];
};

export function validGroundedPairBrief(
  brief: GroundedPairBrief,
  personA: SourceMap,
  personB: SourceMap,
): boolean {
  const styleValid = validPairBrief({
    commonGround: brief.commonGround.map((item) => ({
      insight: item.insight,
      basis: "원문 근거 확인",
    })),
    conversationStarters: brief.conversationStarters,
    considerations: brief.considerations,
  });
  return (
    styleValid &&
    brief.commonGround.every(
      (item) =>
        item.evidence.length === 2 &&
        item.evidence.some(
          (e) => e.person === "a" && quoteInSource(e, personA) && !containsContact(e.quote),
        ) &&
        item.evidence.some(
          (e) => e.person === "b" && quoteInSource(e, personB) && !containsContact(e.quote),
        ),
    ) &&
    !containsContact(
      [
        ...brief.commonGround.map((item) => item.insight),
        ...brief.conversationStarters,
        ...brief.considerations,
      ].join(" "),
    )
  );
}

export async function sourceHash(source: unknown): Promise<string> {
  const bytes = new TextEncoder().encode(JSON.stringify(source));
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}
