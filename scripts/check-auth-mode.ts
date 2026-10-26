import assert from "node:assert/strict";
import { localAuthBypassEnabled } from "../src/lib/auth-mode";
import { localAuthBypassAllowed } from "../supabase/functions/_shared/local-auth";

const local = ["http://127.0.0.1:55321", "http://localhost:55321", "http://[::1]:55321"];
const remote = [
  "https://project.supabase.co",
  "https://localhost.evil.example",
  "http://kong.evil.example",
  "http://127.0.0.1.evil.example",
  "http://localhost@evil.example",
  "http://user@localhost",
  "file://localhost/",
  "invalid",
  "",
];
for (const url of local) {
  assert.equal(localAuthBypassEnabled(true, "true", url), true);
  assert.equal(localAuthBypassAllowed("true", url), true);
  for (const flag of [undefined, "false", "TRUE", "1"]) {
    assert.equal(localAuthBypassEnabled(true, flag, url), false);
    assert.equal(localAuthBypassAllowed(flag, url), false);
  }
  assert.equal(localAuthBypassEnabled(false, "true", url), false);
}
for (const url of remote) {
  assert.equal(localAuthBypassEnabled(true, "true", url), false);
  assert.equal(localAuthBypassAllowed("true", url), false);
}
assert.equal(localAuthBypassAllowed("true", "http://kong:8000"), true);
assert.equal(localAuthBypassEnabled(true, "true", "http://kong:8000"), false);
console.log("Auth mode: explicit flags, production builds and hostile URL guards PASS");
