import assert from "node:assert/strict";
import { execFileSync, spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
const status = execFileSync("npx", ["supabase", "status", "--output", "env"], { encoding: "utf8" });
const dbUrl = status.match(/^DB_URL="?([^"\n]+)"?/m)?.[1];
if (!dbUrl || new URL(dbUrl).hostname !== "127.0.0.1") throw new Error("Local DB only");
const run = (sql) =>
  execFileSync("psql", [dbUrl, "-v", "ON_ERROR_STOP=1", "-Atc", sql], { encoding: "utf8" }).trim();
const ids = Array.from({ length: 4 }, () => randomUUID());
const existing = Number(
  run(
    "select count(*) from public.ai_budget_ledger where created_at >= date_trunc('day',now() at time zone 'Asia/Seoul') at time zone 'Asia/Seoul'",
  ),
);
if (existing) throw new Error("Use a clean isolated QA DB; existing usage will not be deleted");
try {
  const results = await Promise.all(
    ids.map(
      (id) =>
        new Promise((resolve, reject) => {
          const child = spawn("psql", [
            dbUrl,
            "-v",
            "ON_ERROR_STOP=1",
            "-Atc",
            `select public.reserve_ai_budget('${id}','claude-sonnet-5-5',1000)`,
          ]);
          let output = "";
          child.stdout.on("data", (chunk) => (output += chunk));
          child.on("error", reject);
          child.on("close", (code) =>
            code === 0 ? resolve(output.trim()) : reject(new Error("Budget SQL failed")),
          );
        }),
    ),
  );
  assert.equal(
    results.filter((x) => x === "t").length,
    3,
    "four simultaneous requests cannot exceed 3000 KRW",
  );
  assert.equal(results.filter((x) => x === "f").length, 1);
  console.log("Global AI budget: four concurrent requests / three reservations PASS");
} finally {
  run(`delete from public.ai_budget_ledger where id in (${ids.map((id) => `'${id}'`).join(",")})`);
}
