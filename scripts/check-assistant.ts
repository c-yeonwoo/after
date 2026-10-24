import assert from "node:assert/strict";
import { assistantIntent, accountChecksComplete } from "../src/lib/assistant";
import type { Profile } from "../src/lib/api";
import { validConversationPreparation } from "../supabase/functions/_shared/conversation-prep";
import {
  privateAssistantSafety,
  validPrivateAdvice,
} from "../supabase/functions/_shared/assistant-private";
import { seoulAppointment, scheduleKind, scheduleInputIssue } from "../src/lib/assistantSchedule";

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
const advice = ["start", "respect", "pace"].map((kind) => ({
  kind,
  text: "좋아하는 길의 분위기를 물어보고, 내 경험도 짧게 나눠보세요.",
  sourceField: "intro",
  quote: topic.quote,
})) as NonNullable<
  import("../supabase/functions/_shared/conversation-prep").ConversationPreparation["advice"]
>;
assert.equal(validConversationPreparation({ topics: [topic], advice }, sources), true);
assert.equal(
  validConversationPreparation(
    { topics: [topic], advice: [null, advice[1], advice[2]] as unknown as typeof advice },
    sources,
  ),
  false,
  "malformed cached advice fails closed without throwing",
);
assert.equal(
  validConversationPreparation(
    {
      topics: [topic],
      advice: advice.map((t) => ({ ...t, text: "MBTI가 내향형이니 대답을 강요하지 마세요." })),
    },
    sources,
  ),
  false,
);
assert.equal(
  validConversationPreparation(
    {
      topics: [topic],
      advice: advice.map((t) => ({ ...t, quote: "저는 성격이 예민한 편이에요" })),
    },
    sources,
  ),
  false,
);
assert.equal(
  validConversationPreparation(
    { topics: [topic], advice: [advice[0], advice[0], advice[0]] },
    sources,
  ),
  false,
);
assert.equal(
  validConversationPreparation(
    { topics: [{ ...topic, question: "전화번호 01012345678로 먼저 연락해보실래요?" }] },
    sources,
  ),
  false,
);
assert.equal(seoulAppointment("2026-10-30", "19:00"), "2026-10-30T10:00:00.000Z");
assert.equal(seoulAppointment("2026-02-30", "19:00"), null);
assert.equal(seoulAppointment("2026-10-30", "25:00"), null);
assert.equal(seoulAppointment("내일", "저녁"), null);
const meeting = {
  id: "a",
  name: null,
  confirmed: false,
  scheduledAt: null,
  slots: null,
  dates: null,
  place: null,
  isFemale: true,
};
assert.equal(scheduleKind(meeting), "preferences");
assert.equal(scheduleKind({ ...meeting, slots: ["x"] }), "accept_slot");
assert.equal(scheduleKind({ ...meeting, isFemale: false }), null);
assert.equal(scheduleKind({ ...meeting, isFemale: false, dates: ["x"] }), "confirm");
assert.equal(scheduleKind({ ...meeting, confirmed: true }), "change");
const now = Date.parse("2026-10-26T09:00:00+09:00");
assert.match(
  scheduleInputIssue(meeting, "preferences", "2020-01-01T19:00:00+09:00", "", now)!,
  /3시간/,
);
assert.match(
  scheduleInputIssue(meeting, "confirm", "2026-10-26T19:00:00+09:00", "", now)!,
  /장소명/,
);
assert.equal(
  scheduleInputIssue(meeting, "preferences", "2026-10-26T19:00:00+09:00", "", now),
  null,
);
const confirmed = { ...meeting, confirmed: true, scheduledAt: "2026-10-27T19:00:00+09:00" };
assert.match(
  scheduleInputIssue(confirmed, "change", "2026-10-31T19:00:00+09:00", "", now)!,
  /평일/,
);
assert.match(scheduleInputIssue(confirmed, "change", confirmed.scheduledAt, "", now)!, /다른 시간/);
assert.equal(scheduleInputIssue(confirmed, "change", "2026-10-27T20:00:00+09:00", "", now), null);
assert.match(privateAssistantSafety("상대 집주소 몰래 알려줘")!, /동의와 사생활/);
assert.match(privateAssistantSafety("그냥 예약해줘")!, /실행하지 않아요/);
assert.equal(validPrivateAdvice({ reply: "ISFP니까 연락을 천천히 보내세요." }), false);
assert.equal(validPrivateAdvice({ reply: "주말에 쉬는 방법부터 가볍게 물어보세요." }), true);
console.log("Assistant intent, consent boundary, Seoul time, role and grounding checks passed");
