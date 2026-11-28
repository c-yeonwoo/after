import type { KcpFlow } from "./kcp-direct.ts";
export async function handleKcpReturn(
  req: Request,
  resolve: (
    id: string,
    flow: KcpFlow,
    key: string | null,
  ) => Promise<{ appOrigin: string; accepted: boolean } | null>,
) {
  const headers = { "Cache-Control": "no-store", "Referrer-Policy": "no-referrer" };
  if (req.method !== "POST")
    return new Response(null, { status: 405, headers: { ...headers, Allow: "POST" } });
  if (
    !req.headers.get("content-type")?.toLowerCase().startsWith("application/x-www-form-urlencoded")
  )
    return new Response(null, { status: 415, headers });
  const query = new URL(req.url).searchParams,
    id = query.get("id"),
    flow = query.get("flow");
  if (!id || !/^av[0-9a-f]{32}$/.test(id) || (flow !== "member" && flow !== "signup"))
    return new Response(null, { status: 400, headers });
  // Bound chunked and fixed-size callbacks before form parsing. Never log the body.
  const reader = req.body?.getReader();
  if (!reader) return new Response(null, { status: 400, headers });
  const bytes = new Uint8Array(8192);
  let length = 0;
  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    if (length + value.length > bytes.length) {
      await reader.cancel();
      return new Response(null, { status: 413, headers });
    }
    bytes.set(value, length);
    length += value.length;
  }
  const form = new URLSearchParams(new TextDecoder().decode(bytes.subarray(0, length)));
  const key = form.get("reg_cert_key");
  const valid =
    form.get("res_cd") === "0000" &&
    (!form.has("param_opt_1") || form.get("param_opt_1") === id) &&
    !!key &&
    key.length <= 20;
  const receipt = await resolve(id, flow, valid ? key : null);
  if (!receipt)
    return new Response("인증 시간이 지났어요. 애프터에서 다시 시작해 주세요.", {
      status: 410,
      headers,
    });
  const path =
    flow === "member" ? "/verify-phone" : query.get("preview") === "1" ? "/kcp-preview" : "/signup";
  const dest = new URL(path, receipt.appOrigin);
  dest.searchParams.set("identityVerificationId", id);
  if (!valid || !receipt.accepted) dest.searchParams.set("code", "NOT_VERIFIED");
  return new Response(null, { status: 303, headers: { ...headers, Location: dest.href } });
}
