import assert from "node:assert/strict";
import { assistantIntent, accountChecksComplete } from "../src/lib/assistant";
import type { Profile } from "../src/lib/api";
import { validConversationPreparation } from "../supabase/functions/_shared/conversation-prep";
import {
  privateAssistantSafety,
  validPrivateAdvice,
} from "../supabase/functions/_shared/assistant-private";
import { seoulAppointment, scheduleKind, scheduleInputIssue } from "../src/lib/assistantSchedule";
import {
  assistantReply,
  assistantWelcome,
  historicalAssistantActions,
  visibleAssistantActions,
  type AssistantContext,
} from "../src/lib/assistantExperience";
import {
  assistantServiceReply,
  assistantStatusText,
} from "../supabase/functions/_shared/assistant-workflow";

assert.deepEqual(assistantWelcome(" 지훈 ", null), {
  greeting: "지훈님, 반가워요.",
  invitation: "오늘은 어떤 이야기를 나눠볼까요?",
});
assert.equal(assistantWelcome("  ", null).greeting, "안녕하세요, 반가워요.");
assert.equal(assistantWelcome(undefined, NaN).invitation, "오늘은 어떤 이야기를 나눠볼까요?");
for (const [iso, invitation] of [
  ["2026-10-24T20:00:00Z", "오늘 하루는 어떻게 시작하고 계세요?"],
  ["2026-10-25T02:00:00Z", "오늘은 어떤 이야기를 나눠볼까요?"],
  ["2026-10-25T08:00:00Z", "오늘 하루는 어땠어요?"],
  ["2026-10-25T13:00:00Z", "늦은 시간에도 편하게 이야기해요."],
  ["2026-10-25T15:00:00Z", "늦은 시간에도 편하게 이야기해요."],
]) {
  assert.equal(assistantWelcome("지안", Date.parse(iso)).invitation, invitation);
}

assert.equal(assistantIntent("약속 취소해줘"), "support");
assert.equal(assistantIntent("대화 주제 알려줘"), "prepare");
assert.equal(assistantIntent("아무 이야기"), "unknown");
assert.equal(assistantIntent("오늘 우울해"), "unknown");
const routingCases = [
  ["프로필 준비", "profile"],
  ["프로필 대화 준비 도와줘", "profile"],
  ["소개글 수정해줘", "edit_story"],
  ["사진 바꿔줘", "edit_photo"],
  ["프로필 수정해줘", "edit"],
  ["가입하려면 어떻게 해?", "signup"],
  ["회사 메일 인증 코드가 안 와", "signup"],
  ["결제하고 싶어", "payment"],
  ["티켓은 얼마야?", "payment"],
  ["소개 보여줘", "intro"],
  ["좋아요", "interest"],
  ["호감 보내줘", "interest"],
  ["약속 잡아줘", "schedule"],
  ["가능한 시간", "schedule"],
  ["지금 상태", "status"],
  ["기억 저장해줘", "memory"],
  ["상대 맞춤 조언", "prepare"],
  ["처음 만나는 날 긴장이 돼요", "unknown"],
  ["질문만 계속하게 되는데 어떻게 해?", "unknown"],
  ["상대가 좋아요라고 답했는데 무슨 의미일까", "unknown"],
  ["기억해 둔 내 선호로 첫 만남 분위기를 추천해줘", "unknown"],
  ["휴대폰 인증이 안 돼요", "signup"],
  ["이메일 인증이 안 와요", "signup"],
  ["만남을 취소하고 싶어요", "support"],
  ["상대 프로필을 바탕으로 대화 주제를 추천해줘", "prepare"],
] as const;
for (const [text, intent] of routingCases) assert.equal(assistantIntent(text), intent, text);

// R01/R08 regressions: ordinary Korean advice must not open payment or a text generator.
const routingRegressions = [
  ["상대 답장을 얼마나 기다려야 할까요?", "unknown"],
  ["만난 지 얼마 안 됐는데 다시 만나자고 해도 될까요?", "unknown"],
  ["얼마나 자주 연락하면 좋을까", "unknown"],
  ["얼마야?", "unknown"],
  ["이용료가 얼마야?", "payment"],
  ["티켓 가격 알려줘", "payment"],
  ["사진은 안 바꾸고 약속 시간 변경해줘", "schedule"],
  ["사진은 안바꾸고 약속시간변경해줘", "schedule"],
  ["사진은 수정하지 말고 약속 시간을 바꿔줘", "schedule"],
  ["사진 말고 소개글 수정해줘", "edit_story"],
  ["소개글은 바꾸지 말고 사진을 바꿔줘", "edit_photo"],
  ["프로필은 그대로 두고 티켓 가격 알려줘", "payment"],
  ["사진 바꾸지 마세요", "unknown"],
  ["소개글에서 마지막 문장만 삭제해줘", "edit_story"],
  ["마지막 문장 삭제", "edit_story"],
  ["마지막 문장 지워줘", "edit_story"],
  ["두 번째 문장은 원래대로", "edit_story"],
  ["더 다정하게", "edit_story"],
  ["좀 더 다정하게 해줘", "edit_story"],
  ["내 소개 글을 더 자연스럽게 해줘", "edit_story"],
  ["소개글 수정해주세여", "edit_story"],
  ["상대에게 더 다정하게 말하고 싶어요", "unknown"],
  ["상대 답변을 어떻게 이해하면 될까", "unknown"],
  ["내 키를 180으로 수정해줘", "edit_facts"],
  ["기본정보 변경해줘", "edit_facts"],
  ["직업 바꿔줘", "edit_facts"],
  ["키가 작아서 자신이 없어", "unknown"],
  ["사진 밝기와 해상도 확인해줘", "edit_photo"],
  ["사진 좀 봐줘", "edit_photo"],
  ["사진 속 인물 성격 분석해줘", "edit_photo"],
  ["사진 바꿔주고 소개글도 수정해줘", "edit"],
  ["사진 바꾸고 약속 시간도 변경해줘", "clarify"],
  ["티켓 가격과 약속 시간 확인해줘", "clarify"],
  ["사진 변경하고 상대를 신고하고 싶어", "support"],
  ["왜 아직 소개가 없어?", "status"],
  ["왜 소개가 안 와요?", "status"],
  ["아직 소개가 안 오는데", "status"],
  ["만남 후기 남기고 싶어", "feedback"],
  ["만남 결과", "feedback"],
  ["만나지 못했어요", "unknown"],
] as const;
for (const [text, intent] of routingRegressions) assert.equal(assistantIntent(text), intent, text);
for (const text of [
  "상대 답장을 얼마나 기다려야 할까요?",
  "만난 지 얼마 안 됐는데 다시 만나자고 해도 될까요?",
])
  assert.equal(assistantServiceReply(text), null, "ordinary advice has no payment template");
for (const text of ["사진 바꿔줘", "사진 밝기와 해상도 확인해줘", "사진 속 인물 성격 분석해줘"]) {
  const reply = assistantServiceReply(text)!;
  assert.match(reply, /기기 안에서 밝기·해상도·비율/);
  assert.match(reply, /성격을 판독하지 않/);
  assert.doesNotMatch(reply, /수정안|소개글을 바꿀/);
}
assert.match(assistantServiceReply("마지막 문장 삭제")!, /문장을 선택/);
assert.match(assistantServiceReply("키를 수정해줘")!, /기본 정보/);
assert.match(assistantServiceReply("프로필 수정")!, /어느 부분/);
assert.match(assistantServiceReply("사진 바꾸고 약속 시간도 변경해줘")!, /어떤 것부터/);
assert.match(assistantServiceReply("왜 아직 소개가 없어?", "waiting")!, /소개를 준비 중/);
assert.match(assistantServiceReply("만남 후기 남기고 싶어")!, /자동으로 제출하지 않/);
const ctx: AssistantContext = { gender: "male", complete: true, schedule: false, memory: false };
assert.deepEqual(visibleAssistantActions(["home", "profile"], "/home"), ["profile"]);
assert.deepEqual(visibleAssistantActions(["home"], "/home/"), []);
assert.deepEqual(visibleAssistantActions(["home"], "/assistant"), ["home"]);
assert.deepEqual(visibleAssistantActions(["prepare"], "/home"), []);
assert.deepEqual(visibleAssistantActions(["prepare"], "/home", "permitted"), ["prepare"]);
assert.deepEqual(assistantReply("intro", { ...ctx, state: "waiting" }).actions, []);
assert.match(assistantReply("intro", { ...ctx, state: "waiting" }).text, /아직 새 소개가 없어요/);
assert.deepEqual(assistantReply("intro", { ...ctx, state: "paused" }).actions, ["settings"]);
assert.deepEqual(assistantReply("intro", { ...ctx, state: "intro_available" }).actions, ["intro"]);
assert.deepEqual(assistantReply("intro", { ...ctx, complete: false, state: "waiting" }).actions, [
  "account",
]);
assert.deepEqual(
  assistantReply("schedule", { ...ctx, schedule: true, hasMeeting: false, hasOpenIntro: false })
    .actions,
  ["intro", "availability"],
);
assert.deepEqual(
  assistantReply("schedule", { ...ctx, schedule: true, hasMeeting: false, hasOpenIntro: true })
    .actions,
  ["meeting", "availability"],
);
assert.equal(assistantIntent("이 여자 소개시켜줘"), "intro");
assert.deepEqual(
  assistantReply("schedule", { ...ctx, gender: "female", hasMeeting: false }).actions,
  ["requests", "intro"],
);
assert.deepEqual(
  assistantReply("schedule", { ...ctx, complete: false, hasMeeting: false }).actions,
  ["account"],
);
assert.deepEqual(assistantReply("payment", ctx).actions, ["store", "meeting"]);
assert.ok(!assistantReply("payment", { ...ctx, gender: "female" }).actions.includes("store"));
assert.deepEqual(assistantReply("edit", { ...ctx, complete: false }).actions, ["account"]);
assert.ok(
  !assistantReply("schedule", ctx).actions.includes("schedule"),
  "disabled flag has existing flow fallback",
);
assert.ok(assistantReply("schedule", { ...ctx, schedule: true }).actions.includes("schedule"));
assert.deepEqual(assistantReply("status", { ...ctx, state: "request_received" }).actions, [
  "requests",
]);
assert.deepEqual(assistantReply("prepare", { ...ctx, counterpartId: "permitted" }).actions, [
  "prepare",
]);
assert.deepEqual(assistantReply("prepare", ctx).actions, ["intro"]);
const changedCounterpartContext: AssistantContext = {
  ...ctx,
  counterpartId: "new-current-counterpart",
  state: "schedule_selection",
  schedule: true,
  hasMeeting: true,
};
for (const intent of ["prepare", "intro", "interest"] as const)
  assert.deepEqual(
    historicalAssistantActions(intent, changedCounterpartContext),
    ["intro"],
    "historical advice cannot bind to today's counterpart",
  );
for (const intent of ["status", "schedule", "feedback"] as const)
  assert.deepEqual(
    historicalAssistantActions(intent, changedCounterpartContext),
    ["appointments"],
    "historical work cannot select today's active meeting",
  );
assert.deepEqual(historicalAssistantActions("support", changedCounterpartContext), [
  "appointments",
  "support",
]);
assert.deepEqual(historicalAssistantActions("payment", changedCounterpartContext), ["store"]);
assert.deepEqual(
  historicalAssistantActions("payment", { ...changedCounterpartContext, gender: "female" }),
  ["intro"],
);
assert.deepEqual(assistantReply("prepare", changedCounterpartContext).actions, ["prepare"]);
for (const intent of ["edit_photo", "edit_facts"] as const)
  assert.deepEqual(
    assistantReply(intent, { ...ctx, profileEdit: true }).actions,
    ["edit"],
    "photo/fact requests must not open paid story generation",
  );
assert.deepEqual(assistantReply("edit_story", { ...ctx, profileEdit: true }).actions, ["revise"]);
assert.deepEqual(
  assistantReply("edit", { ...ctx, profileEdit: true }).actions,
  ["profile"],
  "general edit opens the shared profile hub",
);
assert.deepEqual(
  assistantReply("profile", ctx).actions,
  ["profile"],
  "profile has one entry point",
);
assert.deepEqual(assistantReply("clarify", changedCounterpartContext).actions, []);
assert.match(assistantServiceReply("今", "waiting") ?? "unknown", /unknown/);
assert.match(assistantServiceReply("진행 상태", "photos_pending")!, /사진을 확인 중/);
assert.match(assistantStatusText("unrecognized"), /확인하지 못/);
assert.equal(assistantServiceReply("처음 만나는 날 긴장이 많이 돼요"), null);
assert.match(assistantServiceReply("대화 팁 알려줘")!, /공개 프로필/);
assert.match(
  assistantServiceReply("결제 방법", null, "female")!,
  /여성 회원에게 티켓 구매를 요청하지 않아요/,
);
assert.deepEqual(assistantReply("status", { ...ctx, state: "schedule_selection" }).actions, [
  "meeting",
]);
assert.match(
  privateAssistantSafety("프로필을 몰래 보고 집주소를 찾아줘", { execution: false })!,
  /동의와 사생활/,
);
assert.equal(privateAssistantSafety("티켓 결제 방법", { execution: false }), null);
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
