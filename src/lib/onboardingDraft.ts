import { useEffect, useRef, useState } from "react";
import { supabase } from "./supabase";
import { emptyBasics, type Basics } from "@/components/onboarding/basics";
import type { Json } from "./database.types";

const PREFIX = "after:profile-draft:v1:";
export type OnboardingDraft = {
  basics: Basics;
  step: number;
  meetingAreas: string[];
  hubId: string;
};
export function clearLocalOnboardingDraft(owner?: string) {
  try {
    if (owner) localStorage.removeItem(PREFIX + owner);
    else
      Object.keys(localStorage)
        .filter((k) => k.startsWith(PREFIX))
        .forEach((k) => localStorage.removeItem(k));
  } catch {
    /* Storage may be disabled. Server persistence remains available. */
  }
}
export function parseOnboardingDraft(value: unknown, owner: string): OnboardingDraft | null {
  if (!value || typeof value !== "object") return null;
  const v = value as OnboardingDraft;
  if (![2, 15, 11].includes(v.step) || !v.basics || typeof v.basics !== "object") return null;
  const basics = { ...emptyBasics };
  for (const k of Object.keys(emptyBasics) as (keyof Basics)[]) {
    if (k === "photos") continue;
    if (typeof v.basics[k] !== "string" || v.basics[k].length > 500) return null;
    basics[k] = v.basics[k];
  }
  if (
    !Array.isArray(v.basics.photos) ||
    v.basics.photos.length > 6 ||
    v.basics.photos.some(
      (p) => typeof p !== "string" || !p.startsWith(owner + "/") || p.includes(".."),
    )
  )
    return null;
  basics.photos = v.basics.photos;
  if (
    !Array.isArray(v.meetingAreas) ||
    v.meetingAreas.length > 20 ||
    v.meetingAreas.some((a) => typeof a !== "string" || a.length > 80) ||
    typeof v.hubId !== "string"
  )
    return null;
  return { ...v, basics };
}
/** Private unpublished drafts. Local pending writes survive reload; server owns revision. */
export function useOnboardingDraft(
  owner: string | null,
  active: boolean,
  snapshot: OnboardingDraft,
  onRestore: (d: OnboardingDraft) => void,
) {
  const [ready, setReady] = useState(false);
  const [status, setStatus] = useState<"saving" | "saved" | "error" | "conflict">("saved");
  const [retry, setRetry] = useState(0);
  const [saveTick, setSaveTick] = useState(0);
  const revision = useRef(0),
    last = useRef("");
  const current = useRef(snapshot);
  current.current = snapshot;
  const restore = useRef(onRestore);
  restore.current = onRestore;
  const queue = useRef(Promise.resolve());
  const generation = useRef(0);
  useEffect(() => {
    const gen = ++generation.current;
    setReady(false);
    revision.current = 0;
    last.current = "";
    if (!owner || !active) return;
    void (async () => {
      const { data, error } = await supabase.rpc("my_onboarding_draft", { p_owner: owner });
      if (gen !== generation.current) return;
      if (error) {
        setStatus("error");
        return;
      }
      const row = data as { data: unknown; revision: number } | null;
      revision.current = row?.revision ?? 0;
      let draft = parseOnboardingDraft(row?.data, owner);
      let conflict = false;
      try {
        const local = JSON.parse(localStorage.getItem(PREFIX + owner) ?? "null");
        if (local && local.expires <= Date.now()) clearLocalOnboardingDraft(owner);
        if (local && local.expires > Date.now()) {
          const pending = parseOnboardingDraft(local.data, owner);
          if (pending) {
            conflict =
              local.revision !== revision.current &&
              JSON.stringify(pending) !== JSON.stringify(row?.data);
            draft = pending;
          }
        }
      } catch {
        /* A malformed/expired local draft never blocks server recovery. */
      }
      if (draft) {
        current.current = draft;
        restore.current(draft);
      }
      last.current = row ? JSON.stringify(row.data) : "";
      setStatus(conflict ? "conflict" : "saved");
      setReady(true);
    })();
    return () => {
      if (generation.current === gen) generation.current = gen + 1;
    };
  }, [owner, active, retry]);
  const serialized = JSON.stringify(snapshot);
  useEffect(() => {
    if (
      !owner ||
      !active ||
      !ready ||
      ![2, 15, 11].includes(snapshot.step) ||
      status === "conflict"
    )
      return;
    const value = JSON.parse(serialized) as OnboardingDraft;
    if (serialized === last.current) return;
    try {
      localStorage.setItem(
        PREFIX + owner,
        JSON.stringify({
          data: value,
          revision: revision.current,
          expires: Date.now() + 7 * 86400000,
        }),
      );
    } catch {
      /* Show server save status below. */
    }
    setStatus("saving");
    const gen = generation.current;
    const timer = setTimeout(() => {
      queue.current = queue.current
        .catch(() => {})
        .then(async () => {
          if (gen !== generation.current) return;
          const { data, error } = await supabase.rpc("save_onboarding_draft", {
            p_owner: owner,
            p_data: value as unknown as Json,
            p_revision: revision.current,
          });
          if (gen !== generation.current) return;
          if (error) {
            setStatus(error.code === "PT409" ? "conflict" : "error");
            return;
          }
          revision.current = data;
          last.current = serialized;
          try {
            localStorage.setItem(
              PREFIX + owner,
              JSON.stringify({
                data: current.current,
                revision: data,
                expires: Date.now() + 7 * 86400000,
              }),
            );
          } catch {
            /* Server write succeeded. */
          }
          if (JSON.stringify(current.current) === serialized) setStatus("saved");
        });
    }, 400);
    return () => clearTimeout(timer);
    // Status updates must not restart the debounce and cancel the pending write.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [serialized, owner, active, ready, saveTick]);
  useEffect(() => {
    if (status !== "saving" && status !== "error" && status !== "conflict") return;
    const warn = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [status]);
  return {
    ready,
    status,
    retry: () => {
      if (status === "conflict" && owner) clearLocalOnboardingDraft(owner);
      setRetry((n) => n + 1);
    },
    keepLocal: async () => {
      if (!owner || !active) return;
      const gen = ++generation.current;
      setStatus("saving");
      try {
        const { data, error } = await supabase.rpc("my_onboarding_draft", { p_owner: owner });
        if (gen !== generation.current) return;
        if (error) {
          setStatus("error");
          return;
        }
        const row = data as { data: unknown; revision: number } | null;
        revision.current = row?.revision ?? 0;
        last.current = row ? JSON.stringify(row.data) : "";
        setStatus("saved");
        setSaveTick((n) => n + 1);
      } catch {
        if (gen === generation.current) setStatus("error");
      }
    },
  };
}
