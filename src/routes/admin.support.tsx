import { createFileRoute, Link } from "@tanstack/react-router";
import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import type { Database } from "@/lib/database.types";
import { supabase } from "@/lib/supabase";

export const Route = createFileRoute("/admin/support")({ component: AdminSupport });

type Request = Database["public"]["Functions"]["admin_support_requests"]["Returns"][number];

function AdminSupport() {
  const [status, setStatus] = useState<"open" | "answered">("open");
  const [requests, setRequests] = useState<Request[] | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [answer, setAnswer] = useState("");
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    const { data, error } = await supabase.rpc("admin_support_requests", { p_status: status });
    if (error) throw error;
    setRequests(data);
  }, [status]);

  useEffect(() => {
    void load().catch(() => toast.error("문의 목록을 불러오지 못했습니다."));
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
                setStatus(value);
                setSelected(null);
              }}
            >
              {value === "open" ? "미답변" : "답변 완료"}
            </Button>
          ))}
        </div>
      </div>
      {requests === null ? (
        <p className="mt-6 text-sm text-muted-foreground">불러오는 중…</p>
      ) : requests.length === 0 ? (
        <p className="mt-6 text-sm text-muted-foreground">해당 문의가 없습니다.</p>
      ) : (
        <div className="mt-5 space-y-3">
          {requests.map((request) => (
            <article key={request.id} className="rounded-surface border border-border bg-card p-5">
              <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
                <span>
                  {request.category} · {new Date(request.created_at).toLocaleString("ko-KR")}
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
        </div>
      )}
    </section>
  );
}
