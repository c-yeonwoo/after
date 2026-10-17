export type ModelUsage = Record<string, { input_tokens: number; output_tokens: number }>;
export function addUsage(
  usage: ModelUsage,
  model: string,
  next: { input_tokens: number; output_tokens: number },
) {
  if (![next.input_tokens, next.output_tokens].every((n) => Number.isSafeInteger(n) && n >= 0))
    throw new Error("invalid provider usage");
  const previous = usage[model] ?? { input_tokens: 0, output_tokens: 0 };
  usage[model] = {
    input_tokens: previous.input_tokens + next.input_tokens,
    output_tokens: previous.output_tokens + next.output_tokens,
  };
}
