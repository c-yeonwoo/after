import { useState } from "react";
import { Flag, MoreHorizontal, Ban } from "lucide-react";
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
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Textarea } from "@/components/ui/textarea";
import { blockUser, reportContent, type ReportKind } from "@/lib/api";

/**
 * 신고 · 차단 진입점.
 *
 * App Store Guideline 1.2 는 사용자 생성 콘텐츠를 다루는 앱에 콘텐츠 신고와
 * 사용자 차단을 모두 요구한다. 채팅과 프로필 양쪽에 붙는다.
 *
 * 두 동작의 결과가 다르므로 문구를 분명히 가른다 —
 *   차단: 내가 끊는다. **티켓은 돌려받지 못한다.**
 *   신고: 운영자가 확인한다. 환불은 그 판단 뒤에 있을 수 있다(약속하지 않는다).
 *
 * 둘 다 되돌릴 수 없어서 확인 단계를 거친다. 소개 넘기기(intro.tsx)와 같은 결이다.
 */
export function SafetyMenu({
  targetId,
  targetName,
  kind,
  messageId,
  onDone,
}: {
  targetId: string;
  targetName: string;
  /** 프로필을 신고하는 자리인지, 메시지를 신고하는 자리인지 */
  kind: ReportKind;
  /** kind 가 "message" 일 때 필수 */
  messageId?: string;
  /** 차단·신고가 끝난 뒤. 보통 목록으로 돌려보낸다 */
  onDone?: () => void;
}) {
  const [blockOpen, setBlockOpen] = useState(false);
  const [reportOpen, setReportOpen] = useState(false);
  const [detail, setDetail] = useState("");
  const [busy, setBusy] = useState(false);

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger
          aria-label="더보기"
          className="-mr-2 inline-flex size-11 shrink-0 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
        >
          <MoreHorizontal className="size-5" aria-hidden="true" />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem onSelect={() => setReportOpen(true)}>
            <Flag className="size-4" aria-hidden="true" />
            신고하기
          </DropdownMenuItem>
          <DropdownMenuItem
            className="text-destructive focus:text-destructive"
            onSelect={() => setBlockOpen(true)}
          >
            <Ban className="size-4" aria-hidden="true" />
            차단하기
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      {/* ── 차단 ── */}
      <AlertDialog open={blockOpen} onOpenChange={setBlockOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{targetName}님을 차단하시겠어요?</AlertDialogTitle>
            <AlertDialogDescription>
              <b className="font-semibold text-foreground">두 분은 다시 만나지 않습니다.</b> 잡혀
              있던 약속은 취소되고,{" "}
              <b className="font-semibold text-foreground">쓰신 티켓은 돌려드리지 않습니다.</b>{" "}
              되돌릴 수 없습니다.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={busy}>취소</AlertDialogCancel>
            <AlertDialogAction
              disabled={busy}
              onClick={async (e) => {
                e.preventDefault();
                setBusy(true);
                try {
                  await blockUser(targetId);
                  toast.success("차단했습니다.");
                  setBlockOpen(false);
                  onDone?.();
                } catch {
                  toast.error("차단하지 못했습니다. 잠시 후 다시 시도해 주세요.");
                } finally {
                  setBusy(false);
                }
              }}
            >
              {busy ? "처리 중…" : "차단하기"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* ── 신고 ── */}
      <AlertDialog
        open={reportOpen}
        onOpenChange={(v) => {
          setReportOpen(v);
          if (!v) setDetail("");
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>무엇이 문제였나요?</AlertDialogTitle>
            <AlertDialogDescription>
              운영자가 확인합니다. 신고하시면{" "}
              <b className="font-semibold text-foreground">{targetName}님과는 즉시 차단됩니다</b> —
              다시 소개되지 않고 잡혀 있던 약속도 취소됩니다.
              <br />
              신고한 사실은 상대에게 알려지지 않습니다.
            </AlertDialogDescription>
          </AlertDialogHeader>

          <Textarea
            value={detail}
            onChange={(e) => setDetail(e.target.value.slice(0, 1000))}
            rows={4}
            placeholder="어떤 점이 문제였는지 적어 주세요."
            aria-label="신고 내용"
          />

          <AlertDialogFooter>
            <AlertDialogCancel disabled={busy}>취소</AlertDialogCancel>
            <AlertDialogAction
              disabled={busy || detail.trim().length === 0}
              onClick={async (e) => {
                e.preventDefault();
                setBusy(true);
                try {
                  await reportContent(targetId, kind, detail.trim(), messageId);
                  toast.success("신고를 접수했습니다.");
                  setReportOpen(false);
                  setDetail("");
                  onDone?.();
                } catch {
                  toast.error("신고하지 못했습니다. 잠시 후 다시 시도해 주세요.");
                } finally {
                  setBusy(false);
                }
              }}
            >
              {busy ? "접수 중…" : "신고하기"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
