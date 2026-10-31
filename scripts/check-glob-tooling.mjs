import assert from "node:assert/strict";
import fs from "node:fs";
import { mkdtemp, mkdir, writeFile, readdir, rm } from "node:fs/promises";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { setTimeout } from "node:timers/promises";
import test from "node:test";
import { ESLint } from "eslint";

const require = createRequire(import.meta.url);
const cliRequire = createRequire(require.resolve("@capacitor/cli/package.json"));
const rimrafRequire = createRequire(cliRequire.resolve("rimraf"));
const { glob } = rimrafRequire("glob");

test("ESLint still enforces Hooks through the real TypeScript flat configuration", async () => {
  const eslint = new ESLint();
  const config = await eslint.calculateConfigForFile("src/ToolingProbe.tsx");
  assert.equal(config.rules["react-hooks/rules-of-hooks"][0], 2);
  assert.equal(config.rules["react-hooks/exhaustive-deps"][0], 1);
  const [result] = await eslint.lintText(
    'import { useState } from "react";\nexport function Probe({ show }: { show: boolean }) {\n  if (show) useState(0);\n  return null;\n}\n',
    { filePath: "src/ToolingProbe.tsx" },
  );
  assert.ok(result.messages.some((message) => message.ruleId === "react-hooks/rules-of-hooks"));
});

test("Capacitor's rimraf removes matching disposable files and preserves the rest", async (t) => {
  const directory = await mkdtemp(join(tmpdir(), "after-glob-compat-"));
  t.after(() => rm(directory, { recursive: true, force: true }));
  await Promise.all(
    ["remove-a.txt", "remove-b.txt", "keep.txt"].map((file) =>
      writeFile(join(directory, file), "synthetic tooling fixture"),
    ),
  );
  await cliRequire("rimraf").rimraf(join(directory, "remove-*.txt"), { glob: true });
  assert.deepEqual(await readdir(directory), ["keep.txt"]);
});

test("the CLI's glob stops directory traversal when aborted during the first read", async (t) => {
  const directory = await mkdtemp(join(tmpdir(), "after-glob-abort-"));
  t.after(() => rm(directory, { recursive: true, force: true }));
  await Promise.all(
    Array.from({ length: 8 }, (_, index) =>
      mkdir(join(directory, `branch-${index}`, "nested"), { recursive: true }),
    ),
  );
  const controller = new AbortController();
  const reason = new Error("synthetic traversal cancellation");
  let reads = 0;
  const instrumentedFs = {
    ...fs,
    readdir(path, options, callback) {
      reads++;
      fs.readdir(path, options, (error, entries) => {
        if (!controller.signal.aborted) controller.abort(reason);
        callback(error, entries);
      });
    },
  };
  await assert.rejects(
    glob("**/*", { cwd: directory, signal: controller.signal, fs: instrumentedFs }),
    (error) => error === reason,
  );
  // The vulnerable release rejects too, then keeps reading in the background.
  await setTimeout(75);
  assert.equal(reads, 1, "no child directory is read after cancellation");
});
