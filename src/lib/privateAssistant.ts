import { supabase } from "./supabase";

export type AssistantFlags = {
  chat: boolean;
  memory: boolean;
  schedule: boolean;
  introduction?: boolean;
  profileEdit?: boolean;
};
export type AssistantMemory = {
  id: string;
  content: string;
  version: number;
  source_kind: string;
  approved_at: string;
  expires_at: string;
};
export type AssistantPrivateState = {
  flags: AssistantFlags;
  consented: boolean;
  revision: number;
  memories: AssistantMemory[];
  turns: {
    id: string;
    question: string;
    answer: string | null;
    state: "pending" | "complete" | "failed";
    created_at: string;
  }[];
};
type AssistantRpcName =
  | "assistant_capabilities"
  | "my_assistant_state"
  | "assistant_consent"
  | "assistant_save_memory"
  | "assistant_forget"
  | "my_assistant_schedule"
  | "assistant_draft_schedule"
  | "assistant_approve_schedule"
  | "assistant_revoke_schedule"
  | "admin_assistant_health";

export type AssistantHealth = {
  asOf: string;
  flags: AssistantFlags;
  turnsPending: number;
  turnsStalled: number;
  actionsAwaiting: number;
  actionsExpired: number;
  actionsSucceeded: number;
  runs24h: {
    feature: string;
    status: string;
    count: number;
    input_tokens: number;
    output_tokens: number;
  }[];
  cleanup: {
    name: string;
    active: boolean;
    lastStatus: string | null;
    lastFinished: string | null;
  }[];
};
// Explicit isolated RPC contract until the next generated schema refresh.
export async function assistantRpc<T>(
  name: AssistantRpcName,
  args: Record<string, unknown> = {},
): Promise<T> {
  const rpc = supabase as unknown as {
    rpc(
      name: string,
      args: Record<string, unknown>,
    ): Promise<{ data: T; error: { code?: string; message?: string } | null }>;
  };
  const { data, error } = await rpc.rpc(name, args);
  if (error)
    throw new Error(
      error.code === "PT409" ? "changed" : error.code === "PT429" ? "limit" : "unavailable",
    );
  return data;
}
export const getAssistantFlags = () => assistantRpc<AssistantFlags>("assistant_capabilities");
export const getPrivateAssistant = () => assistantRpc<AssistantPrivateState>("my_assistant_state");

export async function askPrivateAssistant(question: string, requestId: string, revision: number) {
  const { data, error } = await supabase.functions.invoke<{ code?: string; state?: string }>(
    "assistant-chat",
    { body: { question, requestId, revision } },
  );
  if (error || data?.code) {
    let code = data?.code;
    if (error && "context" in error && error.context instanceof Response) {
      try {
        code = (await error.context.json()).code;
      } catch {
        /* safe fallback */
      }
    }
    throw new Error(code ?? "unknown_result");
  }
  if (data?.state === "failed") throw new Error("turn_failed");
  return data;
}
