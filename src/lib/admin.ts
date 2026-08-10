import { supabase } from "@/lib/supabase";
import type { Database } from "@/lib/database.types";

/**
 * 운영자 전용 호출.
 *
 * **권한은 여기서 판정하지 않는다.** 모든 함수가 서버에서 is_admin() 을 통과해야
 * 실행되고, 통과하지 못하면 42501 로 튕긴다. 클라이언트의 역할 확인은 화면을
 * 감추는 것이지 보안이 아니다 — 이 앱은 PostgREST 를 직접 부르는 구조라 프론트
 * 가드는 우회된다.
 */

export type ReportState = Database["public"]["Enums"]["report_state"];
export type Gender = Database["public"]["Enums"]["gender"];
export type AccountState = Database["public"]["Enums"]["account_state"];
export type AdminReport = Database["public"]["Functions"]["admin_reports"]["Returns"][number];
export type AdminMember = Database["public"]["Functions"]["admin_members"]["Returns"][number];
export type AdminMeeting = Database["public"]["Functions"]["admin_meetings"]["Returns"][number];

/** 만남 목록 필터. 서버가 같은 문자열을 검증하니 여기서 벗어나면 22023 이다. */
export type MeetingFilter = "active" | "confirmed" | "completed" | "cancelled";

/*
  회원 상세는 jsonb 한 덩이로 온다. 생성된 타입은 Json 이라 그대로는 못 쓴다 —
  화면이 기대하는 모양을 여기 한 곳에 적어 둔다. 서버가 to_jsonb(profiles) 를
  그대로 내보내므로 profile 은 Row 타입을 재사용한다.
*/
export type AdminMemberDetail = {
  profile: Database["public"]["Tables"]["profiles"]["Row"];
  tickets: {
    id: string;
    kind: string;
    state: Database["public"]["Enums"]["ticket_state"];
    price_krw: number;
    issued_at: string;
    used_at: string | null;
    refunded_at: string | null;
  }[];
  meetings: {
    id: string;
    counterpart: string | null;
    counterpart_id: string;
    role: "male" | "female";
    scheduled_at: string | null;
    place_name: string | null;
    confirmed_at: string | null;
    completed_at: string | null;
    cancelled_at: string | null;
    cancel_reason: string | null;
    created_at: string;
  }[];
  reports_against: {
    id: string;
    kind: Database["public"]["Enums"]["report_kind"];
    state: ReportState;
    detail: string;
    created_at: string;
    reporter_name: string | null;
  }[];
  reports_filed: {
    id: string;
    kind: Database["public"]["Enums"]["report_kind"];
    state: ReportState;
    detail: string;
    created_at: string;
    accused_name: string | null;
  }[];
  admin_actions: {
    kind: string;
    note: string;
    created_at: string;
    actor_name: string | null;
  }[];
};

export type AdminDashboard = {
  members: { female: number; male: number; paused: number; banned: number };
  flow: { open_intros: number; active_meetings: number; confirmed: number; completed: number };
  backlog: {
    pending_reports: number;
    pending_no_shows: number;
    unmatched_likes: number;
    oldest_like_hours: number | null;
  };
  quality: { intros_total: number; intros_passed: number; intros_used: number };
};

/** 내가 운영자인가. 화면 분기용 — 최종 판정은 항상 서버다. */
export async function amIAdmin(): Promise<boolean> {
  const { data, error } = await supabase.rpc("is_admin");
  if (error) return false;
  return Boolean(data);
}

export async function fetchDashboard(): Promise<AdminDashboard> {
  const { data, error } = await supabase.rpc("admin_dashboard");
  if (error) throw error;
  return data as unknown as AdminDashboard;
}

export async function fetchReports(state?: ReportState): Promise<AdminReport[]> {
  const { data, error } = await supabase.rpc("admin_reports", {
    p_state: state ?? undefined,
  });
  if (error) throw error;
  return data ?? [];
}

// ─────────────────── 회원 ───────────────────

export type MemberFilters = {
  gender?: Gender;
  state?: AccountState;
  hub?: string;
  query?: string;
};

export async function fetchMembers(f: MemberFilters = {}): Promise<AdminMember[]> {
  const { data, error } = await supabase.rpc("admin_members", {
    p_gender: f.gender ?? undefined,
    p_state: f.state ?? undefined,
    p_hub: f.hub ?? undefined,
    p_query: f.query?.trim() ? f.query.trim() : undefined,
  });
  if (error) throw error;
  return data ?? [];
}

export async function fetchMemberDetail(userId: string): Promise<AdminMemberDetail> {
  const { data, error } = await supabase.rpc("admin_member_detail", { p_user: userId });
  if (error) throw error;
  return data as unknown as AdminMemberDetail;
}

/**
 * 정지·해제. 정지하면 서버가 진행 중 만남을 끊고, 티켓 주인이 위반자가 아니면
 * 환불까지 한다 — 화면에서 따로 부를 것이 없다.
 */
export async function setAccountState(
  userId: string,
  state: AccountState,
  note: string,
): Promise<void> {
  const { error } = await supabase.rpc("admin_set_account_state", {
    p_user: userId,
    p_state: state,
    p_note: note,
  });
  if (error) throw error;
}

// ─────────────────── 만남 ───────────────────

export async function fetchMeetings(state?: MeetingFilter): Promise<AdminMeeting[]> {
  const { data, error } = await supabase.rpc("admin_meetings", {
    p_state: state ?? undefined,
  });
  if (error) throw error;
  return data ?? [];
}

export async function cancelMeeting(
  meetingId: string,
  note: string,
  refund: boolean,
): Promise<void> {
  const { error } = await supabase.rpc("admin_cancel_meeting", {
    p_meeting: meetingId,
    p_note: note,
    p_refund: refund,
  });
  if (error) throw error;
}

/**
 * 이미 처리된 대상을 또 건드렸을 때 서버가 주는 코드. 운영자 둘이 같은 목록을
 * 보고 있으면 반드시 일어나는 정상적인 경합이라, 장애가 아니라 "늦었다" 로
 * 안내해야 한다. 신고 처리와 만남 취소가 같은 규약을 쓴다.
 */
export const ALREADY_RESOLVED = "PT409";

/**
 * 신고 처리. `note` 는 서버에서 필수다 — 빈 문자열이면 22023 으로 거부된다.
 * 사유 없는 강제 조작이 admin_actions 에 남지 않게 하려는 것이다.
 *
 * 이미 처리된 건이면 {@link ALREADY_RESOLVED} 코드로 튕긴다.
 */
export async function resolveReport(
  reportId: string,
  upheld: boolean,
  note: string,
  ban = false,
): Promise<void> {
  const { error } = await supabase.rpc("resolve_content_report", {
    p_report_id: reportId,
    p_upheld: upheld,
    p_note: note,
    p_ban: ban,
  });
  if (error) throw error;
}
