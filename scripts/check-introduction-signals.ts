import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
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

import {
  comparePublicSignals,
  publicProfileSignals,
  INTERVIEW_CHOICE_PAGES,
  PROFILE_CHOICES,
  SIGNAL_LABELS,
  approvedProfileSignals,
} from "../supabase/functions/_shared/profile-signals";
import { introductionSources } from "../supabase/functions/_shared/member-introduction";
assert.deepEqual(
  publicProfileSignals({
    contact: ["퇴근 후 편하게"],
    planning: ["상대와 함께 맞추기"],
    first_date: ["짧게 커피", "가짜"],
    care: ["이야기 들어주기"],
  }),
  { first_date: ["짧게 커피"], care: ["이야기 들어주기"] },
);
const compared = comparePublicSignals(
  { first_date: ["짧게 커피"], relationship_goal: ["천천히 알아가는 연애"] },
  { first_date: ["짧게 커피"], relationship_goal: ["결혼도 생각하는 연애"] },
);
assert.equal(compared.compared, 2);
assert.equal(compared.common.length, 1);
assert.equal(compared.differences.length, 1);
assert.deepEqual(comparePublicSignals({}, {}), { common: [], differences: [], compared: 0 });
assert.equal(INTERVIEW_CHOICE_PAGES.flat().length, 6, "no extra onboarding questions or screens");
assert.deepEqual(
  approvedProfileSignals({ first_date: ["짧게 커피", "함께 걷기"], contact: ["퇴근 후 편하게"] }, [
    "choice:first_date:1",
    "choice:contact:2",
  ]),
  { first_date: ["함께 걷기"] },
  "profile preview shows only checked public options, matching server publication",
);
assert.deepEqual(
  introductionSignals({ profile_story: {}, interests: ["산책"] }, { interests: ["산책"] }),
  { interests: [], topics: [] },
  "old tags cannot masquerade as current interview matches",
);
const modelSources = introductionSources({
  profile_story: {
    version: 3,
    sections: [{ id: "daily_life", question: "일상", answer: "퇴근 후에는 천천히 동네를 걸어요." }],
  },
  profile_public_signals: { first_date: ["짧게 커피"], contact: ["private marker"] },
});
assert.equal(modelSources.preference_first_date, "첫 만남: 짧게 커피");
assert.equal(Object.values(modelSources).join(" ").includes("private marker"), false);
assert.ok(modelSources.story_daily_life);
console.log(
  "Public profile signals: consent scope, privacy, missing data, differences and stale legacy tags PASS",
);

import { newProfileInterviewV3 } from "../src/lib/profileInterviewV3";
import { emptyBasics } from "../src/components/onboarding/basics";
import type { Profile } from "../src/lib/api";
const resumed = newProfileInterviewV3(
  {
    profile_preferences: {
      choices: { contact: ["퇴근 후 편하게"], first_date: ["짧게 커피", "알 수 없는 값"] },
      choiceCustom: { contact: "퇴근하면 답할 수 있어요." },
    },
    profile_public_signals: {},
  } as unknown as Profile,
  emptyBasics,
);
assert.deepEqual(resumed.choices.contact, ["퇴근 후 편하게"]);
assert.deepEqual(resumed.choices.first_date, ["짧게 커피"]);
assert.equal(resumed.choiceCustom.contact, "퇴근하면 답할 수 있어요.");
assert.equal(
  resumed.publicIds.some((id) => id.startsWith("choice:")),
  false,
  "prefilling existing answers never silently expands public consent",
);

// The public approval boundary and the client must agree on stable option indices.
const signalMigration = readFileSync(
  new URL("../supabase/migrations/20261031160000_approved_profile_signals.sql", import.meta.url),
  "utf8",
);
const registered = signalMigration.match(/select '(\[.*?\])'::jsonb/);
assert.ok(registered, "public option registry exists");
assert.deepEqual(
  JSON.parse(registered[1]),
  PROFILE_CHOICES.filter((question) => question.id in SIGNAL_LABELS),
  "database publication and client choices preserve identical public option indices",
);
