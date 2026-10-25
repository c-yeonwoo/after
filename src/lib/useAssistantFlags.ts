import { useQuery } from "@tanstack/react-query";
import { getAssistantFlags } from "./privateAssistant";

/** Shared UI capability snapshot, not an authorization decision. Every write
 * remains protected by the live server flags/consent. No persistent storage.
 */
export function useAssistantFlags(owner: string | undefined) {
  return useQuery({
    queryKey: ["assistant-capabilities", owner ?? null],
    queryFn: getAssistantFlags,
    enabled: Boolean(owner),
    staleTime: 60_000,
    gcTime: 5 * 60_000,
    retry: false,
    refetchInterval: 60_000,
    refetchIntervalInBackground: false,
    refetchOnWindowFocus: true,
    refetchOnReconnect: true,
  });
}
