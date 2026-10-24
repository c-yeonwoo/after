import assert from "node:assert/strict";
import { execFileSync, spawn } from "node:child_process";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { createClient } from "@supabase/supabase-js";
import { chromium } from "playwright";

// This utility has no remote mode. Never accept DB/API URLs from caller input.
const env = JSON.parse(
  execFileSync("npx", ["supabase", "status", "-o", "json"], {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  }),
);
assert.match(env.API_URL, /^http:\/\/127\.0\.0\.1:\d+$/);
assert.equal(new URL(env.DB_URL).hostname, "127.0.0.1");
const sql = (s) =>
  execFileSync("psql", [env.DB_URL, "-v", "ON_ERROR_STOP=1", "-Atc", s], {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  }).trim();
const q = (v) => "'" + String(v).replaceAll("'", "''") + "'";
const service = createClient(env.API_URL, env.SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});
const file = resolve(".assistant-lab.local"); // *.local is gitignored.
const marker = "after-assistant-local-lab-v1";
const password = "AfterLocal!2026"; // Deliberately public LOCAL fixture password.
const people = [
  {
    key: "male",
    email: "assistant-male@verify.local",
    name: "테스트 민준",
    gender: "male",
    job: "서비스 기획자",
    birth: "1997-06-21",
    mbti: "INFP",
    headline: "작은 일상을 다정하게 나누고 싶어요.",
    answers: [
      "퇴근 후에는 동네를 걸으며 작은 카페를 찾아요. 주말에는 독립영화를 보고 마음에 남는 장면을 기록합니다.",
      "첫 만남은 조용한 카페에서 짧게 이야기하면 편해요. 서로 말할 틈을 주는 대화가 좋아요.",
      "요즘 배우기 시작한 수영이나 새로 발견한 카페 이야기를 나누고 싶어요.",
    ],
  },
  {
    key: "female",
    email: "assistant-female@verify.local",
    name: "테스트 서연",
    gender: "female",
    job: "브랜드 디자이너",
    birth: "1998-04-12",
    mbti: "ENFP",
    headline: "서로의 하루에 작은 즐거움이 되고 싶어요.",
    answers: [
      "퇴근하고 동네 서점에 들르거나 산책해요. 주말에는 작은 전시를 보러 가는 걸 좋아합니다.",
      "처음부터 많은 약속을 하기보다는 커피 한 잔을 마시며 편하게 알아가고 싶어요. 서로의 취향을 존중하는 대화가 좋아요.",
      "최근 기억에 남은 전시와 좋아하는 산책길 이야기가 궁금해요. 사소한 일상도 함께 나누고 싶어요.",
    ],
  },
  {
    key: "admin",
    email: "assistant-admin@verify.local",
    name: "비서 테스트 운영자",
    gender: "male",
    job: "로컬 QA 운영",
    birth: "1990-01-01",
    mbti: null,
    headline: "로컬 테스트 운영 계정",
    answers: [
      "운영 화면 확인을 위한 합성 계정입니다.",
      "실제 회원이 아닙니다.",
      "이 계정은 소개 후보에서 제외합니다.",
    ],
  },
];
const args = process.argv.slice(2);
const command = args[0] ?? "prepare";
assert.ok(
  ["prepare", "reset", "status", "checkin", "feedback", "off", "dev"].includes(command),
  "Unknown command",
);
const stage = args.includes("--schedule") ? "schedule" : "intro";
const saved = existsSync(file) ? JSON.parse(readFileSync(file, "utf8")) : null;
if (saved) assert.equal(saved.api, env.API_URL, "Fixture belongs to another local stack");
const identities = Object.fromEntries(
  people.map((person) => [
    person.key,
    {
      ...person,
      id: sql(`select id from auth.users where email=${q(person.email)}`) || null,
    },
  ]),
);
for (const person of Object.values(identities)) {
  if (person.id)
    assert.equal(
      sql(`select raw_app_meta_data->>'local_lab' from auth.users where id=${q(person.id)}`),
      marker,
      `Refusing to adopt an existing unowned account: ${person.email}`,
    );
}
const mainIds = () => [identities.male.id, identities.female.id].map(q).join(",");
function assertOwnedRelationships() {
  const ids = [identities.male.id, identities.female.id].filter(Boolean).map(q).join(",");
  if (!ids) return;
  for (const table of ["intros", "intro_queue", "pair_brief_drafts"])
    assert.equal(
      sql(`select count(*) from ${table}
      where (male_id in (${ids}) or female_id in (${ids}))
      and not (male_id in (${ids}) and female_id in (${ids}))`),
      "0",
      `${table}: external relationships exist; refusing automatic fixture changes`,
    );
}
const claims = (id) =>
  `set local request.jwt.claims=${q(JSON.stringify({ sub: id, role: "authenticated", aal: "aal2" }))};`;
const meeting = () =>
  sql(`select m.id from meetings m join intros i on i.id=m.intro_id
  where i.male_id=${q(identities.male.id)} and i.female_id=${q(identities.female.id)}
  and m.cancelled_at is null order by m.created_at desc limit 1`);
function status() {
  const current = identities.male.id && identities.female.id ? meeting() : null;
  console.log(
    JSON.stringify(
      {
        localOnly: true,
        api: env.API_URL,
        url: "http://127.0.0.1:5190/login",
        accounts: people.map((p) => ({ role: p.key, email: p.email })),
        meetingId: current || null,
        suggestedDate: sql(
          "select ((date_trunc('week', now() at time zone 'Asia/Seoul')+interval '7 days')::date)::text",
        ),
        flags: JSON.parse(
          sql(
            "select json_build_object('chat',assistant_chat_enabled,'memory',assistant_memory_enabled,'schedule',assistant_schedule_enabled) from app_settings",
          ),
        ),
        credentialsFile: file,
        feedbackUrl: current ? `http://127.0.0.1:5190/feedback?meetingId=${current}` : null,
      },
      null,
      2,
    ),
  );
}
if (command === "dev") {
  assert.ok(
    saved?.ready === true &&
      Object.values(identities).every((p) => p.id && saved.accounts?.[p.key]?.id === p.id),
    "Prepare fixtures first",
  );
  const server = spawn(
    process.execPath,
    ["node_modules/vite/bin/vite.js", "--host", "127.0.0.1", "--port", "5190", "--strictPort"],
    {
      stdio: "inherit",
      env: {
        ...process.env,
        VITE_SUPABASE_URL: env.API_URL,
        VITE_SUPABASE_ANON_KEY: env.ANON_KEY,
        VITE_CARRIER_IDENTITY_ENABLED: "false",
        VITE_TOSS_CLIENT_KEY: "", // No checkout launch from this local assistant lab.
      },
    },
  );
  for (const signal of ["SIGTERM", "SIGINT"]) process.on(signal, () => server.kill(signal));
  server.on("exit", (code) => process.exit(code ?? 0));
} else if (command === "status") {
  status();
} else if (command === "off") {
  sql(
    "update app_settings set assistant_chat_enabled=false,assistant_memory_enabled=false,assistant_schedule_enabled=false",
  );
  status();
} else if (["checkin", "feedback"].includes(command)) {
  assert.ok(
    Object.values(identities).every((p) => p.id),
    "Prepare fixtures first",
  );
  const id = meeting();
  assert.ok(id, "Create the meeting first");
  assert.equal(
    sql(`select confirmed_at is not null from meetings where id=${q(id)}`),
    "t",
    "Confirm the meeting first",
  );
  // Move only this lab appointment to simulate elapsed time. Do not call global workers.
  const when = command === "checkin" ? "now()+interval '20 hours'" : "now()-interval '2 hours'";
  sql(`begin;
    create temporary table lab_attendance as select male_attendance_at,female_attendance_at from meetings where id=${q(id)};
    update meetings set scheduled_at=${when},proposed_slots=array[${when}],accepted_slot=0,
      private_opens_at=now()-interval '1 hour' where id=${q(id)};
    update meetings set male_attendance_at=(select male_attendance_at from lab_attendance),
      female_attendance_at=(select female_attendance_at from lab_attendance) where id=${q(id)};
    commit;`);
  console.log(`Local clock fixture: ${command}. Refresh the app.`);
  status();
} else {
  const existing = Object.values(identities).every((p) => p.id);
  assertOwnedRelationships();
  const complete =
    existing &&
    saved?.ready === true &&
    Object.values(identities).every((p) => saved.accounts?.[p.key]?.id === p.id) &&
    sql(
      `select count(*) from profiles where id in (${Object.values(identities)
        .map((p) => q(p.id))
        .join(",")})`,
    ) === "3";
  if (complete && command === "prepare") {
    sql(
      "update app_settings set assistant_chat_enabled=true,assistant_memory_enabled=true,assistant_schedule_enabled=true",
    );
    status();
  } else {
    writeFileSync(file, JSON.stringify({ marker, api: env.API_URL, ready: false, stage }) + "\n", {
      mode: 0o600,
    });
    // Ownership and relationship checks happen before any reset.
    if (existing) {
      const ids = mainIds();
      assert.equal(
        sql(`select count(*) from intros where (male_id in (${ids}) or female_id in (${ids}))
        and not (male_id in (${ids}) and female_id in (${ids}))`),
        "0",
        "External relationships exist; refusing automatic reset",
      );
      sql(`begin;
        delete from assistant_turns where owner_id in (${ids});
        delete from assistant_memories where owner_id in (${ids});
        delete from assistant_preferences where owner_id in (${ids});
        delete from pair_brief_drafts where male_id in (${ids}) and female_id in (${ids});
        delete from no_show_reports where reporter_id in (${ids}) or accused_id in (${ids});
        delete from feedbacks where author_id in (${ids});
        delete from meetings where intro_id in (select id from intros where male_id in (${ids}) and female_id in (${ids}));
        delete from tickets where user_id in (${ids});
        delete from intros where male_id in (${ids}) and female_id in (${ids});
        delete from intro_queue where male_id in (${ids}) and female_id in (${ids});
        delete from affinities where from_id in (${ids}) and to_id in (${ids});
        delete from intro_exclusions where user_lo in (${ids}) and user_hi in (${ids});
        delete from notifications where user_id in (${ids});
        commit;`);
    }
    let browser;
    try {
      browser = await chromium.launch();
      const page = await browser.newPage();
      for (const person of Object.values(identities)) {
        if (!person.id) {
          const created = await service.auth.admin.createUser({
            email: person.email,
            password,
            email_confirm: true,
            app_metadata: { local_lab: marker },
          });
          assert.ifError(created.error);
          person.id = created.data.user.id;
        } else {
          assert.ifError((await service.auth.admin.updateUserById(person.id, { password })).error);
        }
        const photoPaths = [];
        for (let index = 0; index < 3; index++) {
          const pixels = await page.evaluate(
            ({ label, index }) => {
              const canvas = document.createElement("canvas");
              canvas.width = 480;
              canvas.height = 640;
              const c = canvas.getContext("2d");
              c.fillStyle = ["#eee6fa", "#fae3db", "#e9eee9"][index];
              c.fillRect(0, 0, 480, 640);
              c.fillStyle = "#4a2e59";
              c.font = "bold 32px sans-serif";
              c.fillText(label, 36, 290);
              c.font = "18px sans-serif";
              c.fillText("LOCAL TEST · SYNTHETIC PROFILE", 36, 345);
              c.fillText(`사진 ${index + 1} / 3`, 36, 380);
              return canvas.toDataURL("image/png").split(",")[1];
            },
            { label: person.name, index },
          );
          const path = `${person.id}/assistant-lab-${index}.png`;
          assert.ifError(
            (
              await service.storage
                .from("profile-photos")
                .upload(path, Buffer.from(pixels, "base64"), {
                  contentType: "image/png",
                  upsert: true,
                })
            ).error,
          );
          photoPaths.push(path);
        }
        const story = {
          version: 3,
          headline: person.headline,
          summary: person.answers[0],
          sections: person.answers.map((answer, i) => ({
            id: ["daily_life", "getting_closer", "conversation"][i],
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
        sql(`insert into profiles(id,gender,hub_id,company_email,email_verified_at,name,birth,job,mbti,smoking,drinking,religion,
          headline,intro,profile_story,profile_preferences,photo_paths,photo_state,onboarding_step,terms_agreed_at,privacy_agreed_at,
          agreed_policy_version,phone_verified_at,role,paused_at)
          values(${q(person.id)},${q(person.gender)},'gangnam',${q(person.email)},now(),${q(person.name)},${q(person.birth)},${q(person.job)},${person.mbti ? q(person.mbti) : "null"},'none','social','none',
          ${q(person.headline)},${q(person.answers.join(" "))},${q(JSON.stringify(story))}::jsonb,'{"first_date":["짧게 커피"]}',array[${photoPaths.map(q)}],'approved',7,now(),now(),
          '2026-10-17.3',now(),${q(person.key === "admin" ? "admin" : "member")},${person.key === "admin" ? "now()" : "null"})
          on conflict(id) do update set account_state='active',paused_at=excluded.paused_at,gender=excluded.gender,
          name=excluded.name,birth=excluded.birth,job=excluded.job,mbti=excluded.mbti,
          email_verified_at=excluded.email_verified_at,phone_verified_at=excluded.phone_verified_at,
          terms_agreed_at=excluded.terms_agreed_at,privacy_agreed_at=excluded.privacy_agreed_at,agreed_policy_version=excluded.agreed_policy_version,
          headline=excluded.headline,intro=excluded.intro,profile_story=excluded.profile_story,photo_paths=excluded.photo_paths,
          photo_state='approved',onboarding_step=7,role=excluded.role;`);
      }
    } finally {
      await browser?.close();
    }
    const male = identities.male.id,
      female = identities.female.id,
      admin = identities.admin.id;
    sql(`begin;
      update app_settings set assistant_chat_enabled=true,assistant_memory_enabled=true,assistant_schedule_enabled=true;
      insert into affinities(from_id,to_id,verdict) values(${q(female)},${q(male)},'like') on conflict(from_id,to_id) do update set verdict='like';
      select issue_ticket(${q(male)},${q(`assistant-lab-intro-${Date.now()}`)},0,'intro');
      select issue_ticket(${q(male)},${q(`assistant-lab-meeting-${Date.now()}`)},0,'meeting');
      ${claims(admin)} select admin_set_queue(${q(male)},array[${q(female)}]::uuid[],'로컬 비서 테스트: 두 합성 계정의 동네 산책·카페 취향');
      commit;`);
    if (stage === "schedule")
      sql(`begin; ${claims(male)} select open_intro();
      select use_meeting_ticket((select id from intros where male_id=${q(male)} and female_id=${q(female)} and closed_at is null));
      update meetings set male_attendance_policy_ack_at=now() where intro_id in
        (select id from intros where male_id=${q(male)} and female_id=${q(female)});
      commit;`);
    const manifest = {
      marker,
      ready: true,
      api: env.API_URL,
      preparedAt: new Date().toISOString(),
      stage,
      accounts: Object.fromEntries(
        Object.values(identities).map((p) => [p.key, { id: p.id, email: p.email, password }]),
      ),
    };
    for (const person of Object.values(identities)) {
      const client = createClient(env.API_URL, env.ANON_KEY, { auth: { persistSession: false } });
      assert.ifError(
        (await client.auth.signInWithPassword({ email: person.email, password })).error,
      );
    }
    writeFileSync(file, JSON.stringify(manifest, null, 2) + "\n", { mode: 0o600 });
    console.log(
      "Prepared owned local fixtures; verification history and unrelated members preserved.",
    );
    status();
  }
}
