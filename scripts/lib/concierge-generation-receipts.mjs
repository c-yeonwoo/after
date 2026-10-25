import assert from "node:assert/strict";
import { createHash, randomUUID } from "node:crypto";
import { mkdir, open, readFile, rename, unlink } from "node:fs/promises";
import { join } from "node:path";

const canonical = (value) =>
  Array.isArray(value)
    ? value.map(canonical)
    : value && typeof value === "object"
      ? Object.fromEntries(
          Object.keys(value)
            .sort()
            .map((key) => [key, canonical(value[key])]),
        )
      : value;

export function generationInputHash(feature, body) {
  const { requestId: _ignored, ...input } = body;
  return createHash("sha256")
    .update(JSON.stringify(canonical({ feature, input })))
    .digest("hex");
}

export function validateGenerationReceipt(receipt, operation, feature, body) {
  assert.equal(receipt.version, 1, "Unsupported generation receipt");
  assert.equal(receipt.operation, operation, "Generation operation changed");
  assert.equal(receipt.feature, feature, "Generation feature changed");
  assert.equal(receipt.inputHash, generationInputHash(feature, body), "Generation input changed");
  assert.match(receipt.requestId, /^[0-9a-f-]{36}$/);
}

/** Persist the reply before returning control to any assertion, lookup or UI step.
 * Only a completed HTTP 200 receipt can be resumed. All other existing states
 * require explicit investigation; this helper never retries a provider request. */
export async function recordedGeneration({ operation, feature, body, store, beforeSend, send }) {
  return store.withLock(operation, async () => {
    const existing = await store.read(operation);
    if (existing) {
      validateGenerationReceipt(existing, operation, feature, body);
      assert.equal(
        existing.state,
        "succeeded",
        "Unresolved generation receipt; automatic retry refused",
      );
      assert.equal(existing.response?.status, 200, "Invalid successful generation receipt");
      return { requestId: existing.requestId, response: existing.response, reused: true };
    }
    const receipt = {
      version: 1,
      operation,
      feature,
      inputHash: generationInputHash(feature, body),
      requestId: randomUUID(),
      state: "prepared",
    };
    await store.write(operation, receipt);
    await beforeSend?.(receipt);
    receipt.state = "posting";
    await store.write(operation, receipt);
    let response;
    try {
      response = await send({ ...body, requestId: receipt.requestId });
    } catch {
      await store.write(operation, { ...receipt, state: "unknown" });
      throw new Error("Generation response unknown; automatic retry refused");
    }
    // If this write fails, the previously persisted 'posting' state remains and
    // blocks a retry. Never discard the request ID after an unrecorded response.
    await store.write(operation, {
      ...receipt,
      state: response.status === 200 ? "succeeded" : "failed",
      response,
    });
    return { requestId: receipt.requestId, response, reused: false };
  });
}

export function fileGenerationReceipts(directory) {
  const path = (operation) => {
    assert.match(operation, /^[a-z0-9-]{1,120}$/);
    return join(directory, `${operation}.json`);
  };
  return {
    async read(operation) {
      try {
        return JSON.parse(await readFile(path(operation), "utf8"));
      } catch (error) {
        if (error.code === "ENOENT") return null;
        throw error;
      }
    },
    async write(operation, receipt) {
      await mkdir(directory, { recursive: true, mode: 0o700 });
      const destination = path(operation);
      const temporary = `${destination}.${randomUUID()}.tmp`;
      const handle = await open(temporary, "wx", 0o600);
      try {
        await handle.writeFile(JSON.stringify(receipt, null, 2));
        await handle.sync();
      } finally {
        await handle.close();
      }
      await rename(temporary, destination);
      const parent = await open(directory, "r");
      try {
        await parent.sync();
      } finally {
        await parent.close();
      }
    },
    async withLock(operation, work) {
      await mkdir(directory, { recursive: true, mode: 0o700 });
      const lockPath = `${path(operation)}.lock`;
      // An abandoned lock is intentionally not removed automatically.
      const lock = await open(lockPath, "wx", 0o600);
      try {
        return await work();
      } finally {
        await lock.close();
        await unlink(lockPath);
      }
    },
  };
}
