export type VerifiedCarrierIdentity = {
  gender: "male" | "female";
  birth: string;
  phone: string;
  di: string;
};

/** Only a server-to-server LIVE response is identity evidence. */
export async function readVerifiedCarrierIdentity(
  id: string,
  config: { apiSecret: string; channelKey: string },
  fetcher: typeof fetch = fetch,
): Promise<VerifiedCarrierIdentity> {
  const response = await fetcher(
    `https://api.portone.io/identity-verifications/${encodeURIComponent(id)}`,
    {
      headers: { Authorization: `PortOne ${config.apiSecret}` },
      signal: AbortSignal.timeout(12000),
    },
  );
  if (!response.ok) throw new Error("provider verification unavailable");
  const result = await response.json();
  if (!result || typeof result !== "object") throw new Error("not verified");
  const customer = result.verifiedCustomer;
  if (result.status !== "VERIFIED" || !customer) throw new Error("not verified");
  if (
    result.id !== id ||
    result.channel?.key !== config.channelKey ||
    result.channel?.type !== "LIVE"
  ) {
    throw new Error("verification channel mismatch");
  }
  const digits = String(customer.phoneNumber ?? "").replace(/[^0-9+]/g, "");
  const local = digits.startsWith("+82") ? `0${digits.slice(3)}` : digits;
  const gender =
    customer.gender === "MALE" ? "male" : customer.gender === "FEMALE" ? "female" : null;
  if (
    !gender ||
    typeof customer.birthDate !== "string" ||
    !/^\d{4}-\d{2}-\d{2}$/.test(customer.birthDate) ||
    !/^01[016789][0-9]{7,8}$/.test(local) ||
    typeof customer.di !== "string" ||
    !customer.di.trim()
  ) {
    throw new Error("incomplete verified identity");
  }
  return { gender, birth: customer.birthDate, phone: `+82${local.slice(1)}`, di: customer.di };
}
