import assert from "node:assert/strict";
import { profileAnswerCoaching, profileCoachingSources } from "../src/lib/profileCoaching";

assert.equal(profileAnswerCoaching("daily_life", "  "), null, "blank answers need no extra prompt");
assert.equal(
  profileAnswerCoaching(
    "daily_life",
    "퇴근하고 강변을 걷다가 벤치에 앉아 오늘 있었던 일을 친구에게 이야기했어요.",
  ),
  null,
  "an existing concrete account is not pushed to become longer",
);
assert.match(profileAnswerCoaching("conversation", "영화")!, /장면|대목/);
assert.match(profileAnswerCoaching("getting_closer", "작은 배려")!, /구체적인.*행동/);
assert.match(profileAnswerCoaching("daily_life", "산책")!, /해본 경험/);
assert.match(profileAnswerCoaching("daily_life", "책 읽기")!, /장면|대목/);
assert.doesNotMatch(
  profileAnswerCoaching("daily_life", "산책은 싫어요")!,
  /달라지|좋아하|산책하는/,
  "mentioning a disliked activity must not become a positive preference",
);
for (const answer of [
  "영화는 안 봐요",
  "운동은 안해요",
  "요리는 안해요",
  "영화 안봄",
  "책 안읽어요",
])
  assert.match(profileAnswerCoaching("conversation", answer)!, /그 답도 그대로/, answer);
assert.match(profileAnswerCoaching("getting_closer", "아직 모르겠어요")!, /그 답도 그대로/);
assert.match(profileAnswerCoaching("conversation", "요리 배워보고 싶어요")!, /해보고 싶은/);
assert.doesNotMatch(
  profileAnswerCoaching("getting_closer", "대화하면 편안해요")!,
  /그 답도 그대로/,
);

const data = {
  answers: {
    daily_life: "  퇴근하면 동네를 걸어요.\n가끔 쉬기도 해요.  ",
    getting_closer: "",
    conversation: "영화 이야기",
  },
  choices: { rhythm: ["동네 돌아보기"], contact: ["틈틈이 짧게"] },
  choiceCustom: { topics: "직접 적은 음악 이야기", planning: "개인 일정 조건" },
  followups: { walk: "좋았던 길 이야기", unknown: "허용되지 않은 질문의 답" },
  followupIds: ["walk"],
  publicIds: [
    "answer:daily_life",
    "choice:rhythm:4",
    "choice:contact:0",
    "choice:topics:custom",
    "choice:planning:custom",
    "followup:walk",
  ],
};
const ids = [
  "answer:daily_life",
  "answer:conversation",
  "choice:rhythm:4",
  "choice:contact:0",
  "choice:topics:custom",
  "choice:planning:custom",
  "followup:walk",
];
const sources = profileCoachingSources(data, ids, "public");
assert.deepEqual(
  sources.map((source) => source.id),
  ["answer:daily_life", "choice:rhythm:4", "choice:topics:custom", "followup:walk"],
);
assert.equal(
  sources[0].text,
  data.answers.daily_life,
  "source quotes preserve the exact original words and whitespace",
);
assert.equal(
  profileCoachingSources(data, ids, "owner").length,
  7,
  "the owner can inspect private source material separately",
);
assert.deepEqual(
  profileCoachingSources(
    data,
    [
      "answer:unknown",
      "answer:toString",
      "choice:rhythm:0",
      "choice:rhythm:04",
      "choice:rhythm:4:extra",
      "followup:unknown",
      "followup:music",
    ],
    "owner",
  ),
  [],
  "unknown IDs, deselected choices, and missing followup answers are not evidence",
);
const reanalyzedData = { ...data, followupIds: ["series"] };
assert.equal(
  profileCoachingSources(reanalyzedData, ["followup:walk"], "public")[0]?.text,
  data.followups.walk,
  "re-analysis may change its questions without deleting an earlier approved followup answer",
);
assert.equal(
  profileCoachingSources(data, ["answer:daily_life", "answer:daily_life"], "owner").length,
  1,
);
assert.deepEqual(
  profileCoachingSources({ ...data, publicIds: [] }, ids, "public"),
  [],
  "removing public consent immediately removes preview source material",
);
assert.deepEqual(
  profileCoachingSources(
    { ...data, answers: { ...data.answers, daily_life: "" } },
    ["answer:daily_life"],
    "public",
  ),
  [],
  "deleted original text cannot return as evidence",
);
console.log("Profile coaching: optional prompts and exact-source/public-selection checks passed.");
