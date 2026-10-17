import assert from "node:assert/strict";
import { readVerifiedCarrierIdentity } from "../supabase/functions/_shared/verified-carrier";

const id = "av11111111111111111111111111111111";
const valid = {
  id,
  status: "VERIFIED",
  channel: { key: "live-channel", type: "LIVE" },
  verifiedCustomer: {
    gender: "FEMALE",
    birthDate: "1994-02-15",
    phoneNumber: "010-1234-5678",
    di: "provider-di",
  },
};
const config = { apiSecret: "synthetic-test-secret", channelKey: "live-channel" };
const responseFor = (value: unknown, status = 200) =>
  (async () => new Response(JSON.stringify(value), { status })) as typeof fetch;
assert.deepEqual(await readVerifiedCarrierIdentity(id, config, responseFor(valid)), {
  gender: "female",
  birth: "1994-02-15",
  phone: "+821012345678",
  di: "provider-di",
});
const male = structuredClone(valid);
male.verifiedCustomer.gender = "MALE";
male.verifiedCustomer.phoneNumber = "+821012345678";
assert.equal((await readVerifiedCarrierIdentity(id, config, responseFor(male))).gender, "male");

const cases: [string, Record<string, unknown>][] = [
  ["not verified", { ...valid, status: "READY" }],
  ["verification channel mismatch", { ...valid, id: "another-id" }],
  ["verification channel mismatch", { ...valid, channel: { key: "live-channel", type: "TEST" } }],
  ["verification channel mismatch", { ...valid, channel: { key: "other-channel", type: "LIVE" } }],
  [
    "incomplete verified identity",
    { ...valid, verifiedCustomer: { ...valid.verifiedCustomer, gender: null } },
  ],
  [
    "incomplete verified identity",
    { ...valid, verifiedCustomer: { ...valid.verifiedCustomer, gender: "OTHER" } },
  ],
  [
    "incomplete verified identity",
    { ...valid, verifiedCustomer: { ...valid.verifiedCustomer, di: "" } },
  ],
  [
    "incomplete verified identity",
    { ...valid, verifiedCustomer: { ...valid.verifiedCustomer, phoneNumber: "0212345678" } },
  ],
];
for (const [message, result] of cases) {
  await assert.rejects(
    readVerifiedCarrierIdentity(id, config, responseFor(result)),
    new RegExp(message),
  );
}
await assert.rejects(
  readVerifiedCarrierIdentity(id, config, responseFor({}, 503)),
  /provider verification unavailable/,
);
console.log(`Carrier identity: ${cases.length + 3} provider validation cases PASS`);
