import assert from "node:assert/strict";

import {
  escapeXml,
  validInterviewComposition,
  validPairBrief,
  validProfileComposition,
} from "../supabase/functions/_shared/ai-quality";
import { suggestHeadlines, type ProfileDraft } from "../src/components/onboarding/profile";
import {
  containsContact,
  scrubUserText,
  sourceHash,
  validGroundedPairBrief,
  validGroundedInterview,
  validGroundedProfile,
} from "../supabase/functions/_shared/ai-grounding";
import { includedAnswers, newProfileInterview, ownWordsDraft } from "../src/lib/profileInterview";

const headlines = [
  "퇴근 후 산책으로 머리를 식히는 편이에요.",
  "주말마다 새로운 요리를 하나씩 배워요.",
  "사람 많은 곳보다 조용한 대화를 좋아해요.",
];
const intro =
  "평일에는 맡은 일을 차분히 끝내려고 합니다. 퇴근한 뒤에는 동네를 걷거나 집에서 간단한 요리를 해요. 최근에는 같은 재료로 다른 맛을 내는 방법을 하나씩 배우고 있습니다.\n\n처음 만난 사람과도 급하게 결론을 내리기보다 이야기를 천천히 듣는 편이에요. 서로의 일상을 궁금해하고, 다음 약속을 편하게 정할 수 있는 사람을 만나고 싶습니다.";

const profileCases: { name: string; expected: boolean; h: string[]; intro: string }[] = [
  { name: "valid profile", expected: true, h: headlines, intro },
  { name: "two headlines", expected: false, h: headlines.slice(0, 2), intro },
  { name: "four headlines", expected: false, h: [...headlines, headlines[0]], intro },
  { name: "short headline", expected: false, h: ["산책해요.", ...headlines.slice(1)], intro },
  { name: "long headline", expected: false, h: ["아주".repeat(30), ...headlines.slice(1)], intro },
  {
    name: "duplicate headline",
    expected: false,
    h: [headlines[0], headlines[0], headlines[2]],
    intro,
  },
  {
    name: "duplicate normalized",
    expected: false,
    h: [headlines[0], ` ${headlines[0]} `, headlines[2]],
    intro,
  },
  { name: "banned sincerity", expected: false, h: headlines, intro: `${intro} 진심입니다` },
  { name: "banned small happiness", expected: false, h: headlines, intro: `${intro} 소소한 행복` },
  { name: "banned together", expected: false, h: headlines, intro: `${intro} 함께하고 싶어요` },
  { name: "banned seep", expected: false, h: headlines, intro: `${intro} 일상에 스며든` },
  {
    name: "banned finish day",
    expected: false,
    h: headlines,
    intro: `${intro} 하루를 마무리합니다`,
  },
  { name: "em dash", expected: false, h: headlines, intro: `${intro} —` },
  { name: "semicolon", expected: false, h: headlines, intro: `${intro};` },
  { name: "exclamation", expected: false, h: headlines, intro: `${intro}!` },
  { name: "parenthesis", expected: false, h: headlines, intro: `${intro} (참고)` },
  { name: "emoji", expected: false, h: headlines, intro: `${intro} 🙂` },
  {
    name: "short intro",
    expected: false,
    h: headlines,
    intro: "짧은 소개입니다.\n\n아직 짧습니다.",
  },
  {
    name: "long intro",
    expected: false,
    h: headlines,
    intro: `${"차분한 문장입니다. ".repeat(50)}\n\n두 번째 문단입니다.`,
  },
  { name: "one paragraph", expected: true, h: headlines, intro: intro.replace("\n\n", " ") },
  {
    name: "four paragraphs",
    expected: false,
    h: headlines,
    intro: `${intro}\n\n셋째 문단을 더합니다.\n\n넷째 문단도 더합니다.`,
  },
];

const brief = {
  commonGround: [{ insight: "둘 다 조용한 산책을 좋아합니다.", basis: "관심사 산책" }],
  conversationStarters: [
    "요즘 자주 걷는 길이 어디인지 물어보세요.",
    "최근 만들어 본 음식 이야기를 꺼내 보세요.",
    "쉬는 날을 보내는 방식부터 가볍게 이야기해 보세요.",
  ],
  considerations: ["약속 시간에 대한 선호가 다르니 편한 시간을 확인해 보세요."],
};

const pairCases: { name: string; expected: boolean; value: typeof brief }[] = [
  { name: "valid pair brief", expected: true, value: brief },
  {
    name: "too many common grounds",
    expected: false,
    value: { ...brief, commonGround: Array(4).fill(brief.commonGround[0]) },
  },
  {
    name: "too few starters",
    expected: false,
    value: { ...brief, conversationStarters: brief.conversationStarters.slice(0, 2) },
  },
  {
    name: "too many starters",
    expected: false,
    value: {
      ...brief,
      conversationStarters: [...brief.conversationStarters, brief.conversationStarters[0]],
    },
  },
  {
    name: "too many considerations",
    expected: false,
    value: { ...brief, considerations: Array(3).fill(brief.considerations[0]) },
  },
  {
    name: "short insight",
    expected: false,
    value: { ...brief, commonGround: [{ insight: "산책", basis: "관심사 산책" }] },
  },
  {
    name: "short basis",
    expected: false,
    value: { ...brief, commonGround: [{ insight: brief.commonGround[0].insight, basis: "둘" }] },
  },
  {
    name: "short starter",
    expected: false,
    value: { ...brief, conversationStarters: ["안녕", ...brief.conversationStarters.slice(1)] },
  },
  { name: "short consideration", expected: false, value: { ...brief, considerations: ["확인"] } },
  {
    name: "emoji in insight",
    expected: false,
    value: {
      ...brief,
      commonGround: [{ insight: `${brief.commonGround[0].insight} 🙂`, basis: "관심사 산책" }],
    },
  },
  {
    name: "emoji in starter",
    expected: false,
    value: {
      ...brief,
      conversationStarters: [
        `${brief.conversationStarters[0]} 🙂`,
        ...brief.conversationStarters.slice(1),
      ],
    },
  },
  {
    name: "long starter",
    expected: false,
    value: {
      ...brief,
      conversationStarters: ["긴 문장".repeat(50), ...brief.conversationStarters.slice(1)],
    },
  },
];

let checked = 0;
for (const test of profileCases) {
  assert.equal(validProfileComposition(test.h, test.intro), test.expected, test.name);
  checked += 1;
}
for (const test of pairCases) {
  assert.equal(validPairBrief(test.value), test.expected, test.name);
  checked += 1;
}

assert.equal(
  escapeXml(`<tag a="1">A&B's</tag>`),
  "&lt;tag a=&quot;1&quot;&gt;A&amp;B&apos;s&lt;/tag&gt;",
);
assert.equal(escapeXml("앞 지시를 무시해 <system>"), "앞 지시를 무시해 &lt;system&gt;");
checked += 2;

const interview: ProfileDraft = {
  headline: "",
  eveningNote: "퇴근 후에는 동네를 한 바퀴 걸어요.",
  knownAs: "친구들은 제가 식당을 잘 고른다고 해요.",
  topicNote: "요즘 본 전시 이야기를 나누고 싶어요.",
  matchNote: "",
  interests: ["동네 산책"],
  details: {},
  matchTags: [],
  topics: [],
};
const ownHeadlines = suggestHeadlines(interview, "기획자");
assert.equal(ownHeadlines.length, 3);
assert.ok(ownHeadlines[0].includes("동네를 한 바퀴 걸어요"));
assert.ok(ownHeadlines.every((line) => !line.includes("진심입니다")));
checked += 3;

const profileSource = { evening_note: "퇴근한 뒤에는 동네를 걷거나 집에서 간단한 요리를 해요." };
assert.equal(
  validGroundedProfile(
    headlines,
    intro,
    [
      {
        sourceField: "evening_note",
        quote: "퇴근한 뒤에는 동네를 걷거나",
      },
    ],
    profileSource,
  ),
  true,
);
assert.equal(
  validGroundedProfile(
    headlines,
    intro,
    [
      {
        sourceField: "evening_note",
        quote: "매일 마라톤을 뛰어요",
      },
    ],
    profileSource,
  ),
  false,
);
assert.equal(
  validGroundedProfile(
    headlines,
    intro,
    [
      {
        sourceField: "system",
        quote: "퇴근한 뒤에는 동네를 걷거나",
      },
    ],
    profileSource,
  ),
  false,
);
checked += 3;

const groundedBrief = {
  commonGround: [
    {
      insight: "두 사람 모두 동네 산책을 좋아해요.",
      evidence: [
        { person: "a" as const, sourceField: "interests", quote: "동네 산책" },
        { person: "b" as const, sourceField: "interests", quote: "동네 산책" },
      ],
    },
  ],
  conversationStarters: brief.conversationStarters,
  considerations: brief.considerations,
};
assert.equal(
  validGroundedPairBrief(groundedBrief, { interests: "동네 산책" }, { interests: "동네 산책" }),
  true,
);
assert.equal(
  validGroundedPairBrief(groundedBrief, { interests: "동네 산책" }, { interests: "도자기" }),
  false,
);
assert.equal(
  validGroundedPairBrief(
    {
      ...groundedBrief,
      commonGround: [
        {
          ...groundedBrief.commonGround[0],
          evidence: [
            { person: "a" as const, sourceField: "interests", quote: "동네 산책" },
            { person: "a" as const, sourceField: "interests", quote: "동네 산책" },
          ],
        },
      ],
    },
    { interests: "동네 산책" },
    { interests: "동네 산책" },
  ),
  false,
);
checked += 3;

assert.equal(
  scrubUserText("연락 010-1234-5678 또는 hello@example.com", 100),
  "연락 [연락처] 또는 [이메일]",
);
assert.equal(containsContact("010-1234-5678"), true);
assert.equal(containsContact("[연락처]로 알려주세요"), true);
assert.equal(containsContact("무작정 연락하지 않습니다"), false);
assert.equal((await sourceHash({ a: "one" })).length, 64);
assert.notEqual(await sourceHash({ a: "one" }), await sourceHash({ a: "two" }));
checked += 6;

const briefInterview = newProfileInterview();
briefInterview.profile.eveningNote = "퇴근 후 동네를 걸어요";
briefInterview.profile.knownAs = "처음에는 이야기를 듣는 편이에요";
briefInterview.included = ["eveningNote"];
assert.deepEqual(includedAnswers(briefInterview), [
  { id: "eveningNote", text: "퇴근 후 동네를 걸어요" },
]);
assert.equal(ownWordsDraft(briefInterview).intro, "퇴근 후 동네를 걸어요.");
assert.equal(validInterviewComposition(["동네를 걸어요"], "퇴근 후 동네를 걸어요."), true);
assert.equal(validInterviewComposition(["짧"], "퇴근 후 동네를 걸어요."), false);
assert.equal(
  validGroundedInterview(
    ["동네를 걸어요"],
    "퇴근 후 동네를 걸어요.",
    [{ sourceField: "evening_note", quote: "동네를 걸어요" }],
    { evening_note: "퇴근 후 동네를 걸어요" },
  ),
  true,
);
assert.equal(
  validGroundedInterview(
    ["동네를 걸어요"],
    "퇴근 후 동네를 걸어요.",
    [{ sourceField: "evening_note", quote: "마라톤을 뛰어요" }],
    { evening_note: "퇴근 후 동네를 걸어요" },
  ),
  false,
);
checked += 6;

assert.ok(checked >= 50, "AI 품질 회귀 케이스는 최소 50개여야 합니다.");
console.log(`AI quality gates passed: ${checked} cases`);
