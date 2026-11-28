export const TICKET_USE = {
  intro: "한 사람의 소개 프로필을 열 때 소개 티켓 1장을 사용해요.",
  meeting: "한 사람에게 날짜와 장소를 제안할 때 만남 티켓 1장을 사용해요.",
} as const;

export const TICKET_RETURN = {
  intro: "프로필을 열면 사용한 소개 티켓은 돌아오지 않아요.",
  meeting:
    "상대가 거절하거나 24시간 동안 응답하지 않거나 상대 사유로 취소되면, 원래 만료일 그대로 만남 티켓이 돌아와요.",
} as const;

export const TICKET_VALIDITY = "새 티켓은 발급일부터 12개월 동안 사용할 수 있어요.";
