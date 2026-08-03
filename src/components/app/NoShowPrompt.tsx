import { useState } from "react";
import { AlertTriangle } from "lucide-react";
import { toast } from "sonner";

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
import { respondNoShow, type NoShowReport } from "@/lib/api";

/**
 * 나에게 접수된 노쇼 신고에 답하는 카드 (P4).
 *
 * 인정은 되돌릴 수 없고 즉시 영구 제명으로 이어지므로 확인 다이얼로그를 반드시
 * 거친다. 기한(24시간) 내 무응답도 확정으로 처리되므로 기한을 명시한다.
 */
export function NoShowPrompt({
  report,
  onResolved,
}: {
  report: NoShowReport;
  onResolved: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);

  const deadline = new Date(report.confirm_by);
  const deadlineLabel = deadline.toLocaleString("ko-KR", {
    month: "long",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });

  async function respond(admit: boolean) {
    setBusy(true);
    try {
      await respondNoShow(report.id, admit);
      toast.success(admit ? "인정으로 처리되었습니다." : "신고에 대해 답변했습니다.");
      onResolved();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "처리에 실패했습니다.");
    } finally {
      setBusy(false);
      setConfirmOpen(false);
    }
  }

  return (
    <div className="rounded-surface border border-destructive/35 bg-destructive/8 p-5">
      <div className="flex items-center gap-2">
        <AlertTriangle className="size-4 text-destructive" aria-hidden="true" />
        <p className="text-sm font-semibold text-destructive">확인이 필요합니다</p>
      </div>
      <p className="mt-2.5 text-sm leading-relaxed text-foreground/85">
        상대가 약속에 나오지 않았다고 신고했습니다. 사실이 아니라면 아니라고 답해 주세요.
      </p>
      <p className="mt-2 text-xs leading-relaxed text-muted-foreground">
        {deadlineLabel}까지 답하지 않으면 신고 내용이 사실로 확정되며, 서비스 이용이 영구적으로
        제한됩니다.
      </p>

      <div className="mt-5 flex gap-2">
        <Button variant="outline" className="flex-1" disabled={busy} onClick={() => respond(false)}>
          사실이 아닙니다
        </Button>
        <Button
          variant="destructive"
          className="flex-1"
          disabled={busy}
          onClick={() => setConfirmOpen(true)}
        >
          인정합니다
        </Button>
      </div>

      <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>노쇼를 인정하시겠어요?</AlertDialogTitle>
            <AlertDialogDescription>
              인정하면 서비스 이용이 영구적으로 제한되고 상대에게 만남 티켓이 재발급됩니다. 되돌릴
              수 없습니다.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={busy}>취소</AlertDialogCancel>
            <AlertDialogAction
              disabled={busy}
              onClick={(e) => {
                e.preventDefault();
                respond(true);
              }}
            >
              인정합니다
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
