import assert from "node:assert/strict";
import test from "node:test";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import {
  fileGenerationReceipts,
  recordedGeneration,
} from "./lib/concierge-generation-receipts.mjs";

function memoryStore() {
  const receipts = new Map();
  return {
    receipts,
    read: async (key) => structuredClone(receipts.get(key) ?? null),
    write: async (key, receipt) => receipts.set(key, structuredClone(receipt)),
    withLock: async (_key, work) => work(),
  };
}
const input = {
  operation: "profile-revision-gates-and-draft",
  feature: "revise-profile",
  body: { consent: true, instruction: "공개 문장의 말투만 다듬어 주세요." },
};

test("a downstream failure resumes the same successful reply and request ID without another send", async () => {
  const store = memoryStore();
  let calls = 0;
  const sentIds = [];
  const options = {
    ...input,
    store,
    send: async (body) => {
      calls++;
      sentIds.push(body.requestId);
      return { status: 200, data: { id: body.requestId, state: "ready" } };
    },
  };
  let first;
  await assert.rejects(async () => {
    first = await recordedGeneration(options);
    throw new Error("Later screenshot failed");
  }, /Later screenshot failed/);
  const resumed = await recordedGeneration({
    ...options,
    body: { ...input.body, requestId: "11111111-1111-4111-8111-111111111111" },
  });
  assert.equal(calls, 1);
  assert.equal(resumed.requestId, first.requestId);
  assert.deepEqual(resumed.response, first.response);
  assert.equal(resumed.reused, true);
  assert.deepEqual(sentIds, [first.requestId]);
});

test("a changed instruction or target cannot replace an operation's paid request", async () => {
  const store = memoryStore();
  let calls = 0;
  const options = {
    ...input,
    store,
    send: async () => {
      calls++;
      return { status: 200, data: {} };
    },
  };
  await recordedGeneration(options);
  await assert.rejects(
    recordedGeneration({ ...options, body: { ...input.body, instruction: "다른 내용" } }),
    /input changed/,
  );
  await assert.rejects(
    recordedGeneration({ ...options, body: { ...input.body, target: "other-person" } }),
    /input changed/,
  );
  assert.equal(calls, 1);
});

for (const kind of ["unknown", "failed"])
  test(`${kind} results are preserved and never resent automatically`, async () => {
    const store = memoryStore();
    let calls = 0;
    const options = {
      ...input,
      store,
      send: async () => {
        calls++;
        if (kind === "unknown") throw new Error("Transport lost after submission");
        return { status: 502, data: { code: "generation_failed" } };
      },
    };
    if (kind === "unknown") await assert.rejects(recordedGeneration(options), /response unknown/);
    else assert.equal((await recordedGeneration(options)).response.status, 502);
    await assert.rejects(recordedGeneration(options), /automatic retry refused/);
    assert.equal(calls, 1);
    assert.equal(store.receipts.get(input.operation).state, kind);
  });

test("a successful HTTP reply whose receipt write fails leaves posting and forbids another send", async () => {
  const store = memoryStore();
  const write = store.write;
  store.write = async (key, receipt) => {
    if (receipt.state === "succeeded") throw new Error("Disk unavailable");
    await write(key, receipt);
  };
  let calls = 0;
  const options = {
    ...input,
    store,
    send: async () => {
      calls++;
      return { status: 200, data: {} };
    },
  };
  await assert.rejects(recordedGeneration(options), /Disk unavailable/);
  await assert.rejects(recordedGeneration(options), /automatic retry refused/);
  assert.equal(calls, 1);
  assert.equal(store.receipts.get(input.operation).state, "posting");
});

test("file-backed receipts survive a new store instance and serialize concurrent operation execution", async () => {
  const directory = await mkdtemp(join(tmpdir(), "after-generation-receipt-test-"));
  let calls = 0;
  let release;
  const wait = new Promise((resolve) => {
    release = resolve;
  });
  try {
    const store = fileGenerationReceipts(directory);
    const first = recordedGeneration({
      ...input,
      store,
      send: async () => {
        calls++;
        await wait;
        return { status: 200, data: { verified: true } };
      },
    });
    // Wait for the fake send to own the lock before testing a competing caller.
    while (!calls) await new Promise((resolve) => setImmediate(resolve));
    await assert.rejects(
      recordedGeneration({
        ...input,
        store,
        send: async () => {
          calls++;
          return { status: 200 };
        },
      }),
      /EEXIST/,
    );
    release();
    const completed = await first;
    const persisted = JSON.parse(
      await readFile(join(directory, `${input.operation}.json`), "utf8"),
    );
    assert.equal(persisted.state, "succeeded");
    const resumed = await recordedGeneration({
      ...input,
      store: fileGenerationReceipts(directory),
      send: async () => {
        calls++;
        throw new Error("Must not be called");
      },
    });
    assert.deepEqual(resumed.response, completed.response);
    assert.equal(resumed.requestId, completed.requestId);
    assert.equal(calls, 1);
  } finally {
    release();
    await rm(directory, { recursive: true, force: true });
  }
});
