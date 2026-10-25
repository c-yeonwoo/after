import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, writeFileSync, unlinkSync } from "node:fs";
import { resolve } from "node:path";
import { createClient } from "@supabase/supabase-js";
import { chromium } from "playwright";

export const marker = "after-manual-cycle-v1";
export const password = "AfterLocal!2026"; // Deliberately public LOCAL fixture only.
export function localEnvironment() {
  let env;
  try {
    env = JSON.parse(
      execFileSync("npx", ["supabase", "status", "-o", "json"], {
        encoding: "utf8",
        stdio: ["ignore", "pipe", "pipe"],
      }),
    );
  } catch {
    // A child-process exception includes captured stdout, which may contain
    // local API keys. Keep status diagnostics out of test failure reports.
    throw new Error("Local Supabase status unavailable");
  }
  assert.match(env.API_URL, /^http:\/\/127\.0\.0\.1:\d+$/);
  assert.equal(new URL(env.DB_URL).hostname, "127.0.0.1");
  return env;
}
export const quote = (value) => "'" + String(value).replaceAll("'", "''") + "'";
export function database(env, query) {
  return execFileSync("psql", [env.DB_URL, "-v", "ON_ERROR_STOP=1", "-Atc", query], {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  }).trim();
}
export function manifestPath(tag = "manual") {
  assert.match(tag, /^[a-z0-9-]{1,32}$/);
  return resolve(`.assistant-cycle-${tag}.local`);
}
export function readManifest(env, tag = "manual") {
  const manifest = JSON.parse(readFileSync(manifestPath(tag), "utf8"));
  assert.equal(manifest.marker, marker);
  assert.equal(manifest.api, env.API_URL);
  assert.equal(manifest.tag, tag);
  assert.equal(manifest.ready, true, "Fixture preparation is not complete");
  for (const account of Object.values(manifest.accounts)) {
    assert.match(account.id, /^[0-9a-f-]{36}$/);
    assert.equal(
      database(
        env,
        `select raw_app_meta_data->>'manual_cycle' from auth.users where id=${quote(account.id)} and raw_app_meta_data->>'manual_cycle_tag'=${quote(tag)}`,
      ),
      marker,
    );
  }
  return manifest;
}

/** Explicit recovery only for an incomplete, unused, owned fixture. */
export async function recoverIncompleteCycle(env, tag = "manual") {
  const manifest = JSON.parse(readFileSync(manifestPath(tag), "utf8"));
  assert.equal(manifest.marker, marker);
  assert.equal(manifest.api, env.API_URL);
  assert.equal(manifest.tag, tag);
  assert.equal(manifest.ready, false, "A completed fixture must never be recovered or reset");
  const ids = [];
  for (const role of ["male", "female", "admin"]) {
    const user = JSON.parse(
      database(
        env,
        `select coalesce((select json_build_object('id',id,'marker',raw_app_meta_data->>'manual_cycle','tag',raw_app_meta_data->>'manual_cycle_tag') from auth.users where email=${quote(`cycle-${tag}-${role}@verify.local`)}),'null'::json)`,
      ),
    );
    if (!user) continue;
    assert.equal(user.marker, marker, "Refusing to adopt an unrelated user");
    assert.equal(user.tag, tag);
    if (manifest.accounts[role]) assert.equal(manifest.accounts[role].id, user.id);
    ids.push(user.id);
  }
  if (ids.length) {
    const list = ids.map(quote).join(",");
    for (const [table, condition] of [
      ["affinities", `from_id in (${list}) or to_id in (${list})`],
      ["intro_queue", `male_id in (${list}) or female_id in (${list})`],
      ["intros", `male_id in (${list}) or female_id in (${list})`],
      ["pair_brief_drafts", `male_id in (${list}) or female_id in (${list})`],
      ["tickets", `user_id in (${list})`],
      ["ticket_orders", `user_id in (${list})`],
      ["profile_interview_drafts", `user_id in (${list})`],
      ["assistant_turns", `owner_id in (${list})`],
      ["assistant_memories", `owner_id in (${list})`],
      ["assistant_preferences", `owner_id in (${list})`],
      ["feedbacks", `author_id in (${list})`],
    ])
      assert.equal(
        database(env, `select count(*) from ${table} where ${condition}`),
        "0",
        "Fixture has activity; recovery refused",
      );
    const service = createClient(env.API_URL, env.SERVICE_ROLE_KEY, {
      auth: { persistSession: false },
    });
    // Resolve every storage target before deleting anything. Do not erase photos
    // uploaded by a person after an incomplete fixture was created.
    const files = [];
    for (const id of ids) {
      const found = await service.storage.from("profile-photos").list(id, { limit: 100 });
      assert.ifError(found.error);
      assert.ok(
        found.data.every((file) => /^manual-cycle-[012]\.png$/.test(file.name)),
        "Non-fixture photo found; recovery refused",
      );
      files.push(...found.data.map((file) => `${id}/${file.name}`));
    }
    if (files.length)
      assert.ifError((await service.storage.from("profile-photos").remove(files)).error);
    for (const id of ids) assert.ifError((await service.auth.admin.deleteUser(id)).error);
  }
  unlinkSync(manifestPath(tag));
  return { recoveredIncompleteFixture: tag, removedUnusedSyntheticAccounts: ids.length };
}
export function legacyFingerprint(env) {
  // Only hashes leave Postgres; private text is never printed or copied to a model.
  const ids =
    "select id from auth.users where email in ('assistant-male@verify.local','assistant-female@verify.local','assistant-admin@verify.local')";
  const tables = [
    ["profiles", `id in (${ids})`],
    ["affinities", `from_id in (${ids}) or to_id in (${ids})`],
    ["intros", `male_id in (${ids}) or female_id in (${ids})`],
    ["intro_queue", `male_id in (${ids}) or female_id in (${ids})`],
    [
      "meetings",
      `intro_id in (select id from intros where male_id in (${ids}) or female_id in (${ids}))`,
    ],
    ["tickets", `user_id in (${ids})`],
    ["ticket_orders", `user_id in (${ids})`],
    ["assistant_turns", `owner_id in (${ids})`],
    ["assistant_memories", `owner_id in (${ids})`],
    ["assistant_preferences", `owner_id in (${ids})`],
    ["feedbacks", `author_id in (${ids})`],
    ["app_settings", "true"],
  ];
  return Object.fromEntries(
    tables.map(([table, condition]) => [
      table,
      database(
        env,
        `select md5(coalesce(string_agg(row_to_json(t)::text,'' order by row_to_json(t)::text),'')) from ${table} t where ${condition}`,
      ),
    ]),
  );
}

/** Every existing public row is hashed inside Postgres. New QA rows can be added,
 * but no pre-existing row (including a participant's manual cycle) may change. */
export function existingPublicRecordHashes(env) {
  const tables = JSON.parse(
    database(
      env,
      "select coalesce(json_agg(tablename order by tablename),'[]') from pg_tables where schemaname='public'",
    ),
  );
  return Object.fromEntries(
    tables.map((table) => {
      assert.match(table, /^[a-z0-9_]+$/);
      const rows = JSON.parse(
        database(
          env,
          `select coalesce(json_agg(hash order by hash),'[]') from (select md5(to_jsonb(t)::text) hash from public.${table} t) rows`,
        ),
      );
      return [table, rows];
    }),
  );
}
export function assertExistingPublicRecordsPreserved(before, after) {
  for (const [table, hashes] of Object.entries(before)) {
    const remaining = new Map();
    for (const hash of after[table] ?? []) remaining.set(hash, (remaining.get(hash) ?? 0) + 1);
    for (const hash of hashes) {
      assert.ok((remaining.get(hash) ?? 0) > 0, `Existing ${table} record was changed or removed`);
      remaining.set(hash, remaining.get(hash) - 1);
    }
  }
}
export async function prepareCycle(env, tag = "manual") {
  if (existsSync(manifestPath(tag))) {
    const saved = JSON.parse(readFileSync(manifestPath(tag), "utf8"));
    assert.notEqual(
      saved.ready,
      false,
      `Incomplete preparation. Run npm run assistant:cycle -- recover-incomplete ${tag}, then prepare again. Completed fixtures are never reset.`,
    );
    return readManifest(env, tag); // Never reset a participant's progress.
  }
  assert.equal(
    database(
      env,
      "select payments_enabled and assistant_chat_enabled and assistant_memory_enabled and assistant_schedule_enabled from app_settings",
    ),
    "t",
    "Shared local flags must already be enabled; this utility does not change them",
  );
  const hub = ["jongno", "yeouido", "pangyo"].find(
    (id) => database(env, `select count(*) from profiles where hub_id=${quote(id)}`) === "0",
  );
  assert.ok(hub, "An empty local hub is required; refusing to mix existing participants");
  const accounts = {};
  const manifest = { marker, api: env.API_URL, tag, hub, ready: false, accounts };
  writeFileSync(manifestPath(tag), JSON.stringify(manifest), { mode: 0o600, flag: "wx" });
  const service = createClient(env.API_URL, env.SERVICE_ROLE_KEY, {
    auth: { persistSession: false },
  });
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage();
    for (const [key, name, job, gender] of [
      ["male", "테스트 지훈", "소프트웨어 엔지니어", "male"],
      ["female", "테스트 지안", "브랜드 디자이너", "female"],
      ["admin", "수동 테스트 운영자", "테스트 운영", "male"],
    ]) {
      const email = `cycle-${tag}-${key}@verify.local`;
      assert.equal(
        database(env, `select count(*) from auth.users where email=${quote(email)}`),
        "0",
        "Refusing to adopt existing account",
      );
      const user = await service.auth.admin.createUser({
        email,
        password,
        email_confirm: true,
        app_metadata: { manual_cycle: marker, manual_cycle_tag: tag },
      });
      assert.ifError(user.error);
      const id = user.data.user.id;
      accounts[key] = { id, email, name, gender, password };
      writeFileSync(manifestPath(tag), JSON.stringify(manifest), { mode: 0o600 });
      const photos = [];
      for (let index = 0; index < 3; index++) {
        const pixels = await page.evaluate(
          ({ index, key }) => {
            const canvas = document.createElement("canvas");
            canvas.width = 480;
            canvas.height = 640;
            const pen = canvas.getContext("2d");
            pen.fillStyle = ["#e5e7eb", "#ffd7bd", "#d5e2d9"][index];
            pen.fillRect(0, 0, 480, 640);
            pen.fillStyle = "#17191d";
            pen.font = "bold 24px sans-serif";
            pen.fillText(`LOCAL TEST ${key.toUpperCase()}`, 34, 285);
            pen.font = "18px sans-serif";
            pen.fillText("SYNTHETIC PROFILE / NOT A REAL PERSON", 34, 325);
            pen.fillText(`PHOTO ${index + 1} / 3`, 34, 365);
            return canvas.toDataURL("image/png").split(",")[1];
          },
          { index, key },
        );
        const path = `${id}/manual-cycle-${index}.png`;
        assert.ifError(
          (
            await service.storage
              .from("profile-photos")
              .upload(path, Buffer.from(pixels, "base64"), {
                contentType: "image/png",
                upsert: false,
              })
          ).error,
        );
        photos.push(path);
      }
      const answers = [
        "퇴근길에 동네 서점에 들르거나 음악을 들으며 걸어요. 최근에는 수영을 배우고 있어요.",
        "처음에는 조용한 카페에서 커피 한 잔 마시며 천천히 알아가고 싶어요.",
        "최근 본 전시나 좋아하는 산책길 이야기를 편하게 나누고 싶어요.",
      ];
      const story = {
        version: 3,
        headline: "서로의 일상을 다정하게 궁금해하는 사람",
        summary: answers[0],
        sections: answers.map((answer, i) => ({
          id: ["daily_life", "getting_closer", "conversation"][i],
          questionId: ["daily_life_v1", "getting_closer_v1", "conversation_v1"][i],
          questionVersion: 1,
          question: [
            "퇴근 후에는 어떻게 보내세요?",
            "어떤 만남에서 편해지나요?",
            "만나면 어떤 이야기를 나누고 싶나요?",
          ][i],
          answer,
        })),
        conversationHooks: [],
        publishedRevision: 1,
      };
      database(
        env,
        `insert into profiles(id,gender,hub_id,company_email,email_verified_at,name,birth,job,mbti,smoking,drinking,religion,headline,intro,profile_story,profile_preferences,photo_paths,photo_state,onboarding_step,terms_agreed_at,privacy_agreed_at,agreed_policy_version,phone_verified_at,role,paused_at)
        values(${quote(id)},${quote(gender)},${quote(hub)},${quote(email)},now(),${quote(name)},'1997-05-10',${quote(job)},${quote(key === "female" ? "ENFP" : "INFJ")},'none','social','none',${quote(story.headline)},${quote(answers.join(" "))},${quote(JSON.stringify(story))}::jsonb,'{"version":1,"choices":{"first_date":["짧게 커피"]},"choiceCustom":{}}',array[${photos.map(quote)}],'approved',7,now(),now(),'2026-10-17.3',now(),${quote(key === "admin" ? "admin" : "member")},${key === "admin" ? "now()" : "null"});`,
      );
    }
    // No affinity, queue, ticket, order, intro or meeting is seeded.
    manifest.ready = true;
    writeFileSync(manifestPath(tag), JSON.stringify(manifest, null, 2), { mode: 0o600 });
    return manifest;
  } finally {
    await browser.close();
  }
}

export function cycleStatus(env, manifest) {
  const male = quote(manifest.accounts.male.id),
    female = quote(manifest.accounts.female.id);
  const summary = JSON.parse(
    database(
      env,
      `select json_build_object(
    'likes',(select count(*) from affinities where from_id=${female} and to_id=${male} and verdict='like'),
    'queue',(select count(*) from intro_queue where male_id=${male} and female_id=${female}),
    'intros',(select count(*) from intros where male_id=${male} and female_id=${female}),
    'orders',(select count(*) from ticket_orders where user_id=${male}),
    'tickets',(select count(*) from tickets where user_id=${male}),
    'meetings',(select count(*) from meetings where intro_id in (select id from intros where male_id=${male} and female_id=${female})),
    'meetingId',(select m.id from meetings m join intros i on i.id=m.intro_id where i.male_id=${male} and i.female_id=${female} and m.cancelled_at is null order by m.created_at desc limit 1));`,
    ),
  );
  return {
    url: "http://127.0.0.1:5191/login",
    tag: manifest.tag,
    hub: manifest.hub,
    accounts: manifest.accounts,
    ...summary,
  };
}
