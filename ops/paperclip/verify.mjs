import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const spec = JSON.parse(await readFile(new URL("./company.json", import.meta.url), "utf8"));
const base = new URL(process.env.AFTER_PAPERCLIP_URL ?? "http://127.0.0.1:3100");
assert.equal(base.origin, "http://127.0.0.1:3100");
async function get(path) {
  const response = await fetch(new URL(`/api${path}`, base), {
    signal: AbortSignal.timeout(10000),
  });
  assert(response.ok, `${path}: ${response.status}`);
  return response.json();
}
const matches = (await get("/companies")).filter(
  (c) => c.description?.includes(`[${spec.marker}]`) && c.name === spec.name,
);
assert.equal(matches.length, 1);
const company = matches[0];
assert(["active", "paused"].includes(company.status));
assert.equal(company.requireBoardApprovalForNewAgents, true);
const agents = await get(`/companies/${company.id}/agents`);
assert.equal(agents.length, 8);
const chief = agents.find((a) => a.metadata.afterRole === "chief");
for (const role of spec.agents) {
  const found = agents.filter((a) => a.metadata.afterRole === role.key);
  assert.equal(found.length, 1);
  const agent = found[0];
  assert.equal(
    agent.status,
    company.status === "active" ? "idle" : "paused",
    `Not ready: ${role.key}`,
  );
  if (company.status === "active") {
    assert.equal(agent.lifecycleState, "ready", `Runtime not ready: ${role.key}`);
    assert.equal(agent.lifecycleError, null);
    assert.deepEqual(agent.lifecycleHolds, []);
  }
  assert.equal(agent.reportsTo, role.key === "chief" ? null : chief.id);
  assert.equal(agent.adapterType, "codex_local");
  assert.equal(agent.adapterConfig.model, spec.model);
  assert.equal(agent.adapterConfig.command, spec.command);
  assert.equal(agent.adapterConfig.modelReasoningEffort, "high");
  assert.equal(agent.adapterConfig.dangerouslyBypassApprovalsAndSandbox, false);
  assert.deepEqual(agent.adapterConfig.extraArgs, ["--sandbox", "read-only"]);
  assert.equal(agent.adapterConfig.timeoutSec, 900);
  const h = agent.runtimeConfig.heartbeat;
  assert.equal(h.enabled, false);
  assert.equal(h.wakeOnDemand, false);
  assert.equal(h.allowExplicitManualWake, true);
  assert.equal(h.maxConcurrentRuns, 1);
  assert.equal(h.maxDailyRuns, 2);
  assert.equal(agent.permissions.canCreateAgents, false);
  assert.equal(agent.permissions.canCreateSkills, false);
  const skills = await get(`/agents/${agent.id}/skills`);
  assert.equal(skills.warnings.length, 0);
  const localSkills = skills.entries.filter((e) => e.desired && e.key.startsWith("local/"));
  assert.equal(localSkills.length, role.skills.length);
  assert(localSkills.every((e) => ["configured", "installed"].includes(e.state)));
  const file = await get(`/agents/${agent.id}/instructions-bundle/file?path=AGENTS.md`);
  assert(file.content.includes(role.mission));
  assert(file.content.includes("MANUAL_ONLY"));
  console.log(`PASS ${role.key}: manual-only, read-only, ${localSkills.length} specialist skills`);
}
const issues = await get(`/companies/${company.id}/issues`);
assert.equal(issues.length, 8);
assert(
  issues.every((i) => i.status === "backlog" && agents.some((a) => a.id === i.assigneeAgentId)),
);
for (const role of spec.agents) {
  const agent = agents.find((a) => a.metadata.afterRole === role.key);
  const task = issues.find((i) => i.assigneeAgentId === agent.id);
  const detail = await get(`/issues/${task.id}`);
  const expected =
    role.key === "engineering"
      ? ["product", "design", "ai"]
      : role.key === "qa"
        ? ["engineering"]
        : role.key === "chief"
          ? []
          : ["chief"];
  assert.deepEqual(
    detail.blockedBy.map((b) => b.assigneeAgentId).sort(),
    expected.map((key) => agents.find((a) => a.metadata.afterRole === key).id).sort(),
  );
}
const runs = await get(`/companies/${company.id}/heartbeat-runs`);
assert.equal(runs.length, 0, "This bootstrap verification expects no agent runs yet");
console.log(
  `PASS ${company.name}: 8 agents, 8 backlog tasks, 0 agent runs; ${base.origin}/${company.issuePrefix}/dashboard`,
);
