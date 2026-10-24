export type ScheduleMeeting = {
  id: string;
  name: string | null;
  confirmed: boolean;
  scheduledAt: string | null;
  slots: string[] | null;
  dates: string[] | null;
  place: string | null;
  isFemale: boolean;
};
export type ScheduleAction = {
  id: string;
  meeting_id: string;
  kind: "preferences" | "accept_slot" | "confirm" | "change";
  args: { at?: string; dates?: string[]; slot?: number; place?: string; placeKind?: string };
  approval_token: string;
  preview: { name: string | null; dates: string[]; place: string | null };
  state: "awaiting_approval" | "succeeded" | "revoked" | "expired";
  expires_at: string;
};
export type ScheduleState = {
  enabled: boolean;
  meetings: ScheduleMeeting[];
  actions: ScheduleAction[];
};

/** Explicit Seoul date/time: never derive the appointment from the device timezone. */
export function seoulAppointment(date: string, time: string): string | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !/^\d{2}:\d{2}$/.test(time)) return null;
  const d = new Date(`${date}T${time}:00+09:00`);
  if (!Number.isFinite(d.getTime())) return null;
  const roundTrip = new Date(d.getTime() + 9 * 3600000).toISOString().slice(0, 16);
  return roundTrip === `${date}T${time}` ? d.toISOString() : null;
}

export function scheduleKind(m: ScheduleMeeting): ScheduleAction["kind"] | null {
  if (m.confirmed) return "change";
  if (m.isFemale) return m.slots?.length ? "accept_slot" : "preferences";
  return m.dates?.length && !m.slots?.length ? "confirm" : null;
}

/** Immediate input guidance; the approval RPC independently revalidates all dates. */
export function scheduleInputIssue(
  meeting: ScheduleMeeting,
  kind: ScheduleAction["kind"],
  at: string | null | undefined,
  place: string,
  now = Date.now(),
): string | null {
  const value = at ? Date.parse(at) : NaN;
  if (!Number.isFinite(value)) return "날짜와 시간을 선택해 주세요.";
  if (kind === "accept_slot")
    return value <= now ? "지난 시간이에요. 최신 제안을 확인해 주세요." : null;
  if (value < now + 3 * 3600000 || value > now + 21 * 86400000)
    return "지금부터 3시간 이후, 21일 이내의 시간을 골라주세요.";
  if (kind === "confirm" && (place.trim().length < 2 || place.trim().length > 100))
    return "찾아갈 수 있는 장소명을 2~100자로 적어주세요.";
  if (kind === "change") {
    const current = Date.parse(meeting.scheduledAt ?? "");
    if (!Number.isFinite(current) || current <= now + 3 * 3600000)
      return "약속이 임박했어요. 기존 약속 화면에서 변경 도움을 요청해 주세요.";
    if (value === current) return "현재 약속과 다른 시간을 골라주세요.";
    const seoul = new Date(value + 9 * 3600000);
    const minutes = seoul.getUTCHours() * 60 + seoul.getUTCMinutes();
    if ([0, 6].includes(seoul.getUTCDay()) || minutes < 18 * 60 || minutes > 22 * 60)
      return "변경할 시간은 한국 기준 평일 저녁 6시~10시 중 골라주세요.";
  }
  return null;
}

export const scheduleLabels = {
  preferences: "가능한 시간 전달",
  accept_slot: "제안받은 약속 확정",
  confirm: "시간·장소 확정",
  change: "시간 변경 요청",
};
