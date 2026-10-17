// USD / 1M tokens, standard global inference, checked 2026-10-17.
// https://platform.claude.com/docs/en/about-claude/pricing
// Unknown models remain unpriced: never silently count them as free.
export const TOKEN_RATES = {
  "claude-opus-5": { input: 5, output: 25 },
  "claude-sonnet-5": { input: 2, output: 10 },
  "claude-sonnet-5-5": { input: 2, output: 10 },
};
export function estimateUsageUsd(usage) {
  let total = 0;
  for (const [model, tokens] of Object.entries(usage)) {
    const rate = TOKEN_RATES[model];
    if (!rate) return null;
    if (
      ![tokens.input_tokens, tokens.output_tokens].every((n) => Number.isSafeInteger(n) && n >= 0)
    )
      throw Error("Invalid token usage");
    total += (tokens.input_tokens * rate.input + tokens.output_tokens * rate.output) / 1e6;
  }
  return total;
}
