import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { Transpiler } from "bun";
import { assertPortoneIdentityResult } from "../src/lib/portoneIdentityResult";

// Run the shipped client wrappers with an isolated SDK/transport/storage.
// No DOM, provider API or secret is used.
for (const signup of [true, false]) {
  const pendingKey = signup ? "after-signup-identity" : "after-carrier-identity-id";
  const id = `av${"1".repeat(32)}`;
  const values = new Map<string, string>([["after-signup-session", "a".repeat(64)]]);
  let result: { identityVerificationId?: string; code?: string } | undefined;
  const calls: string[] = [];
  const file = signup ? "signupSession" : "carrierIdentity";
  const source = readFileSync(`src/lib/${file}.ts`, "utf8")
    .replace(/^import[\s\S]*?;\n/gm, "")
    .replace('await import("@portone/browser-sdk/v2")', "sdk")
    .replace('import.meta.env.VITE_CARRIER_IDENTITY_ENABLED === "true"', "true");
  const code = new Transpiler({ loader: "ts" }).transformSync(source).replace(/^export /gm, "");
  const client = new Function(
    "supabase",
    "sessionStorage",
    "window",
    "sdk",
    "assertPortoneIdentityResult",
    "POLICY_VERSION",
    code +
      `\nreturn {start:${signup ? "startSignupIdentity" : "startCarrierIdentity"},finish:${signup ? "finishSignupIdentity" : "finishCarrierIdentity"}};`,
  )(
    {
      rpc: async () => ({ data: { verified: false }, error: null }),
      functions: {
        invoke: async (_name: string, { body }: { body: { action: string } }) => {
          calls.push(body.action);
          return {
            data:
              body.action === "start"
                ? { identityVerificationId: id, storeId: "store-one", channelKey: "channel-one" }
                : { verified: true, birth: "1994-02-15" },
            error: null,
          };
        },
      },
    },
    {
      getItem: (key: string) => values.get(key) ?? null,
      setItem: (key: string, value: string) => values.set(key, value),
      removeItem: (key: string) => values.delete(key),
    },
    { location: { origin: "http://127.0.0.1:5191" } },
    {
      requestIdentityVerification: async () => {
        calls.push("sdk");
        return result;
      },
    },
    assertPortoneIdentityResult,
    "synthetic-policy",
  );
  await assert.rejects(client.start(), /verification redirecting/);
  assert.equal(values.get(pendingKey), id, "Redirect preserves the pending ID");
  assert.deepEqual(calls, ["start", "sdk"]);
  await client.start();
  assert.deepEqual(
    calls,
    ["start", "sdk", "complete"],
    "Resume consumes the same attempt without another SDK launch",
  );
  assert.equal(values.has(pendingKey), false);
  calls.length = 0;
  result = { identityVerificationId: id, code: "USER_CANCEL" };
  await assert.rejects(client.start(), /not verified/);
  assert.equal(values.has(pendingKey), false, "Explicit cancellation clears only pending proof");
  calls.length = 0;
  result = { identityVerificationId: "another-id" };
  await assert.rejects(client.start(), /verification result mismatch/);
  assert.equal(values.get(pendingKey), id);
  assert.deepEqual(calls, ["start", "sdk"], "Mismatched SDK result never reaches completion");
  calls.length = 0;
  await assert.rejects(client.finish("foreign-id"), /verification expired/);
  assert.deepEqual(calls, [], "Foreign redirect is refused before any server call");
}
assert.throws(
  () => assertPortoneIdentityResult("id", { identityVerificationId: "id", code: "" }),
  /not verified/,
);
console.log(
  "PortOne clients: redirect preservation, same-attempt recovery, cancellation and foreign-ID refusal PASS",
);
