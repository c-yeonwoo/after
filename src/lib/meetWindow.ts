import { supabase } from "@/lib/supabase";

export type MeetWindow = {
  weekdays: number[];
  earliest_local: string;
  updated_at: string;
  fresh: boolean;
};

export type AdminMeetWindow = Omit<MeetWindow, "fresh"> & { user_id: string };

export const WEEKDAY_LABELS = ["", "월", "화", "수", "목", "금"] as const;

export async function myMeetWindow(): Promise<MeetWindow | null> {
  const { data, error } = await supabase.rpc("my_meet_window");
  if (error) throw error;
  return data as MeetWindow | null;
}

export async function saveMyMeetWindow(weekdays: number[], earliestLocal: string) {
  const { data, error } = await supabase.rpc("save_my_meet_window", {
    p_weekdays: weekdays,
    p_earliest_local: earliestLocal,
  });
  if (error) throw error;
  return data as MeetWindow;
}

export async function clearMyMeetWindow(): Promise<void> {
  const { error } = await supabase.rpc("clear_my_meet_window");
  if (error) throw error;
}

export async function suggestedMeetingSlots(introId: string): Promise<string[]> {
  const { data, error } = await supabase.rpc("suggested_meeting_slots", { p_intro_id: introId });
  if (error) throw error;
  return (data ?? []).map((row) => row.slot);
}

export async function adminMeetWindows(userIds: string[]): Promise<AdminMeetWindow[]> {
  if (userIds.length === 0) return [];
  const unique = [...new Set(userIds)];
  const batches = Array.from({ length: Math.ceil(unique.length / 50) }, (_, index) =>
    unique.slice(index * 50, index * 50 + 50),
  );
  const results = await Promise.all(
    batches.map(async (batch) => {
      const { data, error } = await supabase.rpc("admin_meet_windows", { p_users: batch });
      if (error) throw error;
      return data ?? [];
    }),
  );
  return results.flat();
}

export function isMeetWindowFresh(window: Pick<MeetWindow, "updated_at"> | undefined): boolean {
  return Boolean(window && Date.now() - Date.parse(window.updated_at) < 14 * 24 * 60 * 60 * 1000);
}
