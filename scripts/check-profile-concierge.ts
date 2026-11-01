import assert from "node:assert/strict";
import {
  comparePublicProfiles,
  profileReading,
  profileWritingCoaching,
  type ConciergeProfile,
} from "../src/lib/profileConcierge";
import { storyFromAnswers } from "../src/lib/profileStory";

const blank = (): ConciergeProfile => ({
  headline: "",
  intro: "",
  interests: [],
  topics: [],
  answers: [],
});
const profile = (answer: string): ConciergeProfile => {
  const story = storyFromAnswers({ daily_life: answer });
  story.headline = "내가 들려주는 이야기";
  story.summary = answer;
  return { ...blank(), story, headline: story.headline, intro: answer };
};

assert.deepEqual(comparePublicProfiles(blank(), blank()), { connections: [], considerations: [] });
const viewer = profile("요즘 영화를 안 봐요. 언젠가 다시 보고 싶어요.");
const target = profile("최근에 본 영화 이야기가 좋아요.");
const shared = comparePublicProfiles(viewer, target);
assert.equal(shared.connections.length, 1);
assert.equal(shared.considerations.length, 0);
assert.equal(shared.connections[0].evidence[0].quote, viewer.story!.sections[0].answer);
assert.equal(shared.connections[0].evidence[1].quote, target.story!.sections[0].answer);
assert.doesNotMatch(shared.connections[0].reading, /둘 다.*좋아|같은 취향|성격|궁합|운명|성공|%/);
assert.match(shared.connections[0].reading, /서로 다를 수/);

const differences = comparePublicProfiles(
  { ...viewer, smoking: "비흡연", drinking: "안 마심", area: "판교" },
  { ...target, smoking: "흡연", drinking: "즐기는 편", area: "판교" },
);
assert.equal(differences.connections.length, 2);
assert.deepEqual(
  differences.considerations.map((item) => item.id),
  ["smoking", "drinking"],
);
assert.equal(differences.considerations[0].evidence[0].quote, "비흡연");
assert.equal(differences.considerations[0].evidence[1].quote, "흡연");
assert.ok(
  differences.considerations.every((item) => item.invitation && item.evidence.length === 2),
);
assert.equal(
  comparePublicProfiles({ ...blank(), smoking: "비흡연" }, blank()).considerations.length,
  0,
);
assert.equal(
  comparePublicProfiles({ ...blank(), smoking: "비흡연" }, { ...blank(), smoking: "—" })
    .considerations.length,
  0,
);
assert.equal(
  comparePublicProfiles({ ...blank(), drinking: "안 마심" }, { ...blank(), drinking: "안 마심" })
    .considerations.length,
  0,
);

const extra = {
  ...blank(),
  mbti: "ENFP",
  job: "개발자",
  profile_preferences: { contact: "PRIVATE" },
  memories: ["PRIVATE"],
};
assert.deepEqual(comparePublicProfiles(extra, extra), { connections: [], considerations: [] });
assert.doesNotMatch(JSON.stringify(comparePublicProfiles(extra, target)), /ENFP|개발자|PRIVATE/);

// V3 replaces old public sources: stale legacy interests cannot create a connection.
const fresh = profile("주말에는 집에서 쉬는 시간을 보내요.");
fresh.interests = ["영화"];
fresh.intro = "영화를 좋아해요";
assert.equal(comparePublicProfiles(fresh, target).connections.length, 0);
assert.equal(profileReading(viewer).summary, null);
assert.match(profileReading(blank()).nextPrompt, /최근 퇴근 후/);
assert.match(profileReading(profile("짧은 답이에요")).nextPrompt, /최근 퇴근 후/);
assert.doesNotMatch(profileReading(extra).strength, /궁합|매칭|성공|성격|외향|내향/);

const rich = profile("수영을 하고 집에 돌아와 저녁을 만들어요. 물속에 있을 때가 기억에 남아요.");
rich.story!.summary = "수영과 요리가 담긴 일상 이야기예요.";
rich.story!.conversationHooks = ["최근 만든 저녁", "최근 만든 저녁!", "수영 이야기"];
assert.equal(profileReading(rich).summary, rich.story!.summary);
assert.deepEqual(profileReading(rich).hooks, ["최근 만든 저녁", "수영 이야기"]);
assert.match(profileReading(rich).nextPrompt, /어색함이 풀렸던/);
console.log(
  "profile concierge: public evidence, negation, missing data, privacy and writing guidance passed",
);
// No fixed praise, invented flaws, or repeated activity quotations.
assert.equal(profileWritingCoaching(blank()).ready, false);
assert.equal(profileWritingCoaching(blank()).score, 0);
assert.equal(profileWritingCoaching(viewer).strength, null);
assert.doesNotMatch(
  JSON.stringify(profileWritingCoaching(profile("술은 싫어요"))),
  /기준을 지울|싫은 것 뒤/,
);
assert.doesNotMatch(JSON.stringify(profileWritingCoaching(extra)), /ENFP|개발자|PRIVATE/);
assert.doesNotMatch(JSON.stringify(profileWritingCoaching(fresh)), /영화를 좋아해요/);
const complete = profile(
  "보통 퇴근 후 회사 옆 헬스장에서 운동해요. 집으로 돌아와 좋아하는 음악을 들으며 저녁을 먹어요.",
);
complete.story!.sections.push(
  {
    id: "getting_closer",
    question: "가까워지는 순간",
    answer: "지난주 동료와 점심을 먹으며 요즘 본 영화 이야기를 나누니 자연스럽게 친해졌어요.",
  },
  {
    id: "conversation",
    question: "나누고 싶은 이야기",
    answer: "최근 읽은 소설의 마지막 장면이 기억에 남아요. 각자 어떻게 읽었는지 이야기하고 싶어요.",
  },
);
assert.equal(profileWritingCoaching(complete).score, 100);
assert.equal(profileWritingCoaching(complete).improvement, null);
complete.story!.sections[1].answer = "";
assert.equal(profileWritingCoaching(complete).ready, false);
assert.match(profileWritingCoaching(complete).improvement!.title, /가까워지는 순간/);
complete.story!.sections[1].answer =
  "낯을 많이 가려요. 술은 마시지 않지만 편한 자리에서 천천히 이야기 나누고 싶어요.";
assert.equal(profileWritingCoaching(complete).ready, true, "An explicit boundary is not a defect");
complete.headline = complete.story!.headline = "";
assert.equal(profileWritingCoaching(complete).score, 85);
assert.equal(profileWritingCoaching(complete).ready, true, "85 ends unsolicited coaching");
console.log(
  "Writing readiness: fresh edits, 85 threshold, sparse answers, boundaries and no invented coaching passed",
);

assert.equal(
  profileWritingCoaching({
    ...blank(),
    headline: "동네의 작은 이야기",
    intro:
      "저녁에는 수영을 하고 집에 돌아와 저녁을 만들어요. 최근에는 친구와 함께 요리한 시간을 이야기하고 싶어요.",
  }).ready,
  true,
  "Complete legacy prose does not require repeating an interview",
);
