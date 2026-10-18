// No task wakeups or credentials. Paperclip lifecycle validation can run small model hello probes.
import { readFile, access } from "node:fs/promises";
import { homedir } from "node:os";
import { dirname, resolve, join } from "node:path";
import { fileURLToPath } from "node:url";
import assert from "node:assert/strict";

const here = dirname(fileURLToPath(import.meta.url));
const repo = resolve(here, "../..");
const spec = JSON.parse(await readFile(join(here, "company.json"), "utf8"));
const policy = await readFile(join(here, "POLICY.md"), "utf8");
const base = new URL(process.env.AFTER_PAPERCLIP_URL ?? "http://127.0.0.1:3100");
assert.equal(base.protocol, "http:");
assert.equal(base.hostname, "127.0.0.1", "Only the local trusted instance is supported");
const apply = process.argv.includes("--apply");
const manualReady = process.argv.includes("--enable-manual");
assert(!manualReady || apply, "--enable-manual requires --apply");
assert(
  process.argv.slice(2).every((arg) => ["--apply", "--check", "--enable-manual"].includes(arg)),
);

async function api(path, method = "GET", body) {
  const response = await fetch(new URL(`/api${path}`, base), {
    method,
    headers: { "Content-Type": "application/json", Origin: base.origin },
    body: body === undefined ? undefined : JSON.stringify(body),
    signal: AbortSignal.timeout(30000),
  });
  if (!response.ok)
    throw new Error(
      `${method} ${path}: HTTP ${response.status}: ${(await response.text()).slice(0, 500)}`,
    );
  return response.json();
}

const health = await api("/health");
assert.equal(health.deploymentMode, "local_trusted");
assert.equal(health.version, "0.3.1", "Recheck API schemas for a different Paperclip version");
for (const path of Object.values(spec.skills)) await access(join(homedir(), path, "SKILL.md"));
assert.equal(new Set(spec.agents.map((agent) => agent.key)).size, spec.agents.length);
for (const agent of spec.agents) for (const key of agent.skills) assert(key in spec.skills);
console.log(
  `Validated ${spec.agents.length} roles and ${Object.keys(spec.skills).length} local skill sources.`,
);
if (!apply) process.exit(0);

const matches = (await api("/companies")).filter((company) => company.name === spec.name);
assert(matches.length <= 1, "Ambiguous company name; refusing to mutate");
let company = matches[0];
if (company) {
  assert(company.description?.includes(`[${spec.marker}]`), "Existing unrelated After company");
  if (company.status !== "paused") {
    // Recover a crash between company creation and the first pause, but never a live roster.
    assert.equal(
      (await api(`/companies/${company.id}/agents`)).length,
      0,
      "Refusing to overwrite a live company",
    );
    assert.equal(
      (await api(`/companies/${company.id}/projects`)).length,
      0,
      "Refusing to overwrite an initialized company",
    );
    assert.equal((await api(`/companies/${company.id}/heartbeat-runs`)).length, 0);
  }
} else {
  company = await api("/companies", "POST", {
    name: spec.name,
    description: `[${spec.marker}] 직장인의 탐색·조율 피로를 줄이는 AI 지원 소개 서비스. 수동 실행 전용 회사.`,
    budgetMonthlyCents: 0,
  });
}
const cid = company.id;
console.log(`After company: ${cid}`);
// Pause before importing anything. 0 budget is not relied upon as a kill switch.
await api(`/companies/${cid}`, "PATCH", {
  status: "paused",
  requireBoardApprovalForNewAgents: false,
});
let completed = false;
try {
  // Register only the selected skill directories as explicit library workspaces.
  // Never authorize the home directory or the whole plugin cache as an import root.
  const libraryName = "After · 스킬 라이브러리";
  let library = (await api(`/companies/${cid}/projects`)).find((item) => item.name === libraryName);
  if (!library)
    library = await api(`/companies/${cid}/projects`, "POST", {
      name: libraryName,
      status: "planned",
      description: "선택한 로컬 스킬 원본만 연결. 실행 작업 배정 금지.",
    });
  const workspaces = await api(`/projects/${library.id}/workspaces`);
  for (const [alias, relative] of Object.entries(spec.skills)) {
    const cwd = join(homedir(), relative);
    if (!workspaces.some((workspace) => workspace.cwd === cwd)) {
      await api(`/projects/${library.id}/workspaces`, "POST", {
        name: alias,
        cwd,
        sourceType: "local_path",
      });
    }
  }
  const keys = {};
  const skills = await api(`/companies/${cid}/skills`);
  assert(Array.isArray(skills), "Unexpected skills response");
  for (const [alias, relative] of Object.entries(spec.skills)) {
    const source = join(homedir(), relative);
    const existing = skills.find((skill) => skill.sourceLocator === source);
    if (existing) {
      keys[alias] = existing.key;
      continue;
    }
    const result = await api(`/companies/${cid}/skills/import`, "POST", { source });
    assert.equal(result.imported.length, 1, `Expected one skill: ${alias}`);
    keys[alias] = result.imported[0].key;
    console.log(
      `Skill ${alias}: ${result.imported[0].slug}; warnings: ${result.warnings?.length ?? 0}`,
    );
  }
  const roster = await api(`/companies/${cid}/agents`);
  const ids = {};
  for (const role of spec.agents) {
    const name = `After ${role.key} · ${role.name.split(" · ")[1]}`;
    const instruction = `${policy}\n\n# 담당: ${role.title}\n\n${role.mission}\n\n## 필수 결과물\n${role.deliverable}\n\n## 배정 스킬\n${role.skills.join(", ") || "별도 전문 스킬 없음; 조율에 집중"}\n`;
    let agent = roster.find((item) => item.metadata?.afterRole === role.key);
    if (agent) {
      assert.equal(agent.adapterType, "codex_local");
      assert.equal(agent.adapterConfig.dangerouslyBypassApprovalsAndSandbox, false);
      assert.deepEqual(agent.adapterConfig.extraArgs, ["--sandbox", "read-only"]);
      assert.equal(agent.adapterConfig.model, spec.model);
      assert.equal(agent.adapterConfig.command, spec.command);
      assert.equal(agent.adapterConfig.modelReasoningEffort, spec.reasoning);
      assert.equal(agent.adapterConfig.timeoutSec, 900);
      assert.equal(agent.adapterConfig.cwd, repo);
      assert.equal(agent.runtimeConfig.heartbeat.allowExplicitManualWake, true);
      assert.equal(agent.runtimeConfig.heartbeat.maxDailyRuns, 2);
      assert.equal(agent.runtimeConfig.heartbeat.maxConcurrentRuns, 1);
      assert.equal(agent.permissions.canCreateAgents, false);
      assert.equal(agent.permissions.canCreateSkills, false);
      assert.equal(agent.reportsTo, role.key === "chief" ? null : ids.chief);
      const file = await api(`/agents/${agent.id}/instructions-bundle/file?path=AGENTS.md`);
      assert.equal(
        file.content,
        instruction,
        `Instructions changed for ${role.key}; review manually`,
      );
    }
    if (!agent) {
      agent = await api(`/companies/${cid}/agents`, "POST", {
        name,
        role: role.role,
        title: role.title,
        reportsTo: role.key === "chief" ? null : ids.chief,
        capabilities: role.mission,
        adapterType: "codex_local",
        runner: "legacy",
        adapterConfig: {
          cwd: repo,
          command: spec.command,
          engine: "cli",
          model: spec.model,
          modelReasoningEffort: spec.reasoning,
          timeoutSec: 900,
          graceSec: 10,
          fastMode: false,
          dangerouslyBypassApprovalsAndSandbox: false,
          extraArgs: ["--sandbox", "read-only"],
        },
        runtimeConfig: {
          heartbeat: {
            enabled: false,
            wakeOnDemand: false,
            allowExplicitManualWake: true,
            intervalSec: 0,
            maxConcurrentRuns: 1,
            maxDailyRuns: 2,
          },
        },
        permissions: { canCreateAgents: false, canCreateSkills: false },
        desiredSkills: role.skills.map((key) => keys[key]),
        metadata: { afterRole: role.key, harness: spec.marker, executionMode: "manual-only" },
        instructionsBundle: {
          entryFile: "AGENTS.md",
          files: {
            "AGENTS.md": instruction,
          },
        },
      });
    }
    await api(`/agents/${agent.id}`, "PATCH", { status: "paused", name });
    const snapshot = await api(`/agents/${agent.id}/skills`);
    for (const key of role.skills)
      assert(snapshot.desiredSkills.includes(keys[key]), `Missing assigned skill: ${key}`);
    ids[role.key] = agent.id;
  }
  const projectName = "After · 제품 개발과 베타 운영";
  let project = (await api(`/companies/${cid}/projects`)).find((item) => item.name === projectName);
  if (!project)
    project = await api(`/companies/${cid}/projects`, "POST", {
      name: projectName,
      status: "planned",
      leadAgentId: ids.chief,
      description:
        "수동 실행: 기획 → 디자인 → 구현 → 독립 QA → 출시 → 관찰. 외부 연동은 별도 승인.",
      workspace: {
        name: "After repository",
        sourceType: "local_path",
        cwd: repo,
        repoUrl: "https://github.com/c-yeonwoo/after",
        defaultRef: "main",
        isPrimary: true,
      },
      executionWorkspacePolicy: {
        enabled: true,
        sharedWorkspaceConcurrency: "serialize",
        defaultMode: "isolated_workspace",
        allowIssueOverride: false,
        workspaceStrategy: {
          type: "git_worktree",
          baseRef: "origin/main",
          branchTemplate: "codex/{{issue.identifier}}",
        },
      },
    });
  const tasks = [
    [
      "chief",
      "00 · 수동 운영 시작과 연결 검증",
      "각 담당자 한 명씩 읽기 전용 smoke run. 인증/모델/스킬/도구/할당 인계를 실제로 확인한다. 자동 호출하지 않는다. 코드 실행권한·예산은 대표 승인 후 별도 설정.",
    ],
    [
      "product",
      "01 · 중복 없는 인터뷰 질문 설계",
      "칩 선택과 주관식 질문의 중복을 줄인다. 기존 답변과 질문 버전 보존. 아직 구현하지 말고 수락 기준을 디자인·AI에 인계한다.",
    ],
    [
      "design",
      "02 · 프로필·사진·인터뷰 모바일 UX 감사",
      "한줄 요약→사진→3열 정보→인터뷰 흐름, 의미 단위 줄바꿈, 확대보기, 터치/키보드/접근성 검증.",
    ],
    [
      "ai",
      "03 · 프로필·추천 이유 사실성 평가 설계",
      "합성 사례로 따뜻함/구체성/근거/허구/비용 평가. 실 LLM 호출은 횟수·비용 승인 후 진행.",
    ],
    [
      "engineering",
      "04 · 승인된 인터뷰 개선 구현 준비",
      "01/02/03의 설계를 받은 뒤 최소 diff와 테스트 계획. 구현 실행 전에 작업 worktree와 sandbox 쓰기 권한을 명시적으로 승인받는다.",
    ],
    [
      "qa",
      "05 · 남녀 매칭 한 사이클 독립 검증",
      "합성 남2/여3, 호감 on/off·거절·대기·일정·취소·티켓 복구·후기·운영 큐. 코드/대역/실수신 구분 및 출시 판단.",
    ],
    [
      "operations",
      "06 · 베타 운영 큐와 외부 의존 점검",
      "현재 코드·검증 증거를 기준으로 D-4h/D-2h·신고·미응답·연락 동의·실패 큐를 점검. 실제 회원 연락/DB 쓰기 없이 보고.",
    ],
    [
      "growth",
      "07 · 베타 홍보 콘텐츠 변주 기획",
      "대표가 광고 집행. 소셜링 피로 타깃으로 다른 형식의 초안 3개와 주장 검증·CTA·UTM. 게시/광고 금지.",
    ],
  ];
  const issues = await api(`/companies/${cid}/issues`);
  const taskIds = {};
  for (const [role, title, description] of tasks) {
    let issue = issues.find((item) => item.title === title && item.projectId === project.id);
    const dependencies =
      role === "engineering"
        ? ["product", "design", "ai"]
        : role === "qa"
          ? ["engineering"]
          : role === "chief"
            ? []
            : ["chief"];
    if (!issue)
      issue = await api(`/companies/${cid}/issues`, "POST", {
        title,
        description: `${description}\n\n완료 기준: ${spec.agents.find((item) => item.key === role).deliverable}\n실행은 대표 수동 호출만 허용.`,
        projectId: project.id,
        assigneeAgentId: ids[role],
        status: "backlog",
        priority: "medium",
        blockedByIssueIds: dependencies.map((key) => taskIds[key]).filter(Boolean),
      });
    taskIds[role] = issue.id;
  }
  // Read-back verification precedes optional manual-ready activation; no wake API is called.
  const final = await api(`/companies/${cid}/agents`);
  assert.equal(final.length, spec.agents.length);
  assert(
    final.every(
      (agent) =>
        agent.status === "paused" &&
        agent.runtimeConfig.heartbeat.enabled === false &&
        agent.runtimeConfig.heartbeat.wakeOnDemand === false,
    ),
  );
  if (manualReady) {
    await api(`/companies/${cid}`, "PATCH", {
      status: "active",
      requireBoardApprovalForNewAgents: true,
    });
    for (const id of Object.values(ids)) {
      await api(`/agents/${id}`, "PATCH", { status: "idle" });
      const deadline = Date.now() + 120000;
      while (true) {
        const result = await api(`/agents/${id}`);
        assert.equal(result.lifecycleError, null, `Runtime validation failed for ${id}`);
        if (
          result.status === "idle" &&
          result.lifecycleState === "ready" &&
          result.lifecycleHolds.length === 0
        )
          break;
        assert(Date.now() < deadline, `Timed out waiting for ${id}; no task was launched`);
        await new Promise((resolve) => setTimeout(resolve, 2000));
      }
    }
  }
  completed = true;
  console.log(
    JSON.stringify(
      {
        companyId: cid,
        projectId: project.id,
        agents: ids,
        skills: Object.keys(keys).length,
        tasks: Object.keys(taskIds).length,
        mode: manualReady ? "manual-only" : "paused",
        url: `${base.origin}/${company.issuePrefix}/dashboard`,
      },
      null,
      2,
    ),
  );
} finally {
  await api(`/companies/${cid}`, "PATCH", {
    status: completed && manualReady ? "active" : "paused",
    requireBoardApprovalForNewAgents: true,
  });
}
