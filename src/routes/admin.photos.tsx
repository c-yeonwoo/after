import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";

import { Tag } from "@/components/admin/ui";
import { hubLabel } from "@/components/admin/labels";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { usePhotoUrl } from "@/lib/photo";
import {
  ALREADY_RESOLVED,
  fetchPhotoQueue,
  reviewPhoto,
  type PhotoReviewItem,
  type PhotoState,
} from "@/lib/admin";

const STATES: PhotoState[] = ["pending", "rejected", "approved"];

export const Route = createFileRoute("/admin/photos")({
  validateSearch: (s: Record<string, unknown>): { state?: PhotoState } => ({
    state: STATES.includes(s.state as PhotoState) ? (s.state as PhotoState) : undefined,
  }),
  component: PhotosTab,
});

const FILTERS: { v: PhotoState; label: string }[] = [
  { v: "pending", label: "검수 대기" },
  { v: "rejected", label: "반려" },
  { v: "approved", label: "승인" },
];

/**
 * 사진 검수 — 표가 아니라 **그리드**다.
 *
 * 다른 목록은 훑어서 "무엇을 손댈까" 를 고르는 일이지만, 검수는 사진 자체가
 * 판단 근거라 크게 보이지 않으면 아무 일도 못 한다. 한 장씩 열게 만들면 100장을
 * 100번 왕복해야 한다 — 격자로 깔고 그 자리에서 처리한다.
 *
 * 검수 대기 = 지금 아무에게도 보이지 않는 회원이다(s18 이 후보 풀에서 뺀다).
 * 그래서 오래 기다린 순으로 온다.
 */
function PhotosTab() {
  const { state } = Route.useSearch();
  const navigate = useNavigate({ from: Route.fullPath });
  const [rows, setRows] = useState<PhotoReviewItem[] | null>(null);

  const load = useCallback(async () => {
    setRows(await fetchPhotoQueue(state ?? "pending"));
  }, [state]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (state === undefined) void navigate({ search: { state: "pending" }, replace: true });
  }, [state, navigate]);

  const current = state ?? "pending";

  return (
    <>
      <div className="flex flex-wrap gap-1">
        {FILTERS.map((f) => (
          <button
            key={f.v}
            onClick={() => void navigate({ search: { state: f.v }, replace: true })}
            className={`rounded-full px-3 py-1 text-sm transition-colors ${
              current === f.v
                ? "bg-primary text-primary-foreground"
                : "bg-muted text-muted-foreground hover:text-foreground"
            }`}
          >
            {f.label}
          </button>
        ))}
      </div>

      {current === "pending" ? (
        <p className="mt-4 rounded-surface bg-muted/60 px-4 py-3 text-xs leading-relaxed text-muted-foreground">
          검수를 기다리는 동안 이 회원들은 <strong>후보 풀에서 빠져 있습니다.</strong> 밀리면 그만큼
          아무에게도 보이지 않습니다.
        </p>
      ) : null}

      {rows === null ? (
        <p className="mt-6 text-sm text-muted-foreground">불러오는 중…</p>
      ) : rows.length === 0 ? (
        <p className="mt-6 text-sm text-muted-foreground">
          {current === "pending" ? "검수할 사진이 없습니다." : "해당하는 사진이 없습니다."}
        </p>
      ) : (
        <>
          <p className="mt-5 text-sm text-muted-foreground tabular-nums">{rows.length}건</p>
          <ul className="mt-2 grid grid-cols-2 gap-4 sm:grid-cols-3 xl:grid-cols-4">
            {rows.map((r) => (
              <PhotoCard key={r.id} r={r} onDone={load} />
            ))}
          </ul>
        </>
      )}
    </>
  );
}

function PhotoCard({ r, onDone }: { r: PhotoReviewItem; onDone: () => void }) {
  const url = usePhotoUrl(r.photo_url);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const pending = r.photo_state === "pending";

  async function act(approve: boolean) {
    /*
      승인은 사유를 자동으로 채운다. 서버는 기록을 위해 note 를 필수로 받지만,
      승인마다 운영자에게 "왜 승인했는지" 를 타이핑하게 하면 검수 처리량이
      무너진다 — 반려만 사람이 쓴다(그건 사용자에게 보이는 문구다).
    */
    const text = approve ? note.trim() || "기준 충족" : note.trim();
    if (!approve && text.length === 0) {
      toast.error("반려 사유를 적어 주세요. 사용자에게 그대로 보입니다.");
      return;
    }
    setBusy(true);
    try {
      await reviewPhoto(r.id, approve, text);
      toast.success(approve ? "승인했습니다." : "반려했습니다.");
      onDone();
    } catch (e) {
      if ((e as { code?: string } | null)?.code === ALREADY_RESOLVED) {
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
    <li className="overflow-hidden rounded-surface border border-border">
      {/* 사용자 화면과 같은 4:5 — 잘리는 방식까지 같아야 판단이 맞는다. */}
      <div className="relative aspect-[4/5] bg-muted">
        {url ? <img src={url} alt="" className="size-full object-cover" /> : null}
      </div>

      <div className="p-3">
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm">
          <Link
            to="/admin/members/$id"
            params={{ id: r.id }}
            className="font-semibold underline-offset-2 hover:underline"
          >
            {r.name ?? "(이름 없음)"}
          </Link>
          <span className="text-xs text-muted-foreground">
            {r.gender === "female" ? "여" : "남"} · {hubLabel(r.hub_id)}
          </span>
          {r.account_state === "banned" ? <Tag tone="alert">정지</Tag> : null}
          {r.onboarding_step < 7 ? <Tag tone="muted">가입 {r.onboarding_step}/7</Tag> : null}
        </div>

        {r.reject_reason ? (
          <p className="mt-1.5 text-xs text-primary-strong">반려 사유 · {r.reject_reason}</p>
        ) : null}

        {pending ? (
          <>
            <Textarea
              className="mt-2 text-sm"
              rows={2}
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="반려 사유 (반려 시 필수 — 사용자에게 보입니다)"
              aria-label="반려 사유"
            />
            <div className="mt-2 flex gap-2">
              <Button size="sm" disabled={busy} onClick={() => void act(true)}>
                승인
              </Button>
              <Button size="sm" variant="outline" disabled={busy} onClick={() => void act(false)}>
                반려
              </Button>
            </div>
          </>
        ) : null}
      </div>
    </li>
  );
}
