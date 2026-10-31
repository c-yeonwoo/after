import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useMe } from "./me";
import { useMemberLiveQuery } from "./useMemberLiveQuery";
import { assistantRpc, getAssistantFlags } from "./privateAssistant";
import {
  introduceMember,
  introductionProfileFingerprint,
  readIntroductionProfiles,
} from "./memberIntroduction";

/** Home warms the actual readable candidate; detail reuses the same in-memory/server cache. */
export function useMemberIntroduction(targetId: string) {
  const { me } = useMe();
  const client = useQueryClient();
  const live = useMemberLiveQuery(
    `member-introduction:${targetId}`,
    me?.id,
    async () => {
      const flags = await client.fetchQuery({
        queryKey: ["assistant-capabilities", me?.id ?? null],
        queryFn: getAssistantFlags,
        staleTime: 60_000,
        retry: false,
      });
      const consented = flags.introduction
        ? await assistantRpc<number | null>("my_introduction_consent")
        : null;
      const profiles =
        me && flags.introduction && consented !== null
          ? await readIntroductionProfiles(me.id, targetId)
          : null;
      return {
        owner: me?.id,
        target: targetId,
        enabled: Boolean(flags.introduction && consented !== null),
        consentRevision: consented,
        profiles,
      };
    },
    Boolean(me?.id && targetId && me.id !== targetId),
  );
  const context =
    !live.isError && !live.isPaused && live.data?.owner === me?.id && live.data?.target === targetId
      ? live.data
      : null;
  const fingerprint = context?.profiles ? introductionProfileFingerprint(context.profiles) : "";
  const brief = useQuery({
    queryKey: [
      "member-introduction-brief",
      me?.id,
      targetId,
      fingerprint,
      context?.consentRevision,
    ],
    queryFn: async () => {
      const result = await introduceMember(targetId, crypto.randomUUID());
      const latest = await readIntroductionProfiles(me!.id, targetId);
      if (
        !latest ||
        introductionProfileFingerprint(latest) !== fingerprint ||
        result.viewerId !== me!.id ||
        result.targetId !== targetId
      )
        throw new Error("changed");
      return result;
    },
    enabled: Boolean(context?.enabled && fingerprint),
    staleTime: 5 * 60_000,
    gcTime: 5 * 60_000,
    retry: false,
    retryOnMount: false,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
  });
  return {
    context,
    brief,
    visible:
      context?.enabled && brief.data && Date.parse(brief.data.expiresAt) > Date.now()
        ? brief.data
        : null,
  };
}
