import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import { createClient } from "@supabase/supabase-js";
import { estimateUsageUsd } from "./lib/ai-cost.mjs";

// Three opt-in generations, local synthetic data only. No profile is published.
if (process.env.AFTER_LOCAL_AI_CONFIRM !== "synthetic-only")
  throw Error("Explicit synthetic-only provider QA confirmation required");
const env = execFileSync("npx", ["supabase", "status", "-o", "env"], {
  encoding: "utf8",
  stdio: ["ignore", "pipe", "pipe"],
});
const value = (key) => env.match(new RegExp(`^${key}="?([^"\\n]+)"?`, "m"))?.[1];
const api = value("API_URL"),
  db = value("DB_URL");
assert.match(api ?? "", /^http:\/\/127\.0\.0\.1:\d+$/);
assert.ok(db?.includes("@127.0.0.1:"));
const service = createClient(api, value("SERVICE_ROLE_KEY"), { auth: { persistSession: false } });
const sql = (s) =>
  execFileSync("psql", [db, "-v", "ON_ERROR_STOP=1", "-Atc", s], {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  }).trim();
const run = randomUUID(),
  email = `headline-qa-${run}@verify.local`,
  password = `${randomUUID()}Aa1!`;
const output = `/tmp/after-headline-${run}`;
const report = { environment: "local-synthetic-real-provider", cases: [] };
let id;
const cases = [
  {
    name: "퇴근 동선 대신 관계 취향",
    answers: {
      daily_life: "음.. 보통 7시에 퇴근하면 회사 옆 헬스장에서 2시간 운동하고 9시쯤 집에 가요.",
      getting_closer: "활동적인 데이트를 하거나 가볍게 술을 마시면서 친해지는 편이에요.",
      conversation: "일상이나 취미, 하는 일에 대해 서로 이야기하고 싶어요.",
    },
  },
  {
    name: "서로 다른 취향과 말맛",
    answers: {
      daily_life: "요즘 퇴근 후 집에서 기타를 연습해요. 배운 지 3개월이라 아직 초보예요.",
      getting_closer: "시끄러운 곳보다는 조용한 카페에서 천천히 얘기하는 게 좋아요.",
      conversation: "최근 반복해서 듣는 노래랑 가 보고 싶은 공연 얘기를 나누고 싶어요.",
    },
    forbidden: /능숙|전문|고수|연주자/,
  },
  {
    name: "짧은 답변에도 허구 없이",
    answers: {
      daily_life: "퇴근하면 집에서 쉬어요.",
      getting_closer: "커피요.",
      conversation: "음악 얘기요.",
    },
    forbidden: /다정|자상|성실|배려심|매일|항상|재즈|클래식/,
  },
];
try {
  const created = await service.auth.admin.createUser({ email, password, email_confirm: true });
  assert.ifError(created.error);
  id = created.data.user.id;
  sql(
    `insert into profiles(id,company_email,gender,hub_id,name,role) values('${id}','${email}','male','gangnam','가상 한줄 검증','member')`,
  );
  const auth = createClient(api, value("ANON_KEY"), { auth: { persistSession: false } });
  const login = await auth.auth.signInWithPassword({ email, password });
  assert.ifError(login.error);
  for (const item of cases) {
    const response = await fetch(`${api}/functions/v1/compose-profile-v3`, {
      method: "POST",
      signal: AbortSignal.timeout(110000),
      headers: {
        apikey: value("ANON_KEY"),
        Authorization: `Bearer ${login.data.session.access_token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ mode: "compose", answers: item.answers }),
    });
    const data = await response.json();
    report.cases.push({
      name: item.name,
      input: item.answers,
      http: response.status,
      ...data,
      estimatedUsd: estimateUsageUsd(data.meta?.usageByModel ?? {}),
    });
    assert.equal(response.status, 200, `Provider result: ${data.code}`);
    assert.equal(data.cached, undefined, "a new synthetic account must exercise the provider");
    assert.ok(data.story.headline.length <= 35);
    assert.doesNotMatch(data.story.headline, /\d+\s*(시|시간)|회사 옆|헬스장으로 가/);
    assert.equal(data.story.sections.length, 3);
    if (item.forbidden) assert.doesNotMatch(JSON.stringify(data.story), item.forbidden);
    console.log(
      JSON.stringify({
        case: item.name,
        headline: data.story.headline,
        estimatedUsd: report.cases.at(-1).estimatedUsd,
      }),
    );
  }
  assert.equal(
    sql(
      `select count(*) from profile_generation_versions where user_id='${id}' and prompt_version='profile-story-v3-6'`,
    ),
    "3",
  );
  report.pass = true;
} catch (error) {
  report.pass = false;
  report.error = error.message;
  process.exitCode = 1;
  console.error(error.message);
} finally {
  if (id) {
    assert.equal(
      sql(`select count(*) from auth.users where id='${id}' and email='${email}'`),
      "1",
      "cleanup ownership",
    );
    sql(
      `begin; delete from profile_generation_versions where user_id='${id}'; delete from ai_runs where user_id='${id}'; delete from events where user_id='${id}'; delete from auth.users where id='${id}' and email='${email}'; commit;`,
    );
  }
  await mkdir(output, { recursive: true });
  await writeFile(`${output}/report.json`, JSON.stringify(report, null, 2));
  console.log(`Evidence: ${output}/report.json`);
}
