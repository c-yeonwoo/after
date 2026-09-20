import { execFileSync } from "node:child_process";

const url = process.argv[2] ?? "https://eclps.kr";
const expected = execFileSync("git", ["rev-parse", "--short=12", "HEAD"], {
  encoding: "utf8",
}).trim();

const response = await fetch(url, { redirect: "follow" });
if (!response.ok) {
  throw new Error(`${url} returned HTTP ${response.status}`);
}

const html = await response.text();
const match = html.match(/<meta[^>]+name=["']app-version["'][^>]+content=["']([^"']+)/i);
const actual = match?.[1];

if (!actual) throw new Error(`${url} has no app-version meta tag`);
if (actual !== expected) {
  throw new Error(`deployment mismatch: expected ${expected}, received ${actual}`);
}

console.log(`deployment verified: ${url} @ ${actual}`);
