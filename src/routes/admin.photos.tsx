import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useCallback, useRef, useState } from "react";
import { Expand } from "lucide-react";
import { toast } from "sonner";

import { ReviewError, ReviewHeader } from "@/components/admin/ReviewWorkspace";
import { useReviewGuard, useReviewQueue } from "@/components/admin/useReviewWorkspace";
import { Tag } from "@/components/admin/ui";
import { hubLabel } from "@/components/admin/labels";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogTitle, DialogDescription } from "@/components/ui/dialog";
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
import { usePhotoUrl } from "@/lib/photo";
import {
  ALREADY_RESOLVED,
  fetchPhotoQueue,
  reviewPhotoSet,
  type PhotoReviewItem,
  type PhotoState,
} from "@/lib/admin";

const STATES: PhotoState[] = ["pending", "rejected", "approved"];
const FILTERS = [
  { v: "pending", label: "검수 대기" },
  { v: "rejected", label: "반려" },
  { v: "approved", label: "승인" },
] as const;
export const Route = createFileRoute("/admin/photos")({
  validateSearch: (s: Record<string, unknown>): { state?: PhotoState } => ({
    state: STATES.includes(s.state as PhotoState) ? (s.state as PhotoState) : undefined,
  }),
  component: PhotosTab,
});
function PhotosTab() {
  const { state } = Route.useSearch();
  return <PhotoWorkspace key={state ?? "pending"} state={state ?? "pending"} />;
}
function PhotoWorkspace({ state }: { state: PhotoState }) {
  const navigate = useNavigate({ from: Route.fullPath });
  const fetchRows = useCallback(() => fetchPhotoQueue(state), [state]);
  const { data: rows, loading, error, load } = useReviewQueue(fetchRows);
  const [edits, setEdits] = useState<Record<string, { dirty: boolean; busy: boolean }>>({});
  const dirty = Object.values(edits).some((edit) => edit.dirty);
  const busy = Object.values(edits).some((edit) => edit.busy);
  const { ask, dialog } = useReviewGuard(dirty, busy);
  const [refreshKey, setRefreshKey] = useState(0);
  const refresh = () =>
    ask(() => {
      setEdits({});
      void load().then(() => setRefreshKey((value) => value + 1));
    });
  const editing = useCallback(
    (id: string, edit: { dirty: boolean; busy: boolean }) =>
      setEdits((old) => ({ ...old, [id]: edit })),
    [],
  );
  return (
    <section>
      <ReviewHeader
        title="사진 검수"
        description="먼저 접수된 사진부터, 전체 묶음을 확인합니다."
        loading={loading}
        disabled={busy || dirty}
        onRefresh={refresh}
      />
      <div className="flex flex-wrap gap-2" aria-label="사진 상태">
        {FILTERS.map((filter) => (
          <Button
            key={filter.v}
            size="sm"
            variant={state === filter.v ? "default" : "outline"}
            aria-pressed={state === filter.v}
            disabled={busy}
            onClick={() => {
              if (state !== filter.v) void navigate({ search: { state: filter.v }, replace: true });
            }}
          >
            {filter.label}
          </Button>
        ))}
      </div>
      {dialog}
      {state === "pending" && (
        <p className="mt-4 text-sm leading-relaxed text-muted-foreground">
          검수 대기 중에는 소개 후보에 포함되지 않습니다. 사진을 누르면 원본 비율로 볼 수 있어요.
        </p>
      )}
      {error && <ReviewError loading={loading} retry={refresh} />}
      {rows === null && loading ? (
        <p role="status" className="mt-6 text-sm text-muted-foreground">
          사진을 불러오는 중…
        </p>
      ) : rows?.length === 0 ? (
        <p className="mt-6 rounded-surface bg-card p-6 text-sm text-muted-foreground">
          {state === "pending" ? "검수할 사진이 없습니다." : "해당하는 사진이 없습니다."}
        </p>
      ) : (
        rows && (
          <>
            <p className="mt-5 text-sm tabular-nums text-muted-foreground">
              {rows.length}건 · 오래 기다린 순
            </p>
            <ul
              className="mt-3 grid items-start gap-5 md:grid-cols-2 2xl:grid-cols-3"
              aria-label="사진 검수 목록"
            >
              {rows.map((row) => (
                <PhotoCard
                  key={`${refreshKey}:${row.id}:${row.photo_paths?.join(",")}:${row.photo_state}`}
                  photo={row}
                  disabled={error || loading || busy}
                  onEditingChange={editing}
                  onDone={load}
                />
              ))}
            </ul>
          </>
        )
      )}
    </section>
  );
}

function ReviewPhoto({
  path,
  index,
  onReady,
}: {
  path: string;
  index: number;
  onReady: (index: number, ready: boolean) => void;
}) {
  const url = usePhotoUrl(path);
  const [failed, setFailed] = useState(false);
  return (
    <>
      {url && !failed ? (
        <img
          src={url}
          alt=""
          onLoad={() => onReady(index, true)}
          onError={() => {
            setFailed(true);
            onReady(index, false);
          }}
          className="size-full object-cover"
        />
      ) : (
        <span className="flex size-full items-center justify-center px-2 text-xs text-muted-foreground">
          {failed ? "사진을 열지 못했어요" : "사진 불러오는 중…"}
        </span>
      )}
      <span
        aria-hidden="true"
        className="absolute left-1.5 top-1.5 rounded bg-background px-1.5 py-0.5 text-xs font-medium text-foreground"
      >
        {index + 1}번
      </span>
    </>
  );
}
function OriginalPhoto({ path }: { path: string }) {
  const url = usePhotoUrl(path);
  const [failed, setFailed] = useState(false);
  return url && !failed ? (
    <img
      src={url}
      onError={() => setFailed(true)}
      alt="검수 사진 원본 비율"
      className="max-h-[55dvh] w-full object-contain"
    />
  ) : (
    <p role="status" className="py-10 text-sm text-muted-foreground">
      {failed ? "사진을 열지 못했어요. 목록을 새로고침해 주세요." : "사진을 불러오는 중…"}
    </p>
  );
}
function PhotoCard({
  photo,
  disabled,
  onEditingChange,
  onDone,
}: {
  photo: PhotoReviewItem;
  disabled: boolean;
  onEditingChange: (id: string, state: { dirty: boolean; busy: boolean }) => void;
  onDone: () => Promise<void>;
}) {
  const paths = photo.photo_paths?.length
    ? photo.photo_paths
    : photo.photo_url
      ? [photo.photo_url]
      : [];
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const lock = useRef(false);
  const [confirm, setConfirm] = useState<"approve" | "reject" | "reset" | null>(null);
  const [invalid, setInvalid] = useState(false);
  const [preview, setPreview] = useState<number | null>(null);
  const [ready, setReady] = useState<Record<number, boolean>>({});
  const trigger = useRef<HTMLButtonElement | null>(null);
  const previewTrigger = useRef<HTMLButtonElement | null>(null);
  const allReady = paths.length > 0 && paths.every((_, index) => ready[index]);
  const onReady = useCallback(
    (index: number, value: boolean) =>
      setReady((old) => (old[index] === value ? old : { ...old, [index]: value })),
    [],
  );
  const pending = photo.photo_state === "pending";
  const update = (value: string) => {
    setNote(value);
    setInvalid(false);
    onEditingChange(photo.id, { dirty: Boolean(value.trim()), busy: false });
  };
  async function act() {
    if (lock.current || !confirm) return;
    lock.current = true;
    setBusy(true);
    onEditingChange(photo.id, { dirty: Boolean(note.trim()), busy: true });
    try {
      await reviewPhotoSet(photo, confirm === "approve", note.trim() || "기준 충족");
      toast.success(
        confirm === "approve"
          ? "승인했습니다."
          : confirm === "reset"
            ? "사진 승인을 취소했습니다."
            : "반려했습니다.",
      );
      setConfirm(null);
      setNote("");
      onEditingChange(photo.id, { dirty: false, busy: true });
      await onDone();
      onEditingChange(photo.id, { dirty: false, busy: false });
    } catch (error) {
      if ((error as { code?: string })?.code === ALREADY_RESOLVED) {
        toast.error("사진이 바뀌었거나 이미 처리됐어요. 최신 목록을 확인해 주세요.");
        setConfirm(null);
        setNote("");
        onEditingChange(photo.id, { dirty: false, busy: true });
        await onDone();
        onEditingChange(photo.id, { dirty: false, busy: false });
      } else {
        toast.error("처리하지 못했습니다. 입력한 사유는 유지했습니다.");
        onEditingChange(photo.id, { dirty: Boolean(note.trim()), busy: false });
      }
    } finally {
      lock.current = false;
      setBusy(false);
    }
  }
  function open(action: "approve" | "reject" | "reset", button: HTMLButtonElement) {
    if (action !== "approve" && !note.trim()) {
      setInvalid(true);
      return;
    }
    trigger.current = button;
    setConfirm(action);
  }
  return (
    <li className="app-elevated min-w-0 overflow-hidden rounded-surface bg-card">
      <div className="grid grid-cols-3 gap-1.5 p-2">
        {paths.map((path, index) => (
          <button
            key={path}
            aria-label={`${photo.name} ${index + 1}번 사진 확대`}
            className="pressable relative aspect-[3/4] overflow-hidden rounded-control bg-muted focus-visible:ring-2 focus-visible:ring-ring"
            onClick={(event) => {
              previewTrigger.current = event.currentTarget;
              setPreview(index);
            }}
          >
            <ReviewPhoto path={path} index={index} onReady={onReady} />
            <Expand
              aria-hidden="true"
              className="absolute bottom-1.5 right-1.5 size-6 rounded bg-background p-1 text-foreground"
            />
          </button>
        ))}
      </div>
      <div className="px-4 pb-4">
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
          <Link
            to="/admin/members/$id"
            params={{ id: photo.id }}
            className="inline-flex min-h-11 items-center break-all font-semibold underline-offset-4 hover:underline"
          >
            {photo.name || "이름 없음"}
          </Link>
          <span className="text-xs text-muted-foreground">
            {photo.gender === "female" ? "여" : "남"} · {hubLabel(photo.hub_id)}
          </span>
          {photo.account_state === "banned" && <Tag tone="alert">정지</Tag>}
          {photo.onboarding_step < 7 && <Tag tone="muted">가입 {photo.onboarding_step}/7</Tag>}
        </div>
        <p className="text-xs text-muted-foreground">
          사진 {paths.length}장 · {new Date(photo.updated_at).toLocaleString("ko-KR")}
        </p>
        {photo.reject_reason && (
          <p className="mt-3 whitespace-pre-wrap break-words text-sm text-primary-strong">
            반려 사유 · {photo.reject_reason}
          </p>
        )}
        {pending || photo.photo_state === "approved" ? (
          <div className="mt-4 border-t border-border pt-4" aria-busy={busy}>
            <label htmlFor={`photo-note-${photo.id}`} className="text-sm font-medium">
              {pending ? "반려 사유" : "승인 취소 사유"}
            </label>
            <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
              반려·승인 취소 시 필수이며, 회원에게 그대로 표시됩니다.
            </p>
            <Textarea
              id={`photo-note-${photo.id}`}
              className="mt-2 text-base"
              rows={2}
              value={note}
              maxLength={2000}
              disabled={busy || disabled}
              aria-invalid={invalid || undefined}
              onChange={(event) => update(event.target.value)}
            />
            {invalid && (
              <p role="alert" className="mt-2 text-sm text-destructive">
                회원에게 안내할 사유를 입력해 주세요.
              </p>
            )}
            {pending && !allReady && (
              <p className="mt-2 text-xs text-muted-foreground">
                모든 사진이 표시된 뒤 승인할 수 있어요. 보이지 않으면 새로고침해 주세요.
              </p>
            )}
            <div className="mt-3 flex flex-wrap gap-2">
              {pending ? (
                <>
                  <Button
                    size="sm"
                    disabled={disabled || busy || !allReady}
                    onClick={(event) => open("approve", event.currentTarget)}
                  >
                    승인
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={disabled || busy}
                    onClick={(event) => open("reject", event.currentTarget)}
                  >
                    반려
                  </Button>
                </>
              ) : (
                <Button
                  size="sm"
                  variant="destructive"
                  disabled={disabled || busy}
                  onClick={(event) => open("reset", event.currentTarget)}
                >
                  승인 취소
                </Button>
              )}
              {note && (
                <Button
                  size="sm"
                  variant="ghost"
                  disabled={disabled || busy}
                  onClick={() => update("")}
                >
                  사유 비우기
                </Button>
              )}
            </div>
          </div>
        ) : null}
      </div>
      <Dialog
        open={preview !== null}
        onOpenChange={(open) => {
          if (!open) setPreview(null);
        }}
      >
        <DialogContent
          className="max-w-2xl"
          onCloseAutoFocus={(event) => {
            event.preventDefault();
            previewTrigger.current?.focus();
          }}
        >
          <DialogTitle className="break-keep pr-8">
            {photo.name || "회원"}님의 사진 · {(preview ?? 0) + 1}/{paths.length}
          </DialogTitle>
          <DialogDescription>
            원본 비율로 확인합니다. 사진 묶음 전체를 검수해 주세요.
          </DialogDescription>
          {preview !== null && <OriginalPhoto key={paths[preview]} path={paths[preview]} />}
          <div className="flex justify-between gap-2">
            <Button
              variant="outline"
              disabled={preview === 0}
              onClick={() => setPreview((old) => Math.max(0, (old ?? 0) - 1))}
            >
              이전 사진
            </Button>
            <Button
              variant="outline"
              disabled={preview === paths.length - 1}
              onClick={() => setPreview((old) => Math.min(paths.length - 1, (old ?? 0) + 1))}
            >
              다음 사진
            </Button>
          </div>
        </DialogContent>
      </Dialog>
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
            <AlertDialogTitle>
              {photo.name || "회원"}님의 사진을{" "}
              {confirm === "approve" ? "승인" : confirm === "reset" ? "승인 취소" : "반려"}할까요?
            </AlertDialogTitle>
            <AlertDialogDescription>
              {confirm === "approve"
                ? `사진 ${paths.length}장 전체를 승인합니다. 다른 가입 조건도 충족하면 소개 후보에 포함됩니다.`
                : "사진은 소개 후보에서 제외되고, 아래 사유가 회원에게 표시됩니다."}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <p className="whitespace-pre-wrap break-words text-sm">{note.trim() || "기준 충족"}</p>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={busy}>돌아가기</AlertDialogCancel>
            <AlertDialogAction
              disabled={busy}
              onClick={(event) => {
                event.preventDefault();
                void act();
              }}
            >
              {busy ? "처리 중…" : "확인하고 처리"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </li>
  );
}
