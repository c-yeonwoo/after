import { execFileSync, spawn } from "node:child_process";
import { randomUUID } from "node:crypto";

const status = execFileSync("npx", ["supabase", "status", "--output", "env"], {
  encoding: "utf8",
});
const dbUrl = status.match(/^DB_URL="?([^"\n]+)"?/m)?.[1];
if (!dbUrl || !dbUrl.includes("127.0.0.1")) throw new Error("Local Supabase DB_URL not found");

const [maleA, maleB, female, introA, introB, ticketA, ticketB, meetA, meetB] = Array.from(
  { length: 9 },
  () => randomUUID(),
);
const slot = new Date(Date.now() + 4 * 24 * 3600 * 1000).toISOString();
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

async function waitForLock(pid) {
  for (let attempt = 0; attempt < 50; attempt += 1) {
    const waiting = run(`select wait_event_type from pg_stat_activity where pid = ${pid}`).trim();
    if (waiting === "Lock") return;
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error("Second connection never waited on the shared-member lock");
}

let first;
let second;
try {
  run(`begin;
    insert into auth.users(id, instance_id, aud, role, email, encrypted_password,
      email_confirmed_at, created_at, updated_at) values
      ('${maleA}', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', '${maleA}@t.co', '', now(), now(), now()),
      ('${maleB}', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', '${maleB}@t.co', '', now(), now(), now()),
      ('${female}', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', '${female}@t.co', '', now(), now(), now());
    insert into profiles(id, gender, hub_id, company_email, email_verified_at,
      name, onboarding_step, terms_agreed_at, privacy_agreed_at, role) values
      ('${maleA}', 'male', 'gangnam', '${maleA}@t.co', now(), '동시성 남성 A', 7, now(), now(), 'member'),
      ('${maleB}', 'male', 'gangnam', '${maleB}@t.co', now(), '동시성 남성 B', 7, now(), now(), 'member'),
      ('${female}', 'female', 'gangnam', '${female}@t.co', now(), '동시성 여성', 7, now(), now(), 'member');
    insert into intros(id, male_id, female_id) values
      ('${introA}', '${maleA}', '${female}'), ('${introB}', '${maleB}', '${female}');
    insert into tickets(id, user_id, state, kind, price_krw, intro_id, used_at) values
      ('${ticketA}', '${maleA}', 'used', 'meeting', 0, '${introA}', now()),
      ('${ticketB}', '${maleB}', 'used', 'meeting', 0, '${introB}', now());
    insert into meetings(id, intro_id, ticket_id) values
      ('${meetA}', '${introA}', '${ticketA}'), ('${meetB}', '${introB}', '${ticketB}');
    commit;`);

  first = session();
  const aReady = waitForMarker(first.process, "A_READY");
  first.process.stdin.write(
    `begin; update meetings set scheduled_at='${slot}', confirmed_at=now(), private_opens_at=now() where id='${meetA}'; select 'A_READY';\n`,
  );
  await aReady;

  second = session();
  const bReady = waitForMarker(second.process, "B_READY:");
  second.process.stdin.write("select 'B_READY:' || pg_backend_pid();\n");
  const bOutput = await bReady;
  const bPid = Number(bOutput.match(/B_READY:(\d+)/)?.[1]);
  if (!Number.isInteger(bPid)) throw new Error("Second backend PID unavailable");
  const bExit = new Promise((resolve) => second.process.once("exit", resolve));
  second.process.stdin.write(
    `begin; update meetings set scheduled_at='${slot}', confirmed_at=now(), private_opens_at=now() where id='${meetB}';\n`,
  );
  await waitForLock(bPid);

  const aExit = new Promise((resolve) => first.process.once("exit", resolve));
  first.process.stdin.write("commit;\n\\q\n");
  if ((await aExit) !== 0) throw new Error(`First confirmation failed: ${first.getError()}`);
  if ((await bExit) === 0 || !second.getError().includes("participant already has a meeting")) {
    throw new Error(`Second confirmation was not rejected: ${second.getError()}`);
  }
  const result = run(`select count(*) filter (where confirmed_at is not null),
      count(*) filter (where confirmed_at is null) from meetings where id in ('${meetA}','${meetB}')`).trim();
  if (result !== "1|1") throw new Error(`Unexpected meeting state: ${result}`);
  process.stdout.write("Two-connection same-slot confirmation: PASS\n");
} finally {
  if (first?.process.exitCode === null) first.process.stdin.write("rollback;\n\\q\n");
  if (second?.process.exitCode === null) second.process.stdin.write("rollback;\n\\q\n");
  run(`begin;
    delete from meetings where id in ('${meetA}','${meetB}');
    delete from tickets where id in ('${ticketA}','${ticketB}');
    delete from intros where id in ('${introA}','${introB}');
    delete from profiles where id in ('${maleA}','${maleB}','${female}');
    delete from auth.users where id in ('${maleA}','${maleB}','${female}');
    commit;`);
}
