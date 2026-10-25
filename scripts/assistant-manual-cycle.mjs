import assert from "node:assert/strict";
import {
  localEnvironment,
  prepareCycle,
  recoverIncompleteCycle,
  readManifest,
  cycleStatus,
  legacyFingerprint,
  database,
  quote,
} from "./lib/manual-cycle-fixtures.mjs";

const [command = "status", tag = "manual"] = process.argv.slice(2);
assert.ok(
  ["prepare", "status", "dev", "checkin", "feedback", "recover-incomplete"].includes(command),
);
const env = localEnvironment();
const before = legacyFingerprint(env);
if (command === "recover-incomplete") {
  const result = await recoverIncompleteCycle(env, tag);
  assert.deepEqual(legacyFingerprint(env), before);
  console.log(JSON.stringify(result));
} else {
  const manifest = command === "prepare" ? await prepareCycle(env, tag) : readManifest(env, tag);
  if (command === "dev") {
    const { startManualServer } = await import("./lib/manual-cycle-server.mjs");
    const server = await startManualServer(env, tag);
    const close = async () => {
      await server.close();
      process.exit(0);
    };
    process.on("SIGINT", close);
    process.on("SIGTERM", close);
  } else {
    if (command === "checkin" || command === "feedback") {
      const current = cycleStatus(env, manifest).meetingId;
      assert.ok(current, "Create a meeting first");
      assert.equal(
        database(
          env,
          `select confirmed_at is not null and cancelled_at is null and completed_at is null from meetings where id=${quote(current)}`,
        ),
        "t",
        "Confirm an active meeting first",
      );
      const when = command === "checkin" ? "now()+interval '20 hours'" : "now()-interval '2 hours'";
      database(
        env,
        `begin;
      create temporary table manual_attendance as select male_attendance_at,female_attendance_at from meetings where id=${quote(current)};
      update meetings set scheduled_at=${when},proposed_slots=array[${when}],accepted_slot=0,private_opens_at=now()-interval '1 hour' where id=${quote(current)};
      update meetings set male_attendance_at=(select male_attendance_at from manual_attendance),female_attendance_at=(select female_attendance_at from manual_attendance) where id=${quote(current)};
      commit;`,
      );
    }
    assert.deepEqual(
      legacyFingerprint(env),
      before,
      "Existing lab records/settings must remain unchanged",
    );
    console.log(
      JSON.stringify(
        { localOnly: true, ...cycleStatus(env, manifest), existingRecordsUnchanged: true },
        null,
        2,
      ),
    );
  }
}
