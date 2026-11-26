import assert from "node:assert/strict";
import { introReasonCopy } from "../src/lib/introReasonCopy";
import { storyFromAnswers } from "../src/lib/profileStory";
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

// A teaser has no readable peer. Only exact, public words can personalize an opened introduction.
const sharedMovie = {
  source: "shared",
  quote: "영화·드라마",
  label: "공개 접점",
  reason: "기존 소개",
};
const reader = { name: "서연", headline: "좋아하는 영화 이야기를 나누고 싶어요." };
const peer = { name: "민준", intro: "좋았던 장면을 오래 기억해요." };
const paired = introReasonCopy(sharedMovie.reason, sharedMovie, { self: reader, other: peer });
assert.match(paired, /‘좋아하는 영화’.*민준님의 ‘좋았던 장면’/);
assert.match(
  introReasonCopy(sharedMovie.reason, sharedMovie, { self: peer, other: reader }),
  /‘좋았던 장면’.*서연님의 ‘좋아하는 영화’/,
);
const teaserLine = introReasonCopy(sharedMovie.reason, sharedMovie);
assert.doesNotMatch(teaserLine, /민준|서연|좋았던 장면|좋아하는 영화/);
assert.match(teaserLine, /어떤 장면/);
const story = storyFromAnswers({ conversation: "저는 독립영화 이야기가 반가워요." });
story.headline = "조용한 저녁이 좋아요";
story.summary = "가까운 곳에서 가벼운 저녁을 나누고 싶어요.";
assert.match(
  introReasonCopy("", sharedMovie, { self: reader, other: { ...peer, profile_story: story } }),
  /독립영화/,
);
for (const other of [
  {},
  { ...peer, profile_story: {} },
  { intro: "독립영화는 별로 좋아하지 않아요." },
  { intro: "독립영화에는 관심이 없어요." },
  { intro: "영화관보다는 집에서 보는 걸 선호해요." },
  { intro: "영화관람이 취미예요." },
  { intro: "독립영화 말고 코미디가 좋아요." },
  { intro: "독립영화 표는 넘겼고 코미디가 좋아요." },
  { intro: "친구가 독립영화를 좋아해요." },
]) {
  assert.equal(introReasonCopy("", sharedMovie, { self: reader, other }), teaserLine);
}
for (const source of ["priority", "curated", "public", "selection", "reading"]) {
  assert.equal(
    introReasonCopy("기존 근거", { ...sharedMovie, source }, { self: reader, other: peer }),
    "기존 근거",
  );
}
assert.doesNotMatch(
  introReasonCopy("", { ...sharedMovie, discounted: true }, { self: reader, other: peer }),
  /영화|장면|민준/,
);
assert.equal(introReasonCopy("기존 소개", { ...sharedMovie, quote: "constructor" }), "기존 소개");
console.log(
  "Introduction copy: reciprocal public details, locked teaser, consented story, sparse/negative material and preference precedence PASS",
);

const legacyTraveler = { interests: ["여행"], headline: "" };
const legacyNote = introReasonCopy(
  "",
  { ...sharedMovie, quote: "여행" },
  { self: legacyTraveler, other: legacyTraveler },
);
assert.match(legacyNote, /프로필에는 ‘여행’/);
assert.doesNotMatch(legacyNote, /골랐|대화 소재/);

const coffeeAnswer = "창가에서 커피 한 잔 나누는 걸 좋아해요";
const coffeeChoice = {
  quote: "짧게 커피",
  source: "priority",
  label: "상대가 고른 첫 만남",
  reason: "매니저 메모",
};
function opening(change: Partial<import("../src/lib/api").IntroEvidence>) {
  return introReasonCopy(coffeeChoice.reason, { ...coffeeChoice, ...change });
}
assert.match(
  opening({ priority_origin: "feedback", peer_excerpt: coffeeAnswer }),
  /지난 후기.*커피 한 잔.*“창가에서 커피 한 잔 나누는 걸 좋아해요”/,
);
assert.doesNotMatch(opening({ priority_origin: "edit", peer_excerpt: coffeeAnswer }), /후기/);
assert.doesNotMatch(opening({ priority_origin: "feedback" }), /“|적었|썼/);
for (const source of ["shared", "public"]) {
  const note = opening({ source, peer_excerpt: coffeeAnswer });
  assert.ok(note.includes(coffeeAnswer));
  assert.doesNotMatch(note, /지난|후기|다음 소개/);
}
assert.doesNotMatch(
  opening({ source: "shared", discounted: true, peer_excerpt: coffeeAnswer }),
  /창가/,
);
assert.equal(opening({ source: "curated", peer_excerpt: coffeeAnswer }), "매니저 메모");
