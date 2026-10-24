/** Deterministic safety boundary; the model never has execution tools. */
export function privateAssistantSafety(text: string): string | null {
  if (/자살|자해|죽고\s*싶|죽일|살해|협박|폭행|스토킹/.test(text))
    return "지금은 소개팅 조언보다 안전이 먼저예요. 즉각적인 위험이 있다면 현지 긴급기관과 믿을 수 있는 사람에게 도움을 요청해 주세요. 앱 안의 신고·고객센터에서도 도움을 요청할 수 있어요.";
  if (
    /몰래|거절.*(무시|설득)|조종|가스라이팅|신상|집주소|전화번호.*(찾|알아)|술.*취하게/.test(text)
  )
    return "상대의 동의와 사생활을 넘는 방법은 도와드릴 수 없어요. 부담 없는 질문으로 의사를 확인하고, 거절하면 그대로 존중해 주세요.";
  if (/결제|환불|취소해|예약해|보내줘|확정해/.test(text))
    return "이 대화에서는 약속이나 결제를 실행하지 않아요. 일정은 초안을 확인한 뒤 직접 승인할 수 있고, 취소·환불은 기존 약속 화면이나 고객센터에서 진행해 주세요.";
  return null;
}

export function validPrivateAdvice(value: unknown): value is { reply: string } {
  if (!value || typeof value !== "object") return false;
  const reply = (value as { reply?: unknown }).reply;
  return (
    typeof reply === "string" &&
    reply.trim().length >= 10 &&
    reply.length <= 1000 &&
    !/https?:\/\/|010[-\s]?\d{4}[-\s]?\d{4}|\b[IE][NS][FT][JP]\b|애착유형|회피형|자기애성|성공률|궁합.*\d|예약했|전송했|확정했|결제했|저장했|반드시.*좋아/iu.test(
      reply,
    )
  );
}
