/** Kept beside every command that records checkin-v1 acknowledgement. */
export function MeetingPolicyNote() {
  return (
    <p className="my-3 text-xs leading-relaxed text-muted-foreground">
      약속이 확정되면 참석을 한 번 더 확인해요. 안내를 읽은 뒤에도 약속 2시간 전까지 두 분 모두
      확인하지 않으면 자동취소되고 만남 티켓은 돌아와요. 미응답이 반복되면 운영팀이 확인해요.
    </p>
  );
}
