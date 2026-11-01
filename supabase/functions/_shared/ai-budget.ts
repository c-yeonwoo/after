/** Server-only global spend fence. Source: https://www.anthropic.com/claude-sonnet-5-5
 * KRW uses a conservative accounting rate (1 USD = 1,800 KRW + 10% buffer),
 * not a promise about card FX/tax. Text-only standard requests; unknown models fail closed.
 * Every retry reserves separately. Timeouts/unknown usage keep the full reservation.
 */
type BudgetDb = {
  rpc: (
    name: string,
    args: Record<string, unknown>,
  ) => PromiseLike<{ data: unknown; error: unknown }>;
};
const PRICES: Record<string, [number, number]> = {
  "claude-sonnet-5-5": [2, 10],
  "claude-sonnet-5": [2, 10],
  "claude-sonnet-4-6": [3, 15],
  "claude-sonnet-4-5-20250929": [3, 15],
  "claude-haiku-4-5-20251001": [1, 5],
};
const KRW_PER_USD = 1800 * 1.1;
export function budgetEstimate(body: Record<string, unknown>, bytes: number) {
  const price = PRICES[String(body.model)];
  const output = Number(body.max_tokens);
  if (
    !price ||
    !Number.isSafeInteger(output) ||
    output < 1 ||
    output > 8192 ||
    bytes > 180000 ||
    body.stream ||
    body.tools ||
    body.speed ||
    body.service_tier === "priority" ||
    /"type"\s*:\s*"(?:image|document|tool_use|tool_result)"/.test(JSON.stringify(body))
  )
    return null;
  // UTF-8 bytes conservatively bound text tokens, plus protocol/schema overhead.
  // Reserve all input at the 1h cache-write rate (2x), regardless of cache settings.
  return {
    price,
    krw: Math.max(
      1,
      Math.ceil((((bytes + 8192) * price[0] * 2 + output * price[1]) / 1e6) * KRW_PER_USD),
    ),
  };
}
const denied = () =>
  new Response(
    JSON.stringify({ error: { type: "budget_exhausted", message: "AI usage budget unavailable" } }),
    { status: 429, headers: { "content-type": "application/json", "x-should-retry": "false" } },
  );
export function budgetedAnthropicFetch(
  db: BudgetDb,
  providerFetch: typeof fetch = fetch,
): typeof fetch {
  return async (input, init) => {
    const request = new Request(input, init);
    if (request.url !== "https://api.anthropic.com/v1/messages" || request.method !== "POST")
      return denied();
    let body: Record<string, unknown>;
    let text: string;
    try {
      text = await request.clone().text();
      body = JSON.parse(text);
    } catch {
      return denied();
    }
    const estimate = budgetEstimate(body, new TextEncoder().encode(text).length);
    if (!estimate) return denied();
    const id = crypto.randomUUID();
    const reserved = await db.rpc("reserve_ai_budget", {
      p_id: id,
      p_model: String(body.model),
      p_krw: estimate.krw,
    });
    if (reserved.error || reserved.data !== true) return denied();
    const response = await providerFetch(request);
    if (response.ok) {
      try {
        const result = await response.clone().json();
        const u = result.usage;
        const counts = [
          u.input_tokens,
          u.output_tokens,
          u.cache_creation_input_tokens ?? 0,
          u.cache_read_input_tokens ?? 0,
        ];
        if (counts.every((n: unknown) => Number.isSafeInteger(n) && Number(n) >= 0)) {
          const [i, o, w, r] = counts;
          // Cache reads charged conservatively at full input price; cache writes at 2x.
          const krw = Math.ceil(
            (((i + r + w * 2) * estimate.price[0] + o * estimate.price[1]) / 1e6) * KRW_PER_USD,
          );
          if (krw <= estimate.krw) await db.rpc("settle_ai_budget", { p_id: id, p_krw: krw });
        }
      } catch {
        /* Unknown outcome keeps its full reservation. Never retry a paid response. */
      }
    }
    return response;
  };
}
