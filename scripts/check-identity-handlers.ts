import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { Transpiler } from "bun";
import { kcpAppOrigin, kcpConfig } from "../supabase/functions/_shared/kcp-direct";
import { localAuthBypassAllowed } from "../supabase/functions/_shared/local-auth";

// Execute the actual Edge handlers with isolated transports. No provider/network calls.
const token = "a".repeat(64);
const id = `av${"1".repeat(32)}`;
const env = {
  SUPABASE_URL: "http://kong:8000",
  SUPABASE_ANON_KEY: "test-anon",
  SUPABASE_SERVICE_ROLE_KEY: "test-service",
  PORTONE_STORE_ID: "test-store",
  PORTONE_KCP_IDENTITY_CHANNEL_KEY: "test-channel",
  PORTONE_API_SECRET: "test-secret",
};
async function invoke(
  name: string,
  body: unknown,
  options: {
    env?: Record<string, string | undefined>;
    tables?: Record<string, unknown[]>;
    rpc?: Record<string, unknown>;
    user?: boolean;
    email?: string;
    confirmed?: boolean;
    providerError?: string;
  } = {},
) {
  const calls: { name: string; args: unknown }[] = [];
  let providerCalls = 0;
  let handler: (req: Request) => Promise<Response>;
  const db = {
    auth: {
      getUser: async () => ({
        data: {
          user:
            options.user === false
              ? null
              : {
                  id: "user-a",
                  email: options.email,
                  email_confirmed_at: options.confirmed ? "confirmed" : null,
                },
        },
      }),
      signInWithOtp: async (args: unknown) => {
        calls.push({ name: "send-email", args });
        return { error: null };
      },
    },
    rpc: async (name: string, args: unknown) => {
      calls.push({ name, args });
      return { data: options.rpc?.[name] ?? null, error: null };
    },
    from: (name: string) => {
      const result = () => ({ data: options.tables?.[name]?.shift() ?? null, error: null });
      const query: Record<string, unknown> = {};
      for (const method of ["select", "eq", "gte", "gt", "is", "insert", "delete"])
        query[method] = () => query;
      query.maybeSingle = async () => result();
      query.then = (resolve: (v: unknown) => void) => resolve(result());
      return query;
    },
  };
  const source = [
    readFileSync("supabase/functions/_shared/carrier-provider.ts", "utf8"),
    readFileSync(`supabase/functions/${name}/index.ts`, "utf8"),
  ]
    .join("\n")
    .replace(/^import[\s\S]*?;\n/gm, "");
  const code = new Transpiler({ loader: "ts" }).transformSync(source).replace(/^export /gm, "");
  const config = { ...env, ...options.env };
  new Function(
    "Deno",
    "createClient",
    "corsHeaders",
    "readVerifiedCarrierIdentity",
    "localAuthBypassAllowed",
    "kcpAppOrigin",
    "kcpConfig",
    "registerKcp",
    "queryKcp",
    code,
  )(
    {
      env: { get: (key: string) => config[key] },
      serve: (value: typeof handler) => {
        handler = value;
      },
    },
    () => db,
    {},
    async (_id: string, providerConfig: { storeId: string }) => {
      assert.equal(providerConfig.storeId, env.PORTONE_STORE_ID);
      providerCalls++;
      if (options.providerError) throw Error(options.providerError);
      return { gender: "female", birth: "1994-02-15", phone: "+821012345678", di: "synthetic-di" };
    },
    localAuthBypassAllowed,
    kcpAppOrigin,
    kcpConfig,
    async () => {
      providerCalls++;
      if (options.providerError) throw Error(options.providerError);
      return { callUrl: "https://cert.kcp.co.kr/form", registrationKey: "fixture" };
    },
    async () => {
      providerCalls++;
      return { gender: "female", birth: "1994-02-15", phone: "+821012345678", di: "fixture" };
    },
  );
  const response = await handler!(
    new Request("http://local.test", {
      method: "POST",
      headers: {
        Authorization: "Bearer synthetic",
        "Content-Type": "application/json",
        Origin: "https://www.aftersunset.kr",
      },
      body: JSON.stringify(body),
    }),
  );
  return { status: response.status, body: await response.json(), calls, providerCalls };
}

for (const [url, flag, expected] of [
  ["http://kong:8000", "true", 200],
  ["http://kong:8000", "false", 403],
  ["https://prod.supabase.co", "true", 403],
  ["http://kong.evil.example", "true", 403],
] as const) {
  const r = await invoke(
    "signup-identity",
    { action: "dev-status" },
    {
      env: { SUPABASE_URL: url, DEV_AUTH_BYPASS: flag },
    },
  );
  assert.equal(r.status, expected);
  assert.equal(r.calls.length, 0);
}
assert.equal(
  (
    await invoke(
      "signup-identity",
      { action: "start", token },
      {
        env: { PORTONE_API_SECRET: undefined },
      },
    )
  ).status,
  503,
);

const signupBody = { action: "complete", token, identityVerificationId: id };
const owned = () => ({
  signup_identity_attempts: [
    { session_id: "session-a", created_at: new Date().toISOString(), consumed_at: null },
  ],
  signup_sessions: [{ id: "session-a", verification_id: id }],
});
const completed = owned();
Object.assign(completed.signup_identity_attempts[0], {
  consumed_at: "2026-01-01",
  created_at: "2026-01-01",
});
const replay = await invoke("signup-identity", signupBody, {
  tables: completed,
  rpc: { signup_session_status: { verified: true, birth: "1994-02-15" } },
});
assert.equal(replay.status, 200);
assert.equal(replay.providerCalls, 0);
const other = owned();
other.signup_sessions[0].id = "session-b";
const stolen = await invoke("signup-identity", signupBody, {
  tables: other,
  rpc: { signup_session_status: { verified: false } },
});
assert.equal(stolen.status, 409);
assert.equal(stolen.providerCalls, 0);
const success = await invoke("signup-identity", signupBody, {
  tables: owned(),
  rpc: {
    signup_session_status: { verified: false },
    finish_signup_identity: { verified: true },
  },
});
assert.equal(success.status, 200);
assert.equal(success.providerCalls, 1);
assert.equal((success.calls.at(-1)!.args as { p_gender: string }).p_gender, "female");

const carrierBody = { action: "complete", identityVerificationId: id };
const attempt = () => ({
  user_id: "user-a",
  created_at: new Date().toISOString(),
  consumed_at: null,
});
const carrier = await invoke("carrier-identity", carrierBody, {
  tables: { identity_verification_attempts: [attempt()] },
});
assert.equal(carrier.status, 200);
assert.equal((carrier.calls.at(-1)!.args as { p_gender: string }).p_gender, "female");
const receipt = await invoke("carrier-identity", carrierBody, {
  tables: {
    identity_verification_attempts: [
      { ...attempt(), consumed_at: "2026-01-01", created_at: "2026-01-01" },
    ],
    profiles: [{ birth: "1994-02-15", identity_verified_at: "2026-01-01" }],
  },
});
assert.equal(receipt.status, 200);
assert.equal(receipt.providerCalls, 0);
const stolenCarrier = await invoke("carrier-identity", carrierBody, {
  tables: {
    identity_verification_attempts: [{ ...attempt(), user_id: "user-b" }],
  },
});
assert.equal(stolenCarrier.status, 409);
assert.equal(stolenCarrier.providerCalls, 0);
assert.equal((await invoke("carrier-identity", carrierBody, { user: false })).status, 401);
assert.equal((await invoke("carrier-identity", null)).status, 400);
assert.equal(
  (
    await invoke("carrier-identity", carrierBody, {
      tables: {
        identity_verification_attempts: [attempt()],
      },
      providerError: "verification channel mismatch",
    })
  ).status,
  409,
);

const directEnv = {
  KCP_LIVE_ACCESS: "public",
  CARRIER_IDENTITY_PROVIDER: "kcp_direct",
  KCP_SITE_CODE: "Z9999",
  KCP_ENC_KEY: "fixture",
  SUPABASE_URL: "https://project.supabase.co",
};
const previewEnv = {
  ...directEnv,
  KCP_LIVE_ACCESS: undefined,
  KCP_DEVICE_TESTER_EMAIL: "tester@example.test",
};
for (const [email, confirmed, expected] of [
  ["other@example.test", true, 403],
  ["tester@example.test", false, 403],
  ["Tester@example.test", true, 200],
] as const) {
  for (const action of ["preview-access", "start", "complete"]) {
    const r = await invoke(
      "signup-identity",
      { ...signupBody, action, email: "tester@example.test" },
      {
        env: previewEnv,
        email,
        confirmed,
        tables: owned(),
        rpc: { signup_session_status: { verified: false } },
      },
    );
    assert.equal(r.status, expected === 200 && action === "complete" ? 409 : expected);
    if (expected === 403 || action === "preview-access") {
      assert.equal(r.providerCalls, 0);
      assert.equal(r.calls.length, 0);
    }
  }
}
for (const email of ["tester@example.test", "other@example.test"]) {
  const r = await invoke(
    "signup-identity",
    { action: "preview-email", email },
    { env: previewEnv, user: false },
  );
  assert.equal(r.status, 200);
  assert.equal(
    r.calls.filter((c) => c.name === "send-email").length,
    email === "tester@example.test" ? 1 : 0,
  );
  assert.equal(r.providerCalls, 0);
}
for (const name of ["carrier-identity", "signup-identity"]) {
  const r = await invoke(
    name,
    { action: "start", token },
    {
      env: { ...previewEnv, KCP_DEVICE_TESTER_EMAIL: undefined },
      confirmed: true,
      email: "tester@example.test",
    },
  );
  assert.equal(r.status, 403);
  assert.equal(r.providerCalls, 0);
}
assert.equal(
  (
    await invoke(
      "carrier-identity",
      { action: "start" },
      { env: previewEnv, confirmed: true, email: "tester@example.test" },
    )
  ).status,
  403,
);
assert.equal(
  (
    await invoke(
      "signup-identity",
      { action: "preview-email", email: "tester@example.test" },
      { env: directEnv },
    )
  ).status,
  403,
);
for (const isSignup of [true, false]) {
  const name = isSignup ? "signup-identity" : "carrier-identity";
  const rpc = {
    signup_session_status: { verified: false },
    finish_signup_identity: { verified: true },
  };
  const tables = () => (isSignup ? owned() : { identity_verification_attempts: [attempt()] });
  const start = { action: "start", ...(isSignup ? { token } : {}) };
  const profile = () => ({ profiles: [{ account_state: "active", identity_verified_at: null }] });
  const launched = await invoke(name, start, { env: directEnv, tables: profile(), rpc });
  assert.equal(launched.status, 200);
  assert.equal(launched.body.provider, "kcp_direct");
  assert.equal(launched.body.registrationKey, "fixture");
  assert.ok(!Object.hasOwn(launched.body, "key"));
  const failed = await invoke(name, start, {
    env: directEnv,
    tables: profile(),
    rpc,
    providerError: "registration unavailable",
  });
  assert.equal(failed.status, 503);
  for (const returned of [false, true]) {
    const completed = await invoke(name, isSignup ? signupBody : carrierBody, {
      env: directEnv,
      rpc,
      tables: {
        ...tables(),
        kcp_direct_registrations: [
          { registration_key: "fixture", returned_at: returned ? "2026-01-01" : null },
        ],
      },
    });
    assert.equal(completed.status, returned ? 200 : 409);
    assert.equal(completed.providerCalls, returned ? 1 : 0);
  }
}

for (const [url, flag, bypass, expected] of [
  ["http://kong:8000", "true", true, 200],
  ["http://kong:8000", "false", true, 403],
  ["https://prod.supabase.co", "true", true, 403],
  ["http://kong:8000", "true", false, 503],
] as const) {
  const r = await invoke(
    "phone-otp",
    { phone: "01012345678", bypass },
    {
      env: { SUPABASE_URL: url, DEV_AUTH_BYPASS: flag },
      rpc: { issue_phone_code: "123456" },
    },
  );
  assert.equal(r.status, expected);
  assert.equal(r.calls.length, expected === 200 ? 1 : 0);
  assert.equal(r.body.devCode, expected === 200 ? "123456" : undefined);
}
assert.equal(
  (await invoke("phone-otp", { phone: "01012345678", bypass: true }, { user: false })).status,
  401,
);
console.log(
  "Identity Edge handlers: bypass refusal, ownership, completion receipts, provider validation PASS",
);
