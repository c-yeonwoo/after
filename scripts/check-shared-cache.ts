import assert from "node:assert/strict";
import { QueryClient } from "@tanstack/react-query";
import { createReadCache } from "../src/lib/readCache";

let clock = 0;
let reads = 0;
const cache = createReadCache<boolean>(60_000, () => clock);
const read = async () => {
  reads++;
  return false;
};
assert.deepEqual(await Promise.all([cache.read(read), cache.read(read)]), [false, false]);
assert.equal(reads, 1, "concurrent consumers share one request, including false values");
clock = 59_999;
assert.equal(await cache.read(read), false);
assert.equal(reads, 1);
clock = 60_000;
await cache.read(read);
assert.equal(reads, 2, "expiry refreshes the server setting");

cache.clear();
await assert.rejects(
  cache.read(async () => {
    throw Error("offline");
  }),
);
assert.equal(await cache.read(read), false, "failures are not cached as success/defaults");
assert.equal(reads, 3);

cache.clear();
let finishOld!: (value: boolean) => void;
const old = cache.read(
  () =>
    new Promise<boolean>((resolve) => {
      finishOld = resolve;
    }),
);
await Promise.resolve();
cache.clear(); // logout/account replacement
assert.equal(await cache.read(async () => true), true);
finishOld(false);
await old;
assert.equal(await cache.read(read), true, "late response cannot poison the new session cache");
assert.equal(reads, 3);
cache.clear();
assert.equal(await cache.read(read), false, "explicit reset forces a fresh read");

// The capability hook uses this exact owner-scoped QueryClient policy.
const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
let flagReads = 0;
const flags = (owner: string) => ({
  queryKey: ["assistant-capabilities", owner],
  staleTime: 60_000,
  queryFn: async () => {
    flagReads++;
    return { chat: owner === "member-a" };
  },
});
await Promise.all([client.fetchQuery(flags("member-a")), client.fetchQuery(flags("member-a"))]);
await client.fetchQuery(flags("member-a"));
assert.equal(flagReads, 1);
assert.equal((await client.fetchQuery(flags("member-b"))).chat, false);
assert.equal(flagReads, 2, "another account never reuses the first account's snapshot");
client.removeQueries({ queryKey: ["assistant-capabilities"] });
await client.fetchQuery(flags("member-a"));
assert.equal(flagReads, 3, "logout/reset removes capability snapshots");
client.clear();
console.log("shared read cache: coalescing, TTL, errors, reset races and account isolation PASS");
