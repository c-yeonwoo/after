import { execFileSync, spawn } from "node:child_process";
import { randomUUID } from "node:crypto";

const status = execFileSync("npx", ["supabase", "status", "--output", "env"], {
  encoding: "utf8",
});
const dbUrl = status.match(/^DB_URL="?([^"\n]+)"?/m)?.[1];
if (!dbUrl || !dbUrl.includes("127.0.0.1")) throw new Error("Local Supabase DB_URL not found");

const userId = randomUUID();
const firstRequest = randomUUID();
const secondRequest = randomUUID();
const run = (sql) =>
  execFileSync("psql", [dbUrl, "-v", "ON_ERROR_STOP=1", "-Atc", sql], {
    encoding: "utf8",
  });
function session() {
  const process = spawn("psql", [dbUrl, "-X", "-q", "-A", "-t", "-v", "ON_ERROR_STOP=1"], {
    stdio: ["pipe", "pipe", "pipe"],
  });
  let error = "";
  process.stderr.on("data", (chunk) => {
    error += chunk.toString();
  });
  return { process, getError: () => error };
}
function waitForMarker(process, marker) {
  return new Promise((resolve, reject) => {
    let output = "";
    const timer = setTimeout(() => reject(new Error(`Timed out waiting for ${marker}`)), 5000);
    const onData = (chunk) => {
      output += chunk.toString();
      if (!output.includes(marker)) return;
      clearTimeout(timer);
      process.stdout.off("data", onData);
      resolve(output);
    };
    process.stdout.on("data", onData);
  });
}

let first;
let second;
try {
  run(`begin;
    insert into auth.users(id,instance_id,aud,role,email,encrypted_password,email_confirmed_at,
      created_at,updated_at) values('${userId}',
      '00000000-0000-0000-0000-000000000000','authenticated','authenticated',
      '${userId}@t.co','',now(),now(),now());
    insert into public.profiles(id,gender,hub_id,company_email,email_verified_at,name,
      onboarding_step,role) values('${userId}','female','gangnam','${userId}@t.co',
      now(),'AI 경합',7,'member');
    insert into public.ai_runs(user_id,feature,prompt_version,model,status,source_hash)
      select '${userId}','profile_copy','test','test','success',repeat(n::text,64)
      from generate_series(1,4) n;
    commit;`);

  first = session();
  const aReady = waitForMarker(first.process, "A_RESERVED:");
  first.process.stdin.write(`begin;
    select 'A_RESERVED:'||(public.reserve_ai_run('${userId}','profile_copy',
      repeat('a',64),'${firstRequest}','test','test')->>'reserved');\n`);
  if (!(await aReady).includes("A_RESERVED:true")) throw new Error("Fifth call was not reserved");

  second = session();
  const bReady = waitForMarker(second.process, "B_RESULT:");
  second.process.stdin.write(`begin;
    select 'B_RESULT:'||(public.reserve_ai_run('${userId}','profile_copy',
      repeat('b',64),'${secondRequest}','test','test')->>'reason');\n`);
  first.process.stdin.write("commit;\n");
  if (!(await bReady).includes("B_RESULT:daily_limit"))
    throw new Error("Concurrent sixth call exceeded the daily quota");

  const aExit = new Promise((resolve) => first.process.once("exit", resolve));
  const bExit = new Promise((resolve) => second.process.once("exit", resolve));
  first.process.stdin.write("\\q\n");
  second.process.stdin.write("rollback;\n\\q\n");
  if ((await aExit) !== 0 || (await bExit) !== 0)
    throw new Error(`Reservation session failed: ${first.getError()} ${second.getError()}`);
  const count = run(`select count(*) from public.ai_runs where user_id='${userId}'`).trim();
  if (count !== "5") throw new Error(`Expected five reserved/used slots, found ${count}`);
  process.stdout.write("Two-connection AI quota reservation: PASS\n");
} finally {
  if (first?.process.exitCode === null) first.process.stdin.write("rollback;\n\\q\n");
  if (second?.process.exitCode === null) second.process.stdin.write("rollback;\n\\q\n");
  run(`begin;
    delete from public.ai_runs where user_id='${userId}';
    delete from public.profiles where id='${userId}';
    delete from auth.users where id='${userId}';
    commit;`);
}
