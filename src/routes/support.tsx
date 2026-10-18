import { createFileRoute, Link } from "@tanstack/react-router";
import { ExternalLink, Mail } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
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
  validateSearch: (search: Record<string, unknown>): { meetingId?: string } => ({
    meetingId:
      typeof search.meetingId === "string" &&
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(search.meetingId)
        ? search.meetingId
        : undefined,
  }),
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
  const { meetingId } = Route.useSearch();
  const { me, ready } = useMe();
  const userId = ready ? me?.id : undefined;
  const [category, setCategory] = useState(meetingId ? "introduction" : "account");
  const [body, setBody] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [list, setList] = useState<RequestList | null>(null);
  const [submitNotice, setSubmitNotice] = useState<string | null>(null);
  const activeUser = useRef<string | null>(null);
  const latestUserId = useRef(userId);
  const loadSequence = useRef(0);
  const submitSequence = useRef(0);
  const submitLock = useRef(false);
  latestUserId.current = userId;
  const subject = encodeURIComponent(`[${BRAND.name} 문의]`);

  const load = useCallback(async (ownerId: string) => {
    if (activeUser.current !== ownerId) return;
    const sequence = ++loadSequence.current;
    setList((previous) => ({
      ownerId,
      phase: "loading",
      items: previous?.ownerId === ownerId ? previous.items : null,
    }));
    try {
      const { data, error } = await supabase.rpc("my_support_requests");
      if (error) throw error;
      if (activeUser.current !== ownerId || sequence !== loadSequence.current) return;
      setList({ ownerId, phase: "ready", items: data ?? [] });
    } catch {
      if (activeUser.current !== ownerId || sequence !== loadSequence.current) return;
      setList((previous) => ({
        ownerId,
        phase: "error",
        items: previous?.ownerId === ownerId ? previous.items : null,
      }));
    }
  }, []);

  useEffect(() => {
    loadSequence.current += 1;
    submitSequence.current += 1;
    activeUser.current = userId ?? null;
    setList(null);
    setSubmitNotice(null);
    setBody("");
    submitLock.current = false;
    setSubmitting(false);
    if (userId) void load(userId);
    return () => {
      loadSequence.current += 1;
      submitSequence.current += 1;
      activeUser.current = null;
    };
  }, [userId, load]);

  useEffect(() => {
    const { data: subscription } = supabase.auth.onAuthStateChange((event, session) => {
      if (event !== "SIGNED_IN" && event !== "SIGNED_OUT") return;
      const signedInUserId = event === "SIGNED_IN" ? session?.user.id : undefined;
      // Supabase can emit SIGNED_IN again for the same account when a tab regains focus.
      // Keep the in-flight submission locked so its eventual result is still shown.
      if (signedInUserId && signedInUserId === activeUser.current) return;
      loadSequence.current += 1;
      submitSequence.current += 1;
      activeUser.current = null;
      setList(null);
      setSubmitNotice(null);
      submitLock.current = false;
      setSubmitting(false);
      if (signedInUserId && signedInUserId === latestUserId.current) {
        activeUser.current = signedInUserId;
        void load(signedInUserId);
      }
    });
    return () => subscription.subscription.unsubscribe();
  }, [load]);

  useEffect(() => {
    if (!userId) return;
    const refresh = () => {
      if (document.visibilityState === "visible") void load(userId);
    };
    window.addEventListener("focus", refresh);
    document.addEventListener("visibilitychange", refresh);
    return () => {
      window.removeEventListener("focus", refresh);
      document.removeEventListener("visibilitychange", refresh);
    };
  }, [userId, load]);

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const message = body.trim();
    if (
      submitLock.current ||
      !userId ||
      activeUser.current !== userId ||
      message.length < 10 ||
      message.length > (meetingId ? 1000 : 2000)
    )
      return;
    submitLock.current = true;
    setSubmitting(true);
    setSubmitNotice(null);
    const ownerId = userId;
    const sequence = submitSequence.current;
    try {
      const { error } = meetingId
        ? await supabase.rpc("create_meeting_help_request", {
            p_meeting_id: meetingId,
            p_body: message,
          })
        : await supabase.rpc("create_support_request", {
            p_category: category,
            p_body: message,
          });
      if (error) throw error;
      if (activeUser.current !== ownerId || submitSequence.current !== sequence) return;
      setBody("");
      toast.success("문의가 접수되었습니다.");
      setSubmitNotice("문의가 접수되었습니다. 답변은 아래 내 문의에서 확인할 수 있어요.");
      void load(ownerId);
    } catch (error) {
      if (activeUser.current !== ownerId || submitSequence.current !== sequence) return;
      const notice =
        meetingId && errorCode(error) === "23505"
          ? "이 약속의 문의가 이미 접수되어 있어요. 아래 내 문의에서 답변을 확인해 주세요."
          : isConfirmedFailure(error)
            ? "문의가 접수되지 않았어요. 내용을 확인하고 다시 보내거나 이메일로 연락해 주세요."
            : "접수 여부를 확인할 수 없어요. 다시 보내기 전에 아래 내 문의를 새로고침해 확인해 주세요.";
      setSubmitNotice(notice);
      toast.error(notice);
    } finally {
      if (activeUser.current === ownerId && submitSequence.current === sequence) {
        submitLock.current = false;
        setSubmitting(false);
      }
    }
  }

  return (
    <PublicInfoPage title="어떻게 도와드릴까요?">
      <InfoSection title="1:1 문의">
        <p>
          {meetingId
            ? "이 약속의 일정이나 장소가 막혔다면 알려주세요. 운영팀이 확인하고 이 화면에서 답합니다."
            : "가입, 소개, 결제 문제를 남기면 이 화면에서 답변을 확인할 수 있습니다."}
        </p>
        {ready && me ? (
          <form onSubmit={(event) => void submit(event)} className="space-y-3">
            {!meetingId ? (
              <>
                <label htmlFor="support-category" className="block font-medium text-foreground">
                  문의 종류
                </label>
                <select
                  id="support-category"
                  value={category}
                  onChange={(event) => setCategory(event.target.value)}
                  className="min-h-12 w-full rounded-field border border-input bg-card px-3 text-base text-foreground focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background focus-visible:outline-none"
                >
                  {CATEGORIES.map(([value, label]) => (
                    <option key={value} value={value}>
                      {label}
                    </option>
                  ))}
                </select>
              </>
            ) : null}
            <label htmlFor="support-body" className="block font-medium text-foreground">
              문의 내용
            </label>
            <Textarea
              id="support-body"
              value={body}
              maxLength={meetingId ? 1000 : 2000}
              minLength={10}
              required
              placeholder={
                meetingId
                  ? "예: 제안받은 날은 어렵고, 다음 주 수요일 저녁은 괜찮아요."
                  : "무엇이 불편하셨나요? 필요한 내용만 적어주세요."
              }
              onChange={(event) => setBody(event.target.value)}
            />
            <p className="text-xs">
              10자 이상 적어 주세요. 상대방의 연락처나 민감한 개인정보는 적지 말아 주세요.
            </p>
            <Button
              type="submit"
              className="w-full"
              disabled={submitting || body.trim().length < 10}
            >
              {submitting ? "접수 중…" : "문의 보내기"}
            </Button>
            {submitNotice ? (
              <p role="status" className="text-foreground">
                {submitNotice}
              </p>
            ) : null}
          </form>
        ) : ready ? (
          <Link
            to="/login"
            className="inline-flex min-h-12 w-full items-center justify-center rounded-control bg-primary px-4 font-semibold text-primary-foreground"
          >
            로그인하고 문의하기
          </Link>
        ) : null}
        {userId ? (
          <div className="space-y-3 pt-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h3 className="font-semibold text-foreground">내 문의</h3>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => void load(userId)}
                disabled={list?.ownerId === userId && list.phase === "loading"}
              >
                내역 새로고침
              </Button>
            </div>
            <p className="text-xs">
              답변은 이 화면의 내 문의에 표시됩니다. 다시 방문하거나 새로고침해 확인해 주세요.
            </p>
            <p role="status" aria-live="polite" className="text-foreground">
              {!list || list.ownerId !== userId || (list.phase === "loading" && !list.items)
                ? "문의 내역을 불러오는 중이에요."
                : list.phase === "error"
                  ? list.items
                    ? "내역을 새로고침하지 못했어요. 이전 목록을 표시하고 있어요. 내역 새로고침을 눌러 다시 확인해 주세요."
                    : "문의 내역을 불러오지 못했어요. 내역 새로고침을 눌러 다시 확인해 주세요."
                  : list.phase === "loading"
                    ? "문의 내역을 새로고침하는 중이에요. 이전 목록을 표시하고 있어요."
                    : list.items?.length === 0
                      ? "아직 접수된 문의가 없어요."
                      : ""}
            </p>
            {list?.ownerId === userId &&
              list.items?.map((request) => (
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
          className="inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-control border border-border bg-card px-4 font-semibold text-foreground"
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
type RequestList = {
  ownerId: string;
  phase: "loading" | "ready" | "error";
  items: SupportRequest[] | null;
};
const errorCode = (error: unknown) =>
  typeof error === "object" && error !== null && "code" in error && typeof error.code === "string"
    ? error.code
    : null;
const isConfirmedFailure = (error: unknown) => {
  const code = errorCode(error);
  return code !== null && /^[0-9A-Z]{5}$/.test(code) && !code.startsWith("08");
};
const CATEGORIES = [
  ["account", "계정·프로필"],
  ["introduction", "소개·일정"],
  ["payment", "티켓·결제"],
  ["safety", "안전·신고"],
  ["other", "기타"],
] as const;
const categoryLabel = (value: string) => CATEGORIES.find(([key]) => key === value)?.[1] ?? "기타";
