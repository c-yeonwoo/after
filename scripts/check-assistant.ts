import assert from "node:assert/strict";
import { assistantIntent, accountChecksComplete } from "../src/lib/assistant";
import type { Profile } from "../src/lib/api";
import { validConversationPreparation } from "../supabase/functions/_shared/conversation-prep";

assert.equal(assistantIntent("약속 취소해줘"), "support");
assert.equal(assistantIntent("대화 주제 알려줘"), "prepare");
assert.equal(assistantIntent("아무 이야기"), "prepare");
assert.equal(assistantIntent("오늘 우울해"), "unknown");
const profile = {
  terms_agreed_at: "now",
  privacy_agreed_at: "now",
  phone_verified_at: "now",
  company_email: "synthetic@verify.local",
} as Profile;
assert.equal(accountChecksComplete(profile, false), true);
assert.equal(accountChecksComplete(profile, true), false);
assert.equal(accountChecksComplete({ ...profile, terms_agreed_at: null }, false), false);
const sources = { intro: "퇴근 후에는 동네를 걸으며 하루를 정리합니다." };
const topic = {
  title: "산책의 작은 즐거움",
  question: "동네를 걷다가 자주 들르게 되는 곳이 있나요?",
  followup: "그곳의 어떤 점이 특히 마음에 드세요?",
  sourceField: "intro",
  quote: "동네를 걸으며 하루를 정리합니다.",
};
assert.equal(validConversationPreparation({ topics: [topic] }, sources), true);
assert.equal(
  validConversationPreparation(
    { topics: [{ ...topic, quote: "주말마다 등산을 즐깁니다." }] },
    sources,
  ),
  false,
);
assert.equal(
  validConversationPreparation({ topics: [{ ...topic, sourceField: "private_answers" }] }, sources),
  false,
);
assert.equal(
  validConversationPreparation(
    { topics: [{ ...topic, question: "MBTI 궁합이 좋아서 운명 같지 않나요?" }] },
    sources,
  ),
  false,
);
assert.equal(validConversationPreparation({ topics: [topic, topic] }, sources), false);
assert.equal(
  validConversationPreparation(
    { topics: [{ ...topic, question: "전화번호 01012345678로 먼저 연락해보실래요?" }] },
    sources,
  ),
  false,
);
console.log("Assistant intent, account boundary and grounding: 13 assertions passed");
