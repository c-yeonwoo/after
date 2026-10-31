import assert from "node:assert/strict";
import { introductionSignals } from "../src/lib/introductionSignals";
assert.deepEqual(introductionSignals({}, {}), { interests: [], topics: [] });
assert.deepEqual(
  introductionSignals(
    { interests: [" 산책 ", "산책", "전시"], topics: ["영화"] },
    { interests: ["산책"], topics: ["음악"] },
  ),
  { interests: ["산책"], topics: [] },
);
assert.equal(
  introductionSignals({ interests: ["영화를 싫어해요"] }, { interests: ["영화"] }).interests.length,
  0,
);
assert.equal(introductionSignals({ topics: ["Jazz"] }, { topics: ["jazz"] }).topics.length, 1);
console.log(
  "Introduction signals: explicit selections, normalization, deduplication, missing and negated prose PASS",
);
