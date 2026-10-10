/**
 * 알림 문구 — 앱 푸시(send-notifications)와 화면 속 알림 목록(/notifications)이
 * **같은 파일**을 쓴다(2026-10-10, 메일 알림 → 앱 알림).
 *
 * Deno 와 브라우저가 둘 다 읽으므로 이 파일은 아무것도 import 하지 않는다. 화면은
 * 상대 경로로 이 파일을 가져간다(src/lib/notifications.ts). 문구가 두 곳에 있으면
 * 푸시와 목록이 다른 말을 하게 된다.
 *
 * 푸시 제목은 잠금화면에 그대로 뜬다. 상대 이름은 넣되 사적인 내용(사진·소개글·
 * 대화 본문)은 넣지 않는다.
 */

export type NotificationKind =
  | "notification_email_verify"
  | "intro_delivered"
  | "candidates_refilled"
  | "no_show_response_required"
  | "meeting_requested"
  | "prefs_submitted"
  | "meeting_confirmed"
  | "meeting_released"
  | "feedback_due";

export type NotificationCopy = { title: string; body: string; path: string };

export function notificationCopy(
  kind: NotificationKind,
  ctx: { counterpart?: string | null; meetingId?: string | null },
): NotificationCopy {
  // "님" 은 받침이 있어 "이·과" 를, 이름이 없을 때의 "상대" 는 "가·와" 를 받는다.
  const whoGa = ctx.counterpart ? `${ctx.counterpart}님이` : "상대가";
  const whoWa = ctx.counterpart ? `${ctx.counterpart}님과` : "상대와";
  const m = ctx.meetingId;

  switch (kind) {
    case "intro_delivered":
      return {
        title: "새 소개가 도착했어요",
        body: "준비되셨을 때 천천히 열어 보세요.",
        path: "/intro",
      };
    case "candidates_refilled":
      return {
        title: "새로 살펴볼 프로필이 있어요",
        body: "같은 퇴근권에 새 프로필이 준비됐어요.",
        path: "/intro",
      };
    case "no_show_response_required":
      return {
        title: "약속 불참 신고에 답해 주세요",
        body: "사실과 다르다면 24시간 안에 답해 주세요. 운영팀이 양쪽 기록을 확인해요.",
        path: "/home",
      };
    case "meeting_requested":
      return {
        title: `${whoGa} 만나고 싶어 해요`,
        body: "보내 준 시간 중 하나만 고르면 약속이 정해져요. 24시간 안에 답해 주세요.",
        path: "/requests",
      };
    case "prefs_submitted":
      return {
        title: `${whoGa} 가능한 날짜를 보냈어요`,
        body: "하나를 고르면 약속이 정해지고 대화가 열려요.",
        path: m ? `/schedule?meetingId=${m}` : "/home",
      };
    case "meeting_confirmed":
      return {
        title: "만남이 정해졌어요",
        body: `${whoWa}의 약속이 확정됐어요. 대화방에서 인사를 나눠 보세요.`,
        path: "/chats",
      };
    // 거절인지 무응답인지는 말하지 않는다(DeclineRequest 의 약속). 티켓이 돌아왔다는 사실만.
    case "meeting_released":
      return {
        title: "만남 티켓을 돌려드렸어요",
        body: "이번 소개는 약속으로 이어지지 않았어요. 다음 소개에 그대로 쓰실 수 있어요.",
        path: "/home",
      };
    case "feedback_due":
      return {
        title: "어제 만남은 어떠셨어요?",
        body: `${whoWa} 만나셨는지만 알려 주셔도 큰 도움이 돼요. 상대에게는 보이지 않아요.`,
        path: m ? `/feedback?meetingId=${m}` : "/home",
      };
    case "notification_email_verify":
      // 메일 알림을 걷어내며 더 만들지 않는다. 예전에 쌓인 행만 남아 있을 수 있다.
      return { title: "알림 설정", body: "", path: "/settings" };
  }
}
