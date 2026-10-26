import type { AssistantIntent } from "./assistant";
import { assistantServiceReply } from "../../supabase/functions/_shared/assistant-workflow";

export type AssistantAction =
  | "account"
  | "profile"
  | "edit"
  | "revise"
  | "intro"
  | "meeting"
  | "store"
  | "schedule"
  | "availability"
  | "requests"
  | "appointments"
  | "memory"
  | "support"
  | "settings"
  | "prepare"
  | "home";
export type AssistantReply = { text: string; actions: AssistantAction[] };
export type AssistantContext = {
  gender: "male" | "female" | null;
  complete: boolean;
  status?: string;
  state?: string;
  counterpartId?: string | null;
  hasMeeting?: boolean;
  hasOpenIntro?: boolean;
  schedule: boolean;
  memory: boolean;
  profileEdit?: boolean;
};

/** A small welcome, not an AI call or a claim about the member's mood. */
export function assistantWelcome(name: string | null | undefined, now: number | null) {
  const displayName = name?.trim().replace(/\s+/gu, " ");
  const greeting = displayName ? `${displayName}님, 반가워요.` : "안녕하세요, 반가워요.";
  let invitation = "오늘은 어떤 이야기를 나눠볼까요?";
  if (now !== null && Number.isFinite(now)) {
    const hour = Number(
      new Intl.DateTimeFormat("en-GB", {
        timeZone: "Asia/Seoul",
        hour: "2-digit",
        hourCycle: "h23",
      }).format(new Date(now)),
    );
    if (hour >= 5 && hour < 11) invitation = "오늘 하루는 어떻게 시작하고 계세요?";
    else if (hour >= 17 && hour < 22) invitation = "오늘 하루는 어땠어요?";
    else if (hour >= 22 || hour < 5) invitation = "늦은 시간에도 편하게 이야기해요.";
  }
  return { greeting, invitation };
}

/** Keep navigation useful on the current surface, including empty replies. */
export function visibleAssistantActions(
  actions: AssistantAction[],
  pathname: string,
  counterpartId?: string | null,
): AssistantAction[] {
  const currentPath = pathname.replace(/\/+$/, "");
  return actions.filter(
    (action) =>
      !(action === "home" && currentPath === "/home") && !(action === "prepare" && !counterpartId),
  );
}

/** Routes to a bounded structured step; never executes a consequential action. */
export function assistantReply(intent: AssistantIntent, context: AssistantContext): AssistantReply {
  const generic = (query: string, actions: AssistantAction[]): AssistantReply => ({
    text: assistantServiceReply(query, undefined, context.gender)!,
    actions,
  });
  switch (intent) {
    case "status":
      return {
        text: context.status ?? "홈에서 실제 진행 상황과 다음 단계를 확인해 주세요.",
        actions:
          context.state === "request_received"
            ? ["requests"]
            : context.state === "meeting_confirmed" || context.state === "meeting_outcome_required"
              ? ["appointments"]
              : context.state === "schedule_selection"
                ? [context.schedule ? "schedule" : "meeting"]
                : ["home"],
      };
    case "signup":
      return context.complete
        ? {
            text: "계정에서 필요한 인증은 홈에 안내돼요. 문제가 계속되면 고객센터로 알려주세요.",
            actions: ["home", "support"],
          }
        : generic("가입", ["account"]);
    case "profile":
      return context.complete
        ? {
            text: "상대에게 보이는 내 프로필이에요. 바꾸고 싶은 내용은 수정에서 정리해요.",
            actions: ["profile", "edit"],
          }
        : generic("프로필 준비", ["account"]);
    case "edit":
      return generic(
        "프로필 수정",
        context.complete ? (context.profileEdit ? ["revise", "edit"] : ["edit"]) : ["account"],
      );
    case "coach_profile":
      return {
        text: "내 프로필에서 표현을 점검할 수 있어요. AI 상담이 열리면 원문을 함께 읽고 코칭해요.",
        actions: [context.complete ? "profile" : "account"],
      };
    /* General edit preserves the existing confirmation flow. */
    case "edit_photo":
      return generic("사진 바꿔줘", [context.complete ? "edit" : "account"]);
    case "edit_facts":
      return generic("기본정보 변경해줘", [context.complete ? "edit" : "account"]);
    case "edit_story":
      return context.complete && context.profileEdit
        ? {
            text: "바꾸고 싶은 이야기를 들려주세요. 수정안을 함께 보고, 괜찮으면 프로필에 반영해요.",
            actions: ["revise", "edit"],
          }
        : generic("소개글 수정", [context.complete ? "edit" : "account"]);
    case "clarify":
      return { text: "한 가지씩 도와드릴게요. 어떤 것부터 할까요?", actions: [] };
    case "feedback":
      return generic("만남 후기 남기고 싶어", [context.complete ? "appointments" : "account"]);
    case "intro":
      if (context.complete && context.state === "waiting")
        return {
          text: "아직 새 소개가 없어요. 도착한 소개는 소개 탭에서 확인할 수 있어요.",
          actions: [],
        };
      if (context.complete && context.state === "paused")
        return {
          text: "소개를 잠시 쉬고 있어요. 나 → 환경설정에서 다시 받을 수 있어요.",
          actions: ["settings"],
        };
      return generic("소개 보여줘", [context.complete ? "intro" : "account"]);
    case "interest":
      return context.gender === "female"
        ? generic("좋아요", [context.complete ? "intro" : "account"])
        : {
            text: "소개를 읽고 마음이 가면 만남을 요청해 주세요. 티켓 사용과 날짜·장소는 보내기 전에 확인해요.",
            actions: [context.complete ? "intro" : "account"],
          };
    case "payment":
      return context.gender === "male" && context.complete
        ? generic("결제", ["store", "meeting"])
        : {
            text:
              context.gender === "female"
                ? "현재 여성 회원에게 티켓 구매를 요청하지 않아요. 소개와 도착한 만남 요청을 확인해 주세요."
                : "먼저 가입과 프로필 준비를 마쳐주세요. 현재 이용 조건은 이후 화면에서 확인해요.",
            actions: context.complete ? ["intro", "requests"] : ["account"],
          };
    case "schedule":
      if (context.complete && context.hasMeeting === false)
        return {
          text:
            context.gender === "male"
              ? "먼저 소개를 확인하고 만남을 요청해 주세요. 날짜·장소를 함께 제안할 수 있어요."
              : "만남 요청이 오면 편한 시간을 함께 정해요. 지금은 소개를 살펴보세요.",
          actions:
            context.gender === "male"
              ? [context.hasOpenIntro ? "meeting" : "intro", "availability"]
              : ["requests", "intro"],
        };
      return !context.complete
        ? generic("일정", ["account"])
        : context.schedule
          ? generic("일정", ["schedule", "availability"])
          : {
              text: "일정 실행 비서는 아직 준비 중이에요. 기존 약속 화면에서 직접 확인·조율할 수 있어요.",
              actions:
                context.gender === "female"
                  ? ["requests", "appointments", "availability"]
                  : ["meeting", "appointments", "availability"],
            };
    case "prepare":
      return context.counterpartId
        ? {
            text: "공개된 프로필에서 대화의 실마리를 찾아드릴게요. 상대의 마음을 추측하지 않아요.",
            actions: ["prepare"],
          }
        : {
            text: "소개가 열리면 그분에게 맞는 대화 팁을 준비해요. 일반적인 고민은 자유롭게 물어봐 주세요.",
            actions: ["intro"],
          };
    case "memory":
      return context.memory
        ? generic("기억 관리", ["memory"])
        : {
            text: "기억 저장은 아직 준비 중이에요. 프로필은 기존 수정 화면에서 바꿀 수 있어요.",
            actions: ["profile"],
          };
    case "support":
      return generic("약속 취소", ["appointments", "support"]);
    case "unknown":
      return {
        text: "소개·프로필·일정·티켓 이용 방법을 안내해드릴 수 있어요. 궁금한 항목을 골라주세요.",
        actions: [],
      };
  }
}

/** Historical text is not authority to choose today's counterpart or execute a task. */
export function historicalAssistantActions(
  intent: AssistantIntent,
  context: Pick<AssistantContext, "gender" | "complete" | "memory" | "profileEdit">,
): AssistantAction[] {
  if (["status", "schedule", "feedback", "support"].includes(intent))
    return intent === "support" ? ["appointments", "support"] : ["appointments"];
  if (["prepare", "intro", "interest"].includes(intent)) return ["intro"];
  if (intent === "payment") return context.gender === "male" ? ["store"] : ["intro"];
  return assistantReply(intent, { ...context, schedule: false }).actions;
}
