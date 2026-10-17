import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";

/** Account-scoped foreground reads. Interactions cancel stale reads before taking a lock. */
export function useMemberLiveQuery<T>(
  scope: string,
  userId: string | undefined,
  read: (signal: AbortSignal) => Promise<T>,
  enabled = true,
) {
  const client = useQueryClient();
  const key = useMemo(() => [scope, userId ?? null], [scope, userId]);
  const identity = JSON.stringify(key);
  const [locks, setLocks] = useState({ identity, count: 0 });
  const held = locks.identity === identity && locks.count > 0;
  const active = Boolean(userId && enabled && !held);
  const query = useQuery({
    queryKey: key,
    queryFn: async ({ signal }) => {
      const result = await read(signal);
      signal.throwIfAborted();
      return result;
    },
    enabled: active,
    retry: false,
    refetchInterval: active ? 15_000 : false,
    refetchIntervalInBackground: false,
    refetchOnWindowFocus: "always",
    refetchOnReconnect: "always",
  });
  const { refetch } = query;
  useEffect(() => {
    if (!active) return;
    const focus = () => {
      if (document.visibilityState === "visible" && navigator.onLine !== false)
        void refetch({ cancelRefetch: false });
    };
    window.addEventListener("focus", focus);
    return () => window.removeEventListener("focus", focus);
  }, [active, refetch]);

  const beginInteraction = useCallback(() => {
    void client.cancelQueries({ queryKey: key, exact: true });
    setLocks((previous) => ({
      identity,
      count: previous.identity === identity ? previous.count + 1 : 1,
    }));
    let released = false;
    return () => {
      if (released) return;
      released = true;
      setLocks((previous) =>
        previous.identity === identity
          ? { identity, count: Math.max(0, previous.count - 1) }
          : previous,
      );
      void client.invalidateQueries({ queryKey: key, exact: true });
    };
  }, [client, key, identity]);

  const update = useCallback(
    (change: (previous: T) => T) =>
      client.setQueryData<T>(key, (previous) =>
        previous === undefined ? previous : change(previous),
      ),
    [client, key],
  );
  return { ...query, beginInteraction, update };
}

/** Hold across a confirmation dialog, including a failed submit and its retry. */
export function useInteractionHold(begin?: () => () => void) {
  const release = useRef<(() => void) | null>(null);
  const hold = () => {
    if (!release.current) release.current = begin?.() ?? null;
  };
  const finish = useCallback(() => {
    release.current?.();
    release.current = null;
  }, []);
  useEffect(() => finish, [finish]);
  return { hold, finish };
}
