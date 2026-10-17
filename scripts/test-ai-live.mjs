import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFileSync, mkdirSync, writeFileSync } from "node:fs";
import { randomUUID } from "node:crypto";

// Explicit, bounded provider QA. Uses only existing designated reviewer
// accounts; never resets quotas, creates accounts or publishes a profile.
const project = "tsytwxtuczceyojkiaty";
if (process.env.AFTER_LIVE_AI_CONFIRM !== project)
  throw Error("Explicit live AI confirmation required");
const saved = JSON.parse(readFileSync(".app-review-accounts.json", "utf8"));
if (saved.projectRef !== project) throw Error("Reviewer project mismatch");
const keys = JSON.parse(
  execFileSync("npx", ["supabase", "projects", "api-keys", "--project-ref", project], {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  }),
);
const anon = keys.keys.find((k) => k.id === "anon")?.api_key;
if (!anon) throw Error("Public API key unavailable");
const base = `https://${project}.supabase.co`;
const cases = [
  {
    name: "구체적 일상",
    answers: {
      daily_life: "주 3회 퇴근 후 헬스장에서 운동하고 9시쯤 집에 가요.",
      getting_closer: "첫 만남은 짧게 커피를 마시고, 다음에는 함께 걷고 싶어요.",
      conversation: "최근 본 영화와 좋아하는 동네 식당 이야기를 나누고 싶어요.",
    },
  },
  {
    name: "구어체 편집",
    answers: {
      daily_life: "음.. 퇴근하면 동네 한바퀴 돌아요. 이어폰 끼고요.",
      getting_closer: "첨엔 카페에서 좀 얘기하면 편할듯. 너무 시끄러운 곳은 싫고요.",
      conversation: "요즘 본 독립영화 얘기 하고싶어요. 영화제도 언젠가 가보고 싶고요.",
    },
  },
  {
    name: "부정과 희망",
    answers: {
      daily_life: "요즘 운동은 안 해요. 언젠가 등산을 시작해 보고 싶어요.",
      getting_closer: "술자리는 불편해서 첫 만남에는 커피만 마시고 싶어요.",
      conversation: "해외여행은 아직 가 본 적 없지만 여행 이야기는 좋아해요.",
    },
  },
  {
    name: "선택형 중심",
    choices: {
      rhythm: ["취미에 몰입하기"],
      first_date: ["함께 걷기"],
      contact: ["퇴근 후 편하게"],
      planning: ["며칠 전에 정하기"],
      closeness: ["생각을 깊이 나눌 때"],
      topics: ["음악"],
    },
    choiceCustom: { rhythm: "집에서 피아노 연습하기" },
  },
  {
    name: "비공개 제외",
    answers: {
      daily_life: "저녁에는 동네 서점을 들렀다 집에서 책을 읽어요.",
      getting_closer: "첫 만남에는 커피를 마시며 천천히 이야기하는 게 편해요.",
      conversation: "최근 읽은 소설에서 인상적이었던 장면을 이야기하고 싶어요.",
    },
    choices: { contact: ["여유 생길 때 모아서"] },
    choiceCustom: { contact: "비공개 표식 비밀해바라기프로젝트" },
    publicIds: ["answer:daily_life", "answer:getting_closer", "answer:conversation"],
    forbidden: ["비밀해바라기프로젝트"],
  },
  {
    name: "시간 범위 보존",
    answers: {
      daily_life: "퇴근 후 시간이 생기면 혼자 집에서 푹 쉬어요.",
      getting_closer: "처음에는 집 근처 카페에서 짧게 만나는 게 좋아요.",
      conversation: "요즘 듣는 음악이나 각자 쉬는 방법을 이야기하고 싶어요.",
    },
    forbidden: ["주말마다", "쉬는 날마다"],
  },
  {
    name: "성격 과잉추론 방지",
    answers: {
      daily_life: "퇴근 후에는 퍼즐을 맞추거나 집 근처를 걸어요.",
      getting_closer: "서로 말할 시간을 충분히 주는 대화가 편해요.",
      conversation: "함께 본 전시에서 좋았던 작품을 이야기하고 싶어요.",
    },
  },
  {
    name: "가끔과 희망 보존",
    answers: {
      daily_life: "퇴근 후 가끔 요리를 하지만 대부분은 간단히 먹어요.",
      getting_closer: "첫 만남은 카페가 좋고, 익숙해지면 같이 요리도 해 보고 싶어요.",
      conversation: "아직 베이킹은 해 본 적 없어요. 배우고 싶은 음식 이야기는 좋아요.",
    },
  },
  {
    name: "초보 취미 보존",
    answers: {
      daily_life: "기타를 배운 지 3개월 됐어요. 퇴근 후 집에서 연습해요.",
      getting_closer: "처음엔 음악이 크지 않은 곳에서 편하게 대화하고 싶어요.",
      conversation: "최근 자주 듣는 노래와 가 보고 싶은 공연 이야기를 나누고 싶어요.",
    },
  },
  {
    name: "구체성 유지",
    answers: {
      daily_life: "저녁에는 차를 마시며 일기를 쓰고, 가끔 동네를 걸어요.",
      getting_closer: "첫 만남은 카페에서 한 시간 정도 이야기하는 자리가 좋아요.",
      conversation: "요즘 마시는 차와 각자 좋아하는 동네 공간을 이야기하고 싶어요.",
    },
  },
];
const output = `/tmp/after-ai-live-${randomUUID().slice(0, 8)}`;
mkdirSync(output, { recursive: true });
const report = {
  version: "profile-story-v3-4",
  environment: "production-provider-synthetic-only",
  runs: [],
};
for (const [index, account] of [saved.male, saved.female].entries()) {
  const login = await fetch(`${base}/auth/v1/token?grant_type=password`, {
    method: "POST",
    headers: { apikey: anon, "Content-Type": "application/json" },
    body: JSON.stringify({ email: account.email, password: account.password }),
  });
  const session = await login.json();
  if (!login.ok || !session.access_token) throw Error(`Reviewer login failed (${login.status})`);
  for (const item of cases.slice(index * 5, index * 5 + 5)) {
    const started = Date.now();
    const response = await fetch(`${base}/functions/v1/compose-profile-v3`, {
      method: "POST",
      headers: {
        apikey: anon,
        Authorization: `Bearer ${session.access_token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ mode: "compose", ...item }),
      signal: AbortSignal.timeout(110000),
    });
    const data = await response.json();
    const result = {
      name: item.name,
      ms: Date.now() - started,
      http: response.status,
      status: data.status,
      code: data.code,
      cached: data.cached === true,
      requestId: data.requestId,
      story: data.story,
      input: item,
    };
    report.runs.push(result);
    console.log(
      JSON.stringify({
        name: item.name,
        http: result.http,
        status: result.status,
        code: result.code,
        cached: result.cached,
        ms: result.ms,
      }),
    );
    if (data.code === "daily_limit") break;
    if (data.status === "success") {
      assert.ok(data.story.headline.length >= 3);
      assert.ok(data.story.sections.length >= 1 && data.story.sections.length <= 3);
      assert.ok(data.story.sections.every((s) => s.answer.length >= 5 && s.question));
      for (const word of item.forbidden ?? [])
        assert.ok(
          !JSON.stringify(data.story).includes(word),
          `Unexpected private/fabricated phrase: ${word}`,
        );
    }
  }
}
writeFileSync(`${output}/report.json`, JSON.stringify(report, null, 2));
console.log(`Evidence: ${output}/report.json`);
const successes = report.runs.filter((r) => r.status === "success" && !r.cached).length;
console.log(`Fresh model results: ${successes}/${cases.length}`);
if (report.runs.filter((r) => r.status === "success").length !== cases.length) process.exitCode = 1;
