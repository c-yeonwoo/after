import { supabase } from "@/lib/supabase";
import type { Meeting } from "@/lib/api";

export type MeetingChangeState = {
  revision: number;
  asOf: string;
  scheduledAt: string;
  canRequest: boolean;
  change: null | {
    id: string;
    proposedAt: string;
    requestedBy: string;
    state: string;
    expiresAt: string;
  };
};

export async function getMeetingChange(id: string): Promise<MeetingChangeState> {
  const r = await supabase.rpc("my_meeting_change", { p_meeting_id: id });
  if (r.error) throw r.error;
  return r.data as unknown as MeetingChangeState;
}
export async function requestMeetingChange(
  id: string,
  at: string,
  revision: number,
  requestId: string,
) {
  const r = await supabase.rpc("request_meeting_change", {
    p_meeting_id: id,
    p_proposed_at: at,
    p_expected_revision: revision,
    p_request_id: requestId,
  });
  if (r.error) throw r.error;
  return r.data as unknown as MeetingChangeState;
}
export async function respondMeetingChange(id: string, accept: boolean): Promise<Meeting> {
  const r = await supabase.rpc("respond_meeting_change", { p_change_id: id, p_accept: accept });
  if (r.error) throw r.error;
  return r.data;
}
