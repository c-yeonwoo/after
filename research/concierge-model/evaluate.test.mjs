import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import test from "node:test";
import { DIMENSIONS, digest, evaluate, validateDataset } from "./evaluate.mjs";

const fixture = async (name) =>
  JSON.parse(await readFile(new URL(`./fixtures/${name}.json`, import.meta.url), "utf8"));
const originals = await Promise.all(
  ["dataset", "baseline.manual", "candidate.manual", "reviews.pending"].map(fixture),
);
const fresh = () => structuredClone(originals);

// Manufactured test data exercises gates; it is not a model run or a human review.
function completedContract() {
  const [dataset, baseline, candidate, reviews] = fresh();
  dataset.cases.forEach((item) => {
    item.split = "holdout";
  });
  for (const run of [baseline, candidate]) {
    run.provenance = "recorded_model_output";
    run.modelRevision = "unit-test-only-no-model-was-run";
  }
  reviews.status = "completed";
  reviews.blinded = true;
  reviews.reviewerToken = "unit-test-only";
  reviews.bindings = {
    dataset: digest(dataset),
    baseline: digest(baseline),
    candidate: digest(candidate),
  };
  for (const row of reviews.cases)
    for (const side of ["baseline", "candidate"]) {
      row[side].scores = Object.fromEntries(DIMENSIONS.map((dimension) => [dimension, 2]));
    }
  return [dataset, baseline, candidate, reviews];
}

test("synthetic fixtures validate but cannot claim evaluated model quality or promotion", () => {
  const report = evaluate(...fresh());
  assert.equal(report.caseCount, 6);
  assert.deepEqual(report.deterministic, { baseline: [], candidate: [] });
  assert.equal(report.status, "blocked");
  assert.ok(report.blockers.includes("HUMAN_REVIEW_REQUIRED"));
  assert.ok(report.blockers.includes("MODEL_OUTPUT_EVIDENCE_REQUIRED"));
  assert.ok(report.blockers.includes("INDEPENDENT_HOLDOUT_REQUIRED"));
  assert.equal(report.promotionAllowed, false);
  assert.equal(report.modelQualityProven, false);
});

test("even a fully passing offline contract can only proceed to manual next-stage review", () => {
  const report = evaluate(...completedContract());
  assert.equal(report.status, "offline_comparison_passed");
  assert.deepEqual(report.blockers, []);
  assert.equal(report.promotionAllowed, false);
  assert.equal(report.modelQualityProven, false);
});

test("candidate regression in a single dimension blocks an otherwise stronger result", () => {
  const inputs = completedContract();
  inputs[3].cases[0].baseline.scores.factuality = 3;
  inputs[3].cases[0].candidate.scores.naturalness = 3;
  assert.ok(evaluate(...inputs).blockers.includes("BASELINE_REGRESSION"));
});

test("safety failures on either side cannot be offset by quality scores", () => {
  for (const side of ["baseline", "candidate"]) {
    const inputs = completedContract();
    inputs[3].cases[0][side].safetyFlags = ["invented_fact"];
    assert.ok(evaluate(...inputs).blockers.includes("HUMAN_SAFETY_FAILURE"));
  }
});

test("execution, unknown citations, lost intention and unsupported claims fail deterministically", () => {
  const inputs = completedContract();
  Object.assign(inputs[2].outputs[0], {
    text: "매일 러닝을 꾸준히 즐기는 사람이에요.",
    evidenceIds: ["unknown-source"],
    executed: true,
  });
  const report = evaluate(...inputs);
  assert.ok(report.blockers.includes("DETERMINISTIC_CHECK_FAILED"));
  assert.ok(report.blockers.includes("REVIEW_BINDING_MISMATCH"));
  assert.deepEqual(report.deterministic.candidate[0].reasons, [
    "UNAUTHORIZED_ACTION",
    "REQUIRED_MEANING_ANCHOR_MISSING",
    "FORBIDDEN_CLAIM",
    "EVIDENCE_REFERENCE_INVALID",
  ]);
  assert.equal(JSON.stringify(report).includes(inputs[2].outputs[0].text), false);
});

test("a broken baseline also blocks comparison", () => {
  const inputs = completedContract();
  inputs[1].outputs[1].disposition = "refuse";
  assert.ok(evaluate(...inputs).blockers.includes("DETERMINISTIC_CHECK_FAILED"));
});

test("missing or duplicate responses cannot reduce the evaluated denominator", () => {
  for (const mutate of [
    (run) => run.outputs.pop(),
    (run) => {
      run.outputs[1] = run.outputs[0];
    },
  ]) {
    const inputs = fresh();
    mutate(inputs[2]);
    assert.throws(() => evaluate(...inputs), /INVALID_OFFLINE_CONTRACT/);
  }
});

test("non-synthetic sources, training permission and unknown fields are rejected", () => {
  for (const mutate of [
    (data) => {
      data.sourceKind = "member_export";
    },
    (data) => {
      data.allowedUses.push("training");
    },
    (data) => {
      data.memberId = "private-record";
    },
  ]) {
    const [dataset] = fresh();
    mutate(dataset);
    assert.throws(() => validateDataset(dataset), /INVALID_OFFLINE_CONTRACT/);
  }
});

test("scenario groups cannot cross development and holdout", () => {
  const [dataset] = fresh();
  dataset.cases[1].groupId = dataset.cases[0].groupId;
  dataset.cases[1].split = "holdout";
  assert.throws(() => validateDataset(dataset), /INVALID_OFFLINE_CONTRACT/);
});

test("missing human scores, quality floor and stale bindings block comparison", () => {
  const inputs = completedContract();
  inputs[3].cases[0].candidate.scores.factuality = null;
  inputs[3].cases[1].baseline.scores.autonomy = 1;
  inputs[3].bindings.dataset = "a".repeat(64);
  const blockers = evaluate(...inputs).blockers;
  assert.ok(blockers.includes("HUMAN_REVIEW_INCOMPLETE"));
  assert.ok(blockers.includes("HUMAN_QUALITY_FLOOR_FAILED"));
  assert.ok(blockers.includes("REVIEW_BINDING_MISMATCH"));
});

test("contact-like content is rejected without echoing it", () => {
  const inputs = fresh();
  inputs[2].outputs[0].text = "synthetic-rejection-test@example.invalid";
  assert.throws(() => evaluate(...inputs), { message: "INVALID_OFFLINE_CONTRACT" });
});

test("CLI fixture run exits blocked and emits only sanitized report fields", () => {
  const cli = fileURLToPath(new URL("./evaluate.mjs", import.meta.url));
  const paths = ["dataset", "baseline.manual", "candidate.manual", "reviews.pending"].map((name) =>
    fileURLToPath(new URL(`./fixtures/${name}.json`, import.meta.url)),
  );
  const result = spawnSync(process.execPath, [cli, ...paths], { encoding: "utf8" });
  assert.equal(result.status, 2);
  const report = JSON.parse(result.stdout);
  assert.equal(report.status, "blocked");
  assert.equal(result.stderr, "");
  for (const output of originals[2].outputs)
    assert.equal(result.stdout.includes(output.text), false);
});

test("CLI error does not echo unreadable input paths", () => {
  const cli = fileURLToPath(new URL("./evaluate.mjs", import.meta.url));
  const path = "/missing/private-input-marker.json";
  const result = spawnSync(process.execPath, [cli, path, path, path, path], { encoding: "utf8" });
  assert.equal(result.status, 1);
  assert.equal(result.stdout, "");
  assert.equal(result.stderr.includes("private-input-marker"), false);
});
