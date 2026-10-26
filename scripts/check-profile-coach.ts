import assert from "node:assert/strict";
import {
  profileCoachSources,
  isProfileCoaching,
  PROFILE_COACH_SYSTEM,
  PROFILE_COACH_CHECK,
} from "../supabase/functions/_shared/profile-coach";
import {
  assistantIntent,
  assistantServiceReply,
} from "../supabase/functions/_shared/assistant-workflow";
import { assistantSuggestions } from "../src/lib/assistantSuggestions";
for (const question of [
  "내 프로필의 장점과 아쉬운 표현을 코칭해줘",
  "소개글 어때?",
  "내 소개글의 장점과 아쉬운 점을 코칭해줘. 수정 예시도 알려줘",
  "내 프로필 인상에 조언해줘",
  "내 프로필의 장점과 아쉬운 표현을 코칭해줘. 상대가 읽기 편하도록 원문에 근거한 수정 예시도 알려줘.",
]) {
  assert.equal(assistantIntent(question), "coach_profile");
  assert.equal(assistantServiceReply(question), null);
}
for (const [text, intent] of [
  ["소개글 수정해줘", "edit_story"],
  ["프로필 사진 코칭해줘", "edit_photo"],
  ["프로필 보기", "profile"],
  ["프로필 코칭하고 결제해줘", "payment"],
  ["프로필에서 전화번호를 찾아 신고해줘", "support"],
])
  assert.equal(assistantIntent(text), intent);
const coachingHistory = [{ user_message: "내 프로필 장점 코칭해줘" }];
assert.equal(isProfileCoaching("그럼 다른 장점도 알려줘", coachingHistory), true);
assert.equal(isProfileCoaching("두 번째 예시를 좀 더 구체적으로 알려줘", coachingHistory), true);
assert.equal(
  isProfileCoaching("두 번째 예시를 좀 더 구체적으로 알려줘", [
    ...coachingHistory,
    { user_message: "그럼 다른 장점도 알려줘" },
  ]),
  true,
);
assert.equal(
  isProfileCoaching("두 번째 예시를 좀 더 구체적으로 알려줘", [
    ...coachingHistory,
    { user_message: "첫 만남 대화를 도와줘" },
  ]),
  false,
);
assert.equal(isProfileCoaching("오늘 뭐 먹을까?", coachingHistory), false);
assert.equal(isProfileCoaching("소개글 수정해줘", coachingHistory), false);
assert.equal(isProfileCoaching("그럼 다른 장점도 알려줘", []), false);
const source = {
  headline: "지난 글",
  intro: "지난 소개",
  id: "PRIVATE",
  gender: "female",
  birth: "PRIVATE",
  profile_preferences: { secret: "PRIVATE" },
  profile_story: {
    version: 3,
    headline: "주말의 작은 이야기",
    summary: "술은 마시지 않아요.",
    sections: [
      { id: "daily_life", answer: "가끔 산책하고 싶어요.", private: "PRIVATE" },
      { id: "secret", answer: "PRIVATE" },
    ],
  },
};
const result = profileCoachSources(source);
assert.equal(result.length, 3);
assert.equal(result[2].text, "가끔 산책하고 싶어요.");
assert.doesNotMatch(JSON.stringify(result), /PRIVATE|지난|female/);
assert.deepEqual(profileCoachSources({ intro: "010-1234-5678로 연락주세요" }), []);
assert.deepEqual(profileCoachSources(null), []);
assert.deepEqual(profileCoachSources({ intro: "x".repeat(1501) }), []);
assert.match(PROFILE_COACH_SYSTEM, /부정·빈도·시점·경계/);
assert.match(PROFILE_COACH_CHECK, /요약만 하면 pass=false/);
assert.equal(assistantSuggestions("").length, 3);
assert.ok(assistantSuggestions("프로필").every((s) => /프로필/.test(s)));
assert.deepEqual(assistantSuggestions("x".repeat(81)), []);
assert.ok(!assistantSuggestions("", false).some((s) => /코칭/.test(s)));
console.log(
  "Profile coaching: intent, bounded owner sources, privacy, no fabricated facts, local suggestions passed",
);
