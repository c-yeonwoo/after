import { execFileSync } from "node:child_process";
import { appendFileSync } from "node:fs";
import { pathToFileURL } from "node:url";

// Fail closed: only prose documents are exempt. JSON evidence, HTML previews,
// policies in src/, scripts and workflow/config changes always run every gate.
export function isDocsOnly(paths) {
  return (
    paths.length > 0 &&
    paths.every(
      (path) =>
        (path === "README.md" || (path.startsWith("docs/") && path.endsWith(".md"))) &&
        !path.split("/").some((part) => part === ".." || part === "." || part === ""),
    )
  );
}

export function changeScope(base, head, git = execFileSync) {
  const commit = /^[a-f0-9]{40,64}$/;
  if (!commit.test(base ?? "") || !commit.test(head ?? "") || /^0+$/.test(base)) {
    return { docsOnly: false, count: null };
  }
  // --no-renames includes BOTH paths of a rename, preventing a code->docs move
  // from being misclassified. Compare the PR's tested merge tree, not HEAD~1.
  const paths = git("git", ["diff", "--name-only", "--no-renames", "-z", base, head, "--"], {
    encoding: "utf8",
  })
    .split("\0")
    .filter(Boolean);
  return { docsOnly: isDocsOnly(paths), count: paths.length };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const scope = changeScope(process.env.CI_DIFF_BASE, process.env.CI_DIFF_HEAD);
  const result = `run_full=${!scope.docsOnly}\n`;
  if (process.env.GITHUB_OUTPUT) appendFileSync(process.env.GITHUB_OUTPUT, result);
  console.log(`${scope.docsOnly ? "docs-only" : "full"} gate (${scope.count ?? "unknown"} paths)`);
}
