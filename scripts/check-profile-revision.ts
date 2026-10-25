import assert from "node:assert/strict";
import { profileRevisionSummary } from "../src/lib/profileRevisionCopy";
import type { ProfileStoryV3 } from "../src/lib/profileStory";
import {
  revisionBase,
  revisionChanged,
  validRevisionStory,
  REVISION_QUESTIONS,
  type RevisionStory,
} from "../supabase/functions/_shared/profile-revision";

const original: RevisionStory = {
  version: 3,
  headline: "가끔 걷는 시간이 좋아요",
  summary: "퇴근 후 가끔 동네를 걸어요. 언젠가는 도예도 배워보고 싶어요.",
  sections: [
    {
      ...REVISION_QUESTIONS[0],
      questionId: "daily_life_v1",
      questionVersion: 1,
      answer: "퇴근 후 가끔 걸어요. 도예는 아직 해본 적 없지만 배워보고 싶어요.",
    },
  ],
  conversationHooks: ["가끔 걷는 동네 길"],
  publishedRevision: 9,
};
assert.ok(validRevisionStory(original));
assert.equal(revisionChanged(original, { ...original, publishedRevision: 10 }), false);
assert.equal(
  revisionChanged(original, { ...original, headline: "가끔 산책하는 저녁이 좋아요" }),
  true,
);
for (const bad of [
  { ...original, headline: "전화 010-1234-5678" },
  { ...original, summary: "이메일은 fake@example.com 입니다" },
  { ...original, conversationHooks: ["https://example.com"] },
  { ...original, sections: [...original.sections, ...original.sections] },
  { ...original, sections: [{ ...original.sections[0], question: "임의 질문으로 바꾸기" }] },
  { ...original, publishedRevision: NaN },
])
  assert.equal(validRevisionStory(bad), false);
const source = {
  headline: original.headline,
  intro: original.summary,
  profile_story: {
    ...original,
    privateCanary: "PRIVATE_MEMORY_CANARY",
    sections: original.sections.map((section) => ({
      ...section,
      sourceIds: ["PRIVATE_CHOICE_CANARY"],
    })),
  },
  memories: ["PRIVATE_MEMORY_CANARY"],
  profile_preferences: { contact: "PRIVATE_CONTACT_CANARY" },
};
const minimal = revisionBase(source)!;
assert.deepEqual(minimal, original);
assert.doesNotMatch(JSON.stringify(minimal), /CANARY|sourceIds|memories|preferences/);
assert.match(minimal.sections[0].answer, /가끔/);
assert.match(minimal.sections[0].answer, /아직 해본 적 없지만/);
assert.equal(
  revisionBase({ headline: "기존 소개", intro: "기존 소개 원문입니다.", profile_story: null }),
  null,
);
const publicStory = original as ProfileStoryV3;
const changedSummary = { ...publicStory, summary: "원래 사실을 살려 표현을 정리했어요." };
assert.equal(profileRevisionSummary(publicStory, changedSummary), "짧은 소개를 다듬었어요.");
const changedDaily = {
  ...changedSummary,
  sections: publicStory.sections.map((section) => ({
    ...section,
    answer: "퇴근한 뒤 가끔 걸어요. 도예는 아직 배우지 않았지만 해보고 싶어요.",
  })),
};
assert.equal(
  profileRevisionSummary(publicStory, changedDaily),
  "짧은 소개 · 일상 답변을 다듬었어요.",
);
const multiple = { ...changedDaily, headline: "가끔 걷는 저녁이 좋아요" };
assert.equal(
  profileRevisionSummary(publicStory, multiple),
  "한 줄 소개 · 짧은 소개 등 3곳을 다듬었어요.",
);
assert.doesNotMatch(
  profileRevisionSummary(publicStory, multiple),
  /headline|summary|sections|conversationHooks/,
);
assert.equal(profileRevisionSummary(publicStory, publicStory), "바뀐 내용을 함께 확인해 주세요.");
console.log(
  "profile revision: contact, schema, minimal provider sources, negation/hope source retention and no-op checks passed",
);
