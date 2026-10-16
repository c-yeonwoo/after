import { createFileRoute, Link } from "@tanstack/react-router";
import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";

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
  const [answer, setAnswer] = useState("");
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState(false);
  const requestVersion = useRef(0);

  const load = useCallback(
    async (cursor: SupportCursor | null = null) => {
      const version = ++requestVersion.current;
      setLoading(true);
      try {
        const next = await fetchSupportPage(status, cursor);
        if (version !== requestVersion.current) return;
        setPage((previous) =>
          cursor && previous ? { ...next, items: [...previous.items, ...next.items] } : next,
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
    void load();
  }, [load]);

  async function respond(id: string) {
    if (!answer.trim()) return;
    setBusy(true);
    try {
      const { error } = await supabase.rpc("respond_support_request", {
        p_id: id,
        p_response: answer.trim(),
      });
      if (error) throw error;
      toast.success("답변을 등록했습니다.");
      setSelected(null);
      setAnswer("");
      await load();
    } catch {
      toast.error("답변을 등록하지 못했습니다.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section>
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold">고객 문의</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            접수 내용을 확인하고 앱에서 답변합니다.
          </p>
        </div>
        <div className="flex gap-2">
          {(["open", "answered"] as const).map((value) => (
            <Button
              key={value}
              size="sm"
              variant={status === value ? "default" : "outline"}
              onClick={() => {
                if (value === status) return;
                requestVersion.current += 1;
                setPage(null);
                setStatus(value);
                setSelected(null);
              }}
            >
              {value === "open" ? "미답변" : "답변 완료"}
            </Button>
          ))}
        </div>
      </div>
      {loadError ? (
        <div role="alert" className="mt-5 rounded-surface border border-destructive/30 p-4 text-sm">
          문의 목록을 확인할 수 없습니다.
          <Button className="ml-3" size="sm" variant="outline" onClick={() => void load()}>
            다시 시도
          </Button>
        </div>
      ) : null}
      {page === null && loading ? (
        <p className="mt-6 text-sm text-muted-foreground">불러오는 중…</p>
      ) : page?.items.length === 0 ? (
        <p className="mt-6 text-sm text-muted-foreground">해당 문의가 없습니다.</p>
      ) : page ? (
        <div className="mt-5 space-y-3">
          <p className="text-xs text-muted-foreground">
            전체 {page.total}건 · {page.items.length}건 표시
          </p>
          {page.items.map((request) => (
            <article key={request.id} className="rounded-surface border border-border bg-card p-5">
              <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
                <span>
                  {CATEGORY_LABEL[request.category] ?? "기타"} ·{" "}
                  {new Date(request.created_at).toLocaleString("ko-KR")}
                </span>
                <Link
                  to="/admin/members/$id"
                  params={{ id: request.user_id }}
                  className="font-medium text-foreground underline"
                >
                  {request.member_name || "회원"}
                </Link>
              </div>
              <p className="mt-3 whitespace-pre-wrap break-words text-sm">{request.body}</p>
              {request.meeting_id ? (
                <Link
                  to="/admin/meetings"
                  search={{ meeting: request.meeting_id }}
                  className="mt-2 inline-flex min-h-10 items-center text-xs font-semibold text-primary-strong underline underline-offset-4"
                >
                  관련 만남 확인
                </Link>
              ) : null}
              {request.response ? (
                <p className="mt-3 border-t border-border pt-3 text-sm text-muted-foreground">
                  답변: {request.response}
                </p>
              ) : null}
              {status === "open" && selected === request.id ? (
                <div className="mt-4 space-y-2">
                  <label htmlFor={`answer-${request.id}`} className="text-sm font-medium">
                    답변
                  </label>
                  <Textarea
                    id={`answer-${request.id}`}
                    value={answer}
                    maxLength={2000}
                    onChange={(event) => setAnswer(event.target.value)}
                  />
                  <Button
                    size="sm"
                    disabled={busy || !answer.trim()}
                    onClick={() => void respond(request.id)}
                  >
                    {busy ? "등록 중…" : "답변 등록"}
                  </Button>
                </div>
              ) : status === "open" ? (
                <Button
                  size="sm"
                  variant="outline"
                  className="mt-4"
                  onClick={() => {
                    setSelected(request.id);
                    setAnswer("");
                  }}
                >
                  답변하기
                </Button>
              ) : null}
            </article>
          ))}
          {page.next_cursor ? (
            <Button
              variant="outline"
              disabled={loading}
              onClick={() => void load(page.next_cursor)}
            >
              {loading ? "불러오는 중…" : "더 보기"}
            </Button>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}
