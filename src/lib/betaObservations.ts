import { supabase } from "@/lib/supabase";
export type BetaWait = {
  waiting: number;
  oldest_seconds: number | null;
  total_seconds: number | null;
  total_n: number;
  review_seconds: number | null;
  review_n: number;
  intro_seconds: number | null;
  intro_n: number;
};
export type WaveSeat = {
  gender: "female" | "male";
  seat: number;
  code: string | null;
  stage: string;
};
export type InviteBetaObservationsData = {
  wave_one?: WaveSeat[];
  wave_attendance?: {
    matured: number;
    observing: number;
    no_clock: number;
    unlinked: number;
    attendees: number;
    meetings: number;
  };
  pool?: {
    week_start: string;
    week_end: string;
    women: number;
    men: number;
    women_with_slot: number;
    men_with_slot: number;
  };
  followup?: { reviewed: number; shown: number; reflected: number };
  waits: Record<"female" | "male", BetaWait>;
  reactions: { yes: number; total: number };
  actions: Partial<Record<string, { logged: number; manual: number }>>;
};

export async function fetchInviteBetaObservations() {
  const { data, error } = await supabase.rpc("admin_invite_beta_observations");
  if (error) throw error;
  return data as unknown as InviteBetaObservationsData;
}
