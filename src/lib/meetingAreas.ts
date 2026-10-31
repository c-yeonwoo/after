import { supabase } from "./supabase";
import type { Profile } from "./api";
import { HUBS } from "./brand";

export const CAPITAL_AREAS = [
  "gangnam",
  "jongno",
  "yeouido",
  "seoul",
  "pangyo",
  "gyeonggi",
  "incheon",
];
export const meetingAreaLabel = (id: string) =>
  HUBS.find((area) => area.id === id)?.label ?? "미정";

export async function myMeetingAreas(): Promise<string[]> {
  const { data, error } = await supabase.rpc("my_meeting_areas");
  if (error) throw error;
  return data ?? [];
}

export async function saveMeetingAreas(primary: string, areas: string[]): Promise<Profile> {
  const { data, error } = await supabase.rpc("set_my_meeting_areas", {
    p_primary: primary,
    p_areas: areas,
  });
  if (error) throw error;
  return data;
}
