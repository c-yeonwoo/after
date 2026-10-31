/** Counts only explicit, publicly selected values. Never infer a preference from prose. */
type SignalProfile = { interests?: string[] | null; topics?: string[] | null };
function shared(a: string[] | null | undefined, b: string[] | null | undefined) {
  const normalize = (value: string) => value.normalize("NFKC").trim().toLocaleLowerCase("ko");
  const other = new Set((b ?? []).map(normalize).filter(Boolean));
  return [...new Set((a ?? []).map(normalize).filter(Boolean))].filter((v) => other.has(v));
}
export function introductionSignals(self: SignalProfile, other: SignalProfile) {
  return {
    interests: shared(self.interests, other.interests),
    topics: shared(self.topics, other.topics),
  };
}
