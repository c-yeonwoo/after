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
  화면이 기대하는 모양을 여기 한 곳에 적어 둔다.

  profile 은 **Row 전체가 아니다.** s23 에서 서버를 허용 목록으로 바꿨으므로
  (민감 컬럼이 새 컬럼으로 추가돼도 안 나가게), 여기서도 나가는 것만 적는다.
  Row 를 그대로 쓰면 실제로는 오지 않는 필드를 타입이 있다고 말한다.
*/
type ProfileRow = Database["public"]["Tables"]["profiles"]["Row"];

export type AdminMemberDetail = {
  profile: Pick<
    ProfileRow,
    | "id"
    | "gender"
    | "hub_id"
    | "company_email"
    | "email_verified_at"
    | "account_state"
    | "banned_reason"
    | "name"
    | "birth"
    | "job"
    | "photo_url"
    | "mbti"
    | "smoking"
    | "drinking"
    | "religion"
    | "headline"
    | "interests"
    | "match_tags"
    | "topics"
    | "onboarding_step"
    | "created_at"
    | "intro"
    | "details"
    | "terms_agreed_at"
    | "privacy_agreed_at"
    | "agreed_policy_version"
    | "paused_at"
    | "role"
    | "photo_state"
    | "photo_reviewed_at"
    | "photo_reject_reason"
  >;
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
  flow: {
    open_intros: number;
    active_meetings: number;
    confirmed: number;
    completed: number;
    queued_cards: number;
  };
  backlog: {
    pending_reports: number;
    pending_no_shows: number;
    /** 검수 대기 사진 수 = 지금 아무에게도 보이지 않는 회원 수 */
    pending_photos: number;
    /** 아직 어느 큐에도 들어가지 않은 호감 = 큐레이션 대기 */
    unmatched_likes: number;
    /** 큐가 비어 지금 아무것도 못 받는 활성 남성 */
    starved_males: number;
    oldest_like_hours: number | null;
  };
  quality: {
    intros_total: number;
    intros_passed: number;
    intros_used: number;
    /** 큐레이션 노동이 회수되는 비율의 분모·분자 (문서 §5 단위 경제) */
    cards_delivered: number;
    cards_opened: number;
    cards_expired: number;
  };
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
  /** true = 쉬는 중만, false = 활동 중만, undefined = 전체 */
  paused?: boolean;
  query?: string;
};

export async function fetchMembers(f: MemberFilters = {}): Promise<AdminMember[]> {
  const { data, error } = await supabase.rpc("admin_members", {
    p_gender: f.gender ?? undefined,
    p_state: f.state ?? undefined,
    p_hub: f.hub ?? undefined,
    p_paused: f.paused ?? undefined,
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

// ─────────────────── 큐레이션 ───────────────────

export type CurationTarget =
  Database["public"]["Functions"]["admin_curation_targets"]["Returns"][number];
export type LikePoolItem = Database["public"]["Functions"]["admin_like_pool"]["Returns"][number];

/** 작업 대상(남성) 목록. 큐가 빈 사람부터, 그중 오래 기다린 순. */
export async function fetchCurationTargets(): Promise<CurationTarget[]> {
  const { data, error } = await supabase.rpc("admin_curation_targets");
  if (error) throw error;
  return data ?? [];
}

/** 이 남성을 좋다고 한, 아직 큐에 없는 여성들. */
export async function fetchLikePool(maleId: string): Promise<LikePoolItem[]> {
  const { data, error } = await supabase.rpc("admin_like_pool", { p_male: maleId });
  if (error) throw error;
  return data ?? [];
}

/**
 * 현재 큐. **RPC 로 읽는다** — PostgREST 임베드로 profiles 를 조인하면 그쪽 RLS 에
 * 막혀 이름이 null 로 온다(실제로 그렇게 짰다가 "(이름 없음)" 이 떴다).
 */
export type QueueCard = Database["public"]["Functions"]["admin_queue"]["Returns"][number];

export async function fetchQueue(maleId: string): Promise<QueueCard[]> {
  const { data, error } = await supabase.rpc("admin_queue", { p_male: maleId });
  if (error) throw error;
  return data ?? [];
}

/**
 * 큐를 순서째 덮어쓴다. 부분 수정이 아니다 — 화면에서 순서를 마음껏 바꾸고
 * 한 번에 저장한다. 서버가 호감 풀 밖의 사람을 거절하므로 불변식은 안전하다.
 */
export async function setQueue(maleId: string, femaleIds: string[], note: string): Promise<number> {
  const { data, error } = await supabase.rpc("admin_set_queue", {
    p_male: maleId,
    p_female_ids: femaleIds,
    p_note: note,
  });
  if (error) throw error;
  return data ?? 0;
}

// ─────────────────── 큐레이터 지표 ───────────────────

export type CuratorStats =
  Database["public"]["Functions"]["admin_curator_stats"]["Returns"][number];

/**
 * 큐레이터별 퍼널. **비율은 서버가 계산하지 않는다** — 분자·분모를 그대로 받아
 * 화면이 나눈다. 40% 만 오면 그게 2/5 인지 40/100 인지 알 수 없고, 운영자는
 * 1/1 을 100% 로 읽는다.
 */
export async function fetchCuratorStats(since?: Date): Promise<CuratorStats[]> {
  const { data, error } = await supabase.rpc("admin_curator_stats", {
    p_since: since ? since.toISOString() : undefined,
  });
  if (error) throw error;
  return data ?? [];
}

// ─────────────────── 사진 검수 ───────────────────

export type PhotoState = Database["public"]["Enums"]["photo_state"];
export type PhotoReviewItem =
  Database["public"]["Functions"]["admin_photo_queue"]["Returns"][number];

export async function fetchPhotoQueue(state: PhotoState = "pending"): Promise<PhotoReviewItem[]> {
  const { data, error } = await supabase.rpc("admin_photo_queue", { p_state: state });
  if (error) throw error;
  return data ?? [];
}

/**
 * 승인·반려. 반려 사유는 **사용자에게 보인다**(profiles.photo_reject_reason) —
 * 그래서 서버가 사유를 필수로 받는다.
 */
export async function reviewPhoto(userId: string, approve: boolean, note: string): Promise<void> {
  const { error } = await supabase.rpc("admin_review_photo", {
    p_user: userId,
    p_approve: approve,
    p_note: note,
  });
  if (error) throw error;
}

// ─────────────────── 노쇼 신고 ───────────────────

export type NoShowReport =
  Database["public"]["Functions"]["admin_no_show_reports"]["Returns"][number];

export async function fetchNoShowReports(state?: ReportState): Promise<NoShowReport[]> {
  const { data, error } = await supabase.rpc("admin_no_show_reports", {
    p_state: state ?? undefined,
  });
  if (error) throw error;
  return data ?? [];
}

/**
 * 노쇼 판정. 확정을 뒤집으면 서버가 제명을 풀지만 **보상 티켓은 회수하지
 * 않는다** — 이미 나간 것을 사후 판단으로 빼앗지 않는다.
 *
 * 기각된 건을 다시 인정으로 되돌릴 수는 없다({@link ALREADY_RESOLVED}).
 */
export async function resolveNoShow(
  reportId: string,
  upheld: boolean,
  note: string,
): Promise<void> {
  const { error } = await supabase.rpc("admin_resolve_no_show", {
    p_report_id: reportId,
    p_upheld: upheld,
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
