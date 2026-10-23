import { useBlocker } from "@tanstack/react-router";
import { useCallback, useEffect, useRef, useState } from "react";

import { Button } from "@/components/ui/button";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

/** Refreshes preserve the last successful result; keyed workspaces isolate filters. */
export function useReviewQueue<T>(fetchRows: () => Promise<T>) {
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const generation = useRef(0);
  const load = useCallback(async () => {
    const id = ++generation.current;
    setLoading(true);
    try {
      const next = await fetchRows();
      if (generation.current !== id) return;
      setData(next);
      setError(false);
    } catch {
      if (generation.current === id) setError(true);
    } finally {
      if (generation.current === id) setLoading(false);
    }
  }, [fetchRows]);
  useEffect(() => {
    void load();
    return () => {
      generation.current += 1;
    };
  }, [load]);
  return { data, loading, error, load };
}

/** Protect both in-page switching and router/browser navigation, including Safari clicks. */
export function useReviewGuard(dirty: boolean, busy: boolean) {
  const [pending, setPending] = useState<(() => void) | null>(null);
  const returnFocus = useRef<HTMLElement | null>(null);
  const blocker = useBlocker({
    shouldBlockFn: () => true,
    disabled: !dirty && !busy,
    enableBeforeUnload: dirty || busy,
    withResolver: true,
  });
  const ask = (action: () => void, target?: HTMLElement) => {
    if (busy) return;
    if (dirty) {
      returnFocus.current = target ?? (document.activeElement as HTMLElement);
      setPending(() => action);
    } else action();
  };
  const close = () => {
    setPending(null);
    blocker.reset?.();
  };
  const dialog = (
    <AlertDialog
      open={pending !== null || blocker.status === "blocked"}
      onOpenChange={(open) => {
        if (!open) close();
      }}
    >
      <AlertDialogContent
        onCloseAutoFocus={(event) => {
          event.preventDefault();
          const target = returnFocus.current;
          if (target?.isConnected && target !== document.body) target.focus();
          else
            (
              document.querySelector<HTMLElement>("main textarea:not(:disabled)") ??
              document.querySelector<HTMLElement>("main h1")
            )?.focus();
        }}
      >
        <AlertDialogHeader>
          <AlertDialogTitle>
            {busy ? "처리를 마무리하고 있어요" : "작성 중인 내용이 있어요"}
          </AlertDialogTitle>
          <AlertDialogDescription>
            {busy
              ? "결과가 확인될 때까지 이 화면에서 기다려 주세요."
              : "이동하면 저장하지 않은 내용이 사라집니다."}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel onClick={close}>계속 작성하기</AlertDialogCancel>
          <AlertDialogAction
            disabled={busy}
            onClick={() => {
              if (pending) {
                const next = pending;
                setPending(null);
                next();
              } else blocker.proceed?.();
            }}
          >
            내용 버리고 이동
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
  return { ask, dialog };
}
