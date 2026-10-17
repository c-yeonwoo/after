import { execFileSync } from "node:child_process";
import { demoStoryUpgradeSql } from "./lib/demo-profile-stories.mjs";

// Fixed loopback DB only. Unlike e2e-seed, never resets a user's test cycle.
const args = [
  "-h",
  "127.0.0.1",
  "-p",
  "55322",
  "-U",
  "postgres",
  "-d",
  "postgres",
  "-qtA",
  "-v",
  "ON_ERROR_STOP=1",
];
const sql = (text) =>
  execFileSync("psql", [...args, "-c", text], {
    encoding: "utf8",
    env: { ...process.env, PGPASSWORD: "postgres" },
  }).trim();
const rows = JSON.parse(
  sql(`select coalesce(json_agg(json_build_object('id',id,'key',split_part(company_email,'@',1),'headline',headline)),'[]')
  from public.profiles where company_email ~ '^[mf][1-5]@verify[.]local$'
    and profile_story is null and intro=headline and not exists(
      select 1 from public.profile_interview_drafts d where d.user_id=profiles.id)`),
);
for (const row of rows) sql(demoStoryUpgradeSql(row.id, row.key, row.headline));
console.log(
  `Local fictional interview fixtures upgraded: ${rows.length}. Existing test-cycle data preserved.`,
);
