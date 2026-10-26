import assert from "node:assert/strict";
import {
  privateAssistantModelContext,
  PRIVATE_ASSISTANT_SYSTEM,
  PRIVATE_ASSISTANT_CHECK,
} from "../supabase/functions/_shared/assistant-context";

// R09: an earlier AI suggestion must not become a user-confirmed preference.
const projected = privateAssistantModelContext({
  question: "내가 조용한 카페를 좋아한다고 했나요?",
  history: [{ question: "첫 만남 장소를 추천해 주세요", answer: "조용한 카페도 고려해 보세요." }],
  memories: ["주말 오후에 만나는 것이 편해요"],
  session_id: "server-session-only",
  owner_id: "server-owner-only",
  counterpart_profile: { private_answers: "must never reach the model" },
});
assert.deepEqual(projected, {
  current_user_message: "내가 조용한 카페를 좋아한다고 했나요?",
  conversation_history: [
    {
      user_message: "첫 만남 장소를 추천해 주세요",
      assistant_suggestion: "조용한 카페도 고려해 보세요.",
    },
  ],
  user_confirmed_memories: [
    { source: "explicit_user_approval", content: "주말 오후에 만나는 것이 편해요" },
  ],
});
assert.match(PRIVATE_ASSISTANT_SYSTEM, /과거 AI의 제안/);
assert.match(PRIVATE_ASSISTANT_SYSTEM, /사용자 진술·확인된 기억·실행 결과·사실의 근거가 아닙니다/);
assert.match(PRIVATE_ASSISTANT_CHECK, /과거 AI 제안만 근거로 사용자의 취향·경험을 단정/);
for (const input of [
  null,
  {},
  { question: "질문", history: [null], memories: [] },
  { question: "질문", history: [{ question: "질문", answer: null }], memories: [] },
  { question: "질문", history: [], memories: [{ content: "unverified" }] },
  { question: "질문", history: [], memories: Array(11).fill("너무 많은 기억") },
  { question: "질문", history: Array(7).fill({ question: "질문", answer: "답변" }), memories: [] },
])
  assert.equal(privateAssistantModelContext(input), null);
assert.deepEqual(privateAssistantModelContext({ question: "첫 질문", history: [], memories: [] }), {
  current_user_message: "첫 질문",
  conversation_history: [],
  user_confirmed_memories: [],
});
console.log("Assistant context provenance checks passed.");
