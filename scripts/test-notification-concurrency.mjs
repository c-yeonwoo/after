import { execFileSync, spawn } from "node:child_process";
import { randomUUID } from "node:crypto";

const status = execFileSync("npx", ["supabase", "status", "--output", "env"], {
  encoding: "utf8",
});
const dbUrl = status.match(/^DB_URL="?([^"\n]+)"?/m)?.[1];
if (!dbUrl || !dbUrl.includes("127.0.0.1")) throw new Error("Local Supabase DB_URL not found");

const userId = randomUUID();
const notificationId = randomUUID();
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
    insert into auth.users(id, instance_id, aud, role, email, encrypted_password,
      email_confirmed_at, created_at, updated_at) values
      ('${userId}', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
       '${userId}@t.co', '', now(), now(), now());
    insert into profiles(id, gender, hub_id, company_email, email_verified_at,
      name, onboarding_step, role) values
      ('${userId}', 'female', 'gangnam', '${userId}@t.co', now(), '알림 경합', 7, 'member');
    insert into notifications(id, user_id, kind, created_at)
      values ('${notificationId}', '${userId}', 'candidates_refilled', '2000-01-01');
    commit;`);

  first = session();
  const aReady = waitForMarker(first.process, "A_CLAIMED:");
  first.process.stdin.write(`begin;
    set local role service_role;
    set local request.jwt.claims = '{"role":"service_role"}';
    select 'A_CLAIMED:' || count(*) from claim_notification_dispatches(1)
      where id = '${notificationId}';\n`);
  const aResult = await aReady;
  if (!aResult.includes("A_CLAIMED:1")) throw new Error("First worker did not claim test row");

  second = session();
  const bReady = waitForMarker(second.process, "B_CLAIMED:");
  second.process.stdin.write(`begin;
    set local role service_role;
    set local request.jwt.claims = '{"role":"service_role"}';
    select 'B_CLAIMED:' || count(*) from claim_notification_dispatches(50)
      where id = '${notificationId}';\n`);
  const bResult = await bReady;
  if (!bResult.includes("B_CLAIMED:0")) throw new Error("Second worker claimed locked row");

  const aExit = new Promise((resolve) => first.process.once("exit", resolve));
  const bExit = new Promise((resolve) => second.process.once("exit", resolve));
  first.process.stdin.write("rollback;\n\\q\n");
  second.process.stdin.write("rollback;\n\\q\n");
  if ((await aExit) !== 0 || (await bExit) !== 0) {
    throw new Error(`Worker session failed: ${first.getError()} ${second.getError()}`);
  }
  process.stdout.write("Two-connection notification claim: PASS\n");
} finally {
  if (first?.process.exitCode === null) first.process.stdin.write("rollback;\n\\q\n");
  if (second?.process.exitCode === null) second.process.stdin.write("rollback;\n\\q\n");
  run(`begin;
    delete from notifications where id = '${notificationId}';
    delete from profiles where id = '${userId}';
    delete from auth.users where id = '${userId}';
    commit;`);
}
