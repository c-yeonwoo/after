import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { changeScope, isDocsOnly } from "./ci-change-scope.mjs";

test("only explicit Markdown documentation is lightweight", () => {
  assert.equal(isDocsOnly(["README.md", "docs/qa/검증 결과.md"]), true);
  for (const paths of [
    [],
    ["src/routes/index.tsx"],
    ["docs/qa.md", "src/lib/policy.ts"],
    ["docs/qa/result.json"],
    ["docs/preview.html"],
    ["docs/setup.sh"],
    ["supabase/migrations/20261017.sql"],
    [".github/workflows/release.yml"],
    ["scripts/ci-change-scope.mjs"],
    ["package-lock.json"],
    ["wrangler.jsonc"],
    ["docs/../src/README.md"],
    ["other/README.md"],
  ]) {
    assert.equal(isDocsOnly(paths), false, JSON.stringify(paths));
  }
});

test("missing, zero or malformed revisions cannot skip full checks", () => {
  for (const base of [undefined, "", "0".repeat(40), "HEAD~1", "--help"])
    assert.deepEqual(changeScope(base, "b".repeat(40)), { docsOnly: false, count: null });
  assert.equal(changeScope("a".repeat(40), undefined).docsOnly, false);
});

test("all changes are compared with the actual base, with rename detection off", () => {
  const base = "a".repeat(40);
  const head = "b".repeat(40);
  const scope = changeScope(base, head, (command, args) => {
    assert.equal(command, "git");
    assert.deepEqual(args, ["diff", "--name-only", "--no-renames", "-z", base, head, "--"]);
    return "docs/intro.md\0src/deleted.ts\0";
  });
  assert.deepEqual(scope, { docsOnly: false, count: 2 });
  assert.deepEqual(
    changeScope(base, head, () => "docs/intro.md\0"),
    { docsOnly: true, count: 1 },
  );
  assert.deepEqual(
    changeScope(base, head, () => ""),
    { docsOnly: false, count: 0 },
  );
});

test("unavailable comparison fails instead of claiming a docs-only success", () => {
  assert.throws(() =>
    changeScope("a".repeat(40), "b".repeat(40), () => {
      throw new Error("base not fetched");
    }),
  );
});

test("required quality check cannot pass failed, cancelled or missing dependencies", () => {
  const workflow = readFileSync(
    new URL("../.github/workflows/release.yml", import.meta.url),
    "utf8",
  );
  const gate = workflow
    .match(/name: Require the complete selected gate[\s\S]*?run: \|\n((?:          .*\n|\n)+)/)?.[1]
    .replace(/^          /gm, "");
  assert.ok(gate, "the actual workflow gate must be tested");
  function run(overrides = {}) {
    return () =>
      execFileSync("bash", ["--noprofile", "--norc", "-e", "-o", "pipefail", "-c", gate], {
        env: {
          ...process.env,
          SCOPE_RESULT: "success",
          RUN_FULL: "true",
          CORE_RESULT: "success",
          BROWSER_RESULT: "success",
          ...overrides,
        },
        stdio: "pipe",
      });
  }
  assert.doesNotThrow(run());
  assert.doesNotThrow(
    run({ RUN_FULL: "false", CORE_RESULT: "skipped", BROWSER_RESULT: "skipped" }),
  );
  for (const result of ["failure", "cancelled", "skipped", ""]) {
    for (const dependency of ["SCOPE_RESULT", "CORE_RESULT", "BROWSER_RESULT"]) {
      assert.throws(run({ [dependency]: result }), `${dependency}=${result}`);
    }
  }
  assert.throws(run({ RUN_FULL: "" }));
  assert.throws(run({ RUN_FULL: "false" }));
  assert.throws(run({ RUN_FULL: "false", CORE_RESULT: "skipped", BROWSER_RESULT: "failure" }));
});
