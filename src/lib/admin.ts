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
export type AdminReport = Database["public"]["Functions"]["admin_reports"]["Returns"][number];

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

/**
 * 신고 처리. `note` 는 서버에서 필수다 — 빈 문자열이면 22023 으로 거부된다.
 * 사유 없는 강제 조작이 admin_actions 에 남지 않게 하려는 것이다.
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
