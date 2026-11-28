import assert from "node:assert/strict";
import {
  hasIntroductionMaterial,
  introductionSources,
  validMemberIntroduction,
  type MemberIntroduction,
} from "../supabase/functions/_shared/member-introduction";

const self = { story_daily_life: "퇴근하고 책을 읽어요. 영화는 자주 보지 않아요." };
const other = {
  story_daily_life: "퇴근길에 독립서점에 들러 소설을 구경해요.",
  story_conversation: "요즘 수영을 배워보고 싶어요. 아직 시작하지는 않았어요.",
};
const evidence = {
  person: "other" as const,
  field: "story_daily_life",
  quote: "독립서점에 들러 소설을 구경해요",
};
const brief: MemberIntroduction = {
  portrait: [
    {
      text: "퇴근길에 독립서점에서 소설을 구경한다고 적어주셨어요. 요즘 눈길이 가는 책 이야기로 시작해보세요.",
      sources: [evidence],
    },
  ],
  connections: [
    {
      text: "두 분 다 책이 있는 시간을 이야기해주셨어요. 각자 고르는 책이 어떻게 다른지 물어보면 이야기를 이어갈 수 있겠어요.",
      selfSources: [{ person: "self", field: "story_daily_life", quote: "퇴근하고 책을 읽어요" }],
      otherSources: [evidence],
    },
  ],
  questions: [
    {
      text: "수영을 배워보고 싶다고 하셨는데, 어떤 계기로 관심이 생겼는지 물어보면 어떨까요?",
      sources: [
        { person: "other", field: "story_conversation", quote: "요즘 수영을 배워보고 싶어요" },
      ],
    },
  ],
};
assert.equal(validMemberIntroduction(brief, self, other), true);
assert.equal(
  validMemberIntroduction({ ...brief, connections: [], questions: [] }, {}, other),
  true,
);
assert.equal(validMemberIntroduction({ ...brief, portrait: [] }, self, other), false);
assert.equal(validMemberIntroduction(null, self, other), false);
assert.equal(validMemberIntroduction({ ...brief, portrait: [null] }, self, other), false);
assert.equal(
  validMemberIntroduction(
    { ...brief, portrait: [{ ...brief.portrait[0], sources: [{ ...evidence, person: "self" }] }] },
    self,
    other,
  ),
  false,
);
assert.equal(
  validMemberIntroduction(
    {
      ...brief,
      portrait: [
        { ...brief.portrait[0], sources: [{ ...evidence, field: "private_preferences" }] },
      ],
    },
    self,
    other,
  ),
  false,
);
assert.equal(
  validMemberIntroduction(
    {
      ...brief,
      portrait: [{ ...brief.portrait[0], sources: [{ ...evidence, quote: "매일 소설을 읽어요" }] }],
    },
    self,
    other,
  ),
  false,
);
assert.equal(
  validMemberIntroduction(
    { ...brief, connections: [{ ...brief.connections[0], selfSources: [evidence] }] },
    self,
    other,
  ),
  false,
);
assert.equal(
  validMemberIntroduction(
    { ...brief, connections: [{ ...brief.connections[0], selfSources: [] }] },
    self,
    other,
  ),
  false,
);
assert.equal(
  validMemberIntroduction(
    { ...brief, portrait: [brief.portrait[0], brief.portrait[0]] },
    self,
    other,
  ),
  false,
);
for (const text of [
  "두 분은 MBTI가 잘 맞아서 관계가 정말 잘 풀릴 거예요.",
  "상대가 먼저 회원님을 좋아해서 연결 가능성이 높아 보여요.",
  "이분과 만나면 좋은 관계를 만들 확률이 95%예요.",
  "개인 연락은 person@example.test 이메일로 주고받으세요.",
]) {
  assert.equal(
    validMemberIntroduction({ ...brief, portrait: [{ ...brief.portrait[0], text }] }, self, other),
    false,
    text,
  );
}
const filtered = introductionSources({
  job: "민감한 회사 이름",
  intro: "공개 프로필에 담긴 산책 이야기입니다.",
  topic_note: "연락은 private@example.test 로 해주세요.",
  interests: ["산책"],
  details: { 산책: "강변을 따라 천천히 걷고 있어요.", private: "비공개 취향" },
});
assert.equal("job" in filtered, false);
assert.equal("topic_note" in filtered, false);
assert.equal(JSON.stringify(filtered).includes("비공개 취향"), false);
assert.equal(filtered.intro, "공개 프로필에 담긴 산책 이야기입니다.");
const v3 = introductionSources({
  intro: "이전 세대의 소개글은 모델에 전달하지 않습니다.",
  profile_story: {
    version: 3,
    sections: [
      {
        id: "daily_life",
        question: "일상",
        answer: "아직 수영을 시작하지는 않았어요. 언젠가 배워보고 싶어요.",
      },
      { id: "private", question: "비공개", answer: "비공개 답변입니다." },
    ],
  },
});
assert.deepEqual(Object.keys(v3), ["story_daily_life"]);
assert.equal(v3.story_daily_life, "아직 수영을 시작하지는 않았어요. 언젠가 배워보고 싶어요.");
assert.equal(hasIntroductionMaterial(v3), true);
assert.equal(hasIntroductionMaterial({ short: "음" }), false);
console.log(
  "Member introduction: public allowlist, exact evidence, persona bounds, malformed output and unsafe claims passed.",
);

assert.equal(
  validMemberIntroduction(
    { ...brief, portrait: [{ text: other.story_daily_life, sources: [evidence] }] },
    self,
    other,
  ),
  false,
  "a copied source is not a manager explanation",
);

// Six distinct public stories yield 30 directional introductions. A changes places
// with B deliberately: attribution, exact wording and privacy have to hold in both directions.
const stories = [
  "매일 운동하진 않지만 주말에는 집 근처 수영장에서 자유형을 배워요.",
  "아직 악기를 배우지 않았어요. 좋아하는 공연을 보러 가는 건 즐겨요.",
  "야근이 드문 금요일 저녁에만 동네 서점에서 새로 나온 책을 골라요.",
  "커피를 잘 못 마셔서 카페에 가면 주로 따뜻한 차를 골라요.",
  "친구는 등산을 좋아하고 저는 걷다가 사진을 찍는 쪽을 더 좋아해요.",
  "예전에는 빵을 자주 구웠고 요즘은 작은 식당을 찾아다녀요.",
];
let pairs = 0;
for (const mine of stories) {
  for (const theirs of stories.filter((entry) => entry !== mine)) {
    const source = (answer: string) =>
      introductionSources({
        topic_note: "비공개 연락은 private@example.test 로 주세요.",
        profile_story: { version: 3, sections: [{ id: "daily_life", question: "일상", answer }] },
      });
    const viewer = source(mine);
    const peer = source(theirs);
    assert.deepEqual(Object.values(peer), [theirs]);
    const info = { person: "other" as const, field: "story_daily_life", quote: theirs };
    const draft = {
      portrait: [
        { text: `“${theirs}” 이 이야기에서 먼저 묻고 싶은 점이 있으세요?`, sources: [info] },
      ],
      connections: [],
      questions: [],
    };
    assert.ok(validMemberIntroduction(draft, viewer, peer));
    assert.equal(validMemberIntroduction(draft, peer, viewer), false);
    for (const quote of [mine, `항상 ${theirs}`, "상담에서만 공개한 취향이에요"]) {
      assert.equal(
        validMemberIntroduction(
          { ...draft, portrait: [{ ...draft.portrait[0], sources: [{ ...info, quote }] }] },
          viewer,
          peer,
        ),
        false,
      );
    }
    pairs++;
  }
}
assert.equal(pairs, 30);
console.log(
  "30 directional synthetic pairs passed public-source and attribution checks (offline).",
);
