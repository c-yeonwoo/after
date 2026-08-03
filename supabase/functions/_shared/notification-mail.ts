// S9 — 알림 메일 문안.
//
// 문안을 워커에서 분리해 둔다: 카피는 자주 바뀌고 발송 로직은 거의 안 바뀐다.
//
// 원칙 — 메일이 곧 다음 행동이다.
//   · 제목에 무슨 일이 일어났는지를 넣는다. "애프터 알림" 같은 제목은 안 연다.
//   · 본문은 세 줄 이내. 링크 하나. 24시간 기한이 있으면 반드시 명시한다.
//   · 상대의 이름만 쓰고 회사·나이 같은 건 넣지 않는다 — 메일은 받는 사람의
//     회사 메일함에 남고, 우리는 그 메일함을 통제하지 못한다.

export type NotificationKind =
  "meeting_requested" | "prefs_submitted" | "meeting_confirmed" | "feedback_due";

export type MailContext = {
  /** 받는 사람 이름 */
  name: string | null;
  /** 상대 이름 (있으면) */
  counterpart: string | null;
  /** 앱 진입 경로 (절대 URL) */
  url: string;
};

export type RenderedMail = { subject: string; text: string };

const BRAND = "애프터";

function greet(name: string | null) {
  return name ? `${name}님,` : "안녕하세요,";
}

export function renderNotification(kind: NotificationKind, ctx: MailContext): RenderedMail {
  const who = ctx.counterpart ?? "상대";

  switch (kind) {
    case "meeting_requested":
      return {
        subject: `${who}님이 만나고 싶다고 하셨어요 — ${BRAND}`,
        text: [
          greet(ctx.name),
          "",
          `${who}님이 만남 티켓을 사용했습니다.`,
          "가능한 날과 편한 역만 알려 주시면 됩니다.",
          "",
          "24시간 안에 답이 없으면 요청은 자동으로 취소되고 상대의 티켓은 환불됩니다.",
          "",
          ctx.url,
        ].join("\n"),
      };

    case "prefs_submitted":
      return {
        subject: `${who}님이 가능한 날짜를 보내주셨어요 — ${BRAND}`,
        text: [
          greet(ctx.name),
          "",
          `${who}님이 가능한 날짜와 편한 지역을 보내주셨습니다.`,
          "하나를 고르시면 대화가 열립니다.",
          "",
          ctx.url,
        ].join("\n"),
      };

    case "meeting_confirmed":
      return {
        subject: `만남이 확정되었어요 — ${BRAND}`,
        text: [
          greet(ctx.name),
          "",
          `${who}님이 날짜와 장소를 정했습니다. 대화방이 열렸어요.`,
          "사적인 이야기까지 나눌 수 있는 대화는 만나기 전날 저녁 6시에 열립니다.",
          "",
          ctx.url,
        ].join("\n"),
      };

    case "feedback_due":
      return {
        subject: `어제 만남은 어떠셨어요? — ${BRAND}`,
        text: [
          greet(ctx.name),
          "",
          `${who}님과의 만남이 어떠셨는지 한 가지만 여쭤봅니다.`,
          "만나셨는지 여부만 알려 주셔도 큰 도움이 됩니다.",
          "",
          "남겨 주신 내용은 상대에게 공개되지 않습니다.",
          "",
          ctx.url,
        ].join("\n"),
      };
  }
}

/** 알림 종류별 착지 경로. 메일을 열고 한 번 눌러 끝나는 곳으로 보낸다. */
export function pathFor(kind: NotificationKind, meetingId: string | null): string {
  switch (kind) {
    case "meeting_requested":
      return "/requests";
    case "prefs_submitted":
      return meetingId ? `/schedule?meetingId=${meetingId}` : "/home";
    case "meeting_confirmed":
      return "/chats";
    case "feedback_due":
      return meetingId ? `/feedback?meetingId=${meetingId}` : "/home";
  }
}
