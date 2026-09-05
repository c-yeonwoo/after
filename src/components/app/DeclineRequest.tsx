import { useState } from "react";
import { toast } from "sonner";

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
import { declineMeeting } from "@/lib/api";
import { cn } from "@/lib/utils";

/**
 * 만남 요청 거절 (여성).
 *
 * ── 왜 이게 없었나, 그리고 왜 있어야 하나 ──
 *
 * 지금까지 거절하는 방법은 **24시간 방치**뿐이었다. 화면에 버튼이 없었고
 * 서버에도 함수가 없었다(운영자용 취소만 있었다). 그 설계가 만드는 상태가 둘이다.
 *
 *   · 상대의 30,000원이 24시간 묶인다. 거절이라는 정상적인 답이 시스템에서는
 *     하루짜리 침묵으로만 표현된다.
 *   · 답을 안 하는 것이 유일한 답인 화면은 **사람을 나쁜 사람으로 만든다.**
 *     이 제품이 파는 것이 진정성이라면 여기가 제일 먼저 새는 자리다.
 *
 * 그래서 차단(SafetyMenu)과 같은 결로 확인 단계를 둔다 — 되돌릴 수 없고,
 * 상대에게 결과가 가는 조작이다. 다만 톤은 다르다. 차단은 안전 조치이고
 * 거절은 **예의 있는 답**이다. 빨간 destructive 로 그리지 않는 이유가 그것이다.
 */
export function DeclineRequest({
  meetingId,
  candidateName,
  onDone,
  className,
}: {
  meetingId: string;
  candidateName?: string | null;
  /** 거절 후. 보통 목록을 다시 읽거나 홈으로 보낸다 */
  onDone?: () => void;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={cn(
          "min-h-11 w-full text-xs text-muted-foreground transition-colors",
          "hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none",
          className,
        )}
      >
        이번엔 정중히 거절할게요
      </button>

      <AlertDialog open={open} onOpenChange={setOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {candidateName ? `${candidateName}님의 요청을 거절할까요?` : "요청을 거절할까요?"}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {/*
                두 가지를 반드시 말한다. 하나는 상대에게 좋은 소식(돈이 즉시
                돌아간다), 하나는 되돌릴 수 없다는 것. 거절을 미안한 일로
                남겨 두지 않으려면 앞의 문장이 먼저 나와야 한다.
              */}
              <b className="font-semibold text-foreground">
                상대가 쓴 만남 티켓은 바로 환불됩니다.
              </b>{" "}
              거절한 사실이나 이유는 상대에게 전해지지 않아요. 다만{" "}
              <b className="font-semibold text-foreground">두 분은 다시 소개되지 않습니다.</b>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={busy}>돌아가기</AlertDialogCancel>
            <AlertDialogAction
              disabled={busy}
              onClick={async (e) => {
                e.preventDefault();
                setBusy(true);
                try {
                  await declineMeeting(meetingId);
                  toast.success("거절했습니다. 상대에게는 알려지지 않아요.");
                  setOpen(false);
                  onDone?.();
                } catch {
                  toast.error("처리하지 못했습니다. 잠시 후 다시 시도해 주세요.");
                } finally {
                  setBusy(false);
                }
              }}
            >
              {busy ? "처리 중…" : "거절하기"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
