import { createFileRoute, Link } from "@tanstack/react-router";
import { ExternalLink, Mail } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";

import { InfoSection, PublicInfoPage } from "@/components/app/PublicInfoPage";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { BRAND } from "@/lib/brand";
import type { Database } from "@/lib/database.types";
import { useMe } from "@/lib/me";
import { BUSINESS } from "@/lib/policy";
import { supabase } from "@/lib/supabase";

export const Route = createFileRoute("/support")({
  head: () => ({
    meta: [
      { title: `고객 지원 — ${BRAND.name}` },
      {
        name: "description",
        content: `${BRAND.name} 이용 문의, 신고와 차단, 계정 삭제 방법을 안내합니다.`,
      },
    ],
  }),
  component: SupportPage,
});

function SupportPage() {
  const { me, ready } = useMe();
  const [category, setCategory] = useState("account");
  const [body, setBody] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [requests, setRequests] = useState<SupportRequest[] | null>(null);
  const subject = encodeURIComponent(`[${BRAND.name} 문의]`);

  async function load() {
    const { data, error } = await supabase.rpc("my_support_requests");
    if (error) throw error;
    setRequests(data);
  }

  useEffect(() => {
    if (!ready || !me) return;
    void load().catch(() => toast.error("문의 내역을 불러오지 못했습니다."));
  }, [ready, me]);

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const message = body.trim();
    if (message.length < 10 || message.length > 2000) return;
    setSubmitting(true);
    try {
      const { error } = await supabase.rpc("create_support_request", {
        p_category: category,
        p_body: message,
      });
      if (error) throw error;
      setBody("");
      await load();
      toast.success("문의가 접수되었습니다.");
    } catch {
      toast.error("접수하지 못했습니다. 잠시 후 다시 시도하거나 이메일로 연락해 주세요.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <PublicInfoPage title="어떻게 도와드릴까요?">
      <InfoSection title="1:1 문의">
        <p>가입, 소개, 결제 문제를 남기면 이 화면에서 답변을 확인할 수 있습니다.</p>
        {ready && me ? (
          <form onSubmit={(event) => void submit(event)} className="space-y-3">
            <label htmlFor="support-category" className="block font-medium text-foreground">
              문의 종류
            </label>
            <select
              id="support-category"
              value={category}
              onChange={(event) => setCategory(event.target.value)}
              className="min-h-12 w-full rounded-field border border-input bg-card px-3 text-foreground"
            >
              {CATEGORIES.map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
            <label htmlFor="support-body" className="block font-medium text-foreground">
              문의 내용
            </label>
            <Textarea
              id="support-body"
              value={body}
              maxLength={2000}
              minLength={10}
              required
              placeholder="무엇이 불편하셨나요? 필요한 내용만 적어주세요."
              onChange={(event) => setBody(event.target.value)}
            />
            <p className="text-xs">상대방의 연락처나 민감한 개인정보는 적지 말아 주세요.</p>
            <Button
              type="submit"
              className="w-full"
              disabled={submitting || body.trim().length < 10}
            >
              {submitting ? "접수 중…" : "문의 보내기"}
            </Button>
          </form>
        ) : ready ? (
          <Link
            to="/login"
            className="inline-flex min-h-12 w-full items-center justify-center rounded-control bg-primary px-4 font-semibold text-primary-foreground"
          >
            로그인하고 문의하기
          </Link>
        ) : null}
        {me && requests && requests.length > 0 ? (
          <div className="space-y-2 pt-3">
            <h3 className="font-semibold text-foreground">내 문의</h3>
            {requests.map((request) => (
              <div key={request.id} className="rounded-surface border border-border bg-card p-4">
                <div className="flex justify-between gap-3 text-xs">
                  <span>
                    {categoryLabel(request.category)} ·{" "}
                    {new Date(request.created_at).toLocaleDateString("ko-KR")}
                  </span>
                  <span>{request.status === "answered" ? "답변 완료" : "접수됨"}</span>
                </div>
                <p className="mt-2 whitespace-pre-wrap break-words text-foreground">
                  {request.body}
                </p>
                {request.response ? (
                  <div className="mt-3 border-t border-border pt-3">
                    <p className="font-semibold text-foreground">애프터 답변</p>
                    <p className="mt-1 whitespace-pre-wrap break-words">{request.response}</p>
                  </div>
                ) : null}
              </div>
            ))}
          </div>
        ) : null}
        <p>영업일 기준 3일 안에 답변드리며, 신고는 접수 후 24시간 안에 먼저 확인합니다.</p>
      </InfoSection>

      <InfoSection title="이메일로 연락하기">
        <p>로그인할 수 없거나 별도 답변이 필요하다면 이메일로 보내주세요.</p>
        <a
          href={`mailto:${BUSINESS.contactEmail}?subject=${subject}`}
          className="inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-control bg-primary px-4 font-semibold text-primary-foreground"
        >
          <Mail className="size-4" aria-hidden="true" />
          {BUSINESS.contactEmail}
        </a>
      </InfoSection>

      <InfoSection title="신고와 차단">
        <p>
          소개 또는 대화 화면 오른쪽 위 ⋯ 메뉴에서 바로 신고하거나 차단할 수 있습니다. 차단한 상대는
          다시 소개되지 않습니다.
        </p>
        <p>
          신체 위협이나 스토킹처럼 즉시 도움이 필요한 상황은 앱의 답변을 기다리지 말고 112에 신고해
          주세요.
        </p>
      </InfoSection>

      <InfoSection title="계정과 개인정보">
        <div className="grid gap-2">
          <Link
            to="/delete-account"
            className="flex min-h-12 items-center justify-between rounded-control border border-border px-4 font-medium text-foreground"
          >
            계정 삭제 방법
            <ExternalLink className="size-4" aria-hidden="true" />
          </Link>
          <Link
            to="/privacy"
            className="flex min-h-12 items-center justify-between rounded-control border border-border px-4 font-medium text-foreground"
          >
            개인정보 처리방침
            <ExternalLink className="size-4" aria-hidden="true" />
          </Link>
          <Link
            to="/terms"
            className="flex min-h-12 items-center justify-between rounded-control border border-border px-4 font-medium text-foreground"
          >
            이용약관
            <ExternalLink className="size-4" aria-hidden="true" />
          </Link>
        </div>
      </InfoSection>
    </PublicInfoPage>
  );
}

type SupportRequest = Database["public"]["Functions"]["my_support_requests"]["Returns"][number];
const CATEGORIES = [
  ["account", "계정·프로필"],
  ["introduction", "소개·일정"],
  ["payment", "티켓·결제"],
  ["safety", "안전·신고"],
  ["other", "기타"],
] as const;
const categoryLabel = (value: string) => CATEGORIES.find(([key]) => key === value)?.[1] ?? "기타";
