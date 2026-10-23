import { createFileRoute, Link } from "@tanstack/react-router";
import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";

import { ReviewError, ReviewHeader } from "@/components/admin/ReviewWorkspace";
import { useReviewGuard } from "@/components/admin/useReviewWorkspace";
import { Tag } from "@/components/admin/ui";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { fetchSupportPage, type SupportCursor, type SupportPage } from "@/lib/admin";
import { supabase } from "@/lib/supabase";

export const Route = createFileRoute("/admin/support")({ component: AdminSupport });
const CATEGORY_LABEL: Record<string, string> = {
  account: "계정·프로필",
  introduction: "소개·일정",
  payment: "티켓·결제",
  safety: "안전·신고",
  other: "기타",
};

function AdminSupport() {
  const [status, setStatus] = useState<"open" | "answered">("open");
  const [page, setPage] = useState<SupportPage | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [sendError, setSendError] = useState<string | null>(null);
  const requestVersion = useRef(0);
  const lock = useRef(false);
  const hasDraft = Object.values(drafts).some((value) => value.trim());
  const { ask, dialog } = useReviewGuard(hasDraft, busy);

  const load = useCallback(
    async (cursor: SupportCursor | null = null) => {
      const version = ++requestVersion.current;
      setLoading(true);
      try {
        const next = await fetchSupportPage(status, cursor);
        if (version !== requestVersion.current) return;
        setPage((previous) =>
          cursor && previous
            ? {
                ...next,
                items: [
                  ...previous.items,
                  ...next.items.filter((item) => !previous.items.some((old) => old.id === item.id)),
                ],
              }
            : next,
        );
        setLoadError(false);
      } catch {
        if (version === requestVersion.current) setLoadError(true);
      } finally {
        if (version === requestVersion.current) setLoading(false);
      }
    },
    [status],
  );
  useEffect(() => {
    setPage(null);
    setLoadError(false);
    void load();
    return () => {
      requestVersion.current += 1;
    };
  }, [load]);

  async function respond(id: string) {
    const response = drafts[id]?.trim();
    if (lock.current || !response) return;
    lock.current = true;
    setBusy(true);
    setSendError(null);
    try {
      const { error } = await supabase.rpc("respond_support_request", {
        p_id: id,
        p_response: response,
      });
      if (error) throw error;
      toast.success("답변을 등록했습니다.");
      setDrafts((old) => {
        const next = { ...old };
        delete next[id];
        return next;
      });
      setSelected(null);
      await load();
    } catch (error) {
      setSendError(id);
      toast.error(
        (error as { code?: string })?.code === "P0002"
          ? "이미 처리된 문의일 수 있어요. 작성 내용은 유지했습니다. 최신 목록을 확인해 주세요."
          : "답변을 등록하지 못했습니다. 작성 내용은 유지했습니다.",
      );
    } finally {
      lock.current = false;
      setBusy(false);
    }
  }

  return (
    <section>
      <ReviewHeader
        title="고객 문의"
        description="기다리는 문의부터 확인하고, 회원에게 앱으로 답변합니다."
        loading={loading}
        disabled={busy}
        onRefresh={() => void load()}
      />
      <div className="flex flex-wrap gap-2" aria-label="문의 상태">
        {(["open", "answered"] as const).map((value) => (
          <Button
            key={value}
            size="sm"
            aria-pressed={status === value}
            disabled={busy}
            variant={status === value ? "default" : "outline"}
            onClick={(event) => {
              if (value !== status)
                ask(() => {
                  requestVersion.current += 1;
                  setPage(null);
                  setStatus(value);
                  setSelected(null);
                  setDrafts({});
                  setSendError(null);
                }, event.currentTarget);
            }}
          >
            {value === "open" ? "미답변" : "답변 완료"}
          </Button>
        ))}
      </div>
      {dialog}
      {loadError && <ReviewError loading={loading} retry={() => void load()} />}
      {hasDraft && (
        <p role="status" className="mt-3 text-xs text-muted-foreground">
          작성 중인 답변은 이 화면에서 문의별로 유지됩니다. 아직 회원에게 보내지 않았어요.
        </p>
      )}
      {page === null && loading ? (
        <p role="status" className="mt-6 text-sm text-muted-foreground">
          문의를 불러오는 중…
        </p>
      ) : page?.items.length === 0 ? (
        <p className="mt-6 rounded-surface bg-card p-6 text-sm text-muted-foreground">
          {status === "open" ? "답변을 기다리는 문의가 없습니다." : "답변한 문의가 없습니다."}
        </p>
      ) : (
        page && (
          <div className="mt-5 space-y-4">
            <p className="text-sm tabular-nums text-muted-foreground">
              전체 {page.total}건 · {page.items.length}건 표시
            </p>
            <div className="grid items-start gap-4 xl:grid-cols-2">
              {page.items.map((request) => (
                <article
                  key={request.id}
                  className="app-elevated min-w-0 rounded-surface bg-card p-4 sm:p-5"
                >
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="text-xs text-muted-foreground">
                      {CATEGORY_LABEL[request.category] ?? "기타"} ·{" "}
                      {new Date(request.created_at).toLocaleString("ko-KR")}
                    </span>
                    <Tag tone={request.status === "open" ? "alert" : "muted"}>
                      {request.status === "open" ? "미답변" : "답변 완료"}
                    </Tag>
                  </div>
                  <Link
                    to="/admin/members/$id"
                    params={{ id: request.user_id }}
                    className="mt-1 inline-flex min-h-11 items-center break-all font-semibold underline-offset-4 hover:underline"
                  >
                    {request.member_name || "회원"}
                  </Link>
                  <p className="mt-1 whitespace-pre-wrap break-words text-sm leading-relaxed">
                    {request.body}
                  </p>
                  {request.meeting_id && (
                    <Link
                      to="/admin/meetings"
                      search={{ meeting: request.meeting_id }}
                      className="mt-2 inline-flex min-h-11 items-center text-sm font-semibold text-primary-strong underline underline-offset-4"
                    >
                      관련 만남 확인
                    </Link>
                  )}
                  {request.response && (
                    <div className="mt-4 border-t border-border pt-4">
                      <p className="text-xs font-medium text-muted-foreground">
                        등록한 답변
                        {request.responded_at
                          ? ` · ${new Date(request.responded_at).toLocaleString("ko-KR")}`
                          : ""}
                      </p>
                      <p className="mt-2 whitespace-pre-wrap break-words text-sm leading-relaxed">
                        {request.response}
                      </p>
                    </div>
                  )}
                  {status === "open" && selected === request.id ? (
                    <div className="mt-4 space-y-2 border-t border-border pt-4" aria-busy={busy}>
                      <label htmlFor={`answer-${request.id}`} className="text-sm font-medium">
                        답변
                      </label>
                      <p className="text-xs text-muted-foreground">
                        {request.member_name || "회원"}님에게 표시됩니다. 등록 전에 내용을 확인해
                        주세요.
                      </p>
                      <Textarea
                        id={`answer-${request.id}`}
                        className="min-h-32 text-base"
                        value={drafts[request.id] ?? ""}
                        maxLength={2000}
                        disabled={busy}
                        onChange={(event) => {
                          setDrafts((old) => ({ ...old, [request.id]: event.target.value }));
                          setSendError(null);
                        }}
                      />
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <p className="text-xs tabular-nums text-muted-foreground">
                          {(drafts[request.id] ?? "").length}/2,000
                        </p>
                        <Button
                          size="sm"
                          disabled={busy || !drafts[request.id]?.trim()}
                          onClick={() => void respond(request.id)}
                        >
                          {busy ? "등록 중…" : "답변 등록"}
                        </Button>
                      </div>
                      {sendError === request.id && (
                        <p role="alert" className="text-sm text-destructive">
                          답변을 등록하지 못했어요. 작성 내용을 유지했으니 확인 후 다시 시도해
                          주세요.
                        </p>
                      )}
                    </div>
                  ) : (
                    status === "open" && (
                      <Button
                        size="sm"
                        variant="outline"
                        className="mt-4"
                        disabled={busy}
                        onClick={() => {
                          setSelected(request.id);
                          setSendError(null);
                        }}
                      >
                        {drafts[request.id]?.trim() ? "답변 이어 쓰기" : "답변하기"}
                      </Button>
                    )
                  )}
                </article>
              ))}
            </div>
            {page.next_cursor && (
              <Button
                variant="outline"
                disabled={loading || busy}
                onClick={() => void load(page.next_cursor)}
              >
                {loading ? "불러오는 중…" : "더 보기"}
              </Button>
            )}
          </div>
        )
      )}
    </section>
  );
}
