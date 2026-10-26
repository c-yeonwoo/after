import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { Transpiler } from "bun";
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
    providerError?: string;
  } = {},
) {
  const calls: { name: string; args: unknown }[] = [];
  let providerCalls = 0;
  let handler: (req: Request) => Promise<Response>;
  const db = {
    auth: {
      getUser: async () => ({ data: { user: options.user === false ? null : { id: "user-a" } } }),
    },
    rpc: async (name: string, args: unknown) => {
      calls.push({ name, args });
      return { data: options.rpc?.[name] ?? null, error: null };
    },
    from: (name: string) => {
      const result = () => ({ data: options.tables?.[name]?.shift() ?? null, error: null });
      const query: Record<string, unknown> = {};
      for (const method of ["select", "eq", "gte", "insert"]) query[method] = () => query;
      query.maybeSingle = async () => result();
      query.then = (resolve: (v: unknown) => void) => resolve(result());
      return query;
    },
  };
  const source = readFileSync(`supabase/functions/${name}/index.ts`, "utf8").replace(
    /^import[\s\S]*?;\n/gm,
    "",
  );
  const code = new Transpiler({ loader: "ts" }).transformSync(source).replace(/^export /gm, "");
  const config = { ...env, ...options.env };
  new Function(
    "Deno",
    "createClient",
    "corsHeaders",
    "readVerifiedCarrierIdentity",
    "localAuthBypassAllowed",
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
    async () => {
      providerCalls++;
      if (options.providerError) throw Error(options.providerError);
      return { gender: "female", birth: "1994-02-15", phone: "+821012345678", di: "synthetic-di" };
    },
    localAuthBypassAllowed,
  );
  const response = await handler!(
    new Request("http://local.test", {
      method: "POST",
      headers: { Authorization: "Bearer synthetic", "Content-Type": "application/json" },
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
