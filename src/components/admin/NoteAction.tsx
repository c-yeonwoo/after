import { useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { ALREADY_RESOLVED } from "@/lib/admin";

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
};

export function NoteAction({
  actions,
  toggle,
  placeholder = "사유 (필수 — 기록에 남습니다)",
  onDone,
}: {
  actions: NoteActionItem[];
  toggle?: { label: string; defaultOn?: boolean };
  placeholder?: string;
  onDone: () => void;
}) {
  const [note, setNote] = useState("");
  const [on, setOn] = useState(toggle?.defaultOn ?? false);
  const [busy, setBusy] = useState(false);

  async function act(item: NoteActionItem) {
    if (note.trim().length === 0) {
      toast.error("사유를 적어 주세요.");
      return;
    }
    setBusy(true);
    try {
      await item.run(note.trim(), on);
      toast.success(item.done ?? `${item.label} 처리했습니다.`);
      setNote("");
      onDone();
    } catch (e) {
      if ((e as { code?: string } | null)?.code === ALREADY_RESOLVED) {
        // 경합은 장애가 아니다. 이유를 말하고 최신 상태를 보여준다.
        toast.error("다른 운영자가 먼저 처리했습니다.");
        onDone();
      } else {
        toast.error("처리하지 못했습니다.");
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mt-3">
      <Textarea
        rows={2}
        value={note}
        onChange={(e) => setNote(e.target.value)}
        placeholder={placeholder}
        aria-label="사유"
      />
      {toggle ? (
        <label className="mt-2 flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={on}
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
            disabled={busy}
            onClick={() => void act(a)}
          >
            {a.label}
          </Button>
        ))}
      </div>
    </div>
  );
}
