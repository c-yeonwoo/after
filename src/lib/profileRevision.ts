import { supabase } from "@/lib/supabase";
import type { ProfileStoryV3 } from "@/lib/profileStory";

export type ProfileRevisionDraft = {
  id: string;
  instruction: string;
  state: "pending" | "ready" | "approved" | "discarded" | "failed" | "expired";
  before: ProfileStoryV3 | null;
  after: ProfileStoryV3 | null;
  note: string | null;
  createdAt: string;
  expiresAt: string;
  approvedAt: string | null;
};
export type ProfileRevisionState = { enabled: boolean; draft: ProfileRevisionDraft | null };

async function revisionRpc<T>(name: string, args: Record<string, unknown> = {}): Promise<T> {
  const caller = supabase as unknown as {
    rpc(
      name: string,
      args: Record<string, unknown>,
    ): Promise<{ data: T; error: { code?: string } | null }>;
  };
  const { data, error } = await caller.rpc(name, args);
  if (error)
    throw new Error(
      error.code === "PT409"
        ? "context_changed"
        : error.code === "PT429"
          ? "daily_limit"
          : "unavailable",
    );
  return data;
}

export const getProfileRevision = () => revisionRpc<ProfileRevisionState>("my_profile_revision");
export const getProfileRevisionById = (id: string) =>
  revisionRpc<ProfileRevisionState>("my_profile_revision", { p_id: id });
export const approveProfileRevision = (id: string, approved: boolean) =>
  revisionRpc<{ id: string; state: string; reused?: boolean }>("approve_profile_revision", {
    p_id: id,
    p_approved: approved,
  });

export async function generateProfileRevision(instruction: string, requestId: string) {
  const { data, error } = await supabase.functions.invoke<{ code?: string; state?: string }>(
    "revise-profile",
    { body: { instruction, requestId, consent: true } },
  );
  if (error || data?.code) {
    let code = data?.code;
    if (error && "context" in error && error.context instanceof Response) {
      try {
        code = (await error.context.json()).code;
      } catch {
        /* Recovery uses the request receipt. */
      }
    }
    throw new Error(code ?? "unknown_result");
  }
  if (data?.state === "failed") throw new Error("generation_failed");
}

export type ProfileRevisionChange = { label: string; before: string; after: string };
export function profileRevisionChanges(
  before: ProfileStoryV3,
  after: ProfileStoryV3,
): ProfileRevisionChange[] {
  const changes = [
    { label: "한 줄 소개", before: before.headline, after: after.headline },
    { label: "짧은 소개", before: before.summary, after: after.summary },
    ...after.sections.map((section) => ({
      label: section.question,
      before: before.sections.find((previous) => previous.id === section.id)?.answer ?? "",
      after: section.answer,
    })),
    ...before.sections
      .filter((section) => !after.sections.some((next) => next.id === section.id))
      .map((section) => ({ label: section.question, before: section.answer, after: "" })),
    {
      label: "대화 실마리",
      before: before.conversationHooks.join(" · "),
      after: after.conversationHooks.join(" · "),
    },
  ];
  return changes.filter((change) => change.before !== change.after);
}
