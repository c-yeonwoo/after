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
 * 인정·부인 어느 쪽도 자동 제재하지 않고 운영자가 양쪽 기록을 확인한다.
 * 다만 인정은 중요한 진술이므로 실수로 누르지 않게 확인 다이얼로그를 거친다.
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
      toast.success("답변을 보냈습니다. 운영팀이 확인할게요.");
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
        {deadlineLabel}까지 답해 주세요. 답변이 없으면 운영팀 검토가 시작되며, 무응답만으로 이용이
        제한되지는 않습니다.
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
              답변은 운영팀 판정 자료로 기록됩니다. 인정만으로 바로 이용이 제한되지는 않으며, 양쪽
              기록을 확인한 뒤 결과를 안내합니다.
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
