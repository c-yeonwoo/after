import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { ALREADY_RESOLVED } from "@/lib/admin";
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

/**
 * 사유를 받아 운영자 조작을 실행하는 공통부.
 *
 * 신고 처리 · 회원 정지 · 만남 취소가 전부 같은 규칙을 따른다.
 *
 *   · 사유 없이는 실행하지 않는다 (서버도 22023 으로 막지만, 왕복 전에 알린다)
 *   · 이미 처리된 대상이면 경합이다 — 장애처럼 알리지 않고 목록을 다시 부른다
 *   · 조작 중에는 버튼을 잠근다
 *
 * 화면마다 따로 쓰면 이 세 가지가 갈라진다. s16c 에서 "처리하지 못했습니다" 가
 * 경합까지 삼켜 자기 실수처럼 읽히던 문제를 고쳤는데, 같은 로직이 세 곳에
 * 복제되면 그 교훈도 한 곳에만 남는다.
 */
export type NoteActionItem = {
  label: string;
  /** 성공 토스트 문구. 없으면 label 을 쓴다. */
  done?: string;
  variant?: "default" | "outline" | "destructive";
  /** 토글이 켜져 있을 때만 의미가 있는 조작이면 true — 라벨 분기용이 아니다. */
  run: (note: string, toggled: boolean) => Promise<void>;
  confirmation?: (toggled: boolean) => string;
};

export function NoteAction({
  actions,
  toggle,
  placeholder = "사유 (필수 — 기록에 남습니다)",
  onDone,
  onEditingChange,
}: {
  actions: NoteActionItem[];
  toggle?: { label: string; defaultOn?: boolean };
  placeholder?: string;
  onDone: () => void | Promise<void>;
  onEditingChange?: (state: { dirty: boolean; busy: boolean }) => void;
}) {
  const [note, setNote] = useState("");
  const [on, setOn] = useState(toggle?.defaultOn ?? false);
  const [busy, setBusy] = useState(false);
  const lock = useRef(false);
  const [error, setError] = useState(false);
  const [confirm, setConfirm] = useState<NoteActionItem | null>(null);
  const trigger = useRef<HTMLButtonElement | null>(null);
  useEffect(() => {
    onEditingChange?.({ dirty: note.trim().length > 0, busy });
  }, [note, busy, onEditingChange]);

  async function act(item: NoteActionItem) {
    if (lock.current) return;
    if (note.trim().length === 0) {
      setError(true);
      toast.error("사유를 적어 주세요.");
      return;
    }
    lock.current = true;
    setError(false);
    setBusy(true);
    try {
      await item.run(note.trim(), on);
      toast.success(item.done ?? `${item.label} 처리했습니다.`);
      setNote("");
      setConfirm(null);
      await onDone();
    } catch (e) {
      if ((e as { code?: string } | null)?.code === ALREADY_RESOLVED) {
        // 경합은 장애가 아니다. 이유를 말하고 최신 상태를 보여준다.
        toast.error("다른 운영자가 먼저 처리했습니다.");
        setConfirm(null);
        await onDone();
      } else {
        toast.error("처리하지 못했습니다.");
      }
    } finally {
      lock.current = false;
      setBusy(false);
    }
  }

  return (
    <div className="mt-3" aria-busy={busy}>
      <Textarea
        rows={2}
        value={note}
        disabled={busy}
        aria-invalid={error || undefined}
        onChange={(e) => {
          setNote(e.target.value);
          setError(false);
        }}
        placeholder={placeholder}
        aria-label="사유"
      />
      {error ? (
        <p role="alert" className="mt-2 text-xs text-destructive">
          처리 사유를 입력해 주세요.
        </p>
      ) : null}
      {toggle ? (
        <label className="mt-2 flex min-h-11 items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={on}
            disabled={busy}
            onChange={(e) => setOn(e.target.checked)}
            className="size-4"
          />
          {toggle.label}
        </label>
      ) : null}
      <div className="mt-3 flex flex-wrap gap-2">
        {actions.map((a) => (
          <Button
            key={a.label}
            size="sm"
            variant={a.variant ?? "default"}
            aria-label={a.label}
            disabled={busy}
            onClick={(event) => {
              trigger.current = event.currentTarget;
              if (!note.trim()) {
                setError(true);
                return;
              }
              if (a.confirmation) setConfirm(a);
              else void act(a);
            }}
          >
            {a.label}
          </Button>
        ))}
      </div>
      {busy ? (
        <p role="status" className="mt-2 text-xs text-muted-foreground">
          처리 중입니다…
        </p>
      ) : null}
      <AlertDialog
        open={confirm !== null}
        onOpenChange={(open) => {
          if (!open && !lock.current) setConfirm(null);
        }}
      >
        <AlertDialogContent
          onCloseAutoFocus={(event) => {
            event.preventDefault();
            if (trigger.current?.isConnected) trigger.current.focus();
            else document.querySelector<HTMLElement>("main h1")?.focus();
          }}
        >
          <AlertDialogHeader>
            <AlertDialogTitle>{confirm?.label}할까요?</AlertDialogTitle>
            <AlertDialogDescription>{confirm?.confirmation?.(on)}</AlertDialogDescription>
          </AlertDialogHeader>
          <p className="whitespace-pre-wrap break-words text-sm">{note}</p>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={busy}>돌아가기</AlertDialogCancel>
            <AlertDialogAction
              disabled={busy}
              onClick={(event) => {
                event.preventDefault();
                if (confirm) void act(confirm);
              }}
            >
              {busy ? "처리 중…" : "확인하고 처리"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
